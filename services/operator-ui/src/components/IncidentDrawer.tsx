import { useEffect } from "react"
import {
  closureReasonLabel,
  formatDateTime,
  formatRelativeTime,
  handoffAllowed,
  occurrenceStatusLabels,
  statusLabels
} from "../incident-ui"
import type { IncidentBase, IncidentDetails, IncidentSummary } from "../types"
import { IncidentActions } from "./IncidentActions"

export const IncidentDrawer = ({
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
            <IncidentActions
              incident={incident}
              generating={generating}
              copied={handoffCopied}
              error={handoffError}
              onHandoff={onHandoff}
              onCloseIncident={onCloseIncident}
            />
          </footer>
        )}
      </aside>
    </div>
  )
}
