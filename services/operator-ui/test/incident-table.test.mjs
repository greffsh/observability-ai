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
const { DeletionDialog } = await vite.ssrLoadModule("/src/components/DeletionDialog.tsx")
const { deleteIncident } = await vite.ssrLoadModule("/src/analyzer-api.ts")

const incident = (id, status = "awaiting_confirmation") => ({
  id,
  service: "connect-api",
  environment: "local",
  incidentScope: "http",
  mergedIntoIncidentId: null,
  status,
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
    deletingIncidentId: null,
    copiedHandoffIncidentId: null,
    copiedIncidentId: null,
    handoffError: null,
    onSelect: () => undefined,
    onCopyId: () => undefined,
    onHandoff: () => undefined,
    onCloseIncident: () => undefined,
    onDeleteIncident: () => undefined
  }))
  const handoffButtons = [...markup.matchAll(/<button class="handoff-button[^>]*>/g)]
    .map(([button]) => button)

  assert.equal(handoffButtons.length, 2)
  assert.match(handoffButtons[0] ?? "", /\sdisabled=""/)
  assert.doesNotMatch(handoffButtons[1] ?? "", /\sdisabled=""/)
})

test("only closed incidents expose the delete action", () => {
  const markup = renderToStaticMarkup(createElement(IncidentTable, {
    incidents: [incident("closed-incident", "closed"), incident("open-incident", "open")],
    loading: false,
    generatingIncidentId: null,
    closingIncidentId: null,
    deletingIncidentId: null,
    copiedHandoffIncidentId: null,
    copiedIncidentId: null,
    handoffError: null,
    onSelect: () => undefined,
    onCopyId: () => undefined,
    onHandoff: () => undefined,
    onCloseIncident: () => undefined,
    onDeleteIncident: () => undefined
  }))

  assert.equal((markup.match(/>Excluir<\/button>/g) ?? []).length, 1)
})

test("clarifies that deleting an incident does not alter the service", () => {
  const markup = renderToStaticMarkup(createElement(DeletionDialog, {
    incident: incident("closed-incident", "closed"),
    busy: false,
    error: null,
    onCancel: () => undefined,
    onConfirm: () => undefined
  }))

  assert.match(markup, /O serviço <strong>connect-api<\/strong> não será alterado\./)
})

test("deletes an incident through the operator endpoint", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/v1/incidents/incident-1")
    assert.equal(init?.method, "DELETE")
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer operator-token")
    return new Response(null, { status: 204 })
  }

  try {
    await deleteIncident("operator-token", "incident-1")
  } finally {
    globalThis.fetch = originalFetch
  }
})
