import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    ALTER TABLE incidents
      DROP CONSTRAINT incidents_status_check,
      DROP CONSTRAINT incidents_observation_order_check,
      DROP CONSTRAINT incidents_resolution_check;

    ALTER TABLE incidents
      RENAME COLUMN first_seen_at TO started_at;

    ALTER TABLE incidents
      DROP COLUMN last_seen_at,
      ADD COLUMN firing_observed boolean NOT NULL DEFAULT true;

    ALTER TABLE incidents
      ALTER COLUMN firing_observed DROP DEFAULT,
      ADD CONSTRAINT incidents_status_check
        CHECK (status IN ('open', 'resolved', 'closed_unconfirmed')),
      ADD CONSTRAINT incidents_resolution_check
        CHECK (
          (status = 'open' AND resolved_at IS NULL)
          OR (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_at >= started_at)
          OR (status = 'closed_unconfirmed' AND resolved_at IS NULL)
        );

    CREATE UNIQUE INDEX incidents_episode_idx
      ON incidents (correlation_key, started_at);

    CREATE UNIQUE INDEX incidents_one_open_per_correlation_idx
      ON incidents (correlation_key)
      WHERE status = 'open';
  `)
})
