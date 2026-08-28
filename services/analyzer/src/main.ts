import { Config, Effect, Redacted } from "effect"
import { buildApp } from "./app.js"

const configuration = Config.all({
  port: Config.integer("PORT").pipe(Config.withDefault(8080)),
  grafanaWebhookSecret: Config.redacted("GRAFANA_WEBHOOK_SECRET")
})

const main = Effect.gen(function* () {
  const { port, grafanaWebhookSecret } = yield* configuration
  const app = buildApp({
    grafanaWebhookSecret: Redacted.value(grafanaWebhookSecret)
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
