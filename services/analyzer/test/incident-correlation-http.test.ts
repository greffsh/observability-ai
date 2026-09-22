import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { buildApp } from "../src/app.ts"
import { makeEvidenceCollector } from "../src/evidence/evidence-collector.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"
import { makeRcaHandoffExporter } from "../src/rca-handoff/handoff-exporter.ts"
import { checkoutServiceCatalog } from "./fixtures/service-catalog.ts"

type AlertInput = {
  readonly alertName: string
  readonly fingerprint: string
  readonly service?: string
  readonly environment?: string
  readonly incidentScope?: string
  readonly status?: "firing" | "resolved"
  readonly startsAt: string
  readonly endsAt?: string
}

const makeWebhook = (input: AlertInput) => {
  const status = input.status ?? "firing"
  const labels: Record<string, string> = {
    alertname: input.alertName,
    service: input.service ?? "connect-api",
    environment: input.environment ?? "local"
  }
  if (input.incidentScope !== undefined) labels.incident_scope = input.incidentScope

  return {
    status,
    alerts: [{
      status,
      labels,
      annotations: { summary: input.alertName },
      startsAt: input.startsAt,
      endsAt: status === "resolved"
        ? input.endsAt ?? input.startsAt
        : "0001-01-01T00:00:00Z",
      fingerprint: input.fingerprint
    }]
  }
}

const makeTestApp = () => {
  const eventStore = makeMemoryEventStore({
    now: () => new Date("2026-09-09T12:00:00Z")
  })
  const evidenceCollector = makeEvidenceCollector({
    eventStore,
    sources: [],
    analyzerPublicBaseUrl: "http://analyzer.test"
  })
  return buildApp({
    eventStore,
    grafanaWebhookSecret: "test-webhook-secret",
    operatorId: "test-operator",
    operatorToken: "test-operator-token",
    rcaHandoffExporter: makeRcaHandoffExporter({
      eventStore,
      evidenceCollector,
      catalog: checkoutServiceCatalog
    })
  })
}

const sendAlert = async (
  app: ReturnType<typeof makeTestApp>,
  input: AlertInput
) => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/webhooks/grafana",
    headers: { authorization: "Bearer test-webhook-secret" },
    payload: makeWebhook(input)
  })

  expect(response.statusCode).toBe(202)
  expect(response.json()).toMatchObject({ accepted: 1, inserted: 1, duplicates: 0 })
}

const listIncidents = async (app: ReturnType<typeof makeTestApp>) => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/incidents",
    headers: { authorization: "Bearer test-operator-token" }
  })

  expect(response.statusCode).toBe(200)
  return response.json().incidents as ReadonlyArray<{
    readonly id: string
    readonly service: string
    readonly environment: string
    readonly incidentScope: string
    readonly status: string
    readonly activeAlerts: number
  }>
}

const getIncident = async (app: ReturnType<typeof makeTestApp>, incidentId: string) => {
  const response = await app.inject({
    method: "GET",
    url: `/v1/incidents/${incidentId}`,
    headers: { authorization: "Bearer test-operator-token" }
  })

  expect(response.statusCode).toBe(200)
  return response.json() as {
    readonly service: string
    readonly environment: string
    readonly incidentScope: string
    readonly occurrences: ReadonlyArray<{
      readonly alertName: string
      readonly service: string
      readonly environment: string
      readonly incidentScope: string
    }>
  }
}

