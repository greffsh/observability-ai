import { Data, Effect, Schema } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
import {
  GrafanaWebhookSchema,
  type GrafanaWebhook
} from "../contracts/grafana-webhook.js"

export class InvalidGrafanaWebhookError extends Data.TaggedError(
  "InvalidGrafanaWebhookError"
) {}

export class InvalidGrafanaAlertError extends Data.TaggedError(
  "InvalidGrafanaAlertError"
)<{
  readonly alertIndex: number
  readonly field: string
  readonly reason: string
}> {}

export type GrafanaNormalizationError =
  | InvalidGrafanaWebhookError
  | InvalidGrafanaAlertError

const requiredLabel = (
  webhook: GrafanaWebhook,
  alertIndex: number,
  name: "alertname" | "service" | "environment"
) => {
  const value = webhook.alerts[alertIndex]?.labels[name]?.trim()

  return value === undefined || value.length === 0
    ? Effect.fail(new InvalidGrafanaAlertError({
        alertIndex,
        field: `labels.${name}`,
        reason: "required label is missing or empty"
      }))
    : Effect.succeed(value)
}

const normalizeAlert = (
  webhook: GrafanaWebhook,
  alertIndex: number,
  receivedAt: Date
): Effect.Effect<AlertEvent, InvalidGrafanaAlertError> => Effect.gen(function* () {
  const alert = webhook.alerts[alertIndex]

  if (alert === undefined) {
    return yield* new InvalidGrafanaAlertError({
      alertIndex,
      field: "alerts",
      reason: "alert does not exist"
    })
  }

  const alertName = yield* requiredLabel(webhook, alertIndex, "alertname")
  const service = yield* requiredLabel(webhook, alertIndex, "service")
  const environment = yield* requiredLabel(webhook, alertIndex, "environment")
  const fingerprint = alert.fingerprint.trim()

  if (fingerprint.length === 0) {
    return yield* new InvalidGrafanaAlertError({
      alertIndex,
      field: "fingerprint",
      reason: "fingerprint is missing or empty"
    })
  }

  const hasSentinelEnd = alert.endsAt.getUTCFullYear() === 1

  if (alert.status === "resolved" && hasSentinelEnd) {
    return yield* new InvalidGrafanaAlertError({
      alertIndex,
      field: "endsAt",
      reason: "resolved alert must have a real end timestamp"
    })
  }

  if (alert.status === "resolved" && alert.endsAt < alert.startsAt) {
    return yield* new InvalidGrafanaAlertError({
      alertIndex,
      field: "endsAt",
      reason: "end timestamp cannot be before start timestamp"
    })
  }

  return {
    schemaVersion: 1,
    source: "grafana",
    eventId: `${fingerprint}:${alert.status}:${alert.startsAt.toISOString()}`,
    alertFingerprint: fingerprint,
    alertName,
    service,
    environment,
    state: alert.status,
    startedAt: alert.startsAt,
    endedAt: alert.status === "resolved" ? alert.endsAt : null,
    receivedAt,
    labels: alert.labels,
    annotations: alert.annotations ?? {},
    generatorUrl: alert.generatorURL?.trim() || null
  }
})

export const normalizeGrafanaWebhook = (
  input: unknown,
  receivedAt: Date
): Effect.Effect<ReadonlyArray<AlertEvent>, GrafanaNormalizationError> =>
  Schema.decodeUnknown(GrafanaWebhookSchema)(input).pipe(
    Effect.mapError(() => new InvalidGrafanaWebhookError()),
    Effect.flatMap((webhook) => webhook.alerts.length === 0
      ? Effect.fail(new InvalidGrafanaAlertError({
          alertIndex: -1,
          field: "alerts",
          reason: "at least one alert is required"
        }))
      : Effect.forEach(
          webhook.alerts,
          (_, alertIndex) => normalizeAlert(webhook, alertIndex, receivedAt),
          { concurrency: 1 }
        ))
  )
