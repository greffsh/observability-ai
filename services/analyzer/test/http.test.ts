import { createServer, type Server } from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { requestHandler } from "../src/http.ts"

let server: Server | undefined

afterEach(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error === undefined ? resolve() : reject(error)))
    )
  }
})

describe("HTTP API", () => {
  it("reports analyzer health", async () => {
    server = createServer(requestHandler)
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve))

    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral TCP address")
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "analyzer"
    })
  })
})

