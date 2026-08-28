import { NodeRuntime } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, ManagedRuntime, Redacted } from "effect"
import { buildApp } from "./app.js"
import { migrateDatabase } from "./database/migrate.js"
import { makeApplicationLogging } from "./logging.js"
import { makePostgresEventStore } from "./persistence/postgres-event-store.js"

const configuration = Config.all({
  port: Config.integer("PORT").pipe(Config.withDefault(8080)),
  databaseUrl: Config.redacted("DATABASE_URL"),
  grafanaWebhookSecret: Config.redacted("GRAFANA_WEBHOOK_SECRET")
})

const service = process.env.SERVICE_NAME ?? "analyzer"
const environment = process.env.ENVIRONMENT ?? "local"
const logging = makeApplicationLogging({ service, environment })

const main = Effect.gen(function* () {
  const { databaseUrl, port, grafanaWebhookSecret } = yield* configuration

  yield* Effect.addFinalizer(() =>
    Effect.tryPromise(() => logging.flush()).pipe(Effect.orDie)
  )

  const appliedMigrations = yield* migrateDatabase(databaseUrl)
  yield* Effect.logInfo(
    appliedMigrations.length === 0
      ? "Database schema is up to date"
      : `Applied ${appliedMigrations.length} database migration(s)`
  )

  const databaseRuntime = ManagedRuntime.make(PgClient.layer({
    url: databaseUrl,
    applicationName: "grafana-ai-analyzer"
  }))
  yield* Effect.addFinalizer(() =>
    Effect.promise(() => databaseRuntime.dispose())
  )
  const eventStore = yield* Effect.promise(() =>
    databaseRuntime.runPromise(makePostgresEventStore)
  )

  const app = buildApp({
    eventStore,
    grafanaWebhookSecret: Redacted.value(grafanaWebhookSecret),
    logger: logging.logger,
    runEffect: logging.runPromise
  })

  yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => app.listen({ port, host: "0.0.0.0" }),
      catch: (error) =>
        new Error("Failed to start Analyzer HTTP server", { cause: error })
    }),
    () => Effect.promise(() => app.close())
  )

  yield* Effect.logInfo(`Analyzer listening on port ${port}`)
  return yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide(logging.layer)
)

NodeRuntime.runMain(main, {
  disablePrettyLogger: true
})
