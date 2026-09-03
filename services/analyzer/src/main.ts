import { NodeRuntime } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, ManagedRuntime, Redacted } from "effect"
import { buildApp } from "./app.js"
import { migrateDatabase } from "./database/migrate.js"
import { makeEvidenceCollector } from "./evidence/evidence-collector.js"
import { makeLokiEvidenceSource } from "./evidence/loki-source.js"
import { makePrometheusEvidenceSource } from "./evidence/prometheus-source.js"
import { makeApplicationLogging } from "./logging.js"
import { makePostgresEventStore } from "./persistence/postgres-event-store.js"
import { makeRcaHandoffExporter } from "./rca-handoff/handoff-exporter.js"
import { loadServiceCatalog } from "./service-catalog.js"
import { makeSeverityAssessor } from "./severity/severity-assessor.js"

const configuration = Config.all({
  port: Config.integer("PORT").pipe(Config.withDefault(8080)),
  databaseUrl: Config.redacted("DATABASE_URL"),
  grafanaWebhookSecret: Config.redacted("GRAFANA_WEBHOOK_SECRET"),
  operatorToken: Config.redacted("ANALYZER_OPERATOR_TOKEN"),
  operatorId: Config.string("ANALYZER_OPERATOR_ID").pipe(
    Config.withDefault("local-operator")
  ),
  analyzerPublicBaseUrl: Config.string("ANALYZER_PUBLIC_BASE_URL").pipe(
    Config.withDefault("http://localhost:8080")
  ),
  prometheusUrl: Config.string("PROMETHEUS_URL").pipe(
    Config.withDefault("http://prometheus:9090")
  ),
  prometheusPublicUrl: Config.string("PROMETHEUS_PUBLIC_URL").pipe(
    Config.withDefault("http://localhost:9090")
  ),
  lokiUrl: Config.string("LOKI_URL").pipe(
    Config.withDefault("http://loki:3100")
  ),
  lokiPublicUrl: Config.string("LOKI_PUBLIC_URL").pipe(
    Config.withDefault("http://localhost:3100")
  ),
  serviceCatalogFile: Config.string("SERVICE_CATALOG_FILE").pipe(
    Config.withDefault("/etc/analyzer/service-catalog.json")
  )
})

const service = process.env.SERVICE_NAME ?? "analyzer"
const environment = process.env.ENVIRONMENT ?? "local"
const logging = makeApplicationLogging({ service, environment })

const main = Effect.gen(function* () {
  const config = yield* configuration

  yield* Effect.addFinalizer(() =>
    Effect.tryPromise(() => logging.flush()).pipe(Effect.orDie)
  )

  const appliedMigrations = yield* migrateDatabase(config.databaseUrl)
  yield* Effect.logInfo(
    appliedMigrations.length === 0
      ? "Database schema is up to date"
      : `Applied ${appliedMigrations.length} database migration(s)`
  )

  const databaseRuntime = ManagedRuntime.make(PgClient.layer({
    url: config.databaseUrl,
    applicationName: "grafana-ai-analyzer"
  }))
  yield* Effect.addFinalizer(() =>
    Effect.promise(() => databaseRuntime.dispose())
  )
  const eventStore = yield* Effect.promise(() =>
    databaseRuntime.runPromise(makePostgresEventStore)
  )
  const serviceCatalog = yield* loadServiceCatalog(config.serviceCatalogFile)
  const evidenceCollector = makeEvidenceCollector({
    eventStore,
    analyzerPublicBaseUrl: config.analyzerPublicBaseUrl,
    sources: [
      makePrometheusEvidenceSource({
        baseUrl: config.prometheusUrl,
        publicBaseUrl: config.prometheusPublicUrl,
        catalog: serviceCatalog
      }),
      makeLokiEvidenceSource({
        baseUrl: config.lokiUrl,
        publicBaseUrl: config.lokiPublicUrl
      })
    ]
  })
  const severityAssessor = makeSeverityAssessor({
    eventStore,
    evidenceCollector,
    catalog: serviceCatalog
  })
  const rcaHandoffExporter = makeRcaHandoffExporter({
    eventStore,
    severityAssessor
  })

  const app = buildApp({
    evidenceCollector,
    eventStore,
    grafanaWebhookSecret: Redacted.value(config.grafanaWebhookSecret),
    operatorId: config.operatorId,
    operatorToken: Redacted.value(config.operatorToken),
    rcaHandoffExporter,
    logger: logging.logger,
    runEffect: logging.runPromise,
    severityAssessor
  })

  yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => app.listen({ port: config.port, host: "0.0.0.0" }),
      catch: (error) =>
        new Error("Failed to start Analyzer HTTP server", { cause: error })
    }),
    () => Effect.promise(() => app.close())
  )

  yield* Effect.logInfo(`Analyzer listening on port ${config.port}`)
  return yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide(logging.layer)
)

NodeRuntime.runMain(main, {
  disablePrettyLogger: true
})
