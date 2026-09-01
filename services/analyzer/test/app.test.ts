import { Effect, Option } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"
import { makeEvidenceCollector } from "../src/evidence/evidence-collector.ts"
import { EventStoreError, type EventStore } from "../src/persistence/event-store.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"
import { serviceCriticalityCatalog } from "../src/severity/service-criticality.ts"
import { makeSeverityAssessor } from "../src/severity/severity-assessor.ts"
import { firingWebhookFixture } from "./fixtures/grafana-webhook.ts"

let app: ReturnType<typeof buildApp>

beforeEach(() => {
  const eventStore = makeMemoryEventStore({
    now: () => new Date("2026-08-28T13:21:06Z")
  })
  const evidenceCollector = makeEvidenceCollector({
    eventStore,
    sources: [],
    analyzerPublicBaseUrl: "http://analyzer.test",
    now: () => new Date("2026-08-28T13:21:05Z"),
    makeId: () => "evidence-package-1"
  })
  app = buildApp({
    eventStore,
    evidenceCollector,
    grafanaWebhookSecret: "test-webhook-secret",
    now: () => new Date("2026-08-28T13:21:05Z"),
    severityAssessor: makeSeverityAssessor({
      eventStore,
      evidenceCollector,
      catalog: serviceCriticalityCatalog
    })
  })
})

afterEach(async () => {
  await app.close()
})

describe("Analyzer HTTP API", () => {
  it("reports analyzer health", async () => {
    const response = await app.inject({ method: "GET", url: "/health" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: "ok",
      service: "analyzer"
    })
  })

  it("rejects a webhook without Bearer authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      payload: firingWebhookFixture
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers["www-authenticate"]).toBe("Bearer")
    expect(response.json()).toEqual({ error: "unauthorized" })
  })

  it("accepts and summarizes an authenticated webhook", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({
      accepted: 1,
      inserted: 1,
      duplicates: 0,
      eventIds: [
        "fixture-checkout-failure:firing:2026-08-28T13:21:00.000Z"
      ]
    })
  })

  it("acknowledges a repeated event without inserting it twice", async () => {
    const request = {
      method: "POST" as const,
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    }

    await app.inject(request)
    const response = await app.inject(request)

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      accepted: 1,
      inserted: 0,
      duplicates: 1
    })
  })

  it("returns a persisted event by eventId", async () => {
    const eventId = "fixture-checkout-failure:firing:2026-08-28T13:21:00.000Z"

    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })
    const response = await app.inject({
      method: "GET",
      url: `/v1/events/${encodeURIComponent(eventId)}`,
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: "memory-event-1",
      incidentId: "memory-incident-1",
      storedAt: "2026-08-28T13:21:06.000Z",
      event: {
        schemaVersion: 1,
        eventId,
        service: "checkout-api",
        environment: "local",
        state: "firing"
      }
    })
  })

  it("returns the incident correlated to an event", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })
    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/memory-incident-1",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: "memory-incident-1",
      status: "open",
      service: "checkout-api",
      environment: "local",
      detectedAt: "2026-08-28T13:21:00.000Z",
      signalsClearedAt: null,
      occurrences: [{
        status: "open",
        alertName: "Checkout failure mode enabled",
        firingObserved: true
      }]
    })
  })

  it("returns 404 for an unknown incident", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/unknown-incident",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: "incident_not_found" })
  })

  it("collects an evidence package for an incident", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })
    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/memory-incident-1/evidence",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      packageId: "evidence-package-1",
      incidentId: "memory-incident-1",
      window: {
        start: "2026-08-28T13:16:00.000Z",
        end: "2026-08-28T13:21:05.000Z"
      },
      evidence: [{
        source: "alert",
        reference: "http://analyzer.test/v1/events/fixture-checkout-failure%3Afiring%3A2026-08-28T13%3A21%3A00.000Z"
      }],
      limitations: []
    })
  })

  it("returns an auditable inconclusive severity when impact metrics are absent", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })
    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/memory-incident-1/severity",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      assessment: {
        recommendedSeverity: "inconclusiva",
        triggeredRules: [{ code: "INSUFFICIENT_IMPACT_DATA" }]
      },
      evidencePackage: { packageId: "evidence-package-1" }
    })
  })

  it("returns 404 for an unknown event", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/events/unknown-event",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: "event_not_found" })
  })

  it("returns 503 when an accepted event cannot be persisted", async () => {
    const unavailableStore: EventStore = {
      record: () => Effect.fail(new EventStoreError({
        operation: "record",
        cause: new Error("database unavailable")
      })),
      findByEventId: () => Effect.succeed(Option.none()),
      findByIncidentId: () => Effect.succeed([]),
      findIncidentById: () => Effect.succeed(Option.none()),
      findOccurrencesByIncidentId: () => Effect.succeed([])
    }
    const unavailableEvidenceCollector = makeEvidenceCollector({
      eventStore: unavailableStore,
      sources: [],
      analyzerPublicBaseUrl: "http://analyzer.test"
    })
    const unavailableApp = buildApp({
      eventStore: unavailableStore,
      evidenceCollector: unavailableEvidenceCollector,
      grafanaWebhookSecret: "test-webhook-secret",
      now: () => new Date("2026-08-28T13:21:05Z"),
      severityAssessor: makeSeverityAssessor({
        eventStore: unavailableStore,
        evidenceCollector: unavailableEvidenceCollector,
        catalog: serviceCriticalityCatalog
      })
    })

    try {
      const response = await unavailableApp.inject({
        method: "POST",
        url: "/v1/webhooks/grafana",
        headers: { authorization: "Bearer test-webhook-secret" },
        payload: firingWebhookFixture
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ error: "persistence_unavailable" })
    } finally {
      await unavailableApp.close()
    }
  })

  it("returns 400 for an unsupported webhook shape", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: { status: "pending", alerts: [] }
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: "invalid_webhook" })
  })

  it("returns 422 when a required alert label is missing", async () => {
    const payload = {
      ...firingWebhookFixture,
      alerts: [{
        ...firingWebhookFixture.alerts[0],
        labels: {
          alertname: "Checkout failure mode enabled",
          environment: "local"
        }
      }]
    }

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      error: "invalid_alert",
      alertIndex: 0,
      field: "labels.service"
    })
  })

  it("rejects payloads larger than 256 KiB", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: {
        ...firingWebhookFixture,
        message: "x".repeat(257 * 1024)
      }
    })

    expect(response.statusCode).toBe(413)
  })
})
