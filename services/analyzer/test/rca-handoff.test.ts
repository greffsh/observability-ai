import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import type { AlertEvent } from "../src/contracts/alert-event.ts"
import type { EvidenceSource } from "../src/evidence/contracts.ts"
import { makeEvidenceCollector } from "../src/evidence/evidence-collector.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"
import { makeRcaHandoffExporter } from "../src/rca-handoff/handoff-exporter.ts"
import { checkoutServiceCatalog } from "./fixtures/service-catalog.ts"

describe("RCA handoff exporter", () => {
  it("sanitizes the compact snapshot and leaves repository context outside it", async () => {
    const store = makeMemoryEventStore({
      now: () => new Date("2026-09-03T12:00:01Z")
    })
    const event: AlertEvent = {
      schemaVersion: 1,
      source: "grafana",
      eventId: "handoff:firing:2026-09-03T12:00:00.000Z",
      alertFingerprint: "handoff",
      alertName: "Checkout token=do-not-export",
      service: "checkout-api",
      environment: "local",
      state: "firing",
      startedAt: new Date("2026-09-03T12:00:00Z"),
      endedAt: null,
      receivedAt: new Date("2026-09-03T12:00:01Z"),
      labels: {},
      annotations: { summary: "Authorization: Bearer private-value" },
      generatorUrl: null
    }
    await Effect.runPromise(store.record([event]))
    const stored = Option.getOrThrow(await Effect.runPromise(store.findByEventId(event.eventId)))
    const incidentId = Option.getOrThrow(Option.fromNullable(stored.incidentId))
    const logs: EvidenceSource = {
      source: "logs",
      collect: ({ window }) => Effect.succeed({
        evidence: [{
          id: "logs-1",
          source: "logs",
          description: "Logs with password=private-value",
          reference: "http://loki.test/query",
          interval: window,
          untrusted: true,
          data: { entries: [{ line: "api_key=private-value" }] }
        }],
        limitations: []
      })
    }
    const deployment: EvidenceSource = {
      source: "deployment",
      collect: ({ window }) => Effect.succeed({
        evidence: [{
          id: "deployment-1",
          source: "deployment",
          description: "Observed checkout deployment",
          reference: "http://prometheus.test/query",
          interval: window,
          untrusted: true,
          data: {
            revisions: [{
              revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              revisionSource: "vcs.ref.head.revision",
              serviceVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              repositoryUrl: "https://gitlab.example/sancor/checkout-api",
              ref: { name: "main", type: "branch" },
              firstObservedAt: "2026-09-03T11:55:00.000Z",
              lastObservedAt: "2026-09-03T12:01:00.000Z"
            }]
          }
        }],
        limitations: []
      })
    }
    const evidenceCollector = makeEvidenceCollector({
      eventStore: store,
      sources: [logs, deployment],
      analyzerPublicBaseUrl: "http://analyzer.test",
      now: () => new Date("2026-09-03T12:01:00Z"),
      makeId: () => "evidence-1"
    })
    const exporter = makeRcaHandoffExporter({
      eventStore: store,
      evidenceCollector,
      catalog: checkoutServiceCatalog,
      now: () => new Date("2026-09-03T12:01:01Z"),
      makeId: () => "handoff-1"
    })

    const result = await Effect.runPromise(exporter.export(incidentId))
    const serialized = JSON.stringify(result)

    expect(result.occurrences[0]?.alertName).toBe("Checkout token=[REDACTED]")
    expect(serialized).not.toContain("private-value")
    expect(serialized).not.toContain("do-not-export")
    expect(result.schemaVersion).toBe(2)
    expect(result.deploymentContext).toEqual({
      status: "observed",
      revisions: [{
        service: "checkout-api",
        repositoryUrl: "https://gitlab.example/sancor/checkout-api",
        revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        revisionSource: "vcs.ref.head.revision",
        serviceVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ref: { name: "main", type: "branch" },
        firstObservedAt: "2026-09-03T11:55:00.000Z",
        lastObservedAt: "2026-09-03T12:01:00.000Z",
        evidenceIds: ["deployment-1"]
      }]
    })
    expect(result.repositoryContext).toEqual({
      included: false,
      checkoutRequiredSeparately: true
    })
  })
})
