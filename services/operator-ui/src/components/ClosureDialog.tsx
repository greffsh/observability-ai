import { useEffect, useState, type FormEvent } from "react"
import { closureReasonOptions } from "../incident-ui"
import type { ClosureReason, IncidentBase } from "../types"

export const ClosureDialog = ({
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
