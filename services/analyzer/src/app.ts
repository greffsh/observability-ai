import { timingSafeEqual } from "node:crypto"
import { Effect, Either } from "effect"
import Fastify, { type FastifyInstance } from "fastify"
import { normalizeGrafanaWebhook } from "./ingestion/normalize-grafana-webhook.js"

type AppOptions = {
  grafanaWebhookSecret: string
  now?: () => Date
}

const isAuthorized = (authorization: string | undefined, secret: string): boolean => {
  const match = authorization?.match(/^Bearer (.+)$/i)
  if (match === undefined || match === null) {
    return false
  }

  const provided = Buffer.from(match[1] ?? "", "utf8")
  const expected = Buffer.from(secret, "utf8")

  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export const buildApp = (options: AppOptions): FastifyInstance => {
  if (options.grafanaWebhookSecret.length === 0) {
    throw new Error("GRAFANA_WEBHOOK_SECRET must not be empty")
  }

  const app = Fastify()
  const now = options.now ?? (() => new Date())

  app.get("/health", async () => ({
    status: "ok",
    service: "analyzer"
  }))

  app.post("/v1/webhooks/grafana", {
    bodyLimit: 256 * 1024,
    onRequest: async (request, reply) => {
      if (!isAuthorized(request.headers.authorization, options.grafanaWebhookSecret)) {
        return reply
          .header("www-authenticate", "Bearer")
          .code(401)
          .send({ error: "unauthorized" })
      }
    }
  }, async (request, reply) => {
    const result = await Effect.runPromise(
      Effect.either(normalizeGrafanaWebhook(request.body, now()))
    )

    if (Either.isLeft(result)) {
      if (result.left._tag === "InvalidGrafanaWebhookError") {
        return reply.code(400).send({
          error: "invalid_webhook",
          message: "Payload does not match the supported Grafana webhook format"
        })
      }

      return reply.code(422).send({
        error: "invalid_alert",
        alertIndex: result.left.alertIndex,
        field: result.left.field,
        message: result.left.reason
      })
    }

    return reply.code(202).send({
      accepted: result.right.length,
      eventIds: result.right.map((event) => event.eventId)
    })
  })

  return app
}
