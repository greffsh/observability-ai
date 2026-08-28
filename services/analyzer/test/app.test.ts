import { Effect, Option } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"
import { EventStoreError, type EventStore } from "../src/persistence/event-store.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"
import { firingWebhookFixture } from "./fixtures/grafana-webhook.ts"

let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp({
    eventStore: makeMemoryEventStore({
      now: () => new Date("2026-08-28T13:21:06Z")
    }),
    grafanaWebhookSecret: "test-webhook-secret",
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
      headers: { authorization: "Bearer test-webhook-secret" }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: "memory-event-1",
      incidentId: null,
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
      findByEventId: () => Effect.succeed(Option.none())
    }
    const unavailableApp = buildApp({
      eventStore: unavailableStore,
      grafanaWebhookSecret: "test-webhook-secret",
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
