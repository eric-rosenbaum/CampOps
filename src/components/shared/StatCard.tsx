interface Props {
  label: string;
  value: string | number;
  hint?: string;
  variant?: 'default' | 'red' | 'amber' | 'green';
}

const valueColors = {
  default: 'text-forest',
  red: 'text-red',
  amber: 'text-amber',
  green: 'text-green-muted-text',
};

/**
 * A figure in the header band, not a card.
 *
 * The Field Guide treats the top-of-page numbers as one continuous strip divided by hairlines,
 * the way a printed field report rules its columns, so this renders as a flat cell and lets
 * the parent supply the rule. Boxing each number made four small containers compete with the
 * list below them for attention.
 */
export function StatCard({ label, value, hint, variant = 'default' }: Props) {
  return (
    <div className="flex flex-col gap-1 px-6 py-4 border-r border-border last:border-r-0 first:pl-0">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <p className={`font-display text-[31px] font-bold leading-[1.05] tabular-nums ${valueColors[variant]}`}>
        {value}
      </p>
      {hint && <p className="text-[11.5px] text-ink-soft">{hint}</p>}
    </div>
  );
}
