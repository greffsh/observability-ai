import Fastify, { type FastifyInstance } from "fastify"

type FailureState = {
  enabled: boolean
}

export const buildApp = (): FastifyInstance => {
  const app = Fastify()
  const failure: FailureState = { enabled: false }

  app.get("/health", async () => ({
    status: "ok",
    service: "checkout-api"
  }))

  app.get("/checkout", async (_request, reply) => {
    if (failure.enabled) {
      return reply.code(503).send({
        error: "payment_provider_unavailable",
        service: "checkout-api"
      })
    }

    return reply.send({ status: "approved", service: "checkout-api" })
  })

  app.get("/control/failure", async () => failure)

  app.post("/control/failure", async () => {
    failure.enabled = true
    return failure
  })

  app.delete("/control/failure", async () => {
    failure.enabled = false
    return failure
  })

  return app
}
