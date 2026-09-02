import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"

let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp()
})

afterEach(async () => {
  await app.close()
})

describe("checkout-api", () => {
  it("reports health independently from the simulated failure", async () => {
    await app.inject({ method: "POST", url: "/control/failure" })

    const response = await app.inject({ method: "GET", url: "/health" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: "ok",
      service: "checkout-api"
    })
  })

  it("reports service unavailability independently from a dependency degradation", async () => {
    await app.inject({ method: "POST", url: "/control/failure/unavailable" })

    const health = await app.inject({ method: "GET", url: "/health" })
    const checkout = await app.inject({ method: "GET", url: "/checkout" })

    expect(health.statusCode).toBe(503)
    expect(health.json()).toEqual({ status: "unavailable", service: "checkout-api" })
    expect(checkout.statusCode).toBe(503)
    expect(checkout.json()).toEqual({ error: "service_unavailable", service: "checkout-api" })
  })

  it("enables and disables a deterministic checkout failure", async () => {
    const healthy = await app.inject({ method: "GET", url: "/checkout" })
    expect(healthy.statusCode).toBe(200)

    await app.inject({ method: "POST", url: "/control/failure" })
    const failing = await app.inject({ method: "GET", url: "/checkout" })
    expect(failing.statusCode).toBe(503)
    expect(failing.json()).toEqual({
      error: "payment_provider_unavailable",
      service: "checkout-api"
    })

    await app.inject({ method: "DELETE", url: "/control/failure" })
    const recovered = await app.inject({ method: "GET", url: "/checkout" })
    expect(recovered.statusCode).toBe(200)
  })

  it("exposes bounded metrics for successful and failed checkouts", async () => {
    await app.inject({ method: "GET", url: "/checkout" })
    await app.inject({ method: "POST", url: "/control/failure" })
    await app.inject({ method: "GET", url: "/checkout" })

    const response = await app.inject({ method: "GET", url: "/metrics" })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/plain")
    expect(response.body).toContain(
      'checkout_requests_total{outcome="success",http_status="200",service="checkout-api",environment="local"} 1'
    )
    expect(response.body).toContain(
      'checkout_requests_total{outcome="failure",http_status="503",service="checkout-api",environment="local"} 1'
    )
    expect(response.body).toContain(
      'checkout_failure_mode{service="checkout-api",environment="local"} 1'
    )
    expect(response.body).toContain(
      'checkout_availability{service="checkout-api",environment="local"} 1'
    )
  })

  it("records an explicit change marker without claiming causality", async () => {
    const changedAt = new Date("2026-08-31T12:00:00.000Z")
    await app.close()
    app = buildApp({ now: () => changedAt })

    const change = await app.inject({ method: "POST", url: "/control/change" })
    const metrics = await app.inject({ method: "GET", url: "/metrics" })

    expect(change.json()).toEqual({ changedAt: changedAt.toISOString() })
    expect(metrics.body).toContain(
      `checkout_last_change_timestamp_seconds{service="checkout-api",environment="local"} ${changedAt.getTime() / 1_000}`
    )
  })
})
