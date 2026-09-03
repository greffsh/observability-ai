import { Data, type Effect, type Option } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
import type { AlertOccurrence } from "../domain/alert-occurrence.js"
import type {
  Incident,
  IncidentClosureReason,
  IncidentStatus
} from "../domain/incident.js"

export class EventStoreError extends Data.TaggedError("EventStoreError")<{
  readonly operation: "close" | "find" | "record"
  readonly cause: unknown
}> {}

export type CloseIncidentCommand = {
  readonly incidentId: string
  readonly closedAt: Date
  readonly closedBy: string
  readonly reason: IncidentClosureReason
  readonly note: string | null
}

export type CloseIncidentResult =
  | { readonly outcome: "closed" | "already_closed"; readonly incident: Incident }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "not_closable"; readonly status: IncidentStatus }
  | { readonly outcome: "closure_conflict"; readonly incident: Incident }

export type RecordAlertEventsResult = {
  readonly insertedEventIds: ReadonlyArray<string>
  readonly duplicateEventIds: ReadonlyArray<string>
}

export type ListIncidentsFilter = {
  readonly status?: IncidentStatus
  readonly service?: string
  readonly environment?: string
}

export type IncidentSummary = Incident & {
  readonly activeAlerts: number
}

export type StoredAlertEvent = {
  readonly id: string
  readonly occurrenceId: string | null
  readonly incidentId: string | null
  readonly storedAt: Date
  readonly event: AlertEvent
}

export type EventStore = {
  readonly record: (
    events: ReadonlyArray<AlertEvent>
  ) => Effect.Effect<RecordAlertEventsResult, EventStoreError>
  readonly findByEventId: (
    eventId: string
  ) => Effect.Effect<Option.Option<StoredAlertEvent>, EventStoreError>
  readonly findByIncidentId: (
    incidentId: string
  ) => Effect.Effect<ReadonlyArray<StoredAlertEvent>, EventStoreError>
  readonly findIncidentById: (
    incidentId: string
  ) => Effect.Effect<Option.Option<Incident>, EventStoreError>
  readonly listIncidents: (
    filter: ListIncidentsFilter
  ) => Effect.Effect<ReadonlyArray<IncidentSummary>, EventStoreError>
  readonly findOccurrencesByIncidentId: (
    incidentId: string
  ) => Effect.Effect<ReadonlyArray<AlertOccurrence>, EventStoreError>
  readonly closeIncident: (
    command: CloseIncidentCommand
  ) => Effect.Effect<CloseIncidentResult, EventStoreError>
}
