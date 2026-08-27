import type { RequestListener } from "node:http"

export const requestHandler: RequestListener = (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ status: "ok", service: "analyzer" }))
    return
  }

  response.writeHead(404, { "content-type": "application/json" })
  response.end(JSON.stringify({ error: "not_found" }))
}

