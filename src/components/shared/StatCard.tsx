interface Props {
  label: string;
  value: string | number;
  hint?: string;
  variant?: 'default' | 'red' | 'amber';
}

const valueColors = {
  default: 'text-forest',
  red: 'text-red',
  amber: 'text-amber',
};

export function StatCard({ label, value, hint, variant = 'default' }: Props) {
  return (
    <div className="bg-white rounded-card border border-border px-5 py-4 flex flex-col gap-1">
      <p className="text-[12px] font-medium text-forest/60 uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-stat font-medium leading-none ${valueColors[variant]}`}>{value}</p>
      {hint && <p className="text-[11px] text-forest/45">{hint}</p>}
    </div>
  );
}
