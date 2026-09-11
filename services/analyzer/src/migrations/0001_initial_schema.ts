import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    CREATE TABLE incidents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      status text NOT NULL,
      service text NOT NULL,
      environment text NOT NULL,
      detected_at timestamptz NOT NULL,
      last_activity_at timestamptz NOT NULL,
      signals_cleared_at timestamptz,
      closed_at timestamptz,
      closure_method text,
      closure_reason text,
      closed_by text,
      closure_note text,
      closure_policy_version integer,
      incident_scope text NOT NULL,
      merged_into_incident_id uuid REFERENCES incidents (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT incidents_status_check
        CHECK (status IN ('open', 'awaiting_confirmation', 'closed', 'merged')),
      CONSTRAINT incidents_closure_method_check
        CHECK (closure_method IS NULL OR closure_method IN ('operator', 'policy')),
      CONSTRAINT incidents_closure_reason_check
        CHECK (
          closure_reason IS NULL OR closure_reason IN (
            'recovery_confirmed',
            'false_positive',
            'no_action_required',
            'duplicate',
            'other'
          )
        ),
      CONSTRAINT incidents_closure_policy_check
        CHECK (
          (closure_method = 'operator' AND closure_policy_version IS NULL)
          OR (closure_method = 'policy' AND closure_policy_version > 0)
          OR closure_method IS NULL
        ),
      CONSTRAINT incidents_operational_state_check
        CHECK (
          (
            status = 'open'
            AND signals_cleared_at IS NULL
            AND merged_into_incident_id IS NULL
            AND closed_at IS NULL
            AND closure_method IS NULL
            AND closure_reason IS NULL
            AND closed_by IS NULL
            AND closure_note IS NULL
            AND closure_policy_version IS NULL
          )
          OR (
            status = 'awaiting_confirmation'
            AND signals_cleared_at IS NOT NULL
            AND merged_into_incident_id IS NULL
            AND closed_at IS NULL
            AND closure_method IS NULL
            AND closure_reason IS NULL
            AND closed_by IS NULL
            AND closure_note IS NULL
            AND closure_policy_version IS NULL
          )
          OR (
            status = 'closed'
            AND signals_cleared_at IS NOT NULL
            AND merged_into_incident_id IS NULL
            AND closed_at IS NOT NULL
            AND closed_at >= signals_cleared_at
            AND closure_method IS NOT NULL
            AND closure_reason IS NOT NULL
            AND closed_by IS NOT NULL
            AND length(trim(closed_by)) > 0
          )
          OR (
            status = 'merged'
            AND signals_cleared_at IS NOT NULL
            AND merged_into_incident_id IS NOT NULL
            AND merged_into_incident_id <> id
            AND closed_at IS NULL
            AND closure_method IS NULL
            AND closure_reason IS NULL
            AND closed_by IS NULL
            AND closure_note IS NULL
            AND closure_policy_version IS NULL
          )
        )
    );

    CREATE INDEX incidents_correlation_candidates_idx
      ON incidents (service, environment, incident_scope, status);

    CREATE INDEX incidents_status_updated_at_idx
      ON incidents (status, updated_at DESC);

    CREATE TABLE alert_occurrences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      correlation_key text NOT NULL,
      incident_scope text NOT NULL,
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
        CHECK (association_method IN (
          'scope_and_time', 'new_incident', 'split_reconciliation'
        )),
      CONSTRAINT incident_occurrences_policy_version_check
        CHECK (policy_version > 0),
      CONSTRAINT incident_occurrences_metadata_object_check
        CHECK (jsonb_typeof(association_metadata) = 'object')
    );

    CREATE INDEX incident_occurrences_incident_id_idx
      ON incident_occurrences (incident_id);

    CREATE TABLE alert_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id text NOT NULL UNIQUE,
      schema_version integer NOT NULL,
      source text NOT NULL,
      occurrence_id uuid NOT NULL REFERENCES alert_occurrences (id),
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

    CREATE INDEX alert_events_service_environment_received_at_idx
      ON alert_events (service, environment, received_at DESC);

    CREATE TABLE incident_merges (
      merged_incident_id uuid PRIMARY KEY REFERENCES incidents (id),
      canonical_incident_id uuid NOT NULL REFERENCES incidents (id),
      policy_version integer NOT NULL CHECK (policy_version > 0),
      reason text NOT NULL,
      merged_at timestamptz NOT NULL DEFAULT now(),
      CHECK (merged_incident_id <> canonical_incident_id)
    );

    CREATE TABLE incident_splits (
      source_incident_id uuid NOT NULL REFERENCES incidents (id),
      target_incident_id uuid NOT NULL REFERENCES incidents (id),
      occurrence_id uuid NOT NULL REFERENCES alert_occurrences (id),
      policy_version integer NOT NULL CHECK (policy_version > 0),
      reason text NOT NULL,
      split_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_incident_id, target_incident_id, occurrence_id),
      CHECK (source_incident_id <> target_incident_id)
    );
  `)
})
