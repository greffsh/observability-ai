import { createServer } from "node:http"
import { Config, Effect } from "effect"
import { requestHandler } from "./http.js"

const configuration = Config.all({
  port: Config.integer("PORT").pipe(Config.withDefault(8080))
})

const main = Effect.gen(function* () {
  const { port } = yield* configuration

  const server = createServer(requestHandler)

  yield* Effect.async<void, Error>((resume) => {
    server.once("error", (error) => resume(Effect.fail(error)))
    server.listen(port, "0.0.0.0", () => resume(Effect.void))
  })

  yield* Effect.logInfo(`Analyzer listening on port ${port}`)
})

Effect.runPromise(main).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
