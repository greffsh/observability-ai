import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    ALTER TABLE alert_events
      ALTER COLUMN occurrence_id SET NOT NULL,
      DROP COLUMN incident_id;

    ALTER TABLE incidents
      DROP COLUMN correlation_key,
      DROP COLUMN alert_name,
      DROP COLUMN alert_fingerprint,
      DROP COLUMN started_at,
      DROP COLUMN resolved_at,
      DROP COLUMN firing_observed;
  `)
})
