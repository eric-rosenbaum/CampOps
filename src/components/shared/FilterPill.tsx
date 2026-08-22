interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

/**
 * A tab in the toolbar rule, not a pill.
 *
 * The active filter is marked by an ember underline sitting on the toolbar's own bottom border,
 * so the selected view reads as the sheet of paper you are looking at rather than as a
 * separate chip floating above it.
 */
export function FilterPill({ label, active, onClick, count }: Props) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 pb-2.5 pt-3
                  text-[13px] font-semibold transition-colors cursor-pointer ${
        active
          ? 'border-red text-forest'
          : 'border-transparent text-ink-soft hover:text-forest'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="text-[11px] font-medium tabular-nums opacity-75">{count}</span>
      )}
    </button>
  );
}
