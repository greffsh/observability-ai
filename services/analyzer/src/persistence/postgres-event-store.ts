import { PgClient } from "@effect/sql-pg"
import { Effect, Option } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
import { correlationKeyFor, type Incident } from "../domain/incident.js"
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

type StoredIncidentRow = Incident

type IdRow = {
  readonly id: string
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
            const inserted = yield* sql<{ readonly id: string; readonly eventId: string }>`
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
              RETURNING id, event_id AS "eventId"
            `

            if (inserted.length === 0) {
              duplicateEventIds.push(event.eventId)
            } else {
              const correlationKey = correlationKeyFor(event)

              yield* sql`
                SELECT pg_advisory_xact_lock(hashtextextended(${correlationKey}, 0))
              `

              const matchingIncidents = yield* sql<IdRow>`
                SELECT id
                FROM incidents
                WHERE correlation_key = ${correlationKey}
                  AND started_at = ${event.startedAt}
                LIMIT 1
                FOR UPDATE
              `

              let incidentId = matchingIncidents[0]?.id

              if (incidentId !== undefined) {
                if (event.state === "resolved") {
                  yield* sql`
                    UPDATE incidents
                    SET
                      status = 'resolved',
                      resolved_at = ${event.endedAt},
                      updated_at = now()
                    WHERE id = ${incidentId}
                  `
                } else {
                  yield* sql`
                    UPDATE incidents
                    SET
                      firing_observed = true,
                      updated_at = CASE
                        WHEN firing_observed THEN updated_at
                        ELSE now()
                      END
                    WHERE id = ${incidentId}
                  `
                }
              } else {
                if (event.state === "firing") {
                  yield* sql`
                    UPDATE incidents
                    SET status = 'closed_unconfirmed', updated_at = now()
                    WHERE correlation_key = ${correlationKey}
                      AND status = 'open'
                  `
                }

                const created = yield* sql<IdRow>`
                  INSERT INTO incidents (
                    correlation_key,
                    status,
                    alert_name,
                    service,
                    environment,
                    alert_fingerprint,
                    started_at,
                    resolved_at,
                    firing_observed
                  ) VALUES (
                    ${correlationKey},
                    ${event.state === "firing" ? "open" : "resolved"},
                    ${event.alertName},
                    ${event.service},
                    ${event.environment},
                    ${event.alertFingerprint},
                    ${event.startedAt},
                    ${event.endedAt},
                    ${event.state === "firing"}
                  )
                  RETURNING id
                `
                incidentId = created[0]?.id
              }

              if (incidentId === undefined) {
                return yield* Effect.dieMessage(
                  `Could not correlate event ${event.eventId} to an incident`
                )
              }

              yield* sql`
                UPDATE alert_events
                SET incident_id = ${incidentId}
                WHERE id = ${inserted[0]?.id}
              `
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
      ),
      findIncidentById: (incidentId) => sql<StoredIncidentRow>`
        SELECT
          id,
          correlation_key AS "correlationKey",
          status,
          alert_name AS "alertName",
          service,
          environment,
          alert_fingerprint AS "alertFingerprint",
          started_at AS "startedAt",
          resolved_at AS "resolvedAt",
          firing_observed AS "firingObserved",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM incidents
        WHERE id = ${incidentId}
        LIMIT 1
      `.pipe(
        Effect.map((rows) => Option.fromNullable(rows[0])),
        Effect.mapError((cause) => new EventStoreError({
          operation: "find",
          cause
        }))
      )
    }
  })
