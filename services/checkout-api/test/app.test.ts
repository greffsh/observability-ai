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
  it("starts healthy and serves checkouts", async () => {
    const health = await app.inject({ method: "GET", url: "/health" })
    const checkout = await app.inject({ method: "GET", url: "/checkout" })

    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ status: "ok", service: "checkout-api" })
    expect(checkout.statusCode).toBe(200)
    expect(checkout.json()).toEqual({ status: "approved", service: "checkout-api" })
  })

  it("enables and disables a deterministic service failure", async () => {
    const enabled = await app.inject({ method: "POST", url: "/control/failure" })
    const unavailableHealth = await app.inject({ method: "GET", url: "/health" })
    const unavailableCheckout = await app.inject({ method: "GET", url: "/checkout" })

    expect(enabled.json()).toEqual({ failureEnabled: true })
    expect(unavailableHealth.statusCode).toBe(503)
    expect(unavailableHealth.json()).toEqual({ status: "unavailable", service: "checkout-api" })
    expect(unavailableCheckout.statusCode).toBe(503)
    expect(unavailableCheckout.json()).toEqual({ error: "service_unavailable", service: "checkout-api" })

    const disabled = await app.inject({ method: "DELETE", url: "/control/failure" })
    const recoveredHealth = await app.inject({ method: "GET", url: "/health" })
    const recoveredCheckout = await app.inject({ method: "GET", url: "/checkout" })

    expect(disabled.json()).toEqual({ failureEnabled: false })
    expect(recoveredHealth.statusCode).toBe(200)
    expect(recoveredCheckout.statusCode).toBe(200)
  })

  it("exposes only request and availability metrics", async () => {
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
      'checkout_availability{service="checkout-api",environment="local"} 0'
    )
    expect(response.body).not.toContain("checkout_failure_mode")
    expect(response.body).not.toContain("checkout_last_change_timestamp_seconds")
    expect(response.body).not.toContain("checkout_request_duration_seconds")
  })

  it("does not expose removed control endpoints", async () => {
    const state = await app.inject({ method: "GET", url: "/control/failure" })
    const unavailable = await app.inject({ method: "POST", url: "/control/failure/unavailable" })
    const change = await app.inject({ method: "POST", url: "/control/change" })

    expect(state.statusCode).toBe(404)
    expect(unavailable.statusCode).toBe(404)
    expect(change.statusCode).toBe(404)
  })
})
