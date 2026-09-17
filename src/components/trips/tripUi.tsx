/**
 * Small shared pieces of the Town Trips screens: kind styling, seat dots, the sheet that is a
 * dialog on a laptop and a bottom sheet on a phone, and the one-line toast.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { TripKind, TripDirection } from '@/lib/tripTypes';
import type { SeatUsage } from '@/lib/trips';
import { kindStyle } from './tripStyle';

export function KindTag({ kind, className = '' }: { kind: TripKind; className?: string }) {
  const k = kindStyle(kind);
  const I = k.icon;
  return (
    // Sentence case: "OTHER" in capitals read as a system category, not a kind of trip.
    <span
      className={`inline-flex items-center gap-1 rounded-tag px-1.5 py-0.5 text-[11.5px] font-bold ${className}`}
      style={{ background: k.wash, color: k.ink }}
    >
      <I className="h-3 w-3" />
      {k.label}
    </span>
  );
}

/**
 * One dot per passenger seat. Full: taken. Left half: taken on the way there only. Right half: on
 * the way back only. Empty ring: free. Amber "+N": waiting for a seat. A one-way trip has only one
 * leg, so a taken seat on it is a full dot -- half dots on an into-town-only ride suggested there
 * were seats back to be had.
 */
export function SeatDots({ usage, color, size = 10, showWaitlist = true, direction = 'round_trip' }: {
  usage: SeatUsage; color: string; size?: number; showWaitlist?: boolean; direction?: TripDirection;
}) {
  const free = direction === 'outbound' ? usage.freeThere : direction === 'pickup' ? usage.freeBack : usage.freeBoth;
  const label = `${free} of ${usage.seats} seat${usage.seats === 1 ? '' : 's'} free`
    + (usage.waitlist.length ? `, ${usage.waitlist.length} waiting` : '');
  return (
    <span
      className="inline-flex flex-wrap items-center gap-[3px]"
      data-testid="seat-dots"
      data-seats={usage.seats}
      data-there={usage.thereUsed}
      data-back={usage.backUsed}
      data-waitlist={usage.waitlist.length}
      aria-label={label}
      title={label}
      role="img"
    >
      {usage.slots.map((slot, i) => {
        let background = 'transparent';
        const oneWay = direction !== 'round_trip';
        if (oneWay ? (direction === 'outbound' ? slot.there : slot.back) : slot.there && slot.back) background = color;
        else if (!oneWay && slot.there) background = `linear-gradient(90deg, ${color} 50%, transparent 50%)`;
        else if (!oneWay && slot.back) background = `linear-gradient(90deg, transparent 50%, ${color} 50%)`;
        return (
          <span
            key={i}
            className="inline-block flex-none rounded-full"
            style={{ width: size, height: size, background, boxShadow: `inset 0 0 0 1.5px ${color}` }}
          />
        );
      })}
      {usage.seats === 0 && <span className="text-[11px] text-ink-soft">no seats</span>}
      {showWaitlist && usage.waitlist.length > 0 && (
        <span className="ml-0.5 rounded-pill bg-amber-bg px-1.5 text-[10.5px] font-bold leading-[16px] text-amber-text">
          +{usage.waitlist.length} waiting
        </span>
      )}
    </span>
  );
}

/** Initials in a small disc — the driver on a card, a rider in a list. */
export function Initials({ name, className = '' }: { name: string | null | undefined; className?: string }) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const text = parts.length === 0 ? '?' : parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0];
  return (
    <span className={`inline-grid h-6 w-6 flex-none place-items-center rounded-full bg-sage-pale text-[10px] font-bold text-forest ${className}`}>
      {text.toUpperCase()}
    </span>
  );
}

/**
 * A dialog on a laptop, a bottom sheet on a phone.
 *
 * The shared Modal is a fixed 440px box, which on a 390px phone runs off both edges; the planner
 * and the errand form are used mostly on phones, so they get their own.
 */
export function Sheet({ title, onClose, children, footer, wide = false, testId }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 sm:items-center sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={title}
        data-testid={testId}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-[14px] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-modal ${wide ? 'sm:max-w-[640px]' : 'sm:max-w-[480px]'}`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-display text-[17px] font-bold text-forest">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 grid h-10 w-10 place-items-center rounded-btn text-ink-soft hover:bg-cream hover:text-forest"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-border bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-modal">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface Toast { id: number; text: string; tone: 'ok' | 'warn' | 'error' }

export function ToastView({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDone, toast.tone === 'error' ? 6000 : 3500);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  if (!toast) return null;
  const tone = toast.tone === 'ok' ? 'bg-forest text-paper' : toast.tone === 'warn' ? 'bg-amber-bg text-amber-text border border-amber/40' : 'bg-red text-paper';
  return (
    // Above the bottom edge on a phone: at the very bottom it sat over the drawer's action buttons,
    // and at the top it covered the page header and its buttons.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 sm:bottom-5">
      <div role="status" data-testid="trips-toast" className={`pointer-events-auto max-w-md rounded-btn px-4 py-2.5 text-[13.5px] font-semibold shadow-lg ${tone}`}>
        {toast.text}
      </div>
    </div>
  );
}
