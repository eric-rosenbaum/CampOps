interface Props {
  label: string;
  variant?: 'default' | 'location' | 'cost' | 'recurring' | 'public';
}

const variants = {
  default: 'bg-cream-dark text-ink-soft border-border',
  location: 'bg-paper text-ink-soft border-border',
  cost: 'bg-amber-bg text-amber-text border-amber/30',
  recurring: 'bg-green-muted-bg text-green-muted-text border-sage/30',
  // Was violet, which is off-palette here. A called-in report is stamped in ember instead.
  public: 'bg-transparent text-red border-red',
};

export function TagPill({ label, variant = 'default' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-tag border px-2 py-0.5 text-[11px] font-medium ${variants[variant]}`}
    >
      {label}
    </span>
  );
}
