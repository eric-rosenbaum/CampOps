import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { useWriteFailures } from '@/lib/writeFailures';

/**
 * Tells the user, plainly, that something they did was not saved.
 *
 * The failure this exists for is the one where the app said "done", the row appeared, and a
 * later refresh made it vanish. The optimistic row cannot be rolled back from here. The
 * transport layer that detected the failure doesn't know which store it belonged to · so the
 * honest remedy is to reload and show only what the database actually holds. That is the point:
 * the app should never go on quietly displaying work that was never saved.
 *
 * It does not auto-dismiss. A toast that fades is exactly how this bug stayed invisible.
 */
export function UnsavedChangesBanner() {
  const failures = useWriteFailures((s) => s.failures);
  const clear = useWriteFailures((s) => s.clear);

  if (failures.length === 0) return null;

  const targets = Array.from(new Set(failures.map((f) => f.table))).slice(0, 3);

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-card
                 border border-red bg-red-bg p-4 shadow-lg"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-px h-4 w-4 flex-none text-red" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-red-text">
            {failures.length === 1 ? 'A change didn’t save' : `${failures.length} changes didn’t save`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-red-text/90">
            What’s on screen may not match what’s stored. Reload to see exactly what saved
            {targets.length > 0 && <>affected: {targets.join(', ')}</>}.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-btn bg-red px-3 py-1.5 text-[12px]
                         font-bold text-white transition-colors hover:bg-red-text"
            >
              <RotateCw className="h-3.5 w-3.5" /> Reload
            </button>
            <button
              onClick={clear}
              className="rounded-btn px-2 py-1.5 text-[12px] font-semibold text-red-text/80
                         transition-colors hover:text-red-text"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button onClick={clear} aria-label="Dismiss" className="text-red-text/60 hover:text-red-text">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
