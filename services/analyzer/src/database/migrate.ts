import { NodeContext } from "@effect/platform-node"
import { PgClient, PgMigrator } from "@effect/sql-pg"
import { Effect, type Redacted } from "effect"
import { fileURLToPath } from "node:url"

const migrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url)
)

export const migrateDatabase = (
  databaseUrl: Redacted.Redacted<string>
): Effect.Effect<ReadonlyArray<readonly [id: number, name: string]>, unknown> =>
  PgMigrator.run({
    loader: PgMigrator.fromFileSystem(migrationsDirectory)
  }).pipe(
    Effect.provide(PgClient.layer({
      url: databaseUrl,
      applicationName: "grafana-ai-analyzer-migrator",
      maxConnections: 1
    })),
    Effect.provide(NodeContext.layer),
    Effect.scoped
  )
