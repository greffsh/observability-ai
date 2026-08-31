import Fastify, { LogController, type FastifyInstance } from "fastify"
import { performance } from "node:perf_hooks"
import { createMetrics } from "./metrics.js"

type FailureMode = "healthy" | "degraded" | "unavailable"

type FailureState = { enabled: boolean; mode: FailureMode }

type AppOptions = {
  environment?: string
  logger?: boolean
  now?: () => Date
  serviceName?: string
  sourceRevision?: string
}

export const buildApp = (options: AppOptions = {}): FastifyInstance => {
  const serviceName = options.serviceName ?? "checkout-api"
  const environment = options.environment ?? "local"
  const now = options.now ?? (() => new Date())
  const sourceRevision = options.sourceRevision ?? "unknown"
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger === true
      ? {
          level: "info",
          base: { service: serviceName, environment },
          formatters: {
            level: (label) => ({ level: label })
          }
        }
      : false
  })
  const failure: FailureState = { enabled: false, mode: "healthy" }
  const metrics = createMetrics(serviceName, environment)

  app.get("/health", async (_request, reply) => {
    if (failure.mode === "unavailable") {
      return reply.code(503).send({ status: "unavailable", service: serviceName })
    }

    return { status: "ok", service: serviceName }
  })

  app.get("/checkout", async (_request, reply) => {
    const startedAt = performance.now()

    if (failure.mode !== "healthy") {
      const errorCode = failure.mode === "unavailable"
        ? "service_unavailable"
        : "payment_provider_unavailable"
      metrics.recordCheckout("failure", 503, (performance.now() - startedAt) / 1_000)
      reply.log.error({
        event: "checkout_failed",
        outcome: "failure",
        error_code: errorCode,
        failure_mode: failure.mode,
        http_status: 503
      }, "checkout failed")

      return reply.code(503).send({
        error: errorCode,
        service: serviceName
      })
    }

    metrics.recordCheckout("success", 200, (performance.now() - startedAt) / 1_000)
    reply.log.info({
      event: "checkout_completed",
      outcome: "success",
      http_status: 200
    }, "checkout completed")

    return reply.send({ status: "approved", service: serviceName })
  })

  app.get("/control/failure", async () => failure)

  app.get("/metrics", async (_request, reply) => {
    return reply.type(metrics.contentType).send(await metrics.render())
  })

  app.post("/control/failure", async (request) => {
    failure.enabled = true
    failure.mode = "degraded"
    metrics.setFailureMode(true)
    metrics.setAvailability(true)
    request.log.warn({
      event: "failure_mode_changed",
      failure_enabled: true,
      failure_mode: failure.mode
    }, "degraded mode enabled")
    return failure
  })

  app.post("/control/failure/unavailable", async (request) => {
    failure.enabled = true
    failure.mode = "unavailable"
    metrics.setFailureMode(true)
    metrics.setAvailability(false)
    request.log.error({
      event: "failure_mode_changed",
      failure_enabled: true,
      failure_mode: failure.mode
    }, "unavailable mode enabled")
    return failure
  })

  app.delete("/control/failure", async (request) => {
    failure.enabled = false
    failure.mode = "healthy"
    metrics.setFailureMode(false)
    metrics.setAvailability(true)
    request.log.info({
      event: "failure_mode_changed",
      failure_enabled: false
    }, "failure mode disabled")
    return failure
  })

  app.post("/control/change", async (request) => {
    const changedAt = now()
    metrics.recordChange(changedAt.getTime() / 1_000)
    request.log.info({
      event: "change_recorded",
      changed_at: changedAt.toISOString(),
      revision: sourceRevision
    }, "change marker recorded")

    return { changedAt: changedAt.toISOString(), revision: sourceRevision }
  })

  return app
}
