import { Schema } from "effect"

const StringMap = Schema.Record({
  key: Schema.String,
  value: Schema.String
})

const NumberMap = Schema.Record({
  key: Schema.String,
  value: Schema.Number
})

export const GrafanaAlertSchema = Schema.Struct({
  status: Schema.Literal("firing", "resolved"),
  labels: StringMap,
  annotations: StringMap,
  startsAt: Schema.DateFromString,
  endsAt: Schema.DateFromString,
  generatorURL: Schema.String,
  fingerprint: Schema.String,
  silenceURL: Schema.optional(Schema.String),
  dashboardURL: Schema.optional(Schema.String),
  panelURL: Schema.optional(Schema.String),
  values: Schema.optional(NumberMap)
})

export const GrafanaWebhookSchema = Schema.Struct({
  receiver: Schema.String,
  status: Schema.Literal("firing", "resolved"),
  alerts: Schema.Array(GrafanaAlertSchema),
  groupLabels: StringMap,
  commonLabels: StringMap,
  commonAnnotations: StringMap,
  externalURL: Schema.String,
  version: Schema.String,
  groupKey: Schema.String,
  truncatedAlerts: Schema.Number,
  orgId: Schema.Number,
  title: Schema.String,
  state: Schema.String,
  message: Schema.String
})

export type GrafanaWebhook = typeof GrafanaWebhookSchema.Type
