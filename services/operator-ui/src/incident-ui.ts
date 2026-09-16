import type {
  AlertOccurrence,
  ClosureReason,
  IncidentStatus,
  StatusFilter
} from "./types"

export const statusLabels: Readonly<Record<IncidentStatus, string>> = {
  open: "Aberto",
  awaiting_confirmation: "Aguardando confirmação",
  closed: "Encerrado",
  merged: "Mesclado"
}

export const statusOptions: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abertos" },
  { value: "awaiting_confirmation", label: "Aguardando" },
  { value: "closed", label: "Encerrados" }
]

export const closureReasonOptions: ReadonlyArray<{ value: ClosureReason; label: string }> = [
  { value: "recovery_confirmed", label: "Recuperação confirmada" },
  { value: "false_positive", label: "Falso positivo" },
  { value: "no_action_required", label: "Nenhuma ação necessária" },
  { value: "duplicate", label: "Duplicado" },
  { value: "other", label: "Outro" }
]

export const occurrenceStatusLabels: Readonly<Record<AlertOccurrence["status"], string>> = {
  open: "Aberta",
  resolved: "Resolvida",
  closed_unconfirmed: "Encerramento não confirmado"
}

export const closureReasonLabel = (reason: ClosureReason): string =>
  closureReasonOptions.find((option) => option.value === reason)?.label ?? reason

export const handoffAllowed = (status: IncidentStatus): boolean =>
  status === "open" || status === "awaiting_confirmation"

export const formatDateTime = (value: string): string => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium"
}).format(new Date(value))

export const formatRelativeTime = (value: string): string => {
  const seconds = (new Date(value).getTime() - Date.now()) / 1_000
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

  if (Math.abs(seconds) < 60) return formatter.format(Math.round(seconds), "second")
  const minutes = seconds / 60
  if (Math.abs(minutes) < 60) return formatter.format(Math.round(minutes), "minute")
  const hours = minutes / 60
  if (Math.abs(hours) < 24) return formatter.format(Math.round(hours), "hour")
  return formatter.format(Math.round(hours / 24), "day")
}
