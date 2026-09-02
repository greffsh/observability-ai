import { Data, type Effect } from "effect"
import type { Incident } from "../domain/incident.js"

export type EvidenceSourceName = "alert" | "logs" | "metrics"
export type ExternalEvidenceSourceName = Exclude<EvidenceSourceName, "alert">

export type EvidenceInterval = {
  readonly start: Date
  readonly end: Date
}

export type EvidenceItem = {
  readonly id: string
  readonly source: EvidenceSourceName
  readonly description: string
  readonly reference: string
  readonly interval: EvidenceInterval | null
  readonly untrusted: boolean
  readonly data: unknown
}

export type EvidenceLimitation = {
  readonly source: ExternalEvidenceSourceName
  readonly code: "not_configured" | "partial" | "unavailable" | "truncated"
  readonly description: string
}

export type EvidencePackage = {
  readonly schemaVersion: 1
  readonly packageId: string
  readonly incidentId: string
  readonly collectedAt: Date
  readonly window: EvidenceInterval
  readonly evidence: ReadonlyArray<EvidenceItem>
  readonly limitations: ReadonlyArray<EvidenceLimitation>
}

export type EvidencePolicy = {
  readonly lookbackMs: number
  readonly lookaheadMs: number
  readonly maxWindowMs: number
  readonly sourceTimeoutMs: number
  readonly maxLogEntries: number
  readonly maxMetricPoints: number
  readonly maxMetricSeries: number
  readonly maxStringLength: number
}

export type EvidenceCollectionContext = {
  readonly incident: Incident
  readonly window: EvidenceInterval
  readonly policy: EvidencePolicy
}

export type SourceCollection = {
  readonly evidence: ReadonlyArray<EvidenceItem>
  readonly limitations: ReadonlyArray<EvidenceLimitation>
}

export class EvidenceSourceError extends Data.TaggedError("EvidenceSourceError")<{
  readonly source: ExternalEvidenceSourceName
  readonly reason: string
}> {}

export type EvidenceSource = {
  readonly source: ExternalEvidenceSourceName
  readonly collect: (
    context: EvidenceCollectionContext
  ) => Effect.Effect<SourceCollection, EvidenceSourceError>
}

export class IncidentEvidenceNotFoundError extends Data.TaggedError(
  "IncidentEvidenceNotFoundError"
)<{
  readonly incidentId: string
}> {}

export class EvidencePersistenceError extends Data.TaggedError(
  "EvidencePersistenceError"
)<{
  readonly cause: unknown
}> {}

export type EvidenceCollectorError =
  | IncidentEvidenceNotFoundError
  | EvidencePersistenceError

export type EvidenceCollector = {
  readonly collect: (
    incidentId: string
  ) => Effect.Effect<EvidencePackage, EvidenceCollectorError>
}
