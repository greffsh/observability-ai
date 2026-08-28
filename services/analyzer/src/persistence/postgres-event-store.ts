import { PgClient } from "@effect/sql-pg"
import { Effect, Option } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
import {
  EventStoreError,
  type EventStore,
  type StoredAlertEvent
} from "./event-store.js"

type StoredEventRow = {
  readonly id: string
  readonly incidentId: string | null
  readonly storedAt: Date
  readonly schemaVersion: 1
  readonly source: "grafana"
  readonly eventId: string
  readonly alertFingerprint: string
  readonly alertName: string
  readonly service: string
  readonly environment: string
  readonly state: "firing" | "resolved"
  readonly startedAt: Date
  readonly endedAt: Date | null
  readonly receivedAt: Date
  readonly labels: Record<string, string>
  readonly annotations: Record<string, string>
  readonly generatorUrl: string | null
}

const eventPayload = (event: AlertEvent) => ({
  ...event,
  startedAt: event.startedAt.toISOString(),
  endedAt: event.endedAt?.toISOString() ?? null,
  receivedAt: event.receivedAt.toISOString()
})

const rowToStoredEvent = (row: StoredEventRow): StoredAlertEvent => ({
  id: row.id,
  incidentId: row.incidentId,
  storedAt: row.storedAt,
  event: {
    schemaVersion: row.schemaVersion,
    source: row.source,
    eventId: row.eventId,
    alertFingerprint: row.alertFingerprint,
    alertName: row.alertName,
    service: row.service,
    environment: row.environment,
    state: row.state,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    receivedAt: row.receivedAt,
    labels: row.labels,
    annotations: row.annotations,
    generatorUrl: row.generatorUrl
  }
})

export const makePostgresEventStore: Effect.Effect<EventStore, never, PgClient.PgClient> =
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient

    return {
      record: (events) => sql.withTransaction(
        Effect.gen(function* () {
          const insertedEventIds: Array<string> = []
          const duplicateEventIds: Array<string> = []

          for (const event of events) {
            const inserted = yield* sql<{ readonly eventId: string }>`
              INSERT INTO alert_events (
                event_id,
                schema_version,
                source,
                state,
                alert_fingerprint,
                alert_name,
                service,
                environment,
                started_at,
                ended_at,
                received_at,
                labels,
                annotations,
                generator_url,
                event_payload
              ) VALUES (
                ${event.eventId},
                ${event.schemaVersion},
                ${event.source},
                ${event.state},
                ${event.alertFingerprint},
                ${event.alertName},
                ${event.service},
                ${event.environment},
                ${event.startedAt},
                ${event.endedAt},
                ${event.receivedAt},
                ${sql.json(event.labels)},
                ${sql.json(event.annotations)},
                ${event.generatorUrl},
                ${sql.json(eventPayload(event))}
              )
              ON CONFLICT (event_id) DO NOTHING
              RETURNING event_id AS "eventId"
            `

            if (inserted.length === 0) {
              duplicateEventIds.push(event.eventId)
            } else {
              insertedEventIds.push(event.eventId)
            }
          }

          return { insertedEventIds, duplicateEventIds }
        })
      ).pipe(
        Effect.mapError((cause) => new EventStoreError({
          operation: "record",
          cause
        }))
      ),
      findByEventId: (eventId) => sql<StoredEventRow>`
        SELECT
          id,
          incident_id AS "incidentId",
          created_at AS "storedAt",
          schema_version AS "schemaVersion",
          source,
          event_id AS "eventId",
          alert_fingerprint AS "alertFingerprint",
          alert_name AS "alertName",
          service,
          environment,
          state,
          started_at AS "startedAt",
          ended_at AS "endedAt",
          received_at AS "receivedAt",
          labels,
          annotations,
          generator_url AS "generatorUrl"
        FROM alert_events
        WHERE event_id = ${eventId}
        LIMIT 1
      `.pipe(
        Effect.map((rows) => Option.map(
          Option.fromNullable(rows[0]),
          rowToStoredEvent
        )),
        Effect.mapError((cause) => new EventStoreError({
          operation: "find",
          cause
        }))
      )
    }
  })
