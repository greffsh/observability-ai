import { Effect, Option } from "effect"
import {
  correlationKeyFor,
  occurrenceKeyFor,
  type AlertOccurrence
} from "../domain/alert-occurrence.js"
import type { Incident } from "../domain/incident.js"
import {
  correlateOccurrence,
  incidentScopeFor,
  partitionIncidentOccurrences
} from "../domain/incident-correlation.js"
import type { EventStore, StoredAlertEvent } from "./event-store.js"

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
    if (incident.status === "closed" || incident.status === "merged") return
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

  const createIncident = (
    related: ReadonlyArray<AlertOccurrence>,
    changedAt: Date
  ): string => {
    const ordered = [...related].sort((left, right) =>
      left.startedAt.getTime() - right.startedAt.getTime() || left.id.localeCompare(right.id)
    )
    const first = ordered[0]
    if (first === undefined) throw new Error("Cannot create an incident without occurrences")
    const hasOpenOccurrence = ordered.some((occurrence) => occurrence.status === "open")
    const lastActivityAt = ordered.reduce((latest, occurrence) => {
      const activity = occurrence.endedAt ?? occurrence.startedAt
      return activity > latest ? activity : latest
    }, first.startedAt)

    incidentSequence += 1
    const incidentId = `memory-incident-${incidentSequence}`
    incidents.set(incidentId, {
      id: incidentId,
      status: hasOpenOccurrence ? "open" : "awaiting_confirmation",
      service: first.service,
      environment: first.environment,
      incidentScope: first.incidentScope,
      mergedIntoIncidentId: null,
      detectedAt: first.startedAt,
      lastActivityAt,
      signalsClearedAt: hasOpenOccurrence ? null : lastActivityAt,
      closure: null,
      createdAt: changedAt,
      updatedAt: changedAt
    })
    return incidentId
  }

  const splitIncidentIfDisconnected = (incidentId: string, changedAt: Date): void => {
    const incident = incidents.get(incidentId)
    if (incident === undefined || incident.status === "closed" || incident.status === "merged") {
      return
    }

    const partitions = partitionIncidentOccurrences(occurrencesFor(incidentId))
    if (partitions.length <= 1) return

    for (const partition of partitions.slice(1)) {
      const newIncidentId = createIncident(partition, changedAt)
      for (const occurrence of partition) {
        incidentIdsByOccurrence.set(occurrence.id, newIncidentId)
        for (const [eventId, storedEvent] of storedEvents) {
          if (storedEvent.occurrenceId === occurrence.id) {
            storedEvents.set(eventId, { ...storedEvent, incidentId: newIncidentId })
          }
        }
      }
    }

    refreshIncident(incidentId, changedAt)
  }

  const incidentForNewOccurrence = (
    occurrence: AlertOccurrence,
    changedAt: Date
  ): string => {
    const decision = correlateOccurrence(
      occurrence,
      Array.from(incidents.values()).map((incident) => ({
        ...incident,
        openOccurrences: occurrencesFor(incident.id).filter(
          (item) => item.status === "open"
        ).length
      }))
    )

    if (decision.outcome === "associate") {
      for (const mergedIncidentId of decision.mergedIncidentIds) {
        const merged = incidents.get(mergedIncidentId)
        if (merged === undefined) continue

        for (const [occurrenceId, associatedIncidentId] of incidentIdsByOccurrence) {
          if (associatedIncidentId === mergedIncidentId) {
            incidentIdsByOccurrence.set(occurrenceId, decision.incidentId)
            for (const [eventId, storedEvent] of storedEvents) {
              if (storedEvent.occurrenceId === occurrenceId) {
                storedEvents.set(eventId, { ...storedEvent, incidentId: decision.incidentId })
              }
            }
          }
        }
        incidents.set(mergedIncidentId, {
          ...merged,
          status: "merged",
          signalsClearedAt: merged.signalsClearedAt ?? merged.lastActivityAt,
          mergedIntoIncidentId: decision.incidentId,
          closure: null,
          updatedAt: changedAt
        })
      }
      return decision.incidentId
    }

    return createIncident([occurrence], changedAt)
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
          if (event.state === "resolved") {
            splitIncidentIfDisconnected(incidentId, changedAt)
            incidentId = incidentIdsByOccurrence.get(occurrenceId) ?? incidentId
          }
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
            incidentScope: incidentScopeFor(event),
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
    listIncidents: (filter) => Effect.sync(() =>
      Array.from(incidents.values())
        .filter((incident) =>
          (filter.status !== undefined || incident.status !== "merged") &&
          (filter.status === undefined || incident.status === filter.status) &&
          (filter.service === undefined || incident.service === filter.service) &&
          (filter.environment === undefined || incident.environment === filter.environment)
        )
        .map((incident) => ({
          ...incident,
          activeAlerts: occurrencesFor(incident.id).filter(
            (occurrence) => occurrence.status === "open"
          ).length
        }))
        .sort((left, right) =>
          right.detectedAt.getTime() - left.detectedAt.getTime() ||
          left.id.localeCompare(right.id)
        )
        .slice(0, 100)
    ),
    findOccurrencesByIncidentId: (incidentId) => Effect.sync(() =>
      occurrencesFor(incidentId)
    ),
    closeIncident: (command) => Effect.sync(() => {
      const incident = incidents.get(command.incidentId)
      if (incident === undefined) return { outcome: "not_found" as const }

      if (incident.status === "closed") {
        const sameClosure = incident.closure !== null &&
          incident.closure.method === "operator" &&
          incident.closure.reason === command.reason &&
          incident.closure.closedBy === command.closedBy &&
          incident.closure.note === command.note
        return sameClosure
          ? { outcome: "already_closed" as const, incident }
          : { outcome: "closure_conflict" as const, incident }
      }

      if (
        incident.status !== "awaiting_confirmation" ||
        occurrencesFor(command.incidentId).some((occurrence) => occurrence.status === "open")
      ) {
        return { outcome: "not_closable" as const, status: incident.status }
      }

      const closed: Incident = {
        ...incident,
        status: "closed",
        closure: {
          closedAt: command.closedAt,
          method: "operator",
          reason: command.reason,
          closedBy: command.closedBy,
          note: command.note,
          policyVersion: null
        },
        updatedAt: command.closedAt
      }
      incidents.set(command.incidentId, closed)
      return { outcome: "closed" as const, incident: closed }
    })
  }
}
