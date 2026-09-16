export type IncidentStatus = "open" | "awaiting_confirmation" | "closed" | "merged"
export type OperationalStatus = Exclude<IncidentStatus, "merged">
export type StatusFilter = "all" | OperationalStatus

export type ClosureReason =
  | "recovery_confirmed"
  | "false_positive"
  | "no_action_required"
  | "duplicate"
  | "other"

export type IncidentBase = {
  readonly id: string
  readonly service: string
  readonly environment: string
  readonly incidentScope: string
  readonly mergedIntoIncidentId: string | null
  readonly status: IncidentStatus
  readonly detectedAt: string
  readonly lastActivityAt: string
  readonly signalsClearedAt: string | null
}

export type IncidentSummary = IncidentBase & {
  readonly activeAlerts: number
}

export type IncidentClosure = {
  readonly closedAt: string
  readonly method: "operator" | "policy"
  readonly reason: ClosureReason
  readonly closedBy: string
  readonly note: string | null
  readonly policyVersion: number | null
}

export type AlertOccurrence = {
  readonly id: string
  readonly status: "open" | "resolved" | "closed_unconfirmed"
  readonly alertName: string
  readonly startedAt: string
  readonly endedAt: string | null
  readonly firingObserved: boolean
}

export type IncidentDetails = IncidentBase & {
  readonly closure: IncidentClosure | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly occurrences: ReadonlyArray<AlertOccurrence>
}

export type IncidentListResponse = {
  readonly incidents: ReadonlyArray<IncidentSummary>
}
