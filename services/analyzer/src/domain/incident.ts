import { createHash } from "node:crypto"
import type { AlertEvent } from "../contracts/alert-event.js"

export type IncidentStatus = "open" | "resolved" | "closed_unconfirmed"

export type Incident = {
  readonly id: string
  readonly correlationKey: string
  readonly status: IncidentStatus
  readonly alertName: string
  readonly service: string
  readonly environment: string
  readonly alertFingerprint: string
  readonly startedAt: Date
  readonly resolvedAt: Date | null
  readonly firingObserved: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const correlationKeyFor = (event: AlertEvent): string =>
  createHash("sha256")
    .update(JSON.stringify([
      event.source,
      event.environment,
      event.service,
      event.alertName,
      event.alertFingerprint
    ]))
    .digest("hex")

export const episodeKeyFor = (event: AlertEvent): string =>
  `${correlationKeyFor(event)}:${event.startedAt.toISOString()}`
