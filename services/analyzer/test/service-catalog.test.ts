import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  decodeServiceCatalog,
  findEnvironmentProfile,
  renderImpactQuery
} from "../src/service-catalog.ts"

describe("service catalog", () => {
  it("decodes an external service with its own impact queries", async () => {
    const catalog = await Effect.runPromise(decodeServiceCatalog({
      schemaVersion: 1,
      services: {
        connect: {
          criticality: "medium",
          environments: {
            production: {
              severityCeiling: "alta",
              impactQueries: {
                totalRequests: "connect_requests_total{service_name=\"{{service}}\",deployment_environment_name=\"{{environment}}\"}"
              }
            }
          }
        }
      }
    }))

    expect(findEnvironmentProfile(catalog, "connect", "production")).toMatchObject({
      service: { criticality: "medium" },
      environment: { severityCeiling: "alta" }
    })
  })

  it("escapes incident identity when rendering a configured PromQL query", () => {
    expect(renderImpactQuery(
      "metric{service=\"{{service}}\",environment=\"{{environment}}\"}",
      "connect\\\"api",
      "production\nblue"
    )).toBe("metric{service=\"connect\\\\\\\"api\",environment=\"production\\nblue\"}")
  })

  it("rejects an invalid catalog before the Analyzer starts", async () => {
    const result = await Effect.runPromiseExit(decodeServiceCatalog({
      schemaVersion: 1,
      services: { connect: { criticality: "urgent", environments: {} } }
    }))

    expect(result._tag).toBe("Failure")
  })
})
