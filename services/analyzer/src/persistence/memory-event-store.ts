import { Effect, Option } from "effect"
import {
  correlationKeyFor,
  occurrenceKeyFor,
  type AlertOccurrence
} from "../domain/alert-occurrence.js"
import type { Incident } from "../domain/incident.js"
import type { EventStore, StoredAlertEvent } from "./event-store.js"

const correlationWindowMs = 10 * 60 * 1_000

export const makeMemoryEventStore = (options?: {
  readonly now?: () => Date
}): EventStore => {
  const storedEvents = new Map<string, StoredAlertEvent>()
  const occurrences = new Map<string, AlertOccurrence>()
  const occurrenceIdsByKey = new Map<string, string>()
  const incidentIdsByOccurrence = new Map<string, string>()
  const incidents = new Map<string, Incident>()
  const now = options?.now ?? (() => new Date())
  let eventSequence = 0
  let occurrenceSequence = 0
  let incidentSequence = 0

  const occurrencesFor = (incidentId: string): ReadonlyArray<AlertOccurrence> =>
    Array.from(occurrences.values()).filter(
      (occurrence) => incidentIdsByOccurrence.get(occurrence.id) === incidentId
    )

  const refreshIncident = (incidentId: string, changedAt: Date): void => {
    const incident = incidents.get(incidentId)
    if (incident === undefined) throw new Error(`Incident ${incidentId} is missing`)
    const related = occurrencesFor(incidentId)
    const hasOpenOccurrence = related.some((occurrence) => occurrence.status === "open")
    const detectedAt = related.reduce(
      (earliest, occurrence) => occurrence.startedAt < earliest ? occurrence.startedAt : earliest,
      incident.detectedAt
    )
    const lastActivityAt = related.reduce((latest, occurrence) => {
      const candidate = occurrence.endedAt ?? occurrence.startedAt
      return candidate > latest ? candidate : latest
    }, incident.detectedAt)

    incidents.set(incidentId, {
      ...incident,
      status: hasOpenOccurrence ? "open" : "awaiting_confirmation",
      detectedAt,
      lastActivityAt,
      signalsClearedAt: hasOpenOccurrence ? null : lastActivityAt,
      updatedAt: changedAt
    })
  }

  const incidentForNewOccurrence = (
    occurrence: AlertOccurrence,
    changedAt: Date
  ): string => {
    const candidates = Array.from(incidents.values()).filter((incident) =>
      incident.status !== "closed" &&
      incident.service === occurrence.service &&
      incident.environment === occurrence.environment &&
      incident.detectedAt.getTime() <= occurrence.startedAt.getTime() + correlationWindowMs &&
      incident.lastActivityAt.getTime() >= occurrence.startedAt.getTime() - correlationWindowMs
    )

    if (candidates.length === 1 && candidates[0] !== undefined) {
      return candidates[0].id
    }

    incidentSequence += 1
    const incidentId = `memory-incident-${incidentSequence}`
    incidents.set(incidentId, {
      id: incidentId,
      status: occurrence.status === "open" ? "open" : "awaiting_confirmation",
      service: occurrence.service,
      environment: occurrence.environment,
      detectedAt: occurrence.startedAt,
      lastActivityAt: occurrence.endedAt ?? occurrence.startedAt,
      signalsClearedAt: occurrence.status === "open"
        ? null
        : occurrence.endedAt ?? occurrence.startedAt,
      createdAt: changedAt,
      updatedAt: changedAt
    })
    return incidentId
  }

  return {
    record: (events) => Effect.sync(() => {
      const insertedEventIds: Array<string> = []
      const duplicateEventIds: Array<string> = []

      for (const event of events) {
        if (storedEvents.has(event.eventId)) {
          duplicateEventIds.push(event.eventId)
          continue
        }

        const correlationKey = correlationKeyFor(event)
        const occurrenceKey = occurrenceKeyFor(event)
        const existingOccurrenceId = occurrenceIdsByKey.get(occurrenceKey)
        const changedAt = now()
        let occurrenceId = existingOccurrenceId
        let incidentId: string

        if (occurrenceId !== undefined) {
          const occurrence = occurrences.get(occurrenceId)
          if (occurrence === undefined) throw new Error(`Occurrence ${occurrenceId} is missing`)

          occurrences.set(occurrenceId, event.state === "resolved"
            ? { ...occurrence, status: "resolved", endedAt: event.endedAt, updatedAt: changedAt }
            : {
                ...occurrence,
                firingObserved: true,
                updatedAt: occurrence.firingObserved ? occurrence.updatedAt : changedAt
              })
          incidentId = incidentIdsByOccurrence.get(occurrenceId) ?? ""
          if (incidentId.length === 0) throw new Error(`Occurrence ${occurrenceId} has no incident`)
        } else {
          if (event.state === "firing") {
            for (const occurrence of occurrences.values()) {
              if (occurrence.correlationKey === correlationKey && occurrence.status === "open") {
                occurrences.set(occurrence.id, {
                  ...occurrence,
                  status: "closed_unconfirmed",
                  updatedAt: changedAt
                })
                const supersededIncidentId = incidentIdsByOccurrence.get(occurrence.id)
                if (supersededIncidentId !== undefined) {
                  refreshIncident(supersededIncidentId, changedAt)
                }
              }
            }
          }

          occurrenceSequence += 1
          occurrenceId = `memory-occurrence-${occurrenceSequence}`
          const occurrence: AlertOccurrence = {
            id: occurrenceId,
            correlationKey,
            status: event.state === "firing" ? "open" : "resolved",
            alertName: event.alertName,
            service: event.service,
            environment: event.environment,
            alertFingerprint: event.alertFingerprint,
            startedAt: event.startedAt,
            endedAt: event.endedAt,
            firingObserved: event.state === "firing",
            createdAt: changedAt,
            updatedAt: changedAt
          }
          occurrences.set(occurrenceId, occurrence)
          occurrenceIdsByKey.set(occurrenceKey, occurrenceId)
          incidentId = incidentForNewOccurrence(occurrence, changedAt)
          incidentIdsByOccurrence.set(occurrenceId, incidentId)
        }

        refreshIncident(incidentId, changedAt)
        eventSequence += 1
        storedEvents.set(event.eventId, {
          id: `memory-event-${eventSequence}`,
          occurrenceId,
          incidentId,
          storedAt: changedAt,
          event
        })
        insertedEventIds.push(event.eventId)
      }

      return { insertedEventIds, duplicateEventIds }
    }),
    findByEventId: (eventId) => Effect.sync(() =>
      Option.fromNullable(storedEvents.get(eventId))
    ),
    findByIncidentId: (incidentId) => Effect.sync(() =>
      Array.from(storedEvents.values()).filter(
        (storedEvent) => storedEvent.incidentId === incidentId
      )
    ),
    findIncidentById: (incidentId) => Effect.sync(() =>
      Option.fromNullable(incidents.get(incidentId))
    ),
    findOccurrencesByIncidentId: (incidentId) => Effect.sync(() =>
      occurrencesFor(incidentId)
    )
  }
}
