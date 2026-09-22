import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import type { AlertEvent } from "../src/contracts/alert-event.ts"
import {
  EvidenceSourceError,
  type EvidenceSource
} from "../src/evidence/contracts.ts"
import {
  defaultEvidencePolicy,
  makeEvidenceCollector
} from "../src/evidence/evidence-collector.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"

const firingEvent = (overrides: Partial<AlertEvent> = {}): AlertEvent => ({
  schemaVersion: 1,
  source: "grafana",
  eventId: "evidence:firing:2026-08-31T10:00:00.000Z",
  alertFingerprint: "evidence",
  alertName: "Evidence collection test",
  service: "checkout-api",
  environment: "local",
  state: "firing",
  startedAt: new Date("2026-08-31T10:00:00Z"),
  endedAt: null,
  receivedAt: new Date("2026-08-31T10:00:05Z"),
  labels: {},
  annotations: { summary: "password=visible-before-sanitization" },
  generatorUrl: null,
  ...overrides
})

const collectionInputFor = async (
  store: ReturnType<typeof makeMemoryEventStore>,
  eventId: string
) => {
  const stored = Option.getOrThrow(await Effect.runPromise(
    store.findByEventId(eventId)
  ))
  const incidentId = Option.getOrThrow(Option.fromNullable(stored.incidentId))
  const incident = Option.getOrThrow(await Effect.runPromise(
    store.findIncidentById(incidentId)
  ))
  const occurrences = await Effect.runPromise(
    store.findOccurrencesByIncidentId(incidentId)
  )
  return { incident, occurrences }
}

describe("evidence collector", () => {
  it("keeps successful evidence, reports a failed source and sanitizes content", async () => {
    const store = makeMemoryEventStore()
    const alert = firingEvent()
    await Effect.runPromise(store.record([alert]))
    const input = await collectionInputFor(store, alert.eventId)
    const metrics: EvidenceSource = {
      source: "metrics",
      collect: ({ window }) => Effect.succeed({
        evidence: [{
          id: "metrics-test",
          source: "metrics",
          description: "metrics with token=do-not-leak",
          reference: "http://prometheus.test/query",
          interval: window,
          untrusted: true,
          data: { sample: "Authorization: Bearer secret-value" }
        }],
        limitations: []
      })
    }
    const logs: EvidenceSource = {
      source: "logs",
      collect: () => Effect.fail(new EvidenceSourceError({
        source: "logs",
        reason: "Source request failed: timeout"
      }))
    }
    const collector = makeEvidenceCollector({
      eventStore: store,
      sources: [metrics, logs],
      analyzerPublicBaseUrl: "http://analyzer.test",
      now: () => new Date("2026-08-31T10:10:00Z"),
      makeId: () => "package-test",
      policy: { ...defaultEvidencePolicy, maxStringLength: 100 }
    })

    const result = await Effect.runPromise(collector.collect(input))

    expect(result.evidence.map((item) => item.source)).toEqual([
      "alert",
      "metrics"
    ])
    expect(result.limitations).toEqual([{
      source: "logs",
      code: "unavailable",
      description: "Source request failed: timeout"
    }])
    expect(result.evidence[0]?.data).toMatchObject({
      summary: "password=[REDACTED]"
    })
    expect(result.evidence[1]).toMatchObject({
      description: "metrics with token=[REDACTED]",
      data: { sample: "Authorization: Bearer [REDACTED]" }
    })
  })

  it("caps an open incident window at the configured maximum", async () => {
    const store = makeMemoryEventStore()
    const alert = firingEvent()
    await Effect.runPromise(store.record([alert]))
    const input = await collectionInputFor(store, alert.eventId)
    const collector = makeEvidenceCollector({
      eventStore: store,
      sources: [],
      analyzerPublicBaseUrl: "http://analyzer.test",
      now: () => new Date("2026-08-31T12:00:00Z"),
      makeId: () => "package-test"
    })

    const result = await Effect.runPromise(collector.collect(input))

    expect(result.window).toEqual({
      start: new Date("2026-08-31T09:55:00Z"),
      end: new Date("2026-08-31T10:25:00Z")
    })
  })
})
