interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

export function FilterPill({ label, active, onClick, count }: Props) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[12px] font-medium transition-colors cursor-pointer border ${
        active
          ? 'bg-forest text-cream border-forest'
          : 'bg-white text-forest/70 border-border hover:border-forest/30 hover:text-forest'
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            active ? 'bg-white/20 text-cream' : 'bg-forest/8 text-forest/60'
          }`}
          style={!active ? { backgroundColor: 'rgba(26,46,26,0.07)' } : undefined}
        >
          {count}
        </span>
      )}
    </button>
  );
}
