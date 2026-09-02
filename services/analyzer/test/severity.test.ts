import { describe, expect, it } from "vitest"
import type { Incident } from "../src/domain/incident.ts"
import type { EvidenceItem, EvidencePackage } from "../src/evidence/contracts.ts"
import type { ImpactMetricSignal } from "../src/service-catalog.ts"
import { classifySeverity } from "../src/severity/classify-severity.ts"
import { checkoutServiceCatalog } from "./fixtures/service-catalog.ts"

const startedAt = new Date("2026-08-31T10:00:00Z")
const startedAtSeconds = startedAt.getTime() / 1_000

const incident: Incident = {
  id: "incident-1",
  status: "awaiting_confirmation",
  service: "checkout-api",
  environment: "local",
  detectedAt: startedAt,
  lastActivityAt: new Date("2026-08-31T10:05:00Z"),
  signalsClearedAt: new Date("2026-08-31T10:05:00Z"),
  closure: null,
  createdAt: startedAt,
  updatedAt: new Date("2026-08-31T10:05:00Z")
}

const metric = (
  id: string,
  signal: ImpactMetricSignal,
  name: string,
  series: ReadonlyArray<{
    labels?: Readonly<Record<string, string>>
    samples: ReadonlyArray<readonly [number, string]>
  }>
): EvidenceItem => ({
  id,
  source: "metrics",
  description: name,
  reference: `http://prometheus.test/${name}`,
  interval: { start: startedAt, end: new Date(startedAt.getTime() + 5 * 60_000) },
  untrusted: true,
  data: { signal, query: `${name}{service="checkout-api",environment="local"}`, series }
})

const evidencePackage = (evidence: ReadonlyArray<EvidenceItem>): EvidencePackage => ({
  schemaVersion: 1,
  packageId: "package-1",
  incidentId: incident.id,
  collectedAt: new Date("2026-08-31T10:06:00Z"),
  window: { start: new Date("2026-08-31T09:55:00Z"), end: new Date("2026-08-31T10:06:00Z") },
  evidence,
  limitations: []
})

const availability = (values: ReadonlyArray<readonly [number, string]>) =>
  metric("metrics-availability", "availability", "checkout_availability", [{ samples: values }])

describe("deterministic severity", () => {
  it("classifies CV-01 as a low-severity isolated failure", () => {
    const evidence = evidencePackage([
      metric("metrics-total", "totalRequests", "checkout_requests_total", [
        { samples: [[startedAtSeconds, "105"], [startedAtSeconds + 60, "115"]] }
      ]),
      metric("metrics-failed", "failedRequests", "checkout_requests_total", [
        { samples: [[startedAtSeconds, "5"], [startedAtSeconds + 60, "6"]] }
      ]),
      metric("metrics-mode", "failureState", "checkout_failure_mode", [{ samples: [[startedAtSeconds, "0"], [startedAtSeconds + 30, "1"], [startedAtSeconds + 60, "0"]] }]),
      availability([[startedAtSeconds, "1"], [startedAtSeconds + 60, "1"]])
    ])

    const result = classifySeverity(incident, evidence, checkoutServiceCatalog)

    expect(result.recommendedSeverity).toBe("baixa")
    expect(result.signals).toMatchObject({ failedRequests: 1, totalRequests: 10, errorRate: 0.1 })
    expect(result.triggeredRules).toEqual([expect.objectContaining({ code: "ISOLATED_REQUEST_FAILURE" })])
  })

  it("classifies CV-02 as high severity for sustained failures", () => {
    const evidence = evidencePackage([
      metric("metrics-total", "totalRequests", "checkout_requests_total", [
        { samples: [[startedAtSeconds, "105"], [startedAtSeconds + 120, "115"]] }
      ]),
      metric("metrics-failed", "failedRequests", "checkout_requests_total", [
        { samples: [[startedAtSeconds, "5"], [startedAtSeconds + 120, "13"]] }
      ]),
      metric("metrics-mode", "failureState", "checkout_failure_mode", [{ samples: [[startedAtSeconds, "1"], [startedAtSeconds + 60, "1"], [startedAtSeconds + 120, "1"]] }]),
      availability([[startedAtSeconds, "1"], [startedAtSeconds + 120, "1"]])
    ])

    const result = classifySeverity(incident, evidence, checkoutServiceCatalog)

    expect(result.recommendedSeverity).toBe("alta")
    expect(result.signals).toMatchObject({ failedRequests: 8, totalRequests: 10, sustainedFailureSeconds: 120 })
    expect(result.triggeredRules).toEqual([expect.objectContaining({ code: "SUSTAINED_HIGH_ERROR_RATE" })])
  })

  it("classifies CV-03 as critical only from proven service unavailability", () => {
    const evidence = evidencePackage([
      availability([[startedAtSeconds, "1"], [startedAtSeconds + 30, "0"]]),
      metric("metrics-change", "lastChange", "checkout_last_change_timestamp_seconds", [{
        samples: [[startedAtSeconds, String(startedAtSeconds - 300)]]
      }])
    ])

    const result = classifySeverity(incident, evidence, checkoutServiceCatalog)

    expect(result.recommendedSeverity).toBe("critica")
    expect(result.signals).toMatchObject({ minimumAvailability: 0, recentChange: true })
    expect(result.triggeredRules).toEqual([expect.objectContaining({ code: "SERVICE_UNAVAILABLE" })])
    expect(result.observations[0]).toContain("contexto, não prova de causa")
  })

  it("returns inconclusive when impact evidence is insufficient", () => {
    const result = classifySeverity(incident, evidencePackage([]), checkoutServiceCatalog)

    expect(result.recommendedSeverity).toBe("inconclusiva")
    expect(result.triggeredRules).toEqual([expect.objectContaining({ code: "INSUFFICIENT_IMPACT_DATA" })])
  })

  it("produces exactly the same result for the same input", () => {
    const evidence = evidencePackage([availability([[startedAtSeconds, "0"]])])

    expect(classifySeverity(incident, evidence, checkoutServiceCatalog)).toEqual(
      classifySeverity(incident, evidence, checkoutServiceCatalog)
    )
  })
})
