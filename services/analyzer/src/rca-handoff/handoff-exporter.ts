import { randomUUID } from "node:crypto"
import { Effect, Option } from "effect"
import type { Incident } from "../domain/incident.js"
import type { EvidenceCollector, EvidenceItem } from "../evidence/contracts.js"
import { sanitizeString, sanitizeUnknown } from "../evidence/sanitize.js"
import type { EventStore } from "../persistence/event-store.js"
import type { ServiceCatalog } from "../service-catalog.js"
import { classifySeverity } from "../severity/classify-severity.js"
import type { SeverityAssessment } from "../severity/contracts.js"
import {
  RcaHandoffIncidentNotFoundError,
  RcaHandoffUnavailableError,
  type DeploymentRevision,
  type RcaHandoffExporter,
  type RcaHandoffPackage
} from "./contracts.js"

type RcaHandoffExporterOptions = {
  readonly eventStore: EventStore
  readonly evidenceCollector: EvidenceCollector
  readonly catalog: ServiceCatalog
  readonly maxStringLength?: number
  readonly now?: () => Date
  readonly makeId?: () => string
}

const sanitizeEvidence = (item: EvidenceItem, maxStringLength: number): EvidenceItem => ({
  ...item,
  description: sanitizeString(item.description, maxStringLength),
  reference: sanitizeString(item.reference, maxStringLength),
  data: sanitizeUnknown(item.data, maxStringLength)
})

const sanitizeSeverity = (
  assessment: SeverityAssessment,
  maxStringLength: number
): Omit<SeverityAssessment, "schemaVersion" | "incidentId"> => ({
  assessedAt: assessment.assessedAt,
  recommendedSeverity: assessment.recommendedSeverity,
  serviceCriticality: assessment.serviceCriticality,
  signals: assessment.signals,
  triggeredRules: assessment.triggeredRules.map((rule) => ({
    code: sanitizeString(rule.code, maxStringLength),
    description: sanitizeString(rule.description, maxStringLength),
    evidenceIds: rule.evidenceIds.map((id) => sanitizeString(id, maxStringLength))
  })),
  observations: assessment.observations.map((value) => sanitizeString(value, maxStringLength)),
  limitations: assessment.limitations.map((value) => sanitizeString(value, maxStringLength))
})

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null

const deploymentContextFrom = (
  service: string,
  evidence: ReadonlyArray<EvidenceItem>,
  maxStringLength: number
): RcaHandoffPackage["deploymentContext"] => {
  const revisions = new Map<string, DeploymentRevision>()

  for (const item of evidence) {
    if (item.source !== "deployment" || item.data === null || typeof item.data !== "object") {
      continue
    }
    const candidates = (item.data as { readonly revisions?: unknown }).revisions
    if (!Array.isArray(candidates)) continue

    for (const candidate of candidates) {
      if (candidate === null || typeof candidate !== "object") continue
      const input = candidate as Readonly<Record<string, unknown>>
      const revision = stringOrNull(input.revision)
      const revisionSource = input.revisionSource
      const firstObservedAt = stringOrNull(input.firstObservedAt)
      const lastObservedAt = stringOrNull(input.lastObservedAt)
      if (
        revision === null ||
        (revisionSource !== "vcs.ref.head.revision" && revisionSource !== "service.version") ||
        firstObservedAt === null ||
        lastObservedAt === null
      ) continue

      const inputRef = input.ref !== null && typeof input.ref === "object"
        ? input.ref as Readonly<Record<string, unknown>>
        : {}
      const refType = inputRef.type === "branch" || inputRef.type === "tag"
        ? inputRef.type
        : null
      const sanitizedRevision = sanitizeString(revision, maxStringLength)
      const existing = revisions.get(sanitizedRevision)
      if (existing !== undefined) {
        revisions.set(sanitizedRevision, {
          ...existing,
          firstObservedAt: firstObservedAt < existing.firstObservedAt
            ? firstObservedAt
            : existing.firstObservedAt,
          lastObservedAt: lastObservedAt > existing.lastObservedAt
            ? lastObservedAt
            : existing.lastObservedAt,
          evidenceIds: existing.evidenceIds.includes(item.id)
            ? existing.evidenceIds
            : [...existing.evidenceIds, sanitizeString(item.id, maxStringLength)]
        })
        continue
      }

      const repositoryUrl = stringOrNull(input.repositoryUrl)
      const serviceVersion = stringOrNull(input.serviceVersion)
      const refName = stringOrNull(inputRef.name)
      revisions.set(sanitizedRevision, {
        service: sanitizeString(service, maxStringLength),
        repositoryUrl: repositoryUrl === null
          ? null
          : sanitizeString(repositoryUrl, maxStringLength),
        revision: sanitizedRevision,
        revisionSource,
        serviceVersion: serviceVersion === null
          ? null
          : sanitizeString(serviceVersion, maxStringLength),
        ref: {
          name: refName === null ? null : sanitizeString(refName, maxStringLength),
          type: refType
        },
        firstObservedAt,
        lastObservedAt,
        evidenceIds: [sanitizeString(item.id, maxStringLength)]
      })
    }
  }

  const observed = [...revisions.values()].sort((left, right) =>
    left.firstObservedAt.localeCompare(right.firstObservedAt) ||
    left.revision.localeCompare(right.revision)
  )
  return {
    status: observed.length === 0 ? "not_observed" : "observed",
    revisions: observed
  }
}

