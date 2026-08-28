import { Config, Effect, Redacted } from "effect"
import { buildApp } from "./app.js"
import { migrateDatabase } from "./database/migrate.js"

const configuration = Config.all({
  port: Config.integer("PORT").pipe(Config.withDefault(8080)),
  databaseUrl: Config.redacted("DATABASE_URL"),
  grafanaWebhookSecret: Config.redacted("GRAFANA_WEBHOOK_SECRET")
})

const main = Effect.gen(function* () {
  const { databaseUrl, port, grafanaWebhookSecret } = yield* configuration

  const appliedMigrations = yield* migrateDatabase(databaseUrl)
  yield* Effect.logInfo(
    appliedMigrations.length === 0
      ? "Database schema is up to date"
      : `Applied ${appliedMigrations.length} database migration(s)`
  )

  const app = buildApp({
    grafanaWebhookSecret: Redacted.value(grafanaWebhookSecret),
    logger: true,
    serviceName: process.env.SERVICE_NAME ?? "analyzer",
    environment: process.env.ENVIRONMENT ?? "local"
  })

  yield* Effect.tryPromise({
    try: () => app.listen({ port, host: "0.0.0.0" }),
    catch: (error) =>
      new Error("Failed to start Analyzer HTTP server", { cause: error })
  })

  yield* Effect.logInfo(`Analyzer listening on port ${port}`)
})

Effect.runPromise(main).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
