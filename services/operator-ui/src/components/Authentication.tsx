import { useState, type FormEvent } from "react"

export const Authentication = ({
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
