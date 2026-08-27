import { buildApp } from "./app.js"

const port = Number.parseInt(process.env.PORT ?? "8081", 10)
const app = buildApp({
  logger: true,
  serviceName: process.env.SERVICE_NAME ?? "checkout-api",
  environment: process.env.ENVIRONMENT ?? "local"
})

try {
  await app.listen({ port, host: "0.0.0.0" })
  app.log.info({ event: "service_started", port }, "checkout-api started")
} catch (error: unknown) {
  app.log.error({ err: error, event: "service_start_failed" }, "checkout-api failed to start")
  process.exitCode = 1
}
