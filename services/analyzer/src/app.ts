import { timingSafeEqual } from "node:crypto"
import { Effect, Either, Logger, Option } from "effect"
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify"
import type { EvidenceCollector } from "./evidence/contracts.js"
import { normalizeGrafanaWebhook } from "./ingestion/normalize-grafana-webhook.js"
import type { EffectRunner } from "./logging.js"
import type { EventStore } from "./persistence/event-store.js"

type AppOptions = {
  evidenceCollector: EvidenceCollector
  eventStore: EventStore
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

  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    if (isAuthorized(request.headers.authorization, options.grafanaWebhookSecret)) {
      return
    }

    await runEffect(
      Effect.logWarning("Analyzer authentication failed").pipe(
        Effect.annotateLogs({
          event: "analyzer_unauthorized",
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

  app.get("/health", async () => ({
    status: "ok",
    service: "analyzer"
  }))

  app.post("/v1/webhooks/grafana", {
    bodyLimit: 256 * 1024,
    onRequest: authenticate
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

    const persistence = await runEffect(
      Effect.either(options.eventStore.record(result.right))
    )

    if (Either.isLeft(persistence)) {
      await runEffect(
        Effect.logError("Failed to persist Grafana webhook events").pipe(
          Effect.annotateLogs({
            event: "grafana_webhook_persistence_failed",
            reqId: request.id,
            operation: persistence.left.operation
          })
        )
      )

      return reply.code(503).send({ error: "persistence_unavailable" })
    }

    const response = {
      accepted: result.right.length,
      inserted: persistence.right.insertedEventIds.length,
      duplicates: persistence.right.duplicateEventIds.length,
      eventIds: result.right.map((event) => event.eventId)
    }

    await runEffect(
      Effect.logInfo("Grafana webhook accepted").pipe(
        Effect.annotateLogs({
          event: "grafana_webhook_accepted",
          reqId: request.id,
          accepted: response.accepted,
          inserted: response.inserted,
          duplicates: response.duplicates,
          event_ids: response.eventIds
        })
      )
    )

    return reply.code(202).send(response)
  })

  app.get<{ Params: { eventId: string } }>("/v1/events/:eventId", {
    onRequest: authenticate
  }, async (request, reply) => {
    const result = await runEffect(
      Effect.either(options.eventStore.findByEventId(request.params.eventId))
    )

    if (Either.isLeft(result)) {
      return reply.code(503).send({ error: "persistence_unavailable" })
    }

    if (Option.isNone(result.right)) {
      return reply.code(404).send({ error: "event_not_found" })
    }

    return reply.code(200).send(result.right.value)
  })

  app.get<{ Params: { incidentId: string } }>("/v1/incidents/:incidentId", {
    onRequest: authenticate
  }, async (request, reply) => {
    const result = await runEffect(
      Effect.either(options.eventStore.findIncidentById(request.params.incidentId))
    )

    if (Either.isLeft(result)) {
      return reply.code(503).send({ error: "persistence_unavailable" })
    }

    if (Option.isNone(result.right)) {
      return reply.code(404).send({ error: "incident_not_found" })
    }

    return reply.code(200).send(result.right.value)
  })

  app.post<{ Params: { incidentId: string } }>(
    "/v1/incidents/:incidentId/evidence",
    { onRequest: authenticate },
    async (request, reply) => {
      const result = await runEffect(
        Effect.either(options.evidenceCollector.collect(request.params.incidentId))
      )

      if (Either.isLeft(result)) {
        return result.left._tag === "IncidentEvidenceNotFoundError"
          ? reply.code(404).send({ error: "incident_not_found" })
          : reply.code(503).send({ error: "persistence_unavailable" })
      }

      return reply.code(200).send(result.right)
    }
  )

  return app
}
