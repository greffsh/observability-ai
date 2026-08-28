import { timingSafeEqual } from "node:crypto"
import { Effect, Either, Logger } from "effect"
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance
} from "fastify"
import { normalizeGrafanaWebhook } from "./ingestion/normalize-grafana-webhook.js"
import type { EffectRunner } from "./logging.js"

type AppOptions = {
  grafanaWebhookSecret: string
  logger?: FastifyBaseLogger
  now?: () => Date
  runEffect?: EffectRunner
}

const SilentLogger = Logger.replace(Logger.defaultLogger, Logger.none)

const defaultRunEffect: EffectRunner = (effect) =>
  Effect.runPromise(effect.pipe(Effect.provide(SilentLogger)))

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

  const logController = new LogController({ disableRequestLogging: true })
  const app = options.logger === undefined
    ? Fastify({ logger: false, logController })
    : Fastify({ loggerInstance: options.logger, logController })
  const now = options.now ?? (() => new Date())
  const runEffect = options.runEffect ?? defaultRunEffect

  app.get("/health", async () => ({
    status: "ok",
    service: "analyzer"
  }))

  app.post("/v1/webhooks/grafana", {
    bodyLimit: 256 * 1024,
    onRequest: async (request, reply) => {
      if (!isAuthorized(request.headers.authorization, options.grafanaWebhookSecret)) {
        await runEffect(
          Effect.logWarning("Grafana webhook authentication failed").pipe(
            Effect.annotateLogs({
              event: "grafana_webhook_unauthorized",
              reqId: request.id,
              authorization_present: request.headers.authorization !== undefined,
              authorization_scheme: request.headers.authorization?.split(" ", 1)[0] ?? null
            })
          )
        )

        return reply
          .header("www-authenticate", "Bearer")
          .code(401)
          .send({ error: "unauthorized" })
      }
    }
  }, async (request, reply) => {
    const result = await runEffect(
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

    await runEffect(
      Effect.logInfo("Grafana webhook accepted").pipe(
        Effect.annotateLogs({
          event: "grafana_webhook_accepted",
          reqId: request.id,
          accepted: response.accepted,
          event_ids: response.eventIds
        })
      )
    )

    return reply.code(202).send(response)
  })

  return app
}
