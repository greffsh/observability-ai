import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Incident } from "../src/domain/incident.ts"
import type { EvidenceCollectionContext } from "../src/evidence/contracts.ts"
import { defaultEvidencePolicy } from "../src/evidence/evidence-collector.ts"
import { makeLokiEvidenceSource } from "../src/evidence/loki-source.ts"
import { makePrometheusDeploymentEvidenceSource } from "../src/evidence/prometheus-deployment-source.ts"
import { makePrometheusEvidenceSource } from "../src/evidence/prometheus-source.ts"
import { makeTempoEvidenceSource } from "../src/evidence/tempo-source.ts"
import { checkoutServiceCatalog } from "./fixtures/service-catalog.ts"

const incident: Incident = {
  id: "incident-1",
  status: "awaiting_confirmation",
  service: "checkout-api",
  environment: "local",
  incidentScope: "alert:Checkout unavailable",
  mergedIntoIncidentId: null,
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
      publicBaseUrl: "http://localhost:9090",
      catalog: checkoutServiceCatalog
    })

    const result = await Effect.runPromise(source.collect(context))
    const requestUrl = fetchMock.mock.calls[0]?.[0] as URL

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(requestUrl.origin).toBe("http://prometheus:9090")
    expect(requestUrl.searchParams.get("limit")).toBe("20")
    expect(result.evidence[0]).toMatchObject({
      source: "metrics",
      reference: expect.stringContaining("http://localhost:9090/api/v1/query_range"),
      data: {
        signal: "totalRequests",
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

  it("normalizes every deployment revision observed in the incident window", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: {
              __name__: "target_info",
              job: "checkout-api",
              deployment_environment_name: "local",
              service_version: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              vcs_ref_head_revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              vcs_ref_head_name: "main",
              vcs_ref_head_type: "branch",
              vcs_repository_url_full: "https://gitlab.example/sancor/checkout-api",
              instance: "internal-host:8081"
            },
            values: [[1788170100, "1"], [1788170400, "1"]]
          },
          {
            metric: {
              job: "checkout-api",
              deployment_environment_name: "local",
              service_version: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              vcs_ref_head_name: "release-v2",
              vcs_ref_head_type: "tag",
              vcs_repository_url_full: "https://gitlab.example/sancor/checkout-api"
            },
            values: [[1788170500, "1"]]
          }
        ]
      }
    }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const source = makePrometheusDeploymentEvidenceSource({
      baseUrl: "http://prometheus:9090",
      publicBaseUrl: "http://localhost:9090"
    })

    const result = await Effect.runPromise(source.collect(context))
    const requestUrl = fetchMock.mock.calls[0]?.[0] as URL

    expect(requestUrl.searchParams.get("query")).toBe(
      'target_info{job="checkout-api",deployment_environment_name="local"}'
    )
    expect(result.evidence).toEqual([expect.objectContaining({
      id: "deployment-1",
      source: "deployment",
      reference: expect.stringContaining("http://localhost:9090/api/v1/query_range"),
      data: {
        query: 'target_info{job="checkout-api",deployment_environment_name="local"}',
        revisions: [
          {
            revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            revisionSource: "vcs.ref.head.revision",
            serviceVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            repositoryUrl: "https://gitlab.example/sancor/checkout-api",
            ref: { name: "main", type: "branch" },
            firstObservedAt: "2026-08-31T09:55:00.000Z",
            lastObservedAt: "2026-08-31T10:00:00.000Z"
          },
          {
            revision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            revisionSource: "service.version",
            serviceVersion: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            repositoryUrl: "https://gitlab.example/sancor/checkout-api",
            ref: { name: "release-v2", type: "tag" },
            firstObservedAt: "2026-08-31T10:01:40.000Z",
            lastObservedAt: "2026-08-31T10:01:40.000Z"
          }
        ]
      }
    })])
    expect(JSON.stringify(result.evidence)).not.toContain("internal-host")
  })

  it("uses a configured impact query for a different service without code changes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: { resultType: "matrix", result: [] }
    }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const source = makePrometheusEvidenceSource({
      baseUrl: "http://prometheus:9090",
      publicBaseUrl: "http://localhost:9090",
      catalog: {
        schemaVersion: 1,
        services: {
          "connect-api": {
            criticality: "medium",
            environments: {
              production: {
                severityCeiling: "alta",
                impactQueries: {
                  availability: "connect_up{service=\"{{service}}\",environment=\"{{environment}}\"}"
                }
              }
            }
          }
        }
      }
    })

    const result = await Effect.runPromise(source.collect({
      ...context,
      incident: { ...incident, service: "connect-api", environment: "production" }
    }))
    const requestUrl = fetchMock.mock.calls[0]?.[0] as URL

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrl.searchParams.get("query")).toBe(
      "connect_up{service=\"connect-api\",environment=\"production\"}"
    )
    expect(result.evidence[0]).toMatchObject({
      data: { signal: "availability" }
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
    expect(requestUrl.searchParams.get("limit")).toBe("200")
    expect(result.evidence[0]).toMatchObject({
      data: {
        selection: {
          strategy: "errors_then_incident_proximity",
          scannedEntries: 3,
          returnedEntries: 2
        },
        entries: [
          { timestamp: "1788170800000000000", fields: null },
          { timestamp: "1788170900000000000", fields: null }
        ]
      }
    })
    expect(result.evidence[0]?.data).not.toMatchObject({
      entries: [{ line: expect.anything() }]
    })
    expect(result.limitations).toEqual([{
      source: "logs",
      code: "truncated",
      description: "Selected 2 of 3 scanned log entries; errors and incident proximity were prioritized"
    }])
  })

  it("collects bounded Tempo traces and preserves service paths", async () => {
    const traceStart = "1788170400000000000"
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input))
      if (url.pathname === "/api/search") {
        return new Response(JSON.stringify({
          traces: [{
            traceID: "trace-1",
            rootServiceName: "checkout-api",
            rootTraceName: "GET /checkout",
            startTimeUnixNano: traceStart,
            durationMs: 25
          }]
        }), { headers: { "content-type": "application/json" } })
      }

      return new Response(JSON.stringify({
        batches: [{
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }]
          },
          scopeSpans: [{
            scope: { name: "http" },
            spans: [{
              spanId: "span-1",
              name: "GET /checkout",
              startTimeUnixNano: traceStart,
              endTimeUnixNano: "1788170400025000000",
              attributes: [
                { key: "http.request.method", value: { stringValue: "GET" } },
                { key: "http.route", value: { stringValue: "/checkout" } },
                { key: "url.full", value: { stringValue: "http://secret/path?token=x" } }
              ],
              status: { code: "STATUS_CODE_ERROR" }
            }]
          }]
        }]
      }), { headers: { "content-type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    const source = makeTempoEvidenceSource({
      baseUrl: "http://tempo:3200",
      publicBaseUrl: "http://localhost:3200"
    })

    const result = await Effect.runPromise(source.collect(context))
    const searchUrl = fetchMock.mock.calls[0]?.[0] as URL

    expect(searchUrl.pathname).toBe("/api/search")
    expect(searchUrl.searchParams.get("q")).toBe(
      "{ resource.service.name = \"checkout-api\" && kind = server }"
    )
    expect(result.evidence[0]).toMatchObject({
      id: "traces-1",
      source: "traces",
      reference: "http://localhost:3200/api/traces/trace-1",
      data: {
        traceId: "trace-1",
        hasError: true,
        spans: [{
          service: "checkout-api",
          name: "GET /checkout",
          attributes: {
            "http.request.method": "GET",
            "http.route": "/checkout"
          }
        }]
      }
    })
    expect(result.evidence[0]?.data).not.toMatchObject({
      spans: [{ attributes: { "url.full": expect.anything() } }]
    })
  })

  it("selects errors first and then logs closest to incident detection", async () => {
    const nanoseconds = (iso: string) =>
      (BigInt(new Date(iso).getTime()) * 1_000_000n).toString()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: {
        resultType: "streams",
        result: [
          {
            stream: { service: "checkout-api", environment: "local", level: "error" },
            values: [[
              nanoseconds("2026-08-31T09:56:00Z"),
              JSON.stringify({ event: "older-error" })
            ]]
          },
          {
            stream: { service: "checkout-api", environment: "local", level: "info" },
            values: [
              [
                nanoseconds("2026-08-31T10:09:00Z"),
                JSON.stringify({ event: "far-info" })
              ],
              [
                nanoseconds("2026-08-31T10:00:01Z"),
                JSON.stringify({ event: "nearest-info" })
              ]
            ]
          },
          {
            stream: { service: "checkout-api", environment: "local" },
            values: [[
              nanoseconds("2026-08-31T10:00:30Z"),
              JSON.stringify({
                event: "nearby-error",
                severityText: "FATAL",
                message: "ignored raw message"
              })
            ]]
          }
        ]
      }
    }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const source = makeLokiEvidenceSource({
      baseUrl: "http://loki:3100",
      publicBaseUrl: "http://localhost:3100"
    })

    const result = await Effect.runPromise(source.collect({
      ...context,
      policy: { ...context.policy, maxLogEntries: 3 }
    }))

    expect(result.evidence[0]).toMatchObject({
      data: {
        entries: [
          { fields: { event: "older-error" } },
          { fields: { event: "nearest-info" } },
          { fields: { event: "nearby-error" } }
        ]
      }
    })
  })
})
