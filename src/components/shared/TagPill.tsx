interface Props {
  label: string;
  variant?: 'default' | 'location' | 'cost' | 'recurring';
}

const variants = {
  default: 'bg-cream-dark text-forest/70 border-border',
  location: 'bg-forest/8 text-forest border-forest/10',
  cost: 'bg-amber-bg text-amber-text border-amber/20',
  recurring: 'bg-green-muted-bg text-green-muted-text border-sage/20',
};

export function TagPill({ label, variant = 'default' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-tag text-[11px] font-medium border ${variants[variant]}`}
      style={variant === 'location' ? { backgroundColor: 'rgba(26,46,26,0.06)' } : undefined}
    >
      {label}
    </span>
  );
}
