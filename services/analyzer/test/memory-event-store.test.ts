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

  it("resolves an occurrence and moves its incident to awaiting confirmation", async () => {
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
    const occurrences = await Effect.runPromise(
      store.findOccurrencesByIncidentId(incident.id)
    )

    expect(storedResolved.incidentId).toBe(storedFiring.incidentId)
    expect(incident).toMatchObject({
      status: "awaiting_confirmation",
      signalsClearedAt: new Date("2026-08-28T10:10:00Z")
    })
    expect(occurrences).toEqual([expect.objectContaining({
      status: "resolved",
      firingObserved: true,
      endedAt: new Date("2026-08-28T10:10:00Z")
    })])
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

    const occurrences = await Effect.runPromise(
      store.findOccurrencesByIncidentId(incident.id)
    )
    expect(incident.status).toBe("awaiting_confirmation")
    expect(occurrences[0]).toMatchObject({ status: "resolved", firingObserved: true })
  })

  it("keeps a closed incident terminal when a late firing completes its occurrence", async () => {
    const closedAt = new Date("2026-08-28T10:11:00Z")
    const store = makeMemoryEventStore()
    const resolved = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      endedAt: new Date("2026-08-28T10:10:00Z")
    })

    await Effect.runPromise(store.record([resolved]))
    const storedResolved = required(await Effect.runPromise(
      store.findByEventId(resolved.eventId)
    ))
    const incidentId = required(Option.fromNullable(storedResolved.incidentId))
    await Effect.runPromise(store.closeIncident({
      incidentId,
      closedAt,
      closedBy: "test-operator",
      reason: "recovery_confirmed",
      note: null
    }))

    await Effect.runPromise(store.record([event()]))
    const incident = required(await Effect.runPromise(store.findIncidentById(incidentId)))

    expect(incident.status).toBe("closed")
    expect(incident.closure).toMatchObject({ closedAt, closedBy: "test-operator" })
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
    const previousIncident = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(firstStored.incidentId)))
    ))

    expect(previousIncident.status).toBe("awaiting_confirmation")
    expect((await Effect.runPromise(
      store.findOccurrencesByIncidentId(previousIncident.id)
    ))[0]?.status).toBe("closed_unconfirmed")

    await Effect.runPromise(store.record([lateResolution]))
    const previous = required(await Effect.runPromise(
      store.findIncidentById(previousIncident.id)
    ))
    const current = required(await Effect.runPromise(
      store.findIncidentById(required(Option.fromNullable(secondStored.incidentId)))
    ))

    expect(previous.status).toBe("awaiting_confirmation")
    expect(current.status).toBe("open")

    const thirdFiring = event({
      eventId: "checkout:firing:2026-08-28T12:00:00.000Z",
      startedAt: new Date("2026-08-28T12:00:00Z")
    })
    await Effect.runPromise(store.record([thirdFiring]))
    const supersededIncident = required(await Effect.runPromise(
      store.findIncidentById(current.id)
    ))

    expect(supersededIncident.status).toBe("awaiting_confirmation")
    expect((await Effect.runPromise(
      store.findOccurrencesByIncidentId(current.id)
    ))[0]?.status).toBe("closed_unconfirmed")
  })

  it("groups related occurrences and keeps the incident open until all resolve", async () => {
    const store = makeMemoryEventStore()
    const availabilityFiring = event()
    const errorsFiring = event({
      eventId: "checkout-errors:firing:2026-08-28T10:01:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      startedAt: new Date("2026-08-28T10:01:00Z")
    })

    const scopedAvailabilityFiring = {
      ...availabilityFiring,
      labels: { incident_scope: "checkout-http" }
    }

    await Effect.runPromise(store.record([errorsFiring, scopedAvailabilityFiring]))
    const availabilityStored = required(await Effect.runPromise(
      store.findByEventId(scopedAvailabilityFiring.eventId)
    ))
    const errorsStored = required(await Effect.runPromise(
      store.findByEventId(errorsFiring.eventId)
    ))
    expect(errorsStored.incidentId).toBe(availabilityStored.incidentId)

    const incidentId = required(Option.fromNullable(availabilityStored.incidentId))
    expect(await Effect.runPromise(store.findOccurrencesByIncidentId(incidentId))).toHaveLength(2)
    expect(required(await Effect.runPromise(store.findIncidentById(incidentId))).detectedAt)
      .toEqual(new Date("2026-08-28T10:00:00Z"))

    await Effect.runPromise(store.record([event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      state: "resolved",
      labels: { incident_scope: "checkout-http" },
      endedAt: new Date("2026-08-28T10:05:00Z")
    })]))
    expect(required(await Effect.runPromise(store.findIncidentById(incidentId))).status).toBe("open")

    await Effect.runPromise(store.record([event({
      eventId: "checkout-errors:resolved:2026-08-28T10:01:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      startedAt: new Date("2026-08-28T10:01:00Z"),
      endedAt: new Date("2026-08-28T10:06:00Z")
    })]))
    expect(required(await Effect.runPromise(store.findIncidentById(incidentId))).status)
      .toBe("awaiting_confirmation")
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

  it("uses alert name as a conservative incident scope fallback", async () => {
    const store = makeMemoryEventStore()
    const availability = event()
    const errorRate = event({
      eventId: "checkout-errors:firing:2026-08-28T10:01:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      startedAt: new Date("2026-08-28T10:01:00Z")
    })

    await Effect.runPromise(store.record([availability, errorRate]))

    const incidents = await Effect.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(2)
  })

  it("does not fragment a compatible incident while an occurrence remains open", async () => {
    const store = makeMemoryEventStore()
    const availability = event({ labels: { incident_scope: "checkout-http" } })
    const errorRate = event({
      eventId: "checkout-errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      startedAt: new Date("2026-08-28T10:30:00Z")
    })

    await Effect.runPromise(store.record([availability, errorRate]))

    const availabilityEvent = required(await Effect.runPromise(
      store.findByEventId(availability.eventId)
    ))
    const errorRateEvent = required(await Effect.runPromise(
      store.findByEventId(errorRate.eventId)
    ))
    expect(errorRateEvent.incidentId).toBe(availabilityEvent.incidentId)
  })

  it("does not fragment open occurrences received in reverse chronological order", async () => {
    const store = makeMemoryEventStore()
    const availability = event({ labels: { incident_scope: "checkout-http" } })
    const errorRate = event({
      eventId: "checkout-errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      startedAt: new Date("2026-08-28T10:30:00Z")
    })

    await Effect.runPromise(store.record([errorRate, availability]))

    const incidents = await Effect.runPromise(store.listIncidents({}))
    expect(incidents).toHaveLength(1)
    expect(await Effect.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
      .toHaveLength(2)
  })

  it("keeps one incident when resolution bounds an earlier open occurrence", async () => {
    const availabilityFiring = event({ labels: { incident_scope: "checkout-http" } })
    const availabilityResolved = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      endedAt: new Date("2026-08-28T10:40:00Z")
    })
    const errorRateResolved = event({
      eventId: "checkout-errors:resolved:2026-08-28T10:30:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      startedAt: new Date("2026-08-28T10:30:00Z"),
      endedAt: new Date("2026-08-28T10:30:00Z")
    })

    const arrivalOrders = [
      [errorRateResolved, availabilityFiring, availabilityResolved],
      [availabilityResolved, errorRateResolved, availabilityFiring]
    ]

    for (const arrivalOrder of arrivalOrders) {
      const store = makeMemoryEventStore()
      await Effect.runPromise(store.record(arrivalOrder))

      const incidents = await Effect.runPromise(store.listIncidents({}))
      expect(incidents, arrivalOrder.map((item) => item.eventId).join(" -> "))
        .toHaveLength(1)
      expect(await Effect.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
        .toHaveLength(2)
    }
  })

  it("separates provisionally grouped occurrences when a late resolution disconnects them", async () => {
    const availabilityFiring = event({ labels: { incident_scope: "checkout-http" } })
    const availabilityResolved = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      endedAt: new Date("2026-08-28T10:01:00Z")
    })
    const errorRateFiring = event({
      eventId: "checkout-errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      startedAt: new Date("2026-08-28T10:30:00Z")
    })
    const arrivalOrders = [
      [availabilityFiring, errorRateFiring, availabilityResolved],
      [availabilityFiring, availabilityResolved, errorRateFiring],
      [errorRateFiring, availabilityFiring, availabilityResolved],
      [errorRateFiring, availabilityResolved, availabilityFiring],
      [availabilityResolved, availabilityFiring, errorRateFiring],
      [availabilityResolved, errorRateFiring, availabilityFiring]
    ]

    for (const arrivalOrder of arrivalOrders) {
      const store = makeMemoryEventStore()
      await Effect.runPromise(store.record(arrivalOrder))

      const incidents = await Effect.runPromise(store.listIncidents({}))
      expect(incidents, arrivalOrder.map((item) => item.eventId).join(" -> "))
        .toHaveLength(2)
      expect(incidents.map((incident) => incident.activeAlerts).sort()).toEqual([0, 1])
    }
  })

  it("does not correlate an open occurrence after a resolved interval outside cooldown", async () => {
    const resolved = event({
      eventId: "checkout:resolved:2026-08-28T10:00:00.000Z",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      endedAt: new Date("2026-08-28T10:00:00Z")
    })
    const laterOpen = event({
      eventId: "checkout-errors:firing:2026-08-28T10:30:00.000Z",
      alertFingerprint: "checkout-errors",
      alertName: "Checkout error rate high",
      labels: { incident_scope: "checkout-http" },
      startedAt: new Date("2026-08-28T10:30:00Z")
    })

    for (const arrivalOrder of [[resolved, laterOpen], [laterOpen, resolved]]) {
      const store = makeMemoryEventStore()
      await Effect.runPromise(store.record(arrivalOrder))

      expect(await Effect.runPromise(store.listIncidents({})),
        arrivalOrder.map((item) => item.eventId).join(" -> ")).toHaveLength(2)
    }
  })

  it("produces the same incident partition for every event arrival order", async () => {
    const resolvedAt = (name: string, minute: number): AlertEvent => event({
      eventId: `${name}:resolved:2026-08-28T10:${String(minute).padStart(2, "0")}:00.000Z`,
      alertFingerprint: name,
      alertName: name,
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      startedAt: new Date(Date.UTC(2026, 7, 28, 10, minute)),
      endedAt: new Date(Date.UTC(2026, 7, 28, 10, minute))
    })
    const inputs = [resolvedAt("availability", 0), resolvedAt("errors", 9), resolvedAt("latency", 18)]
    const permutations = [
      [inputs[0], inputs[1], inputs[2]],
      [inputs[0], inputs[2], inputs[1]],
      [inputs[1], inputs[0], inputs[2]],
      [inputs[1], inputs[2], inputs[0]],
      [inputs[2], inputs[0], inputs[1]],
      [inputs[2], inputs[1], inputs[0]]
    ] as const

    for (const arrivalOrder of permutations) {
      const store = makeMemoryEventStore()
      for (const alertEvent of arrivalOrder) {
        await Effect.runPromise(store.record([alertEvent]))
      }

      const incidents = await Effect.runPromise(store.listIncidents({}))
      expect(incidents, arrivalOrder.map((item) => item.alertName).join(" -> ")).toHaveLength(1)
      expect(await Effect.runPromise(store.findOccurrencesByIncidentId(incidents[0]!.id)))
        .toHaveLength(3)
    }
  })

  it("keeps merged incident identities as auditable aliases", async () => {
    const store = makeMemoryEventStore()
    const first = event({
      eventId: "availability:resolved:2026-08-28T10:00:00.000Z",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      endedAt: new Date("2026-08-28T10:00:00Z")
    })
    const last = event({
      eventId: "latency:resolved:2026-08-28T10:18:00.000Z",
      alertFingerprint: "latency",
      alertName: "Latency",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      startedAt: new Date("2026-08-28T10:18:00Z"),
      endedAt: new Date("2026-08-28T10:18:00Z")
    })
    const bridge = event({
      eventId: "errors:resolved:2026-08-28T10:09:00.000Z",
      alertFingerprint: "errors",
      alertName: "Errors",
      labels: { incident_scope: "checkout-http" },
      state: "resolved",
      startedAt: new Date("2026-08-28T10:09:00Z"),
      endedAt: new Date("2026-08-28T10:09:00Z")
    })

    await Effect.runPromise(store.record([first, last]))
    const firstIncidentId = required(Option.fromNullable(required(await Effect.runPromise(
      store.findByEventId(first.eventId)
    )).incidentId))
    const lastIncidentId = required(Option.fromNullable(required(await Effect.runPromise(
      store.findByEventId(last.eventId)
    )).incidentId))
    await Effect.runPromise(store.record([bridge]))

    expect(required(await Effect.runPromise(store.findIncidentById(lastIncidentId))))
      .toMatchObject({ status: "merged", mergedIntoIncidentId: firstIncidentId })
    expect(required(await Effect.runPromise(store.findByEventId(last.eventId))).incidentId)
      .toBe(firstIncidentId)
  })
})
