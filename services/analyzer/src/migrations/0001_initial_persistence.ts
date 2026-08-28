import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    CREATE TABLE incidents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      correlation_key text NOT NULL,
      status text NOT NULL,
      alert_name text NOT NULL,
      service text NOT NULL,
      environment text NOT NULL,
      alert_fingerprint text NOT NULL,
      first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      resolved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT incidents_status_check
        CHECK (status IN ('open', 'resolved')),
      CONSTRAINT incidents_observation_order_check
        CHECK (last_seen_at >= first_seen_at),
      CONSTRAINT incidents_resolution_check
        CHECK (
          (status = 'open' AND resolved_at IS NULL)
          OR (status = 'resolved' AND resolved_at IS NOT NULL)
        )
    );

    CREATE INDEX incidents_correlation_key_idx
      ON incidents (correlation_key);

    CREATE INDEX incidents_status_updated_at_idx
      ON incidents (status, updated_at DESC);

    CREATE TABLE alert_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id text NOT NULL UNIQUE,
      schema_version integer NOT NULL,
      source text NOT NULL,
      incident_id uuid REFERENCES incidents (id),
      state text NOT NULL,
      alert_fingerprint text NOT NULL,
      alert_name text NOT NULL,
      service text NOT NULL,
      environment text NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      received_at timestamptz NOT NULL,
      labels jsonb NOT NULL,
      annotations jsonb NOT NULL,
      generator_url text,
      event_payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT alert_events_schema_version_check
        CHECK (schema_version > 0),
      CONSTRAINT alert_events_source_check
        CHECK (source = 'grafana'),
      CONSTRAINT alert_events_state_check
        CHECK (state IN ('firing', 'resolved')),
      CONSTRAINT alert_events_resolution_check
        CHECK (
          (state = 'firing' AND ended_at IS NULL)
          OR (state = 'resolved' AND ended_at IS NOT NULL AND ended_at >= started_at)
        ),
      CONSTRAINT alert_events_labels_object_check
        CHECK (jsonb_typeof(labels) = 'object'),
      CONSTRAINT alert_events_annotations_object_check
        CHECK (jsonb_typeof(annotations) = 'object'),
      CONSTRAINT alert_events_payload_object_check
        CHECK (jsonb_typeof(event_payload) = 'object')
    );

    CREATE INDEX alert_events_incident_id_idx
      ON alert_events (incident_id);

    CREATE INDEX alert_events_service_environment_received_at_idx
      ON alert_events (service, environment, received_at DESC);
  `)
})
