import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"

let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp()
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
})
