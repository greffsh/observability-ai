import assert from "node:assert/strict"
import test, { after } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true }
})
after(() => vite.close())

const { IncidentTable } = await vite.ssrLoadModule("/src/components/IncidentTable.tsx")

const incident = (id) => ({
  id,
  service: "connect-api",
  environment: "local",
  incidentScope: "http",
  mergedIntoIncidentId: null,
  status: "awaiting_confirmation",
  detectedAt: "2026-09-21T10:00:00.000Z",
  lastActivityAt: "2026-09-21T10:05:00.000Z",
  signalsClearedAt: "2026-09-21T10:05:00.000Z",
  activeAlerts: 0
})

test("only the incident generating a handoff changes its action state", () => {
  const markup = renderToStaticMarkup(createElement(IncidentTable, {
    incidents: [incident("incident-1"), incident("incident-2")],
    loading: false,
    generatingIncidentId: "incident-1",
    closingIncidentId: null,
    copiedHandoffIncidentId: null,
    copiedIncidentId: null,
    handoffError: null,
    onSelect: () => undefined,
    onCopyId: () => undefined,
    onHandoff: () => undefined,
    onCloseIncident: () => undefined
  }))
  const handoffButtons = [...markup.matchAll(/<button class="handoff-button[^>]*>/g)]
    .map(([button]) => button)

  assert.equal(handoffButtons.length, 2)
  assert.match(handoffButtons[0] ?? "", /\sdisabled=""/)
  assert.doesNotMatch(handoffButtons[1] ?? "", /\sdisabled=""/)
})
