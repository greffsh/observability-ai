import { NodeRuntime } from "@effect/platform-node"
import { Config, Effect } from "effect"
import { migrateDatabase } from "./database/migrate.js"
import { makeApplicationLogging } from "./logging.js"

const logging = makeApplicationLogging({
  service: process.env.SERVICE_NAME ?? "analyzer-migrator",
  environment: process.env.ENVIRONMENT ?? "local"
})

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL")
  const appliedMigrations = yield* migrateDatabase(databaseUrl)

  yield* Effect.logInfo(
    appliedMigrations.length === 0
      ? "Database schema is up to date"
      : `Applied ${appliedMigrations.length} database migration(s)`
  )
}).pipe(
  Effect.tapErrorCause((cause) => Effect.logError("Database migration failed", cause)),
  Effect.ensuring(Effect.tryPromise(() => logging.flush()).pipe(Effect.orDie)),
  Effect.provide(logging.layer)
)

NodeRuntime.runMain(program, {
  disablePrettyLogger: true
})
