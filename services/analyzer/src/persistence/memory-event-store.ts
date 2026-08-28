import { Effect, Option } from "effect"
import type { EventStore, StoredAlertEvent } from "./event-store.js"

export const makeMemoryEventStore = (options?: {
  readonly now?: () => Date
}): EventStore => {
  const storedEvents = new Map<string, StoredAlertEvent>()
  const now = options?.now ?? (() => new Date())
  let sequence = 0

  return {
    record: (events) => Effect.sync(() => {
      const insertedEventIds: Array<string> = []
      const duplicateEventIds: Array<string> = []

      for (const event of events) {
        if (storedEvents.has(event.eventId)) {
          duplicateEventIds.push(event.eventId)
          continue
        }

        sequence += 1
        storedEvents.set(event.eventId, {
          id: `memory-event-${sequence}`,
          incidentId: null,
          storedAt: now(),
          event
        })
        insertedEventIds.push(event.eventId)
      }

      return { insertedEventIds, duplicateEventIds }
    }),
    findByEventId: (eventId) => Effect.sync(() =>
      Option.fromNullable(storedEvents.get(eventId))
    )
  }
}
