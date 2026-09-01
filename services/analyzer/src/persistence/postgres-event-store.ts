import { PgClient } from "@effect/sql-pg"
import { Effect, Option } from "effect"
import type { AlertEvent } from "../contracts/alert-event.js"
import { correlationKeyFor, type AlertOccurrence } from "../domain/alert-occurrence.js"
import type {
  Incident,
  IncidentClosureReason
} from "../domain/incident.js"
import {
  EventStoreError,
  type EventStore,
  type StoredAlertEvent
} from "./event-store.js"

type StoredEventRow = {
  readonly id: string
  readonly occurrenceId: string | null
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

type IdRow = { readonly id: string }

type IncidentRow = {
  readonly id: string
  readonly status: "open" | "awaiting_confirmation" | "closed"
  readonly service: string
  readonly environment: string
  readonly detectedAt: Date
  readonly lastActivityAt: Date
  readonly signalsClearedAt: Date | null
  readonly closedAt: Date | null
  readonly closureMethod: "operator" | "policy" | null
  readonly closureReason: IncidentClosureReason | null
  readonly closedBy: string | null
  readonly closureNote: string | null
  readonly closurePolicyVersion: number | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

const eventPayload = (event: AlertEvent) => ({
  ...event,
  startedAt: event.startedAt.toISOString(),
  endedAt: event.endedAt?.toISOString() ?? null,
  receivedAt: event.receivedAt.toISOString()
})

const rowToStoredEvent = (row: StoredEventRow): StoredAlertEvent => ({
  id: row.id,
  occurrenceId: row.occurrenceId,
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

const rowToIncident = (row: IncidentRow): Incident => ({
  id: row.id,
  status: row.status,
  service: row.service,
  environment: row.environment,
  detectedAt: row.detectedAt,
  lastActivityAt: row.lastActivityAt,
  signalsClearedAt: row.signalsClearedAt,
  closure: row.closedAt === null || row.closureMethod === null ||
      row.closureReason === null || row.closedBy === null
    ? null
    : {
        closedAt: row.closedAt,
        method: row.closureMethod,
        reason: row.closureReason,
        closedBy: row.closedBy,
        note: row.closureNote,
        policyVersion: row.closurePolicyVersion
      },
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

export const makePostgresEventStore: Effect.Effect<EventStore, never, PgClient.PgClient> =
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient

    const refreshIncident = (incidentId: string) => sql`
      UPDATE incidents AS incident
      SET
        status = CASE
          WHEN aggregate.open_count > 0 THEN 'open'
          ELSE 'awaiting_confirmation'
        END,
        detected_at = aggregate.detected_at,
        last_activity_at = aggregate.last_activity_at,
        signals_cleared_at = CASE
          WHEN aggregate.open_count > 0 THEN NULL
          ELSE aggregate.last_activity_at
        END,
        updated_at = now()
      FROM (
        SELECT
          relation.incident_id,
          count(*) FILTER (WHERE occurrence.status = 'open') AS open_count,
          min(occurrence.started_at) AS detected_at,
          max(coalesce(occurrence.ended_at, occurrence.started_at)) AS last_activity_at
        FROM incident_occurrences AS relation
        JOIN alert_occurrences AS occurrence
          ON occurrence.id = relation.occurrence_id
        WHERE relation.incident_id = ${incidentId}
        GROUP BY relation.incident_id
      ) AS aggregate
      WHERE incident.id = aggregate.incident_id
        AND incident.status <> 'closed'
    `

    const eventSelection = sql`
      SELECT
        event.id,
        event.occurrence_id AS "occurrenceId",
        relation.incident_id AS "incidentId",
        event.created_at AS "storedAt",
        event.schema_version AS "schemaVersion",
        event.source,
        event.event_id AS "eventId",
        event.alert_fingerprint AS "alertFingerprint",
        event.alert_name AS "alertName",
        event.service,
        event.environment,
        event.state,
        event.started_at AS "startedAt",
        event.ended_at AS "endedAt",
        event.received_at AS "receivedAt",
        event.labels,
        event.annotations,
        event.generator_url AS "generatorUrl"
      FROM alert_events AS event
      LEFT JOIN incident_occurrences AS relation
        ON relation.occurrence_id = event.occurrence_id
    `

    const incidentSelection = sql`
      SELECT
        id, status, service, environment,
        detected_at AS "detectedAt",
        last_activity_at AS "lastActivityAt",
        signals_cleared_at AS "signalsClearedAt",
        closed_at AS "closedAt",
        closure_method AS "closureMethod",
        closure_reason AS "closureReason",
        closed_by AS "closedBy",
        closure_note AS "closureNote",
        closure_policy_version AS "closurePolicyVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM incidents
    `

    return {
      record: (events) => sql.withTransaction(
        Effect.gen(function* () {
          const insertedEventIds: Array<string> = []
          const duplicateEventIds: Array<string> = []

          yield* sql`
            SELECT pg_advisory_xact_lock(hashtextextended('alert-event-ingestion', 0))
          `

          for (const event of events) {
            const existingEvents = yield* sql<IdRow>`
              SELECT id
              FROM alert_events
              WHERE event_id = ${event.eventId}
              LIMIT 1
            `

            if (existingEvents.length > 0) {
              duplicateEventIds.push(event.eventId)
              continue
            }

            const correlationKey = correlationKeyFor(event)
            const scopeKey = `${event.environment}:${event.service}`

            const matchingOccurrences = yield* sql<IdRow>`
              SELECT id
              FROM alert_occurrences
              WHERE correlation_key = ${correlationKey}
                AND started_at = ${event.startedAt}
              LIMIT 1
              FOR UPDATE
            `
            let occurrenceId = matchingOccurrences[0]?.id
            let incidentId: string | undefined
            const incidentsToRefresh = new Set<string>()

            if (occurrenceId !== undefined) {
              if (event.state === "resolved") {
                yield* sql`
                  UPDATE alert_occurrences
                  SET status = 'resolved', ended_at = ${event.endedAt}, updated_at = now()
                  WHERE id = ${occurrenceId}
                `
              } else {
                yield* sql`
                  UPDATE alert_occurrences
                  SET
                    firing_observed = true,
                    updated_at = CASE WHEN firing_observed THEN updated_at ELSE now() END
                  WHERE id = ${occurrenceId}
                `
              }

              const relations = yield* sql<IdRow>`
                SELECT incident_id AS id
                FROM incident_occurrences
                WHERE occurrence_id = ${occurrenceId}
              `
              incidentId = relations[0]?.id
            } else {
              if (event.state === "firing") {
                const superseded = yield* sql<IdRow>`
                  UPDATE alert_occurrences
                  SET status = 'closed_unconfirmed', updated_at = now()
                  WHERE correlation_key = ${correlationKey}
                    AND status = 'open'
                  RETURNING id
                `
                for (const occurrence of superseded) {
                  const relations = yield* sql<IdRow>`
                    SELECT incident_id AS id
                    FROM incident_occurrences
                    WHERE occurrence_id = ${occurrence.id}
                  `
                  if (relations[0]?.id !== undefined) incidentsToRefresh.add(relations[0].id)
                }
              }

              const createdOccurrences = yield* sql<IdRow>`
                INSERT INTO alert_occurrences (
                  correlation_key, status, alert_name, service, environment,
                  alert_fingerprint, started_at, ended_at, firing_observed
                ) VALUES (
                  ${correlationKey},
                  ${event.state === "firing" ? "open" : "resolved"},
                  ${event.alertName}, ${event.service}, ${event.environment},
                  ${event.alertFingerprint}, ${event.startedAt}, ${event.endedAt},
                  ${event.state === "firing"}
                )
                RETURNING id
              `
              occurrenceId = createdOccurrences[0]?.id
              if (occurrenceId === undefined) {
                return yield* Effect.dieMessage(`Could not create occurrence for ${event.eventId}`)
              }

              const candidates = yield* sql<IdRow>`
                SELECT id
                FROM incidents
                WHERE status <> 'closed'
                  AND service = ${event.service}
                  AND environment = ${event.environment}
                  AND detected_at <= ${new Date(event.startedAt.getTime() + 10 * 60 * 1_000)}
                  AND last_activity_at >= ${new Date(event.startedAt.getTime() - 10 * 60 * 1_000)}
                ORDER BY last_activity_at DESC
                LIMIT 2
                FOR UPDATE
              `

              let associationMethod: "scope_and_time" | "new_incident"
              if (candidates.length === 1 && candidates[0] !== undefined) {
                incidentId = candidates[0].id
                associationMethod = "scope_and_time"
              } else {
                const createdIncidents = yield* sql<IdRow>`
                  INSERT INTO incidents (
                    status, service, environment, detected_at, last_activity_at,
                    signals_cleared_at
                  ) VALUES (
                    ${event.state === "firing" ? "open" : "awaiting_confirmation"},
                    ${event.service}, ${event.environment}, ${event.startedAt},
                    ${event.endedAt ?? event.startedAt}, ${event.endedAt}
                  )
                  RETURNING id
                `
                incidentId = createdIncidents[0]?.id
                associationMethod = "new_incident"
              }

              if (incidentId === undefined) {
                return yield* Effect.dieMessage(`Could not correlate occurrence ${occurrenceId}`)
              }

              yield* sql`
                INSERT INTO incident_occurrences (
                  incident_id, occurrence_id, association_method, policy_version,
                  association_metadata
                ) VALUES (
                  ${incidentId}, ${occurrenceId}, ${associationMethod}, 1,
                  ${sql.json({ scope: scopeKey, windowSeconds: 600 })}
                )
              `
            }

            if (occurrenceId === undefined || incidentId === undefined) {
              return yield* Effect.dieMessage(`Could not link event ${event.eventId}`)
            }
            incidentsToRefresh.add(incidentId)

            yield* sql`
              INSERT INTO alert_events (
                event_id, schema_version, source, occurrence_id, state,
                alert_fingerprint, alert_name, service, environment, started_at,
                ended_at, received_at, labels, annotations, generator_url,
                event_payload
              ) VALUES (
                ${event.eventId}, ${event.schemaVersion}, ${event.source},
                ${occurrenceId}, ${event.state}, ${event.alertFingerprint},
                ${event.alertName}, ${event.service}, ${event.environment},
                ${event.startedAt}, ${event.endedAt}, ${event.receivedAt},
                ${sql.json(event.labels)}, ${sql.json(event.annotations)},
                ${event.generatorUrl}, ${sql.json(eventPayload(event))}
              )
            `
            for (const refreshId of incidentsToRefresh) {
              yield* refreshIncident(refreshId)
            }
            insertedEventIds.push(event.eventId)
          }

          return { insertedEventIds, duplicateEventIds }
        })
      ).pipe(
        Effect.mapError((cause) => new EventStoreError({ operation: "record", cause }))
      ),
      findByEventId: (eventId) => sql<StoredEventRow>`
        ${eventSelection}
        WHERE event.event_id = ${eventId}
        LIMIT 1
      `.pipe(
        Effect.map((rows) => Option.map(Option.fromNullable(rows[0]), rowToStoredEvent)),
        Effect.mapError((cause) => new EventStoreError({ operation: "find", cause }))
      ),
      findByIncidentId: (incidentId) => sql<StoredEventRow>`
        ${eventSelection}
        WHERE relation.incident_id = ${incidentId}
        ORDER BY event.received_at, event.created_at
      `.pipe(
        Effect.map((rows) => rows.map(rowToStoredEvent)),
        Effect.mapError((cause) => new EventStoreError({ operation: "find", cause }))
      ),
      findIncidentById: (incidentId) => sql<IncidentRow>`
        ${incidentSelection}
        WHERE id = ${incidentId}
        LIMIT 1
      `.pipe(
        Effect.map((rows) => Option.map(Option.fromNullable(rows[0]), rowToIncident)),
        Effect.mapError((cause) => new EventStoreError({ operation: "find", cause }))
      ),
      findOccurrencesByIncidentId: (incidentId) => sql<AlertOccurrence>`
        SELECT
          occurrence.id,
          occurrence.correlation_key AS "correlationKey",
          occurrence.status,
          occurrence.alert_name AS "alertName",
          occurrence.service,
          occurrence.environment,
          occurrence.alert_fingerprint AS "alertFingerprint",
          occurrence.started_at AS "startedAt",
          occurrence.ended_at AS "endedAt",
          occurrence.firing_observed AS "firingObserved",
          occurrence.created_at AS "createdAt",
          occurrence.updated_at AS "updatedAt"
        FROM alert_occurrences AS occurrence
        JOIN incident_occurrences AS relation
          ON relation.occurrence_id = occurrence.id
        WHERE relation.incident_id = ${incidentId}
        ORDER BY occurrence.started_at, occurrence.created_at
      `.pipe(
        Effect.mapError((cause) => new EventStoreError({ operation: "find", cause }))
      ),
      closeIncident: (command) => sql.withTransaction(
        Effect.gen(function* () {
          const rows = yield* sql<IncidentRow>`
            ${incidentSelection}
            WHERE id = ${command.incidentId}
            LIMIT 1
            FOR UPDATE
          `
          const row = rows[0]
          if (row === undefined) return { outcome: "not_found" as const }
          const incident = rowToIncident(row)

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

          const openOccurrences = yield* sql<IdRow>`
            SELECT occurrence.id
            FROM alert_occurrences AS occurrence
            JOIN incident_occurrences AS relation
              ON relation.occurrence_id = occurrence.id
            WHERE relation.incident_id = ${command.incidentId}
              AND occurrence.status = 'open'
            LIMIT 1
          `
          if (incident.status !== "awaiting_confirmation" || openOccurrences.length > 0) {
            return { outcome: "not_closable" as const, status: incident.status }
          }

          yield* sql`
            UPDATE incidents
            SET
              status = 'closed',
              closed_at = ${command.closedAt},
              closure_method = 'operator',
              closure_reason = ${command.reason},
              closed_by = ${command.closedBy},
              closure_note = ${command.note},
              closure_policy_version = NULL,
              updated_at = ${command.closedAt}
            WHERE id = ${command.incidentId}
          `

          return {
            outcome: "closed" as const,
            incident: {
              ...incident,
              status: "closed" as const,
              closure: {
                closedAt: command.closedAt,
                method: "operator" as const,
                reason: command.reason,
                closedBy: command.closedBy,
                note: command.note,
                policyVersion: null
              },
              updatedAt: command.closedAt
            }
          }
        })
      ).pipe(
        Effect.mapError((cause) => new EventStoreError({ operation: "close", cause }))
      )
    }
  })
