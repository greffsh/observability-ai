import { useEffect, useState, type FormEvent } from "react"

type IncidentStatus = "open" | "awaiting_confirmation" | "closed" | "merged"
type OperationalStatus = Exclude<IncidentStatus, "merged">
type StatusFilter = "all" | OperationalStatus
type ClosureReason =
  | "recovery_confirmed"
  | "false_positive"
  | "no_action_required"
  | "duplicate"
  | "other"

type IncidentBase = {
  readonly id: string
  readonly service: string
  readonly environment: string
  readonly incidentScope: string
  readonly mergedIntoIncidentId: string | null
  readonly status: IncidentStatus
  readonly detectedAt: string
  readonly lastActivityAt: string
  readonly signalsClearedAt: string | null
}

type IncidentSummary = IncidentBase & {
  readonly activeAlerts: number
}

type IncidentClosure = {
  readonly closedAt: string
  readonly method: "operator" | "policy"
  readonly reason: ClosureReason
  readonly closedBy: string
  readonly note: string | null
  readonly policyVersion: number | null
}

type AlertOccurrence = {
  readonly id: string
  readonly status: "open" | "resolved" | "closed_unconfirmed"
  readonly alertName: string
  readonly startedAt: string
  readonly endedAt: string | null
  readonly firingObserved: boolean
}

type IncidentDetails = IncidentBase & {
  readonly closure: IncidentClosure | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly occurrences: ReadonlyArray<AlertOccurrence>
}

type IncidentListResponse = {
  readonly incidents: ReadonlyArray<IncidentSummary>
}

type CopyFeedback = {
  readonly incidentId: string
  readonly message: string
}

type OperationNotice = {
  readonly kind: "success" | "error"
  readonly message: string
}

const tokenStorageKey = "grafana-ai-operator-token"

const statusLabels: Readonly<Record<IncidentStatus, string>> = {
  open: "Aberto",
  awaiting_confirmation: "Aguardando confirmação",
  closed: "Encerrado",
  merged: "Mesclado"
}

const statusOptions: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abertos" },
  { value: "awaiting_confirmation", label: "Aguardando" },
  { value: "closed", label: "Encerrados" }
]

const closureReasonOptions: ReadonlyArray<{ value: ClosureReason; label: string }> = [
  { value: "recovery_confirmed", label: "Recuperação confirmada" },
  { value: "false_positive", label: "Falso positivo" },
  { value: "no_action_required", label: "Nenhuma ação necessária" },
  { value: "duplicate", label: "Duplicado" },
  { value: "other", label: "Outro" }
]

const occurrenceStatusLabels: Readonly<Record<AlertOccurrence["status"], string>> = {
  open: "Aberta",
  resolved: "Resolvida",
  closed_unconfirmed: "Encerramento não confirmado"
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

const formatDateTime = (value: string): string => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium"
}).format(new Date(value))

const formatRelativeTime = (value: string): string => {
  const seconds = (new Date(value).getTime() - Date.now()) / 1_000
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

  if (Math.abs(seconds) < 60) return formatter.format(Math.round(seconds), "second")
  const minutes = seconds / 60
  if (Math.abs(minutes) < 60) return formatter.format(Math.round(minutes), "minute")
  const hours = minutes / 60
  if (Math.abs(hours) < 24) return formatter.format(Math.round(hours), "hour")
  return formatter.format(Math.round(hours / 24), "day")
}

const closureReasonLabel = (reason: ClosureReason): string =>
  closureReasonOptions.find((option) => option.value === reason)?.label ?? reason

const handoffAllowed = (status: IncidentStatus): boolean =>
  status === "open" || status === "awaiting_confirmation"

const authorizationHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`
})

const ClosureDialog = ({
  incident,
  busy,
  error,
  onCancel,
  onConfirm
}: {
  readonly incident: IncidentBase
  readonly busy: boolean
  readonly error: string | null
  readonly onCancel: () => void
  readonly onConfirm: (reason: ClosureReason, note: string) => void
}) => {
  const [reason, setReason] = useState<ClosureReason>("recovery_confirmed")
  const [note, setNote] = useState("")

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onCancel()
    }

    window.addEventListener("keydown", closeOnEscape, true)
    return () => window.removeEventListener("keydown", closeOnEscape, true)
  }, [busy, onCancel])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onConfirm(reason, note.trim())
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="closure-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="closure-title"
        aria-describedby="closure-description"
      >
        <p className="eyebrow">Encerramento operacional</p>
        <h2 id="closure-title">Fechar incidente</h2>
        <p id="closure-description" className="muted">
          Confirme o motivo do encerramento de <strong>{incident.service}</strong>. Esta ação é
          terminal e não afirma que uma causa raiz foi identificada.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="closure-reason">Motivo</label>
          <select
            id="closure-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value as ClosureReason)}
            disabled={busy}
            autoFocus
          >
            {closureReasonOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <label htmlFor="closure-note">Nota opcional</label>
          <textarea
            id="closure-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2_000}
            rows={4}
            disabled={busy}
            placeholder="Contexto para a trilha de auditoria"
          />

          {error !== null && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button className="danger-button" type="submit" disabled={busy}>
              {busy ? "Fechando…" : "Confirmar fechamento"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

const IncidentDrawer = ({
  target,
  details,
  loading,
  error,
  copied,
  generating,
  handoffCopied,
  handoffError,
  onClose,
  onCopyId,
  onHandoff,
  onCloseIncident
}: {
  readonly target: IncidentSummary
  readonly details: IncidentDetails | null
  readonly loading: boolean
  readonly error: string | null
  readonly copied: boolean
  readonly generating: boolean
  readonly handoffCopied: boolean
  readonly handoffError: string | null
  readonly onClose: () => void
  readonly onCopyId: () => void
  readonly onHandoff: (incident: IncidentBase) => void
  readonly onCloseIncident: (incident: IncidentBase) => void
}) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  const incident = details ?? target
  const activeAlerts = details === null
    ? target.activeAlerts
    : details.occurrences.filter((occurrence) => occurrence.status === "open").length

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside className="incident-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-header">
          <div>
            <p className="eyebrow">Detalhes do incidente</p>
            <h2 id="drawer-title">{incident.service}</h2>
            <span className="service-meta">{incident.environment} · {incident.incidentScope}</span>
          </div>
          <button className="drawer-close" type="button" aria-label="Fechar detalhes" onClick={onClose}>×</button>
        </header>

        <div className="drawer-body">
          <div className="drawer-status-line">
            <span className={`status-badge status-${incident.status}`}>
              {statusLabels[incident.status]}
            </span>
            <span>{activeAlerts} {activeAlerts === 1 ? "alerta ativo" : "alertas ativos"}</span>
          </div>

          <div className="drawer-id">
            <code>{incident.id}</code>
            <button className={`copy-id-button${copied ? " copied" : ""}`} type="button" onClick={onCopyId}>
              {copied ? "Copiado" : "Copiar ID"}
            </button>
          </div>

          <dl className="detail-grid">
            <div>
              <dt>Detectado</dt>
              <dd><time dateTime={incident.detectedAt} title={formatDateTime(incident.detectedAt)}>{formatRelativeTime(incident.detectedAt)}</time></dd>
            </div>
            <div>
              <dt>Última atividade</dt>
              <dd><time dateTime={incident.lastActivityAt} title={formatDateTime(incident.lastActivityAt)}>{formatRelativeTime(incident.lastActivityAt)}</time></dd>
            </div>
            <div>
              <dt>Sinais limpos</dt>
              <dd>{incident.signalsClearedAt === null ? "Ainda ativos" : (
                <time dateTime={incident.signalsClearedAt} title={formatDateTime(incident.signalsClearedAt)}>
                  {formatRelativeTime(incident.signalsClearedAt)}
                </time>
              )}</dd>
            </div>
          </dl>

          {loading && details === null && <div className="drawer-loading">Carregando detalhes…</div>}
          {error !== null && <div className="notice error-notice" role="alert">{error}</div>}

          {details !== null && (
            <>
              <section className="drawer-section">
                <div className="drawer-section-heading">
                  <h3>Ocorrências</h3>
                  <span>{details.occurrences.length}</span>
                </div>
                {details.occurrences.length === 0 ? (
                  <p className="drawer-empty">Nenhuma ocorrência associada.</p>
                ) : details.occurrences.map((occurrence) => (
                  <article className="occurrence-card" key={occurrence.id}>
                    <div>
                      <strong>{occurrence.alertName}</strong>
                      <span>{occurrenceStatusLabels[occurrence.status]}</span>
                    </div>
                    <p>
                      Início <time dateTime={occurrence.startedAt} title={formatDateTime(occurrence.startedAt)}>{formatRelativeTime(occurrence.startedAt)}</time>
                      {occurrence.endedAt !== null && (
                        <> · fim <time dateTime={occurrence.endedAt} title={formatDateTime(occurrence.endedAt)}>{formatRelativeTime(occurrence.endedAt)}</time></>
                      )}
                    </p>
                    {!occurrence.firingObserved && <small>Ciclo reconstruído sem firing observado.</small>}
                  </article>
                ))}
              </section>

              {details.closure !== null && (
                <section className="drawer-section closure-summary">
                  <h3>Encerramento</h3>
                  <dl>
                    <div><dt>Motivo</dt><dd>{closureReasonLabel(details.closure.reason)}</dd></div>
                    <div><dt>Responsável</dt><dd>{details.closure.closedBy}</dd></div>
                    <div><dt>Quando</dt><dd><time dateTime={details.closure.closedAt} title={formatDateTime(details.closure.closedAt)}>{formatRelativeTime(details.closure.closedAt)}</time></dd></div>
                  </dl>
                  {details.closure.note !== null && <p>{details.closure.note}</p>}
                </section>
              )}
            </>
          )}
        </div>

        {handoffAllowed(incident.status) && (
          <footer className="drawer-actions">
            {incident.status === "awaiting_confirmation" && (
              <button className="close-button" type="button" onClick={() => onCloseIncident(incident)}>
                Encerrar
              </button>
            )}
            <button
              className={`handoff-button${generating ? " is-loading" : ""}${handoffCopied ? " is-copied" : ""}`}
              type="button"
              aria-busy={generating}
              onClick={() => onHandoff(incident)}
              disabled={generating}
            >
              {handoffCopied ? "Copiado" : "Copiar handoff"}
            </button>
            {handoffError !== null && <span className="action-feedback error" role="alert">{handoffError}</span>}
          </footer>
        )}
      </aside>
    </div>
  )
}

const Authentication = ({
  message,
  onAuthenticate
}: {
  readonly message: string | null
  readonly onAuthenticate: (token: string) => void
}) => {
  const [value, setValue] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = value.trim()
    if (token.length > 0) onAuthenticate(token)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">AI</div>
        <p className="eyebrow">Grafana AI</p>
        <h1 id="auth-title">Acesso do operador</h1>
        <p className="muted">
          Informe a credencial do Analyzer para visualizar incidentes e gerar handoffs.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="operator-token">Token de operador</label>
          <input
            id="operator-token"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="Bearer token"
          />
          {message !== null && <p className="form-error" role="alert">{message}</p>}
          <button className="primary-button" type="submit" disabled={value.trim().length === 0}>
            Acessar incidentes
          </button>
        </form>

        <p className="storage-note">O token permanece somente nesta sessão do navegador.</p>
      </section>
    </main>
  )
}

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
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null)
  const [closureTarget, setClosureTarget] = useState<IncidentBase | null>(null)
  const [closingIncidentId, setClosingIncidentId] = useState<string | null>(null)
  const [closureError, setClosureError] = useState<string | null>(null)
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null)
  const [copiedIncidentId, setCopiedIncidentId] = useState<string | null>(null)
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

    fetch("/api/v1/incidents", {
      headers: authorizationHeaders(token),
      signal: controller.signal
    }).then(async (response) => {
      if (response.status === 401) {
        forgetToken("Token inválido ou expirado.")
        return null
      }
      if (!response.ok) throw new Error(`Analyzer respondeu HTTP ${response.status}`)
      return response.json() as Promise<IncidentListResponse>
    }).then((response) => {
      if (response !== null) setIncidents(response.incidents)
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      setListError(error instanceof Error ? error.message : "Não foi possível carregar os incidentes.")
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

    fetch(`/api/v1/incidents/${encodeURIComponent(detailTarget.id)}`, {
      headers: authorizationHeaders(token),
      signal: controller.signal
    }).then(async (response) => {
      if (response.status === 401) {
        forgetToken("Token inválido ou expirado.")
        return null
      }
      if (!response.ok) throw new Error(`Analyzer respondeu HTTP ${response.status}`)
      return response.json() as Promise<IncidentDetails>
    }).then((response) => {
      if (response !== null) setIncidentDetails(response)
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return
      setDetailError(error instanceof Error ? error.message : "Não foi possível carregar os detalhes.")
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
        message: error instanceof Error ? error.message : "Não foi possível copiar o ID."
      })
    }
  }

  const closeIncident = async (reason: ClosureReason, note: string) => {
    if (closureTarget === null) return

    setClosingIncidentId(closureTarget.id)
    setClosureError(null)

    try {
      const response = await fetch(
        `/api/v1/incidents/${encodeURIComponent(closureTarget.id)}/closure`,
        {
          method: "PUT",
          headers: {
            ...authorizationHeaders(token),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ reason, ...(note.length === 0 ? {} : { note }) })
        }
      )
      if (response.status === 401) {
        forgetToken("Token inválido ou expirado.")
        return
      }
      if (response.status === 409) {
        throw new Error("O incidente não pode mais ser encerrado neste estado.")
      }
      if (!response.ok) {
        throw new Error(`Não foi possível fechar o incidente (HTTP ${response.status}).`)
      }

      setClosureTarget(null)
      setOperationNotice({ kind: "success", message: "Incidente encerrado com sucesso." })
      setRefreshVersion((value) => value + 1)
    } catch (error: unknown) {
      setClosureError(error instanceof Error ? error.message : "Falha ao fechar o incidente.")
    } finally {
      setClosingIncidentId(null)
    }
  }

  const generateAndCopyHandoff = async (incident: IncidentBase) => {
    setGeneratingIncidentId(incident.id)
    setCopiedHandoffIncidentId(null)
    setCopyFeedback(null)

    try {
      const response = await fetch(`/api/v1/incidents/${encodeURIComponent(incident.id)}/rca-handoff`, {
        method: "POST",
        headers: authorizationHeaders(token)
      })
      if (response.status === 401) {
        forgetToken("Token inválido ou expirado.")
        return
      }
      if (!response.ok) throw new Error(`Não foi possível gerar o handoff (HTTP ${response.status}).`)
      if (navigator.clipboard === undefined) {
        throw new Error("O navegador não disponibilizou acesso ao clipboard.")
      }

      const handoff = await response.json() as unknown
      await navigator.clipboard.writeText(JSON.stringify(handoff, null, 2))
      setCopiedHandoffIncidentId(incident.id)
      window.setTimeout(() => {
        setCopiedHandoffIncidentId((current) => current === incident.id ? null : current)
      }, 1_500)
    } catch (error: unknown) {
      setCopyFeedback({
        incidentId: incident.id,
        message: error instanceof Error ? error.message : "Falha ao gerar e copiar o handoff."
      })
    } finally {
      setGeneratingIncidentId(null)
    }
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
          <div className="status-tabs" role="group" aria-label="Filtrar incidentes por status">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                className={status === option.value ? "active" : ""}
                type="button"
                aria-pressed={status === option.value}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
                <span>{statusCounts[option.value]}</span>
              </button>
            ))}
          </div>
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

        <section className="incident-panel" aria-busy={loading}>
          <div className="panel-heading">
            <div>
              <h2>Lista operacional</h2>
              <p>{visibleIncidents.length} {visibleIncidents.length === 1 ? "incidente" : "incidentes"}</p>
            </div>
          </div>

          {loading && incidents.length === 0 ? (
            <div className="empty-state">Carregando incidentes…</div>
          ) : visibleIncidents.length === 0 ? (
            <div className="empty-state">Nenhum incidente encontrado para este filtro.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Status</th>
                    <th>Detectado</th>
                    <th>Última atividade</th>
                    <th className="active-alerts-heading">Alertas ativos</th>
                    <th className="action-heading">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleIncidents.map((incident) => {
                    const feedback = copyFeedback?.incidentId === incident.id ? copyFeedback : null
                    const generating = generatingIncidentId === incident.id
                    const handoffCopied = copiedHandoffIncidentId === incident.id

                    return (
                      <tr
                        className="incident-row"
                        key={incident.id}
                        onClick={() => {
                          setIncidentDetails(null)
                          setDetailTarget(incident)
                        }}
                      >
                        <td>
                          <button className="service-link" type="button">
                            {incident.service}
                          </button>
                          <span className="service-meta">
                            {incident.environment} · {incident.incidentScope}
                          </span>
                          <span className="incident-identity">
                            <span className="incident-id">{incident.id}</span>
                            <button
                              className={`copy-id-icon${copiedIncidentId === incident.id ? " copied" : ""}`}
                              type="button"
                              aria-label="Copiar ID do incidente"
                              title="Copiar ID do incidente"
                              onClick={(event) => {
                                event.stopPropagation()
                                void copyIncidentId(incident.id)
                              }}
                            >
                              {copiedIncidentId === incident.id ? "✓" : "⧉"}
                            </button>
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge status-${incident.status}`}>
                            {statusLabels[incident.status]}
                          </span>
                        </td>
                        <td>
                          <time dateTime={incident.detectedAt} title={formatDateTime(incident.detectedAt)}>
                            {formatRelativeTime(incident.detectedAt)}
                          </time>
                        </td>
                        <td>
                          <time dateTime={incident.lastActivityAt} title={formatDateTime(incident.lastActivityAt)}>
                            {formatRelativeTime(incident.lastActivityAt)}
                          </time>
                        </td>
                        <td className="active-alerts-cell"><span className="active-count">{incident.activeAlerts}</span></td>
                        <td className="action-cell" onClick={(event) => event.stopPropagation()}>
                          {handoffAllowed(incident.status) ? (
                            <>
                              <div className="action-buttons">
                                {incident.status === "awaiting_confirmation" && (
                                  <button
                                    className="close-button"
                                    type="button"
                                    onClick={() => {
                                      setOperationNotice(null)
                                      setClosureError(null)
                                      setClosureTarget(incident)
                                    }}
                                    disabled={generatingIncidentId !== null || closingIncidentId !== null}
                                  >
                                    Encerrar
                                  </button>
                                )}
                                <button
                                  className={`handoff-button${generating ? " is-loading" : ""}${handoffCopied ? " is-copied" : ""}`}
                                  type="button"
                                  aria-busy={generating}
                                  aria-label={generating ? "Copiando handoff" : handoffCopied ? "Handoff copiado" : "Copiar handoff"}
                                  onClick={() => void generateAndCopyHandoff(incident)}
                                  disabled={generatingIncidentId !== null || closingIncidentId !== null}
                                >
                                  {handoffCopied ? "Copiado" : "Copiar handoff"}
                                </button>
                              </div>
                              {feedback !== null && (
                                <span className="action-feedback error" role="alert">
                                  {feedback.message}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="unavailable-action" aria-label="Sem ações">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
          handoffError={copyFeedback?.incidentId === detailTarget.id ? copyFeedback.message : null}
          onClose={() => {
            setDetailTarget(null)
            setIncidentDetails(null)
            setDetailError(null)
          }}
          onCopyId={() => void copyIncidentId(detailTarget.id)}
          onHandoff={(incident) => void generateAndCopyHandoff(incident)}
          onCloseIncident={(incident) => {
            setOperationNotice(null)
            setClosureError(null)
            setClosureTarget(incident)
          }}
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
