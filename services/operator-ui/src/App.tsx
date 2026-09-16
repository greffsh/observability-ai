import { useEffect, useState } from "react"
import {
  AnalyzerApiError,
  closeIncident as closeIncidentRequest,
  exportHandoff,
  getIncident,
  listIncidents
} from "./analyzer-api"
import { Authentication } from "./components/Authentication"
import { ClosureDialog } from "./components/ClosureDialog"
import { IncidentDrawer } from "./components/IncidentDrawer"
import { IncidentTable, type HandoffError } from "./components/IncidentTable"
import { StatusTabs } from "./components/StatusTabs"
import type {
  ClosureReason,
  IncidentBase,
  IncidentDetails,
  IncidentSummary,
  StatusFilter
} from "./types"

const tokenStorageKey = "grafana-ai-operator-token"

type OperationNotice = {
  readonly kind: "success" | "error"
  readonly message: string
}

const readStoredToken = (): string => {
  try {
    return window.sessionStorage.getItem(tokenStorageKey) ?? ""
  } catch {
    return ""
  }
}

const storeToken = (token: string): void => {
  try {
    window.sessionStorage.setItem(tokenStorageKey, token)
  } catch {
    // The token remains available only for the current page lifecycle.
  }
}

const removeStoredToken = (): void => {
  try {
    window.sessionStorage.removeItem(tokenStorageKey)
  } catch {
    // There is no persisted token to remove when storage is unavailable.
  }
}

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