describe("incident correlation through the Analyzer HTTP API", () => {
  it("associates different alerts with the same service, environment and scope", async () => {
    const app = makeTestApp()
    try {
      await sendAlert(app, {
        alertName: "Connect availability degraded",
        fingerprint: "availability",
        incidentScope: "http",
        startsAt: "2026-09-09T10:00:00Z"
      })
      await sendAlert(app, {
        alertName: "HTTP server errors detected",
        fingerprint: "http-errors",
        incidentScope: "http",
        startsAt: "2026-09-09T10:05:00Z"
      })

      const incidents = await listIncidents(app)
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({
        service: "connect-api",
        environment: "local",
        incidentScope: "scope:http",
        status: "open",
        activeAlerts: 2
      })
      const incident = await getIncident(app, incidents[0]!.id)
      expect(incident.occurrences.map(({ alertName }) => alertName)).toEqual([
        "Connect availability degraded",
        "HTTP server errors detected"
      ])
    } finally {
      await app.close()
    }
  })

  it.each([
    {
      dimension: "scope",
      first: { incidentScope: "http" },
      second: { incidentScope: "dependency" }
    },
    {
      dimension: "service",
      first: { incidentScope: "http", service: "connect-api" },
      second: { incidentScope: "http", service: "payments" }
    },
    {
      dimension: "environment",
      first: { incidentScope: "http", environment: "local" },
      second: { incidentScope: "http", environment: "staging" }
    }
  ])("keeps different $dimension values in separate incidents", async ({ first, second }) => {
    const app = makeTestApp()
    try {
      await sendAlert(app, {
        alertName: "Signal A",
        fingerprint: "signal-a",
        startsAt: "2026-09-09T10:00:00Z",
        ...first
      })
      await sendAlert(app, {
        alertName: "Signal B",
        fingerprint: "signal-b",
        startsAt: "2026-09-09T10:01:00Z",
        ...second
      })

      const incidents = await listIncidents(app)
      expect(incidents).toHaveLength(2)
      for (const summary of incidents) {
        const incident = await getIncident(app, summary.id)
        expect(incident.occurrences).toHaveLength(1)
        expect(incident.occurrences[0]).toMatchObject({
          service: incident.service,
          environment: incident.environment,
          incidentScope: incident.incidentScope
        })
      }
    } finally {
      await app.close()
    }
  })

  it("produces the same grouping for chronological and reverse arrival", async () => {
    const chronological: ReadonlyArray<AlertInput> = [
      {
        alertName: "Signal A",
        fingerprint: "signal-a",
        incidentScope: "http",
        startsAt: "2026-09-09T10:00:00Z"
      },
      {
        alertName: "Signal B",
        fingerprint: "signal-b",
        incidentScope: "http",
        startsAt: "2026-09-09T10:30:00Z"
      }
    ]

    for (const arrivalOrder of [chronological, [...chronological].reverse()]) {
      const app = makeTestApp()
      try {
        for (const alert of arrivalOrder) await sendAlert(app, alert)

        const incidents = await listIncidents(app)
        expect(incidents).toHaveLength(1)
        expect(incidents[0]?.activeAlerts).toBe(2)
      } finally {
        await app.close()
      }
    }
  })

  it("keeps resolved occurrences outside cooldown in separate incidents", async () => {
    const app = makeTestApp()
    try {
      await sendAlert(app, {
        alertName: "Signal A",
        fingerprint: "signal-a",
        incidentScope: "http",
        status: "resolved",
        startsAt: "2026-09-09T10:00:00Z"
      })
      await sendAlert(app, {
        alertName: "Signal B",
        fingerprint: "signal-b",
        incidentScope: "http",
        status: "resolved",
        startsAt: "2026-09-09T10:11:00Z"
      })

      const incidents = await listIncidents(app)
      expect(incidents).toHaveLength(2)
      expect(incidents.every(({ status }) => status === "awaiting_confirmation")).toBe(true)
    } finally {
      await app.close()
    }
  })

  it("merges incidents when a late occurrence connects both intervals", async () => {
    const app = makeTestApp()
    try {
      for (const alert of [
        {
          alertName: "Signal A",
          fingerprint: "signal-a",
          incidentScope: "http",
          status: "resolved" as const,
          startsAt: "2026-09-09T10:00:00Z"
        },
        {
          alertName: "Signal C",
          fingerprint: "signal-c",
          incidentScope: "http",
          status: "resolved" as const,
          startsAt: "2026-09-09T10:20:00Z"
        },
        {
          alertName: "Bridge signal",
          fingerprint: "bridge",
          incidentScope: "http",
          status: "resolved" as const,
          startsAt: "2026-09-09T10:09:00Z",
          endsAt: "2026-09-09T10:11:00Z"
        }
      ]) await sendAlert(app, alert)

      const incidents = await listIncidents(app)
      expect(incidents).toHaveLength(1)
      const incident = await getIncident(app, incidents[0]!.id)
      expect(incident.occurrences).toHaveLength(3)
    } finally {
      await app.close()
    }
  })

  it("splits a provisional association after a late resolution bounds its interval", async () => {
    const app = makeTestApp()
    try {
      await sendAlert(app, {
        alertName: "Signal A",
        fingerprint: "signal-a",
        incidentScope: "http",
        startsAt: "2026-09-09T10:00:00Z"
      })
      await sendAlert(app, {
        alertName: "Signal B",
        fingerprint: "signal-b",
        incidentScope: "http",
        startsAt: "2026-09-09T10:30:00Z"
      })
      expect(await listIncidents(app)).toHaveLength(1)

      await sendAlert(app, {
        alertName: "Signal A",
        fingerprint: "signal-a",
        incidentScope: "http",
        status: "resolved",
        startsAt: "2026-09-09T10:00:00Z",
        endsAt: "2026-09-09T10:01:00Z"
      })

      const incidents = await listIncidents(app)
      expect(incidents).toHaveLength(2)
      expect(incidents.map(({ activeAlerts }) => activeAlerts).sort()).toEqual([0, 1])
    } finally {
      await app.close()
    }
  })
})
