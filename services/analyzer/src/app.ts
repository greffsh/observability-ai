import Fastify, { type FastifyInstance } from "fastify"

export const buildApp = (): FastifyInstance => {
  const app = Fastify()

  app.get("/health", async () => ({
    status: "ok",
    service: "analyzer"
  }))

  return app
}
