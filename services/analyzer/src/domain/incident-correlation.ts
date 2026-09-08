import type { AlertEvent } from "../contracts/alert-event.js"
import type { AlertOccurrence } from "./alert-occurrence.js"
import type { Incident } from "./incident.js"

const explicitScopePrefix = "scope:"
const alertScopePrefix = "alert:"

export const incidentCorrelationPolicyVersion = 2
export const incidentCorrelationCooldownMs = 10 * 60 * 1_000

export const incidentScopeFor = (event: AlertEvent): string => {
  const configured = event.labels.incident_scope?.trim()

  return configured === undefined || configured.length === 0
    ? `${alertScopePrefix}${event.alertName}`
    : `${explicitScopePrefix}${configured}`
}

export type IncidentCorrelationCandidate = Pick<
  Incident,
  "id" | "status" | "service" | "environment" | "incidentScope" |
  "detectedAt" | "lastActivityAt"
> & { readonly openOccurrences: number }

export type IncidentCorrelationDecision =
  | { readonly outcome: "new_incident" }
  | {
      readonly outcome: "associate"
      readonly incidentId: string
      readonly mergedIncidentIds: ReadonlyArray<string>
    }

const isRelated = (
  occurrence: AlertOccurrence,
  candidate: IncidentCorrelationCandidate
): boolean => {
  if (
    candidate.status === "closed" || candidate.status === "merged" ||
    candidate.service !== occurrence.service ||
    candidate.environment !== occurrence.environment ||
    candidate.incidentScope !== occurrence.incidentScope
  ) return false

  const occurrenceEnd = occurrence.endedAt ?? occurrence.startedAt
  const startsBeforeCandidateEnds = occurrence.startedAt.getTime() <=
    candidate.lastActivityAt.getTime() + incidentCorrelationCooldownMs
  const endsAfterCandidateStarts = occurrenceEnd.getTime() >=
    candidate.detectedAt.getTime() - incidentCorrelationCooldownMs

  return (occurrence.status === "open" || endsAfterCandidateStarts) &&
    (candidate.openOccurrences > 0 || startsBeforeCandidateEnds)
}

const occurrencesAreRelated = (
  left: AlertOccurrence,
  right: AlertOccurrence
): boolean => {
  if (
    left.service !== right.service ||
    left.environment !== right.environment ||
    left.incidentScope !== right.incidentScope
  ) return false

  const leftEnd = left.endedAt ?? left.startedAt
  const rightEnd = right.endedAt ?? right.startedAt

  return (right.status === "open" || left.startedAt.getTime() <=
      rightEnd.getTime() + incidentCorrelationCooldownMs) &&
    (left.status === "open" || right.startedAt.getTime() <=
      leftEnd.getTime() + incidentCorrelationCooldownMs)
}

const compareOccurrences = (left: AlertOccurrence, right: AlertOccurrence): number =>
  left.startedAt.getTime() - right.startedAt.getTime() || left.id.localeCompare(right.id)

export const partitionIncidentOccurrences = (
  occurrences: ReadonlyArray<AlertOccurrence>
): ReadonlyArray<ReadonlyArray<AlertOccurrence>> => {
  const ordered = [...occurrences].sort(compareOccurrences)
  const visited = new Set<string>()
  const partitions: Array<Array<AlertOccurrence>> = []

  for (const root of ordered) {
    if (visited.has(root.id)) continue

    const partition: Array<AlertOccurrence> = []
    const pending = [root]
    visited.add(root.id)

    while (pending.length > 0) {
      const current = pending.pop()!
      partition.push(current)

      for (const candidate of ordered) {
        if (!visited.has(candidate.id) && occurrencesAreRelated(current, candidate)) {
          visited.add(candidate.id)
          pending.push(candidate)
        }
      }
    }

    partitions.push(partition.sort(compareOccurrences))
  }

  return partitions.sort((left, right) => compareOccurrences(left[0]!, right[0]!))
}

export const correlateOccurrence = (
  occurrence: AlertOccurrence,
  candidates: ReadonlyArray<IncidentCorrelationCandidate>
): IncidentCorrelationDecision => {
  const related = candidates
    .filter((candidate) => isRelated(occurrence, candidate))
    .sort((left, right) =>
      left.detectedAt.getTime() - right.detectedAt.getTime() ||
      left.id.localeCompare(right.id)
    )
  const canonical = related[0]

  return canonical === undefined
    ? { outcome: "new_incident" }
    : {
        outcome: "associate",
        incidentId: canonical.id,
        mergedIncidentIds: related.slice(1).map((candidate) => candidate.id)
      }
}
