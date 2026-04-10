interface Props {
  variant: 'alert' | 'warn';
  message: string;
  action?: { label: string; onClick: () => void };
}

export function AlertBanner({ variant, message, action }: Props) {
  const isAlert = variant === 'alert';
  return (
    <div
      className={`flex items-center gap-3 rounded-card border px-4 py-3.5 mb-5 ${
        isAlert
          ? 'bg-red-bg border-red/25'
          : 'bg-amber-bg border-amber/30'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${
          isAlert ? 'bg-red' : 'bg-amber'
        }`}
      >
        !
      </div>
      <p className={`flex-1 text-body leading-relaxed ${isAlert ? 'text-red/80' : 'text-amber-text'}`}>
        {message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className={`text-meta font-semibold px-3 py-1.5 rounded-btn border transition-colors whitespace-nowrap ${
            isAlert
              ? 'text-red border-red/40 hover:bg-red-bg'
              : 'text-amber-text border-amber/40 hover:bg-amber-bg'
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
