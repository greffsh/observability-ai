import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Incident } from "../src/domain/incident.ts"
import type { EvidenceCollectionContext } from "../src/evidence/contracts.ts"
import { defaultEvidencePolicy } from "../src/evidence/evidence-collector.ts"
import { makeLokiEvidenceSource } from "../src/evidence/loki-source.ts"
import { makePrometheusEvidenceSource } from "../src/evidence/prometheus-source.ts"

const incident: Incident = {
  id: "incident-1",
  status: "awaiting_confirmation",
  service: "checkout-api",
  environment: "local",
  detectedAt: new Date("2026-08-31T10:00:00Z"),
  lastActivityAt: new Date("2026-08-31T10:05:00Z"),
  signalsClearedAt: new Date("2026-08-31T10:05:00Z"),
  closure: null,
  createdAt: new Date("2026-08-31T10:00:01Z"),
  updatedAt: new Date("2026-08-31T10:05:01Z")
}

const context: EvidenceCollectionContext = {
  incident,
  window: {
    start: new Date("2026-08-31T09:55:00Z"),
    end: new Date("2026-08-31T10:10:00Z")
  },
  policy: { ...defaultEvidencePolicy, maxLogEntries: 2 }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("evidence source adapters", () => {
  it("normalizes bounded Prometheus matrix results and preserves a query reference", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: {
        resultType: "matrix",
        result: [{
          metric: {
            __name__: "checkout_failure_mode",
            service: "checkout-api",
            environment: "local",
            instance: "internal-host:8081"
          },
          values: [[1788170100, "1"]]
        }]
      }
    }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const source = makePrometheusEvidenceSource({
      baseUrl: "http://prometheus:9090",
      publicBaseUrl: "http://localhost:9090"
    })

    const result = await Effect.runPromise(source.collect(context))
    const requestUrl = fetchMock.mock.calls[0]?.[0] as URL

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(requestUrl.origin).toBe("http://prometheus:9090")
    expect(requestUrl.searchParams.get("limit")).toBe("20")
    expect(result.evidence[0]).toMatchObject({
      source: "metrics",
      reference: expect.stringContaining("http://localhost:9090/api/v1/query_range"),
      data: {
        series: [{
          labels: {
            __name__: "checkout_failure_mode",
            service: "checkout-api",
            environment: "local"
          },
          samples: [[1788170100, "1"]]
        }]
      }
    })
    expect(result.evidence[0]?.data).not.toMatchObject({
      series: [{ labels: { instance: expect.anything() } }]
    })
  })

  it("uses Loki's exclusive end and reports local truncation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: {
        resultType: "streams",
        result: [{
          stream: { service: "checkout-api", environment: "local", level: "error" },
          values: [
            ["1788171000000000000", "third"],
            ["1788170900000000000", "second"],
            ["1788170800000000000", "first"]
          ]
        }]
      }
    }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const source = makeLokiEvidenceSource({
      baseUrl: "http://loki:3100",
      publicBaseUrl: "http://localhost:3100"
    })

    const result = await Effect.runPromise(source.collect(context))
    const requestUrl = fetchMock.mock.calls[0]?.[0] as URL

    expect(requestUrl.searchParams.get("end")).toBe("1788171000001000000")
    expect(result.evidence[0]).toMatchObject({
      data: {
        entries: [
          { line: "first" },
          { line: "second" }
        ]
      }
    })
    expect(result.limitations).toEqual([{
      source: "logs",
      code: "truncated",
      description: "Log evidence reached the limit of 2 entries"
    }])
  })
})
