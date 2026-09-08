import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM alert_events LIMIT 1)
        OR EXISTS (SELECT 1 FROM alert_occurrences LIMIT 1)
        OR EXISTS (SELECT 1 FROM incidents LIMIT 1)
      THEN
        RAISE EXCEPTION 'correlation policy v2 requires an empty Analyzer database';
      END IF;
    END $$;

    ALTER TABLE alert_occurrences
      ADD COLUMN incident_scope text NOT NULL;

    ALTER TABLE incident_occurrences
      DROP CONSTRAINT incident_occurrences_method_check,
      ADD CONSTRAINT incident_occurrences_method_check
        CHECK (association_method IN (
          'legacy_backfill', 'scope_and_time', 'new_incident', 'split_reconciliation'
        ));

    ALTER TABLE incidents
      ADD COLUMN incident_scope text NOT NULL,
      ADD COLUMN merged_into_incident_id uuid REFERENCES incidents (id);

    ALTER TABLE incidents
      DROP CONSTRAINT incidents_status_check,
      DROP CONSTRAINT incidents_operational_state_check,
      ADD CONSTRAINT incidents_status_check
        CHECK (status IN ('open', 'awaiting_confirmation', 'closed', 'merged')),
      ADD CONSTRAINT incidents_operational_state_check CHECK (
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
      );

    CREATE INDEX incidents_correlation_candidates_idx
      ON incidents (service, environment, incident_scope, status);

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
