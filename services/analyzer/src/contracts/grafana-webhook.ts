import { Schema } from "effect"

const StringMap = Schema.Record({
  key: Schema.String,
  value: Schema.String
})

export const GrafanaAlertSchema = Schema.Struct({
  status: Schema.Literal("firing", "resolved"),
  labels: StringMap,
  annotations: Schema.optional(StringMap),
  startsAt: Schema.DateFromString,
  endsAt: Schema.DateFromString,
  generatorURL: Schema.optional(Schema.String),
  fingerprint: Schema.String,
  silenceURL: Schema.optional(Schema.String),
  dashboardURL: Schema.optional(Schema.String),
  panelURL: Schema.optional(Schema.String)
})

export const GrafanaWebhookSchema = Schema.Struct({
  receiver: Schema.optional(Schema.String),
  status: Schema.Literal("firing", "resolved"),
  alerts: Schema.Array(GrafanaAlertSchema),
  groupLabels: Schema.optional(StringMap),
  commonLabels: Schema.optional(StringMap),
  commonAnnotations: Schema.optional(StringMap),
  externalURL: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  groupKey: Schema.optional(Schema.String),
  truncatedAlerts: Schema.optional(Schema.Number),
  orgId: Schema.optional(Schema.Number),
  title: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String)
})

export type GrafanaWebhook = typeof GrafanaWebhookSchema.Type
