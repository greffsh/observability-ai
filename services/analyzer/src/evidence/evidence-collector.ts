import { randomUUID } from "node:crypto"
import { Effect, Either, Option } from "effect"
import type { EventStore } from "../persistence/event-store.js"
import {
  EvidencePersistenceError,
  IncidentEvidenceNotFoundError,
  type EvidenceCollector,
  type EvidenceItem,
  type EvidencePackage,
  type EvidencePolicy,
  type EvidenceSource
} from "./contracts.js"
import { sanitizeString, sanitizeUnknown } from "./sanitize.js"

export const defaultEvidencePolicy: EvidencePolicy = {
  lookbackMs: 5 * 60 * 1_000,
  lookaheadMs: 5 * 60 * 1_000,
  maxWindowMs: 30 * 60 * 1_000,
  sourceTimeoutMs: 3_000,
  maxLogEntries: 50,
  maxMetricPoints: 121,
  maxMetricSeries: 20,
  maxStringLength: 4_096
}

type EvidenceCollectorOptions = {
  readonly eventStore: EventStore
  readonly sources: ReadonlyArray<EvidenceSource>
  readonly analyzerPublicBaseUrl: string
  readonly policy?: EvidencePolicy
  readonly now?: () => Date
  readonly makeId?: () => string
}

const sourceLimitation = (source: EvidenceSource, reason: string) => ({
  source: source.source,
  code: "unavailable" as const,
  description: reason
})

export const makeEvidenceCollector = (
  options: EvidenceCollectorOptions
): EvidenceCollector => {
  const policy = options.policy ?? defaultEvidencePolicy
  const now = options.now ?? (() => new Date())
  const makeId = options.makeId ?? randomUUID
  const analyzerPublicBaseUrl = options.analyzerPublicBaseUrl.replace(/\/$/, "")

  return {
    collect: (incidentId) => Effect.gen(function* () {
      const incidentResult = yield* options.eventStore.findIncidentById(incidentId).pipe(
        Effect.mapError((cause) => new EvidencePersistenceError({ cause }))
      )

      if (Option.isNone(incidentResult)) {
        return yield* new IncidentEvidenceNotFoundError({ incidentId })
      }

      const incident = incidentResult.value
      const occurrences = yield* options.eventStore.findOccurrencesByIncidentId(incidentId).pipe(
        Effect.mapError((cause) => new EvidencePersistenceError({ cause }))
      )
      const events = yield* options.eventStore.findByIncidentId(incidentId).pipe(
        Effect.mapError((cause) => new EvidencePersistenceError({ cause }))
      )
      const collectedAt = now()
      const occurrenceStartMs = occurrences.reduce(
        (earliest, occurrence) => Math.min(earliest, occurrence.startedAt.getTime()),
        incident.detectedAt.getTime()
      )
      const startMs = occurrenceStartMs - policy.lookbackMs
      const desiredEndMs = incident.signalsClearedAt === null
        ? collectedAt.getTime()
        : incident.signalsClearedAt.getTime() + policy.lookaheadMs
      const endMs = Math.max(
        startMs,
        Math.min(collectedAt.getTime(), desiredEndMs, startMs + policy.maxWindowMs)
      )
      const window = { start: new Date(startMs), end: new Date(endMs) }

      const alertEvidence: ReadonlyArray<EvidenceItem> = events.map(
        (storedEvent, index) => ({
          id: `alert-${index + 1}`,
          source: "alert",
          description: `${storedEvent.event.alertName} changed to ${storedEvent.event.state}`,
          reference: `${analyzerPublicBaseUrl}/v1/events/${encodeURIComponent(storedEvent.event.eventId)}`,
          interval: {
            start: storedEvent.event.startedAt,
            end: storedEvent.event.endedAt ?? storedEvent.event.startedAt
          },
          untrusted: true,
          data: {
            eventId: storedEvent.event.eventId,
            state: storedEvent.event.state,
            service: storedEvent.event.service,
            environment: storedEvent.event.environment,
            fingerprint: storedEvent.event.alertFingerprint,
            summary: storedEvent.event.annotations.summary ?? null,
            description: storedEvent.event.annotations.description ?? null
          }
        })
      )

      const sourceResults = yield* Effect.forEach(
        options.sources,
        (source) => source.collect({ incident, window, policy }).pipe(Effect.either),
        { concurrency: "unbounded" }
      )
      const externalEvidence: Array<EvidenceItem> = []
      const limitations = []

      for (let index = 0; index < sourceResults.length; index += 1) {
        const result = sourceResults[index]
        const source = options.sources[index]
        if (result === undefined || source === undefined) continue

        if (Either.isLeft(result)) {
          limitations.push(sourceLimitation(source, result.left.reason))
        } else {
          externalEvidence.push(...result.right.evidence)
          limitations.push(...result.right.limitations)
        }
      }

      const sanitizeEvidence = (item: EvidenceItem): EvidenceItem => ({
        ...item,
        description: sanitizeString(item.description, policy.maxStringLength),
        data: sanitizeUnknown(item.data, policy.maxStringLength)
      })

      return {
        schemaVersion: 1,
        packageId: makeId(),
        incidentId,
        collectedAt,
        window,
        evidence: [...alertEvidence, ...externalEvidence].map(sanitizeEvidence),
        limitations
      } satisfies EvidencePackage
    })
  }
}
