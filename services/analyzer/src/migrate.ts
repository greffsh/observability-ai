import { Config, Effect } from "effect"
import { migrateDatabase } from "./database/migrate.js"

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL")
  const appliedMigrations = yield* migrateDatabase(databaseUrl)

  yield* Effect.logInfo(
    appliedMigrations.length === 0
      ? "Database schema is up to date"
      : `Applied ${appliedMigrations.length} database migration(s)`
  )
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
