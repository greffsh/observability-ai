import { Data, type Effect, type Option } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
import type { AlertOccurrence } from "../domain/alert-occurrence.js"
import type { Incident } from "../domain/incident.js"

export class EventStoreError extends Data.TaggedError("EventStoreError")<{
  readonly operation: "find" | "record"
  readonly cause: unknown
}> {}

export type RecordAlertEventsResult = {
  readonly insertedEventIds: ReadonlyArray<string>
  readonly duplicateEventIds: ReadonlyArray<string>
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
  readonly findOccurrencesByIncidentId: (
    incidentId: string
  ) => Effect.Effect<ReadonlyArray<AlertOccurrence>, EventStoreError>
}
