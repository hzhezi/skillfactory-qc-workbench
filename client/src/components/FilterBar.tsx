import type { SegmentFilter } from "../types/qc";

interface FilterBarProps {
  filter: SegmentFilter;
  total: number;
  valid: number;
  invalid: number;
  onChange: (filter: SegmentFilter) => void;
}

const OPTIONS: Array<{ value: SegmentFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "VALID", label: "Valid" },
  { value: "INVALID", label: "Invalid" },
];

export function FilterBar({
  filter,
  total,
  valid,
  invalid,
  onChange,
}: FilterBarProps) {
  const counts: Record<SegmentFilter, number> = {
    ALL: total,
    VALID: valid,
    INVALID: invalid,
  };

  return (
    <div className="filter-bar" role="group" aria-label="筛选 Segment">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-button ${
            filter === option.value ? "is-active" : ""
          }`}
          aria-pressed={filter === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          <span className="filter-count">{counts[option.value]}</span>
        </button>
      ))}
    </div>
  );
}
