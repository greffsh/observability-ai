import { handoffAllowed } from "../incident-ui"
import type { IncidentBase } from "../types"

export const IncidentActions = ({
  incident,
  generating,
  copied,
  disabled = false,
  error,
  onHandoff,
  onCloseIncident
}: {
  readonly incident: IncidentBase
  readonly generating: boolean
  readonly copied: boolean
  readonly disabled?: boolean
  readonly error: string | null
  readonly onHandoff: (incident: IncidentBase) => void
  readonly onCloseIncident: (incident: IncidentBase) => void
}) => {
  if (!handoffAllowed(incident.status)) {
    return <span className="unavailable-action" aria-label="Sem ações">—</span>
  }

  return (
    <>
      <div className="action-buttons">
        {incident.status === "awaiting_confirmation" && (
          <button
            className="close-button"
            type="button"
            onClick={() => onCloseIncident(incident)}
            disabled={disabled}
          >
            Encerrar
          </button>
        )}
        <button
          className={`handoff-button${generating ? " is-loading" : ""}${copied ? " is-copied" : ""}`}
          type="button"
          aria-busy={generating}
          aria-label={generating ? "Copiando handoff" : copied ? "Handoff copiado" : "Copiar handoff"}
          onClick={() => onHandoff(incident)}
          disabled={disabled}
        >
          {copied ? "Copiado" : "Copiar handoff"}
        </button>
      </div>
      {error !== null && <span className="action-feedback error" role="alert">{error}</span>}
    </>
  )
}
