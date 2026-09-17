import { useEffect, useRef } from 'react';

/**
 * An in-page "are you sure", for the few food-request actions that are easy to tap by mistake
 * (cancelling, handing over before the pickup day). The browser's native confirm() was used before;
 * on a phone it reads as a system alert from nowhere and cannot say which request it is about.
 *
 * Escape is taken in the capture phase so it closes this dialog and not the modal underneath.
 */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Keep it', tone = 'primary', busy = false, onConfirm, onCancel }: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCancel();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="food-confirm-title" data-testid="confirm-dialog"
        className="w-full max-w-[420px] rounded-modal bg-white px-5 py-4 shadow-xl">
        <h2 id="food-confirm-title" className="text-[16px] font-semibold text-forest">{title}</h2>
        <div className="mt-1.5 text-[14px] leading-snug text-ink-soft">{body}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-btn border border-border bg-white px-4 py-2.5 text-[14px] font-bold text-forest hover:border-sage">
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy}
            className={`rounded-btn px-4 py-2.5 text-[14px] font-bold text-paper disabled:opacity-60 ${tone === 'danger' ? 'bg-red hover:bg-red-text' : 'bg-forest hover:bg-forest-mid'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
