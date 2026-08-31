import { Effect, Option } from "effect"
import {
  correlationKeyFor,
  episodeKeyFor,
  type Incident
} from "../domain/incident.js"
import type { EventStore, StoredAlertEvent } from "./event-store.js"

export const makeMemoryEventStore = (options?: {
  readonly now?: () => Date
}): EventStore => {
  const storedEvents = new Map<string, StoredAlertEvent>()
  const incidents = new Map<string, Incident>()
  const incidentIdsByEpisode = new Map<string, string>()
  const openIncidentIdsByCorrelation = new Map<string, string>()
  const now = options?.now ?? (() => new Date())
  let eventSequence = 0
  let incidentSequence = 0

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
        const episodeKey = episodeKeyFor(event)
        const existingIncidentId = incidentIdsByEpisode.get(episodeKey)
        const changedAt = now()
        let incidentId = existingIncidentId

        if (incidentId !== undefined) {
          const incident = incidents.get(incidentId)
          if (incident === undefined) {
            throw new Error(`Incident ${incidentId} is missing`)
          }

          if (event.state === "resolved") {
            incidents.set(incidentId, {
              ...incident,
              status: "resolved",
              resolvedAt: event.endedAt,
              updatedAt: changedAt
            })
            if (openIncidentIdsByCorrelation.get(correlationKey) === incidentId) {
              openIncidentIdsByCorrelation.delete(correlationKey)
            }
          } else if (!incident.firingObserved) {
            incidents.set(incidentId, {
              ...incident,
              firingObserved: true,
              updatedAt: changedAt
            })
          }
        } else {
          if (event.state === "firing") {
            const openIncidentId = openIncidentIdsByCorrelation.get(correlationKey)
            if (openIncidentId !== undefined) {
              const openIncident = incidents.get(openIncidentId)
              if (openIncident !== undefined) {
                incidents.set(openIncidentId, {
                  ...openIncident,
                  status: "closed_unconfirmed",
                  updatedAt: changedAt
                })
              }
            }
          }

          incidentSequence += 1
          incidentId = `memory-incident-${incidentSequence}`
          const incident: Incident = {
            id: incidentId,
            correlationKey,
            status: event.state === "firing" ? "open" : "resolved",
            alertName: event.alertName,
            service: event.service,
            environment: event.environment,
            alertFingerprint: event.alertFingerprint,
            startedAt: event.startedAt,
            resolvedAt: event.endedAt,
            firingObserved: event.state === "firing",
            createdAt: changedAt,
            updatedAt: changedAt
          }
          incidents.set(incidentId, incident)
          incidentIdsByEpisode.set(episodeKey, incidentId)

          if (incident.status === "open") {
            openIncidentIdsByCorrelation.set(correlationKey, incidentId)
          }
        }

        eventSequence += 1
        storedEvents.set(event.eventId, {
          id: `memory-event-${eventSequence}`,
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
    findIncidentById: (incidentId) => Effect.sync(() =>
      Option.fromNullable(incidents.get(incidentId))
    )
  }
}
