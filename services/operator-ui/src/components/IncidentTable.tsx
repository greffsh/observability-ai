import { formatDateTime, formatRelativeTime, statusLabels } from "../incident-ui"
import type { IncidentBase, IncidentSummary } from "../types"
import { IncidentActions } from "./IncidentActions"

export type HandoffError = {
  readonly incidentId: string
  readonly message: string
}

export const IncidentTable = ({
  incidents,
  loading,
  generatingIncidentId,
  closingIncidentId,
  copiedHandoffIncidentId,
  copiedIncidentId,
  handoffError,
  onSelect,
  onCopyId,
  onHandoff,
  onCloseIncident
}: {
  readonly incidents: ReadonlyArray<IncidentSummary>
  readonly loading: boolean
  readonly generatingIncidentId: string | null
  readonly closingIncidentId: string | null
  readonly copiedHandoffIncidentId: string | null
  readonly copiedIncidentId: string | null
  readonly handoffError: HandoffError | null
  readonly onSelect: (incident: IncidentSummary) => void
  readonly onCopyId: (incidentId: string) => void
  readonly onHandoff: (incident: IncidentBase) => void
  readonly onCloseIncident: (incident: IncidentBase) => void
}) => (
  <section className="incident-panel" aria-busy={loading}>
    <div className="panel-heading">
      <div>
        <h2>Lista operacional</h2>
        <p>{incidents.length} {incidents.length === 1 ? "incidente" : "incidentes"}</p>
      </div>
    </div>

    {loading && incidents.length === 0 ? (
      <div className="empty-state">Carregando incidentes…</div>
    ) : incidents.length === 0 ? (
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
            {incidents.map((incident) => (
              <tr className="incident-row" key={incident.id} onClick={() => onSelect(incident)}>
                <td>
                  <button className="service-link" type="button">{incident.service}</button>
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
                        onCopyId(incident.id)
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
                <td className="active-alerts-cell">
                  <span className="active-count">{incident.activeAlerts}</span>
                </td>
                <td className="action-cell" onClick={(event) => event.stopPropagation()}>
                  <IncidentActions
                    incident={incident}
                    generating={generatingIncidentId === incident.id}
                    copied={copiedHandoffIncidentId === incident.id}
                    disabled={
                      generatingIncidentId === incident.id || closingIncidentId === incident.id
                    }
                    error={handoffError?.incidentId === incident.id ? handoffError.message : null}
                    onHandoff={onHandoff}
                    onCloseIncident={onCloseIncident}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
)
