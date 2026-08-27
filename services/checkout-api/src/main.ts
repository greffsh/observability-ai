import { buildApp } from "./app.js"

const port = Number.parseInt(process.env.PORT ?? "8081", 10)
const app = buildApp()

try {
  await app.listen({ port, host: "0.0.0.0" })
  console.log(`checkout-api listening on port ${port}`)
} catch (error: unknown) {
  console.error(error)
  process.exitCode = 1
}
