import type {
  ClosureReason,
  IncidentDetails,
  IncidentListResponse
} from "./types"

export class AnalyzerApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Analyzer respondeu HTTP ${status}`)
    this.name = "AnalyzerApiError"
    this.status = status
  }
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`/api${path}`, { ...init, headers })
  if (!response.ok) throw new AnalyzerApiError(response.status)
  return response.json() as Promise<T>
}

export const listIncidents = (
  token: string,
  signal: AbortSignal
): Promise<IncidentListResponse> => requestJson("/v1/incidents", token, { signal })

export const getIncident = (
  token: string,
  incidentId: string,
  signal: AbortSignal
): Promise<IncidentDetails> => requestJson(
  `/v1/incidents/${encodeURIComponent(incidentId)}`,
  token,
  { signal }
)

export const exportHandoff = (
  token: string,
  incidentId: string
): Promise<unknown> => requestJson(
  `/v1/incidents/${encodeURIComponent(incidentId)}/rca-handoff`,
  token,
  { method: "POST" }
)

export const closeIncident = (
  token: string,
  incidentId: string,
  reason: ClosureReason,
  note: string
): Promise<unknown> => requestJson(
  `/v1/incidents/${encodeURIComponent(incidentId)}/closure`,
  token,
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, ...(note.length === 0 ? {} : { note }) })
  }
)
