import Fastify, { LogController, type FastifyInstance } from "fastify"
import { performance } from "node:perf_hooks"
import { createMetrics } from "./metrics.js"

type FailureState = {
  enabled: boolean
}

type AppOptions = {
  environment?: string
  logger?: boolean
  serviceName?: string
}

export const buildApp = (options: AppOptions = {}): FastifyInstance => {
  const serviceName = options.serviceName ?? "checkout-api"
  const environment = options.environment ?? "local"
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
  const failure: FailureState = { enabled: false }
  const metrics = createMetrics(serviceName, environment)

  app.get("/health", async () => ({
    status: "ok",
    service: "checkout-api"
  }))

  app.get("/checkout", async (_request, reply) => {
    const startedAt = performance.now()

    if (failure.enabled) {
      metrics.recordCheckout("failure", 503, (performance.now() - startedAt) / 1_000)
      reply.log.error({
        event: "checkout_failed",
        outcome: "failure",
        error_code: "payment_provider_unavailable",
        http_status: 503
      }, "checkout failed")

      return reply.code(503).send({
        error: "payment_provider_unavailable",
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
    metrics.setFailureMode(true)
    request.log.warn({
      event: "failure_mode_changed",
      failure_enabled: true
    }, "failure mode enabled")
    return failure
  })

  app.delete("/control/failure", async (request) => {
    failure.enabled = false
    metrics.setFailureMode(false)
    request.log.info({
      event: "failure_mode_changed",
      failure_enabled: false
    }, "failure mode disabled")
    return failure
  })

  return app
}