const compactIncident = (incident: Incident, maxStringLength: number) => ({
  id: incident.id,
  status: incident.status,
  service: sanitizeString(incident.service, maxStringLength),
  environment: sanitizeString(incident.environment, maxStringLength),
  incidentScope: sanitizeString(incident.incidentScope, maxStringLength),
  mergedIntoIncidentId: incident.mergedIntoIncidentId,
  detectedAt: incident.detectedAt,
  lastActivityAt: incident.lastActivityAt,
  signalsClearedAt: incident.signalsClearedAt,
  closure: incident.closure === null
    ? null
    : {
        closedAt: incident.closure.closedAt,
        method: incident.closure.method,
        reason: incident.closure.reason,
        note: incident.closure.note === null
          ? null
          : sanitizeString(incident.closure.note, maxStringLength)
      }
})

export const makeRcaHandoffExporter = (
  options: RcaHandoffExporterOptions
): RcaHandoffExporter => {
  const now = options.now ?? (() => new Date())
  const makeId = options.makeId ?? randomUUID
  const maxStringLength = options.maxStringLength ?? 4_096

  return {
    export: (incidentId) => Effect.gen(function* () {
      const incidentResult = yield* options.eventStore.findIncidentById(incidentId).pipe(
        Effect.mapError((cause) => new RcaHandoffUnavailableError({ cause }))
      )
      if (Option.isNone(incidentResult)) {
        return yield* new RcaHandoffIncidentNotFoundError({ incidentId })
      }
      const incident = incidentResult.value
      const occurrences = yield* options.eventStore.findOccurrencesByIncidentId(incidentId).pipe(
        Effect.mapError((cause) => new RcaHandoffUnavailableError({ cause }))
      )
      const evidencePackage = yield* options.evidenceCollector.collect({
        incident,
        occurrences
      }).pipe(
        Effect.mapError((cause) => new RcaHandoffUnavailableError({ cause }))
      )
      const severity = classifySeverity(incident, evidencePackage, options.catalog)

      return {
        schemaVersion: 2,
        handoffId: makeId(),
        exportedAt: now(),
        incident: compactIncident(incident, maxStringLength),
        occurrences: [...occurrences]
          .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime() ||
            left.id.localeCompare(right.id))
          .map((occurrence) => ({
            id: occurrence.id,
            status: occurrence.status,
            alertName: sanitizeString(occurrence.alertName, maxStringLength),
            startedAt: occurrence.startedAt,
            endedAt: occurrence.endedAt,
            firingObserved: occurrence.firingObserved
          })),
        severity: sanitizeSeverity(severity, maxStringLength),
        evidence: {
          packageId: evidencePackage.packageId,
          collectedAt: evidencePackage.collectedAt,
          window: evidencePackage.window,
          items: evidencePackage.evidence.map((item) => sanitizeEvidence(item, maxStringLength)),
          limitations: evidencePackage.limitations.map((limitation) => ({
            ...limitation,
            description: sanitizeString(limitation.description, maxStringLength)
          }))
        },
        deploymentContext: deploymentContextFrom(
          incident.service,
          evidencePackage.evidence,
          maxStringLength
        ),
        repositoryContext: {
          included: false,
          checkoutRequiredSeparately: true
        }
      } satisfies RcaHandoffPackage
    })
  }
}
