import { handoffAllowed } from "../incident-ui"
import type { IncidentBase } from "../types"

export const IncidentActions = ({
  incident,
  generating,
  copied,
  disabled = false,
  deleting = false,
  error,
  onHandoff,
  onCloseIncident,
  onDeleteIncident
}: {
  readonly incident: IncidentBase
  readonly generating: boolean
  readonly copied: boolean
  readonly disabled?: boolean
  readonly deleting?: boolean
  readonly error: string | null
  readonly onHandoff: (incident: IncidentBase) => void
  readonly onCloseIncident: (incident: IncidentBase) => void
  readonly onDeleteIncident?: (incident: IncidentBase) => void
}) => {
  if (incident.status === "closed") {
    return onDeleteIncident === undefined
      ? <span className="unavailable-action" aria-label="Sem ações">—</span>
      : (
          <button
            className="delete-button"
            type="button"
            onClick={() => onDeleteIncident(incident)}
            disabled={deleting}
          >
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        )
  }

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
