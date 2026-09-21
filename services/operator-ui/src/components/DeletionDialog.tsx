import { useEffect } from "react"
import type { IncidentBase } from "../types"

export const DeletionDialog = ({
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
  readonly onConfirm: () => void
}) => {
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

  return (
    <div className="dialog-backdrop">
      <section
        className="closure-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deletion-title"
        aria-describedby="deletion-description"
      >
        <p className="eyebrow">Incidente encerrado</p>
        <h2 id="deletion-title">Excluir este incidente?</h2>
        <p id="deletion-description" className="muted">
          Este incidente deixará de aparecer nas listagens operacionais. O serviço
          {" "}<strong>{incident.service}</strong> não será alterado. Eventos, ocorrências e dados
          de encerramento permanecerão preservados para auditoria.
        </p>

        {error !== null && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Excluindo…" : "Excluir incidente"}
          </button>
        </div>
      </section>
    </div>
  )
}
