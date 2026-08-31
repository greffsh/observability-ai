import { Data, type Effect, type Option } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
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
  readonly findIncidentById: (
    incidentId: string
  ) => Effect.Effect<Option.Option<Incident>, EventStoreError>
}
