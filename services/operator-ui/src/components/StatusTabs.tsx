import { statusOptions } from "../incident-ui"
import type { StatusFilter } from "../types"

export const StatusTabs = ({
  selected,
  counts,
  onSelect
}: {
  readonly selected: StatusFilter
  readonly counts: Readonly<Record<StatusFilter, number>>
  readonly onSelect: (status: StatusFilter) => void
}) => (
  <div className="status-tabs" role="group" aria-label="Filtrar incidentes por status">
    {statusOptions.map((option) => (
      <button
        key={option.value}
        className={selected === option.value ? "active" : ""}
        type="button"
        aria-pressed={selected === option.value}
        onClick={() => onSelect(option.value)}
      >
        {option.label}
        <span>{counts[option.value]}</span>
      </button>
    ))}
  </div>
)
