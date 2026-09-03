import { randomUUID } from "node:crypto"
import { Effect, Option } from "effect"
import type { Incident } from "../domain/incident.js"
import type { EvidenceItem } from "../evidence/contracts.js"
import { sanitizeString, sanitizeUnknown } from "../evidence/sanitize.js"
import type { EventStore } from "../persistence/event-store.js"
import type { SeverityAssessment, SeverityAssessor } from "../severity/contracts.js"
import {
  RcaHandoffIncidentNotFoundError,
  RcaHandoffUnavailableError,
  type RcaHandoffExporter,
  type RcaHandoffPackage
} from "./contracts.js"

type RcaHandoffExporterOptions = {
  readonly eventStore: EventStore
  readonly severityAssessor: SeverityAssessor
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

const compactIncident = (incident: Incident, maxStringLength: number) => ({
  id: incident.id,
  status: incident.status,
  service: sanitizeString(incident.service, maxStringLength),
  environment: sanitizeString(incident.environment, maxStringLength),
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
      const severityResult = yield* options.severityAssessor.assess(incidentId).pipe(
        Effect.mapError((cause) => cause._tag === "SeverityIncidentNotFoundError"
          ? new RcaHandoffIncidentNotFoundError({ incidentId })
          : new RcaHandoffUnavailableError({ cause }))
      )
      const incident = yield* options.eventStore.findIncidentById(incidentId).pipe(
        Effect.mapError((cause) => new RcaHandoffUnavailableError({ cause }))
      )
      if (Option.isNone(incident)) {
        return yield* new RcaHandoffIncidentNotFoundError({ incidentId })
      }
      const occurrences = yield* options.eventStore.findOccurrencesByIncidentId(incidentId).pipe(
        Effect.mapError((cause) => new RcaHandoffUnavailableError({ cause }))
      )
      const evidencePackage = severityResult.evidencePackage

      return {
        schemaVersion: 1,
        handoffId: makeId(),
        exportedAt: now(),
        incident: compactIncident(incident.value, maxStringLength),
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
        severity: sanitizeSeverity(severityResult.assessment, maxStringLength),
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
        repositoryContext: {
          included: false,
          checkoutRequiredSeparately: true
        }
      } satisfies RcaHandoffPackage
    })
  }
}
