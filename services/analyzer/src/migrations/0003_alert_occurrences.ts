import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    CREATE TABLE alert_occurrences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      correlation_key text NOT NULL,
      status text NOT NULL,
      alert_name text NOT NULL,
      service text NOT NULL,
      environment text NOT NULL,
      alert_fingerprint text NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      firing_observed boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT alert_occurrences_status_check
        CHECK (status IN ('open', 'resolved', 'closed_unconfirmed')),
      CONSTRAINT alert_occurrences_resolution_check
        CHECK (
          (status = 'open' AND ended_at IS NULL)
          OR (status = 'resolved' AND ended_at IS NOT NULL AND ended_at >= started_at)
          OR (status = 'closed_unconfirmed' AND ended_at IS NULL)
        )
    );

    CREATE UNIQUE INDEX alert_occurrences_episode_idx
      ON alert_occurrences (correlation_key, started_at);

    CREATE UNIQUE INDEX alert_occurrences_one_open_per_correlation_idx
      ON alert_occurrences (correlation_key)
      WHERE status = 'open';

    CREATE TABLE incident_occurrences (
      incident_id uuid NOT NULL REFERENCES incidents (id),
      occurrence_id uuid NOT NULL UNIQUE REFERENCES alert_occurrences (id),
      associated_at timestamptz NOT NULL DEFAULT now(),
      association_method text NOT NULL,
      policy_version integer NOT NULL,
      association_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (incident_id, occurrence_id),
      CONSTRAINT incident_occurrences_method_check
        CHECK (association_method IN ('legacy_backfill', 'scope_and_time', 'new_incident')),
      CONSTRAINT incident_occurrences_policy_version_check
        CHECK (policy_version > 0),
      CONSTRAINT incident_occurrences_metadata_object_check
        CHECK (jsonb_typeof(association_metadata) = 'object')
    );

    CREATE INDEX incident_occurrences_incident_id_idx
      ON incident_occurrences (incident_id);

    ALTER TABLE alert_events
      ADD COLUMN occurrence_id uuid REFERENCES alert_occurrences (id);

    ALTER TABLE incidents
      ADD COLUMN detected_at timestamptz,
      ADD COLUMN last_activity_at timestamptz,
      ADD COLUMN signals_cleared_at timestamptz;

    INSERT INTO alert_occurrences (
      correlation_key,
      status,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      ended_at,
      firing_observed,
      created_at,
      updated_at
    )
    SELECT
      correlation_key,
      status,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      resolved_at,
      firing_observed,
      created_at,
      updated_at
    FROM incidents;

    INSERT INTO incident_occurrences (
      incident_id,
      occurrence_id,
      associated_at,
      association_method,
      policy_version,
      association_metadata
    )
    SELECT
      incident.id,
      occurrence.id,
      incident.created_at,
      'legacy_backfill',
      1,
      jsonb_build_object('source', 'incidents_pre_occurrence_model')
    FROM incidents AS incident
    JOIN alert_occurrences AS occurrence
      ON occurrence.correlation_key = incident.correlation_key
      AND occurrence.started_at = incident.started_at;

    UPDATE alert_events AS event
    SET occurrence_id = relation.occurrence_id
    FROM incident_occurrences AS relation
    WHERE relation.incident_id = event.incident_id;

    CREATE TEMPORARY TABLE orphan_occurrence_groups AS
    SELECT
      gen_random_uuid() AS occurrence_id,
      gen_random_uuid() AS incident_id,
      md5(concat_ws(
        E'\\x1f',
        source,
        environment,
        service,
        alert_name,
        alert_fingerprint
      )) AS correlation_key,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      max(ended_at) FILTER (WHERE state = 'resolved') AS ended_at,
      bool_or(state = 'firing') AS firing_observed,
      min(created_at) AS created_at,
      max(created_at) AS updated_at
    FROM alert_events
    WHERE occurrence_id IS NULL
    GROUP BY source, environment, service, alert_name, alert_fingerprint, started_at;

    INSERT INTO incidents (
      id,
      correlation_key,
      status,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      resolved_at,
      firing_observed,
      created_at,
      updated_at,
      detected_at,
      last_activity_at,
      signals_cleared_at
    )
    SELECT
      incident_id,
      correlation_key,
      CASE WHEN ended_at IS NULL THEN 'open' ELSE 'resolved' END,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      ended_at,
      firing_observed,
      created_at,
      updated_at,
      started_at,
      coalesce(ended_at, started_at),
      ended_at
    FROM orphan_occurrence_groups;

    INSERT INTO alert_occurrences (
      id,
      correlation_key,
      status,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      ended_at,
      firing_observed,
      created_at,
      updated_at
    )
    SELECT
      occurrence_id,
      correlation_key,
      CASE WHEN ended_at IS NULL THEN 'open' ELSE 'resolved' END,
      alert_name,
      service,
      environment,
      alert_fingerprint,
      started_at,
      ended_at,
      firing_observed,
      created_at,
      updated_at
    FROM orphan_occurrence_groups;

    INSERT INTO incident_occurrences (
      incident_id,
      occurrence_id,
      associated_at,
      association_method,
      policy_version,
      association_metadata
    )
    SELECT
      incident_id,
      occurrence_id,
      created_at,
      'legacy_backfill',
      1,
      jsonb_build_object('source', 'unlinked_alert_events')
    FROM orphan_occurrence_groups;

    UPDATE alert_events AS event
    SET
      occurrence_id = orphan.occurrence_id,
      incident_id = orphan.incident_id
    FROM orphan_occurrence_groups AS orphan
    WHERE event.occurrence_id IS NULL
      AND event.alert_name = orphan.alert_name
      AND event.service = orphan.service
      AND event.environment = orphan.environment
      AND event.alert_fingerprint = orphan.alert_fingerprint
      AND event.started_at = orphan.started_at;

    UPDATE incidents
    SET
      detected_at = coalesce(detected_at, started_at),
      last_activity_at = coalesce(last_activity_at, resolved_at, started_at),
      signals_cleared_at = CASE
        WHEN status IN ('resolved', 'closed_unconfirmed')
          THEN coalesce(resolved_at, started_at)
        ELSE NULL
      END;

    ALTER TABLE incidents
      DROP CONSTRAINT incidents_status_check,
      DROP CONSTRAINT incidents_resolution_check;

    UPDATE incidents
    SET status = CASE
      WHEN status = 'open' THEN 'open'
      ELSE 'awaiting_confirmation'
    END;

    ALTER TABLE incidents
      ALTER COLUMN detected_at SET NOT NULL,
      ALTER COLUMN last_activity_at SET NOT NULL,
      ADD CONSTRAINT incidents_status_check
        CHECK (status IN ('open', 'awaiting_confirmation', 'closed')),
      ADD CONSTRAINT incidents_operational_state_check
        CHECK (
          (status = 'open' AND signals_cleared_at IS NULL)
          OR (status = 'awaiting_confirmation' AND signals_cleared_at IS NOT NULL)
          OR status = 'closed'
        );

    DROP INDEX incidents_episode_idx;
    DROP INDEX incidents_one_open_per_correlation_idx;
  `)
})
