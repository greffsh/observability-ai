import { Data, type Effect } from "effect"
import type { AlertOccurrence, AlertOccurrenceStatus } from "../domain/alert-occurrence.js"
import type { IncidentClosure, IncidentStatus } from "../domain/incident.js"
import type { EvidenceItem, EvidenceLimitation, EvidenceInterval } from "../evidence/contracts.js"
import type { SeverityAssessment } from "../severity/contracts.js"

export type RcaHandoffIncident = {
  readonly id: string
  readonly status: IncidentStatus
  readonly service: string
  readonly environment: string
  readonly detectedAt: Date
  readonly lastActivityAt: Date
  readonly signalsClearedAt: Date | null
  readonly closure: Pick<IncidentClosure, "closedAt" | "method" | "reason" | "note"> | null
}

export type RcaHandoffOccurrence = Pick<
  AlertOccurrence,
  "id" | "alertName" | "startedAt" | "endedAt" | "firingObserved"
> & { readonly status: AlertOccurrenceStatus }

export type RcaHandoffPackage = {
  readonly schemaVersion: 1
  readonly handoffId: string
  readonly exportedAt: Date
  readonly incident: RcaHandoffIncident
  readonly occurrences: ReadonlyArray<RcaHandoffOccurrence>
  readonly severity: Omit<SeverityAssessment, "schemaVersion" | "incidentId">
  readonly evidence: {
    readonly packageId: string
    readonly collectedAt: Date
    readonly window: EvidenceInterval
    readonly items: ReadonlyArray<EvidenceItem>
    readonly limitations: ReadonlyArray<EvidenceLimitation>
  }
  readonly repositoryContext: {
    readonly included: false
    readonly checkoutRequiredSeparately: true
  }
}

export class RcaHandoffIncidentNotFoundError extends Data.TaggedError(
  "RcaHandoffIncidentNotFoundError"
)<{ readonly incidentId: string }> {}

export class RcaHandoffUnavailableError extends Data.TaggedError(
  "RcaHandoffUnavailableError"
)<{ readonly cause: unknown }> {}

export type RcaHandoffExporter = {
  readonly export: (
    incidentId: string
  ) => Effect.Effect<
    RcaHandoffPackage,
    RcaHandoffIncidentNotFoundError | RcaHandoffUnavailableError
  >
}
