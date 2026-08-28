import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"
import { firingWebhookFixture } from "./fixtures/grafana-webhook.ts"

let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp({
    grafanaWebhookSecret: "test-webhook-secret",
    now: () => new Date("2026-08-27T15:00:05Z")
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
      eventIds: [
        "fixture-checkout-failure:firing:2026-08-27T15:00:00.000Z"
      ]
    })
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
          alertname: "CheckoutFailureRateHigh",
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
