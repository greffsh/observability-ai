import Fastify, { LogController, type FastifyInstance } from "fastify"
import { createMetrics } from "./metrics.js"

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
  let failureEnabled = false
  const metrics = createMetrics(serviceName, environment)

  app.get("/health", async (_request, reply) => failureEnabled
    ? reply.code(503).send({ status: "unavailable", service: serviceName })
    : reply.send({ status: "ok", service: serviceName }))

  app.get("/checkout", async (request, reply) => {
    if (failureEnabled) {
      metrics.recordCheckout("failure", 503)
      request.log.error({
        event: "checkout_failed",
        outcome: "failure",
        error_code: "service_unavailable",
        http_status: 503
      }, "checkout failed")

      return reply.code(503).send({
        error: "service_unavailable",
        service: serviceName
      })
    }

    metrics.recordCheckout("success", 200)
    request.log.info({
      event: "checkout_completed",
      outcome: "success",
      http_status: 200
    }, "checkout completed")

    return reply.send({ status: "approved", service: serviceName })
  })

  app.get("/metrics", async (_request, reply) =>
    reply.type(metrics.contentType).send(await metrics.render()))

  app.post("/control/failure", async (request) => {
    failureEnabled = true
    metrics.setAvailability(false)
    request.log.error({
      event: "failure_state_changed",
      failure_enabled: true
    }, "controlled failure enabled")

    return { failureEnabled }
  })

  app.delete("/control/failure", async (request) => {
    failureEnabled = false
    metrics.setAvailability(true)
    request.log.info({
      event: "failure_state_changed",
      failure_enabled: false
    }, "controlled failure disabled")

    return { failureEnabled }
  })

  return app
}
