import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AlertEventSchema } from "../src/contracts/alert-event.ts"
import { GrafanaWebhookSchema } from "../src/contracts/grafana-webhook.ts"
import { firingWebhookFixture } from "./fixtures/grafana-webhook.ts"

describe("Grafana webhook contract", () => {
  it("decodes a representative firing webhook", () => {
    const decoded = Schema.decodeUnknownSync(GrafanaWebhookSchema)(
      firingWebhookFixture
    )

    expect(decoded.status).toBe("firing")
    expect(decoded.alerts).toHaveLength(1)
    expect(decoded.alerts[0]?.startsAt).toEqual(
      new Date("2026-08-28T13:21:00Z")
    )
  })

  it("rejects an unsupported alert state", () => {
    const invalid = {
      ...firingWebhookFixture,
      status: "pending"
    }

    expect(() =>
      Schema.decodeUnknownSync(GrafanaWebhookSchema)(invalid)
    ).toThrow()
  })
})

describe("internal alert event contract", () => {
  it("requires versioned identity, ownership, state and timestamps", () => {
    const decoded = Schema.decodeUnknownSync(AlertEventSchema)({
      schemaVersion: 1,
      source: "grafana",
      eventId: "fixture-checkout-failure:firing:2026-08-27T15:00:00.000Z",
      alertFingerprint: "fixture-checkout-failure",
      alertName: "Checkout failure mode enabled",
      service: "checkout-api",
      environment: "local",
      state: "firing",
      startedAt: new Date("2026-08-27T15:00:00Z"),
      endedAt: null,
      receivedAt: new Date("2026-08-27T15:00:05Z"),
      labels: {
        severity: "warning"
      },
      annotations: {
        summary: "Checkout failure rate is above the configured threshold"
      },
      generatorUrl: "http://grafana:3000/alerting/grafana/example/view"
    })

    expect(decoded.schemaVersion).toBe(1)
    expect(decoded.service).toBe("checkout-api")
    expect(decoded.environment).toBe("local")
  })

  it("rejects an event without a service identity", () => {
    expect(() =>
      Schema.decodeUnknownSync(AlertEventSchema)({
        schemaVersion: 1,
        source: "grafana",
        eventId: "missing-service",
        alertFingerprint: "fixture-checkout-failure",
        alertName: "CheckoutFailureRateHigh",
        environment: "local",
        state: "firing",
        startedAt: new Date("2026-08-27T15:00:00Z"),
        endedAt: null,
        receivedAt: new Date("2026-08-27T15:00:05Z"),
        labels: {},
        annotations: {},
        generatorUrl: null
      })
    ).toThrow()
  })
})
