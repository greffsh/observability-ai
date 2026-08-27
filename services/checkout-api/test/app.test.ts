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
})
