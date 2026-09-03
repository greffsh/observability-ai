import { Effect, Option } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"
import { makeEvidenceCollector } from "../src/evidence/evidence-collector.ts"
import { EventStoreError, type EventStore } from "../src/persistence/event-store.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"
import { makeRcaHandoffExporter } from "../src/rca-handoff/handoff-exporter.ts"
import { makeSeverityAssessor } from "../src/severity/severity-assessor.ts"
import { firingWebhookFixture } from "./fixtures/grafana-webhook.ts"
import { checkoutServiceCatalog } from "./fixtures/service-catalog.ts"

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
  const severityAssessor = makeSeverityAssessor({
    eventStore,
    evidenceCollector,
    catalog: checkoutServiceCatalog
  })
  app = buildApp({
    eventStore,
    grafanaWebhookSecret: "test-webhook-secret",
    operatorId: "test-operator",
    operatorToken: "test-operator-token",
    rcaHandoffExporter: makeRcaHandoffExporter({
      eventStore,
      severityAssessor,
      now: () => new Date("2026-08-28T13:21:05Z"),
      makeId: () => "handoff-1"
    }),
    now: () => new Date("2026-08-28T13:21:05Z")
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
      headers: { authorization: "Bearer test-operator-token" }
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

  it("lists incidents for operators using operational filters", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })

    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?status=open&service=checkout-api&environment=local",
      headers: { authorization: "Bearer test-operator-token" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      incidents: [{
        id: "memory-incident-1",
        service: "checkout-api",
        environment: "local",
        status: "open",
        detectedAt: "2026-08-28T13:21:00.000Z",
        lastActivityAt: "2026-08-28T13:21:00.000Z",
        signalsClearedAt: null,
        activeAlerts: 1
      }]
    })
  })

  it("returns an empty incident list when operational filters do not match", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?status=open&service=connect",
      headers: { authorization: "Bearer test-operator-token" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ incidents: [] })
  })

  it("rejects invalid incident list filters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents?status=resolved",
      headers: { authorization: "Bearer test-operator-token" }
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: "invalid_incident_filter",
      field: "status"
    })
  })

  it("does not authorize incident reads with the Grafana credential", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: "unauthorized" })
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
      headers: { authorization: "Bearer test-operator-token" }
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

  it("closes an incident after its alert occurrences have resolved", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: {
        ...firingWebhookFixture,
        status: "resolved",
        alerts: [{
          ...firingWebhookFixture.alerts[0],
          status: "resolved",
          endsAt: "2026-08-28T13:21:04Z"
        }]
      }
    })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/incidents/memory-incident-1/closure",
      headers: { authorization: "Bearer test-operator-token" },
      payload: {
        reason: "recovery_confirmed",
        note: "Checkout validated after recovery"
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      incidentId: "memory-incident-1",
      status: "closed",
      closedAt: "2026-08-28T13:21:05.000Z",
      closureMethod: "operator",
      closureReason: "recovery_confirmed",
      closedBy: "test-operator",
      note: "Checkout validated after recovery"
    })

    const repeated = await app.inject({
      method: "PUT",
      url: "/v1/incidents/memory-incident-1/closure",
      headers: { authorization: "Bearer test-operator-token" },
      payload: {
        reason: "recovery_confirmed",
        note: "Checkout validated after recovery"
      }
    })
    expect(repeated.statusCode).toBe(200)
    expect(repeated.json()).toEqual(response.json())

    const conflicting = await app.inject({
      method: "PUT",
      url: "/v1/incidents/memory-incident-1/closure",
      headers: { authorization: "Bearer test-operator-token" },
      payload: { reason: "other", note: "Replacement audit" }
    })
    expect(conflicting.statusCode).toBe(409)
    expect(conflicting.json()).toEqual({ error: "incident_already_closed" })

    const incident = await app.inject({
      method: "GET",
      url: "/v1/incidents/memory-incident-1",
      headers: { authorization: "Bearer test-operator-token" }
    })
    expect(incident.json()).toMatchObject({
      status: "closed",
      closure: {
        method: "operator",
        reason: "recovery_confirmed",
        closedBy: "test-operator"
      }
    })
  })

  it("does not authorize incident closure with the Grafana credential", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/incidents/memory-incident-1/closure",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: { reason: "recovery_confirmed" }
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: "unauthorized" })
  })

  it("refuses to close an incident while an occurrence is open", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/incidents/memory-incident-1/closure",
      headers: { authorization: "Bearer test-operator-token" },
      payload: { reason: "recovery_confirmed" }
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      error: "incident_not_closable",
      status: "open"
    })
  })

  it("returns 404 for an unknown incident", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/incidents/unknown-incident",
      headers: { authorization: "Bearer test-operator-token" }
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: "incident_not_found" })
  })

  it("keeps evidence and severity collection behind the handoff interface", async () => {
    for (const suffix of ["evidence", "severity"]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/incidents/memory-incident-1/${suffix}`,
        headers: { authorization: "Bearer test-operator-token" }
      })
      expect(response.statusCode).toBe(404)
    }
  })

  it("exports a compact RCA handoff with operator authentication", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/grafana",
      headers: { authorization: "Bearer test-webhook-secret" },
      payload: firingWebhookFixture
    })

    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/memory-incident-1/rca-handoff",
      headers: { authorization: "Bearer test-operator-token" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="rca-handoff-handoff-1.json"'
    )
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      handoffId: "handoff-1",
      exportedAt: "2026-08-28T13:21:05.000Z",
      incident: {
        id: "memory-incident-1",
        status: "open",
        service: "checkout-api",
        environment: "local"
      },
      occurrences: [{
        alertName: "Checkout failure mode enabled",
        status: "open",
        firingObserved: true
      }],
      severity: {
        recommendedSeverity: "inconclusiva",
        triggeredRules: [{ code: "INSUFFICIENT_IMPACT_DATA" }]
      },
      evidence: {
        packageId: "evidence-package-1",
        items: [{ source: "alert" }],
        limitations: []
      },
      repositoryContext: {
        included: false,
        checkoutRequiredSeparately: true
      }
    })
    expect(response.json().occurrences[0]).not.toHaveProperty("correlationKey")
    expect(response.json().occurrences[0]).not.toHaveProperty("alertFingerprint")
  })

  it("does not export an RCA handoff with the Grafana credential", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/incidents/memory-incident-1/rca-handoff",
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: "unauthorized" })
  })

  it("returns 404 for an unknown event", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/events/unknown-event",
      headers: { authorization: "Bearer test-operator-token" }
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
      listIncidents: () => Effect.succeed([]),
      findOccurrencesByIncidentId: () => Effect.succeed([]),
      closeIncident: () => Effect.fail(new EventStoreError({
        operation: "close",
        cause: new Error("database unavailable")
      }))
    }
    const unavailableEvidenceCollector = makeEvidenceCollector({
      eventStore: unavailableStore,
      sources: [],
      analyzerPublicBaseUrl: "http://analyzer.test"
    })
    const severityAssessor = makeSeverityAssessor({
      eventStore: unavailableStore,
      evidenceCollector: unavailableEvidenceCollector,
      catalog: checkoutServiceCatalog
    })
    const unavailableApp = buildApp({
      eventStore: unavailableStore,
      grafanaWebhookSecret: "test-webhook-secret",
      operatorId: "test-operator",
      operatorToken: "test-operator-token",
      rcaHandoffExporter: makeRcaHandoffExporter({
        eventStore: unavailableStore,
        severityAssessor
      }),
      now: () => new Date("2026-08-28T13:21:05Z")
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
