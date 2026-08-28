import { timingSafeEqual } from "node:crypto"
import { Effect, Either } from "effect"
import Fastify, { LogController, type FastifyInstance } from "fastify"
import { normalizeGrafanaWebhook } from "./ingestion/normalize-grafana-webhook.js"

type AppOptions = {
  environment?: string
  grafanaWebhookSecret: string
  logger?: boolean
  now?: () => Date
  serviceName?: string
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

  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger === true
      ? {
          level: "info",
          base: {
            service: options.serviceName ?? "analyzer",
            environment: options.environment ?? "local"
          },
          formatters: {
            level: (label) => ({ level: label })
          }
        }
      : false
  })
  const now = options.now ?? (() => new Date())

  app.get("/health", async () => ({
    status: "ok",
    service: "analyzer"
  }))

  app.post("/v1/webhooks/grafana", {
    bodyLimit: 256 * 1024,
    onRequest: async (request, reply) => {
      if (!isAuthorized(request.headers.authorization, options.grafanaWebhookSecret)) {
        request.log.warn({
          event: "grafana_webhook_unauthorized",
          authorization_present: request.headers.authorization !== undefined,
          authorization_scheme: request.headers.authorization?.split(" ", 1)[0] ?? null
        }, "Grafana webhook authentication failed")

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

    const response = {
      accepted: result.right.length,
      eventIds: result.right.map((event) => event.eventId)
    }

    request.log.info({
      event: "grafana_webhook_accepted",
      accepted: response.accepted,
      event_ids: response.eventIds
    }, "Grafana webhook accepted")

    return reply.code(202).send(response)
  })

  return app
}
