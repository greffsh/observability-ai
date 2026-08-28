import { Schema } from "effect"

const StringMap = Schema.Record({
  key: Schema.String,
  value: Schema.String
})

export const AlertEventSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  source: Schema.Literal("grafana"),
  eventId: Schema.String,
  alertFingerprint: Schema.String,
  alertName: Schema.String,
  service: Schema.String,
  environment: Schema.String,
  state: Schema.Literal("firing", "resolved"),
  startedAt: Schema.ValidDateFromSelf,
  endedAt: Schema.NullOr(Schema.ValidDateFromSelf),
  receivedAt: Schema.ValidDateFromSelf,
  labels: StringMap,
  annotations: StringMap,
  generatorUrl: Schema.NullOr(Schema.String)
})

export type AlertEvent = typeof AlertEventSchema.Type
