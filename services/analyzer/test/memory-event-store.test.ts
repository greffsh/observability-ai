import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import type { AlertEvent } from "../src/contracts/alert-event.ts"
import { makeMemoryEventStore } from "../src/persistence/memory-event-store.ts"

const event = (overrides: Partial<AlertEvent> = {}): AlertEvent => ({
  schemaVersion: 1,
  source: "grafana",
  eventId: "checkout:firing:2026-08-28T10:00:00.000Z",
  alertFingerprint: "checkout",
  alertName: "Checkout unavailable",
  service: "checkout-api",
  environment: "local",
  state: "firing",
  startedAt: new Date("2026-08-28T10:00:00Z"),
  endedAt: null,
  receivedAt: new Date("2026-08-28T10:00:05Z"),
  labels: {},
  annotations: {},
  generatorUrl: null,
  ...overrides
})

const required = <A>(value: Option.Option<A>): A => Option.getOrThrow(value)

describe("in-memory incident correlation", () => {
  it("does not create or update an incident for a duplicate event", async () => {
    let tick = 0
    const store = makeMemoryEventStore({
      now: () => new Date(Date.UTC(2026, 7, 28, 10, 1, tick++))
    })
    const firing = event()

    const first = await Effect.runPromise(store.record([firing]))
    const storedEvent = required(await Effect.runPromise(
      store.findByEventId(firing.eventId)
    ))
    const beforeDuplicate = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(storedEvent.incidentId)))
    ))
    const duplicate = await Effect.runPromise(store.record([firing]))
    const afterDuplicate = required(await Effect.runPromise(
      store.findIncidentById(beforeDuplicate.id)
    ))

    expect(first.insertedEventIds).toEqual([firing.eventId])
    expect(duplicate.duplicateEventIds).toEqual([firing.eventId])
    expect(afterDuplicate).toEqual(beforeDuplicate)
  })

  it("resolves the incident for the same episode", async () => {
    const store = makeMemoryEventStore()
    const firing = event()
    const resolved = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      endedAt: new Date("2026-08-28T10:10:00Z")
    })

    await Effect.runPromise(store.record([firing, resolved]))
    const storedFiring = required(await Effect.runPromise(
      store.findByEventId(firing.eventId)
    ))
    const storedResolved = required(await Effect.runPromise(
      store.findByEventId(resolved.eventId)
    ))
    const incident = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(storedFiring.incidentId)))
    ))

    expect(storedResolved.incidentId).toBe(storedFiring.incidentId)
    expect(incident).toMatchObject({
      status: "resolved",
      firingObserved: true,
      resolvedAt: new Date("2026-08-28T10:10:00Z")
    })
  })

  it("completes a reconstructed incident when firing arrives after resolved", async () => {
    const store = makeMemoryEventStore()
    const resolved = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      endedAt: new Date("2026-08-28T10:10:00Z")
    })
    const firing = event()

    await Effect.runPromise(store.record([resolved]))
    const storedResolved = required(await Effect.runPromise(
      store.findByEventId(resolved.eventId)
    ))
    await Effect.runPromise(store.record([firing]))
    const incident = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(storedResolved.incidentId)))
    ))

    expect(incident.status).toBe("resolved")
    expect(incident.firingObserved).toBe(true)
  })

  it("keeps a newer episode open when the previous resolution arrives late", async () => {
    const store = makeMemoryEventStore()
    const firstFiring = event()
    const secondFiring = event({
      eventId: "checkout:firing:2026-08-28T11:00:00.000Z",
      startedAt: new Date("2026-08-28T11:00:00Z")
    })
    const lateResolution = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      endedAt: new Date("2026-08-28T10:30:00Z")
    })

    await Effect.runPromise(store.record([firstFiring, secondFiring]))
    const firstStored = required(await Effect.runPromise(
      store.findByEventId(firstFiring.eventId)
    ))
    const secondStored = required(await Effect.runPromise(
      store.findByEventId(secondFiring.eventId)
    ))
    const closed = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(firstStored.incidentId)))
    ))

    expect(closed.status).toBe("closed_unconfirmed")

    await Effect.runPromise(store.record([lateResolution]))
    const previous = required(await Effect.runPromise(
      store.findIncidentById(closed.id)
    ))
    const current = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(secondStored.incidentId)))
    ))

    expect(previous.status).toBe("resolved")
    expect(current.status).toBe("open")

    const thirdFiring = event({
      eventId: "checkout:firing:2026-08-28T12:00:00.000Z",
      startedAt: new Date("2026-08-28T12:00:00Z")
    })
    await Effect.runPromise(store.record([thirdFiring]))
    const superseded = required(await Effect.runPromise(
      store.findIncidentById(current.id)
    ))

    expect(superseded.status).toBe("closed_unconfirmed")
  })

  it("does not correlate different services or environments", async () => {
    const store = makeMemoryEventStore()
    const localCheckout = event()
    const productionCheckout = event({
      eventId: "checkout-production:firing:2026-08-28T10:00:00.000Z",
      environment: "production"
    })
    const localPayments = event({
      eventId: "payments:firing:2026-08-28T10:00:00.000Z",
      service: "payments-api"
    })

    await Effect.runPromise(store.record([
      localCheckout,
      productionCheckout,
      localPayments
    ]))
    const incidentIds = await Promise.all(
      [localCheckout, productionCheckout, localPayments].map(async (item) =>
        required(Option.fromNullable(required(await Effect.runPromise(
          store.findByEventId(item.eventId)
        )).incidentId))
      )
    )

    expect(new Set(incidentIds).size).toBe(3)
  })
})
