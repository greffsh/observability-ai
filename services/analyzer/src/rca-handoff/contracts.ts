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
  readonly incidentScope: string
  readonly mergedIntoIncidentId: string | null
  readonly detectedAt: Date
  readonly lastActivityAt: Date
  readonly signalsClearedAt: Date | null
  readonly closure: Pick<IncidentClosure, "closedAt" | "method" | "reason" | "note"> | null
}

export type RcaHandoffOccurrence = Pick<
  AlertOccurrence,
  "id" | "alertName" | "startedAt" | "endedAt" | "firingObserved"
> & { readonly status: AlertOccurrenceStatus }

export type DeploymentRevision = {
  readonly service: string
  readonly repositoryUrl: string | null
  readonly revision: string
  readonly revisionSource: "vcs.ref.head.revision" | "service.version"
  readonly serviceVersion: string | null
  readonly ref: {
    readonly name: string | null
    readonly type: "branch" | "tag" | null
  }
  readonly firstObservedAt: string
  readonly lastObservedAt: string
  readonly evidenceIds: ReadonlyArray<string>
}

export type RcaHandoffPackage = {
  readonly schemaVersion: 2
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
  readonly deploymentContext: {
    readonly status: "observed" | "not_observed"
    readonly revisions: ReadonlyArray<DeploymentRevision>
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
