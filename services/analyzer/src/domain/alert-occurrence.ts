import { createHash } from "node:crypto"
import type { AlertEvent } from "../contracts/alert-event.js"

export type AlertOccurrenceStatus = "open" | "resolved" | "closed_unconfirmed"

export type AlertOccurrence = {
  readonly id: string
  readonly correlationKey: string
  readonly status: AlertOccurrenceStatus
  readonly alertName: string
  readonly service: string
  readonly environment: string
  readonly alertFingerprint: string
  readonly startedAt: Date
  readonly endedAt: Date | null
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

export const occurrenceKeyFor = (event: AlertEvent): string =>
  `${correlationKeyFor(event)}:${event.startedAt.toISOString()}`
