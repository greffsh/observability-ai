export type IncidentStatus = "open" | "awaiting_confirmation" | "closed"

export type Incident = {
  readonly id: string
  readonly status: IncidentStatus
  readonly service: string
  readonly environment: string
  readonly detectedAt: Date
  readonly lastActivityAt: Date
  readonly signalsClearedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}
