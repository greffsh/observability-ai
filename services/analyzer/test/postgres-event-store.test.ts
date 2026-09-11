import { PgClient } from "@effect/sql-pg"
import { Effect, ManagedRuntime, Option, Redacted } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { AlertEvent } from "../src/contracts/alert-event.ts"
import { migrateDatabase } from "../src/database/migrate.ts"
import type { EventStore } from "../src/persistence/event-store.ts"
import { makePostgresEventStore } from "../src/persistence/postgres-event-store.ts"

const databaseUrl = process.env.TEST_DATABASE_URL
const integration = describe.skipIf(databaseUrl === undefined)

const event = (overrides: Partial<AlertEvent> = {}): AlertEvent => ({
  schemaVersion: 1,
  source: "grafana",
  eventId: "availability:firing:2026-08-28T10:00:00.000Z",
  alertFingerprint: "availability",
  alertName: "Availability",
  service: "connect",
  environment: "local",
  state: "firing",
  startedAt: new Date("2026-08-28T10:00:00Z"),
  endedAt: null,
  receivedAt: new Date("2026-08-28T10:00:05Z"),
  labels: { incident_scope: "http" },
  annotations: {},
  generatorUrl: null,
  ...overrides
})

integration("PostgreSQL incident correlation", () => {
  let runtime: ManagedRuntime.ManagedRuntime<PgClient.PgClient, never>
  let store: EventStore
  let appliedMigrations: ReadonlyArray<readonly [id: number, name: string]>

  beforeAll(async () => {
    const redactedUrl = Redacted.make(databaseUrl!)
    appliedMigrations = await Effect.runPromise(migrateDatabase(redactedUrl))
    runtime = ManagedRuntime.make(PgClient.layer({ url: redactedUrl }))
    store = await runtime.runPromise(makePostgresEventStore)
  })

  beforeEach(async () => {
    await runtime.runPromise(Effect.gen(function* () {
      const sql = yield* PgClient.PgClient
      yield* sql.unsafe("TRUNCATE TABLE alert_events, incident_occurrences, alert_occurrences, incidents RESTART IDENTITY CASCADE")
    }))
  })

  afterAll(async () => {
    await runtime?.dispose()
  })

  it("bootstraps an empty database from one consolidated baseline", () => {
    expect(appliedMigrations).toEqual([[1, "initial_schema"]])
  })

  it("keeps compatible late alerts in an incident with an open occurrence", async () => {
    const lateErrorRate = event({
      eventId: "errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "errors",
      alertName: "Error rate",
      startedAt: new Date("2026-08-28T10:30:00Z")
    })

    await runtime.runPromise(store.record([event(), lateErrorRate]))

    const incidents = await runtime.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(1)
    expect(await runtime.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
      .toHaveLength(2)
  })

  it("keeps open occurrences together in reverse chronological order", async () => {
    const lateErrorRate = event({
      eventId: "errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "errors",
      alertName: "Error rate",
      startedAt: new Date("2026-08-28T10:30:00Z")
    })

    await runtime.runPromise(store.record([lateErrorRate, event()]))

    const incidents = await runtime.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(1)
    expect(await runtime.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
      .toHaveLength(2)
  })

  it("keeps one incident when resolution bounds an earlier open occurrence", async () => {
    const availabilityResolved = event({
      eventId: "availability:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      endedAt: new Date("2026-08-28T10:40:00Z")
    })
    const errorRateResolved = event({
      eventId: "errors:resolved:2026-08-28T10:30:00.000Z",
      alertFingerprint: "errors",
      alertName: "Error rate",
      state: "resolved",
      startedAt: new Date("2026-08-28T10:30:00Z"),
      endedAt: new Date("2026-08-28T10:30:00Z")
    })

    await runtime.runPromise(store.record([
      errorRateResolved,
      event(),
      availabilityResolved
    ]))

    const incidents = await runtime.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(1)
    expect(await runtime.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
      .toHaveLength(2)
  })

  it("separates provisionally grouped occurrences when a late resolution disconnects them", async () => {
    const availabilityResolved = event({
      eventId: "availability:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      endedAt: new Date("2026-08-28T10:01:00Z")
    })
    const errorRateFiring = event({
      eventId: "errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "errors",
      alertName: "Error rate",
      startedAt: new Date("2026-08-28T10:30:00Z")
    })

    await runtime.runPromise(store.record([event(), errorRateFiring, availabilityResolved]))

    const incidents = await runtime.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(2)
    expect(incidents.map((incident) => incident.activeAlerts).sort()).toEqual([0, 1])
  })

  it("merges incidents connected by an out-of-order occurrence", async () => {
    const resolvedAt = (name: string, minute: number): AlertEvent => event({
      eventId: `${name}:resolved:2026-08-28T10:${String(minute).padStart(2, "0")}:00.000Z`,
      alertFingerprint: name,
      alertName: name,
      state: "resolved",
      startedAt: new Date(Date.UTC(2026, 7, 28, 10, minute)),
      endedAt: new Date(Date.UTC(2026, 7, 28, 10, minute))
    })
    const first = resolvedAt("availability", 0)
    const last = resolvedAt("latency", 18)
    const bridge = resolvedAt("errors", 9)

    await runtime.runPromise(store.record([first, last, bridge]))

    const incidents = await runtime.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(1)
    expect(await runtime.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
      .toHaveLength(3)

    const lastEvent = Option.getOrThrow(await runtime.runPromise(store.findByEventId(last.eventId)))
    expect(lastEvent.incidentId).toBe(incidents[0]!.id)

    const merged = await runtime.runPromise(store.listIncidents({ status: "merged" }))
    expect(merged).toHaveLength(1)
    expect(merged[0]!.mergedIntoIncidentId).toBe(incidents[0]!.id)
  })

  it("uses alert name when no explicit incident scope is provided", async () => {
    const availability = event({ labels: {} })
    const errors = event({
      eventId: "errors:firing:2026-08-28T10:01:00.000Z",
      alertFingerprint: "errors",
      alertName: "Error rate",
      labels: {},
      startedAt: new Date("2026-08-28T10:01:00Z")
    })

    await runtime.runPromise(store.record([availability, errors]))

    expect(await runtime.runPromise(store.listIncidents({}))).toHaveLength(2)
  })
})
