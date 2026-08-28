import { Effect, Either } from "effect"
import { describe, expect, it } from "vitest"
import { normalizeGrafanaWebhook } from "../src/ingestion/normalize-grafana-webhook.ts"
import {
  firingWebhookFixture,
  resolvedWebhookFixture
} from "./fixtures/grafana-webhook.ts"

const receivedAt = new Date("2026-08-27T15:00:05Z")

describe("Grafana webhook normalization", () => {
  it("normalizes a firing alert and removes the sentinel end timestamp", async () => {
    const events = await Effect.runPromise(
      normalizeGrafanaWebhook(firingWebhookFixture, receivedAt)
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      source: "grafana",
      eventId: "fixture-checkout-failure:firing:2026-08-27T15:00:00.000Z",
      alertName: "CheckoutFailureRateHigh",
      service: "checkout-api",
      environment: "local",
      state: "firing",
      endedAt: null,
      receivedAt
    })
  })

  it("keeps a real end timestamp for a resolved alert", async () => {
    const events = await Effect.runPromise(
      normalizeGrafanaWebhook(resolvedWebhookFixture, receivedAt)
    )

    expect(events[0]?.state).toBe("resolved")
    expect(events[0]?.endedAt).toEqual(new Date("2026-08-27T15:10:00Z"))
  })

  it("rejects the whole group when one alert lacks a required label", async () => {
    const invalidGroup = {
      ...firingWebhookFixture,
      alerts: [
        firingWebhookFixture.alerts[0],
        {
          ...firingWebhookFixture.alerts[0],
          fingerprint: "missing-service",
          labels: {
            alertname: "CheckoutFailureRateHigh",
            environment: "local"
          }
        }
      ]
    }

    const result = await Effect.runPromise(
      Effect.either(normalizeGrafanaWebhook(invalidGroup, receivedAt))
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        _tag: "InvalidGrafanaAlertError",
        alertIndex: 1,
        field: "labels.service"
      })
    }
  })
})
