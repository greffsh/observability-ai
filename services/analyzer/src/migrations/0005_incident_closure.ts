import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    ALTER TABLE incidents
      ADD COLUMN closed_at TIMESTAMPTZ,
      ADD COLUMN closure_method TEXT,
      ADD COLUMN closure_reason TEXT,
      ADD COLUMN closed_by TEXT,
      ADD COLUMN closure_note TEXT,
      ADD COLUMN closure_policy_version INTEGER;

    ALTER TABLE incidents
      DROP CONSTRAINT incidents_operational_state_check,
      ADD CONSTRAINT incidents_closure_method_check CHECK (
        closure_method IS NULL OR closure_method IN ('operator', 'policy')
      ),
      ADD CONSTRAINT incidents_closure_reason_check CHECK (
        closure_reason IS NULL OR closure_reason IN (
          'recovery_confirmed',
          'false_positive',
          'no_action_required',
          'duplicate',
          'other'
        )
      ),
      ADD CONSTRAINT incidents_closure_policy_check CHECK (
        (closure_method = 'operator' AND closure_policy_version IS NULL)
        OR (closure_method = 'policy' AND closure_policy_version > 0)
        OR closure_method IS NULL
      ),
      ADD CONSTRAINT incidents_operational_state_check CHECK (
        (
          status = 'open'
          AND signals_cleared_at IS NULL
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
          AND closed_at IS NOT NULL
          AND closed_at >= signals_cleared_at
          AND closure_method IS NOT NULL
          AND closure_reason IS NOT NULL
          AND closed_by IS NOT NULL
          AND length(trim(closed_by)) > 0
        )
      );
  `)
})
