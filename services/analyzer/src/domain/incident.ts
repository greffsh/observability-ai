export const incidentStatuses = ["open", "awaiting_confirmation", "closed"] as const

export type IncidentStatus = typeof incidentStatuses[number]

export const incidentClosureReasons = [
  "recovery_confirmed",
  "false_positive",
  "no_action_required",
  "duplicate",
  "other"
] as const

export type IncidentClosureReason = typeof incidentClosureReasons[number]

export type IncidentClosure = {
  readonly closedAt: Date
  readonly method: "operator" | "policy"
  readonly reason: IncidentClosureReason
  readonly closedBy: string
  readonly note: string | null
  readonly policyVersion: number | null
}

export type Incident = {
  readonly id: string
  readonly status: IncidentStatus
  readonly service: string
  readonly environment: string
  readonly detectedAt: Date
  readonly lastActivityAt: Date
  readonly signalsClearedAt: Date | null
  readonly closure: IncidentClosure | null
  readonly createdAt: Date
  readonly updatedAt: Date
}
