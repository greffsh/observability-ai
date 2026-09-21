import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql.unsafe(`
    ALTER TABLE incidents
      ADD COLUMN deleted_at timestamptz,
      ADD COLUMN deleted_by text,
      ADD CONSTRAINT incidents_operational_deletion_check
        CHECK (
          (deleted_at IS NULL AND deleted_by IS NULL)
          OR (
            status = 'closed'
            AND deleted_at IS NOT NULL
            AND deleted_by IS NOT NULL
            AND length(trim(deleted_by)) > 0
          )
        );

    CREATE INDEX incidents_operational_listing_idx
      ON incidents (status, detected_at DESC)
      WHERE deleted_at IS NULL;
  `)
})