export const App = () => {
  const [token, setToken] = useState(readStoredToken)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusFilter>("all")
  const [incidents, setIncidents] = useState<ReadonlyArray<IncidentSummary>>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)

  const [generatingIncidentId, setGeneratingIncidentId] = useState<string | null>(null)
  const [copiedHandoffIncidentId, setCopiedHandoffIncidentId] = useState<string | null>(null)
  const [handoffError, setHandoffError] = useState<HandoffError | null>(null)
  const [copiedIncidentId, setCopiedIncidentId] = useState<string | null>(null)

  const [closureTarget, setClosureTarget] = useState<IncidentBase | null>(null)
  const [closingIncidentId, setClosingIncidentId] = useState<string | null>(null)
  const [closureError, setClosureError] = useState<string | null>(null)
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null)

  const [detailTarget, setDetailTarget] = useState<IncidentSummary | null>(null)
  const [incidentDetails, setIncidentDetails] = useState<IncidentDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const forgetToken = (message: string | null) => {
    removeStoredToken()
    setToken("")
    setIncidents([])
    setDetailTarget(null)
    setIncidentDetails(null)
    setAuthMessage(message)
  }

  const handleUnauthorized = (error: unknown): boolean => {
    if (error instanceof AnalyzerApiError && error.status === 401) {
      forgetToken("Token inválido ou expirado.")
      return true
    }
    return false
  }

  useEffect(() => {
    if (operationNotice === null) return
    const timeout = window.setTimeout(() => setOperationNotice(null), 3_000)
    return () => window.clearTimeout(timeout)
  }, [operationNotice])

  useEffect(() => {
    if (token.length === 0) return

    const controller = new AbortController()
    setLoading(true)
    setListError(null)

    listIncidents(token, controller.signal).then((response) => {
      setIncidents(response.incidents)
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      if (!handleUnauthorized(error)) {
        setListError(errorMessage(error, "Não foi possível carregar os incidentes."))
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
  }, [token, refreshVersion])

  useEffect(() => {
    if (detailTarget === null || token.length === 0) return

    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError(null)

    getIncident(token, detailTarget.id, controller.signal).then(setIncidentDetails)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (!handleUnauthorized(error)) {
          setDetailError(errorMessage(error, "Não foi possível carregar os detalhes."))
        }
      }).finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
  }, [detailTarget?.id, token, refreshVersion])

  const authenticate = (newToken: string) => {
    storeToken(newToken)
    setAuthMessage(null)
    setToken(newToken)
  }

  const copyIncidentId = async (incidentId: string) => {
    try {
      if (navigator.clipboard === undefined) {
        throw new Error("O navegador não disponibilizou acesso ao clipboard.")
      }
      await navigator.clipboard.writeText(incidentId)
      setCopiedIncidentId(incidentId)
      window.setTimeout(() => {
        setCopiedIncidentId((current) => current === incidentId ? null : current)
      }, 1_500)
    } catch (error: unknown) {
      setOperationNotice({
        kind: "error",
        message: errorMessage(error, "Não foi possível copiar o ID.")
      })
    }
  }

  const closeIncident = async (reason: ClosureReason, note: string) => {
    if (closureTarget === null) return

    setClosingIncidentId(closureTarget.id)
    setClosureError(null)

    try {
      await closeIncidentRequest(token, closureTarget.id, reason, note)
      setClosureTarget(null)
      setOperationNotice({ kind: "success", message: "Incidente encerrado com sucesso." })
      setRefreshVersion((value) => value + 1)
    } catch (error: unknown) {
      if (handleUnauthorized(error)) return
      if (error instanceof AnalyzerApiError && error.status === 409) {
        setClosureError("O incidente não pode mais ser encerrado neste estado.")
      } else {
        setClosureError(errorMessage(error, "Falha ao fechar o incidente."))
      }
    } finally {
      setClosingIncidentId(null)
    }
  }

  const generateAndCopyHandoff = async (incident: IncidentBase) => {
    setGeneratingIncidentId(incident.id)
    setCopiedHandoffIncidentId(null)
    setHandoffError(null)

    try {
      const handoff = await exportHandoff(token, incident.id)
      if (navigator.clipboard === undefined) {
        throw new Error("O navegador não disponibilizou acesso ao clipboard.")
      }
      await navigator.clipboard.writeText(JSON.stringify(handoff, null, 2))
      setCopiedHandoffIncidentId(incident.id)
      window.setTimeout(() => {
        setCopiedHandoffIncidentId((current) => current === incident.id ? null : current)
      }, 1_500)
    } catch (error: unknown) {
      if (!handleUnauthorized(error)) {
        setHandoffError({
          incidentId: incident.id,
          message: errorMessage(error, "Falha ao gerar e copiar o handoff.")
        })
      }
    } finally {
      setGeneratingIncidentId(null)
    }
  }

  const openClosure = (incident: IncidentBase) => {
    setOperationNotice(null)
    setClosureError(null)
    setClosureTarget(incident)
  }

  const visibleIncidents = status === "all"
    ? incidents
    : incidents.filter((incident) => incident.status === status)
  const statusCounts: Readonly<Record<StatusFilter, number>> = {
    all: incidents.length,
    open: incidents.filter((incident) => incident.status === "open").length,
    awaiting_confirmation: incidents.filter(
      (incident) => incident.status === "awaiting_confirmation"
    ).length,
    closed: incidents.filter((incident) => incident.status === "closed").length
  }

  if (token.length === 0) {
    return <Authentication message={authMessage} onAuthenticate={authenticate} />
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Grafana AI</p>
          <h1>Incidentes</h1>
        </div>
        <button
          className="text-button"
          type="button"
          title="Remove o token desta sessão"
          onClick={() => forgetToken(null)}
        >
          Sair
        </button>
      </header>

      <main className="content">
        <section className="toolbar" aria-label="Controles da lista">
          <StatusTabs selected={status} counts={statusCounts} onSelect={setStatus} />
          <button
            className={`secondary-button${loading ? " is-loading" : ""}`}
            type="button"
            aria-busy={loading}
            title="Busca novamente os incidentes no Analyzer"
            onClick={() => setRefreshVersion((value) => value + 1)}
            disabled={loading}
          >
            Atualizar
          </button>
        </section>

        {operationNotice !== null && (
          <div className={`notice ${operationNotice.kind}-notice`} role="status">
            <span>{operationNotice.message}</span>
          </div>
        )}

        {listError !== null && (
          <div className="notice error-notice" role="alert">
            <strong>Falha ao carregar incidentes.</strong>
            <span>{listError}</span>
          </div>
        )}

        <IncidentTable
          incidents={visibleIncidents}
          loading={loading}
          generatingIncidentId={generatingIncidentId}
          closingIncidentId={closingIncidentId}
          copiedHandoffIncidentId={copiedHandoffIncidentId}
          copiedIncidentId={copiedIncidentId}
          handoffError={handoffError}
          onSelect={(incident) => {
            setIncidentDetails(null)
            setDetailTarget(incident)
          }}
          onCopyId={(incidentId) => void copyIncidentId(incidentId)}
          onHandoff={(incident) => void generateAndCopyHandoff(incident)}
          onCloseIncident={openClosure}
        />
      </main>

      {detailTarget !== null && (
        <IncidentDrawer
          target={detailTarget}
          details={incidentDetails}
          loading={detailLoading}
          error={detailError}
          copied={copiedIncidentId === detailTarget.id}
          generating={generatingIncidentId === detailTarget.id}
          handoffCopied={copiedHandoffIncidentId === detailTarget.id}
          handoffError={handoffError?.incidentId === detailTarget.id ? handoffError.message : null}
          onClose={() => {
            setDetailTarget(null)
            setIncidentDetails(null)
            setDetailError(null)
          }}
          onCopyId={() => void copyIncidentId(detailTarget.id)}
          onHandoff={(incident) => void generateAndCopyHandoff(incident)}
          onCloseIncident={openClosure}
        />
      )}

      {closureTarget !== null && (
        <ClosureDialog
          key={closureTarget.id}
          incident={closureTarget}
          busy={closingIncidentId === closureTarget.id}
          error={closureError}
          onCancel={() => {
            setClosureTarget(null)
            setClosureError(null)
          }}
          onConfirm={(reason, note) => void closeIncident(reason, note)}
        />
      )}
    </div>
  )
}
