/* eslint-disable react-refresh/only-export-components -- the Receipts UI kit: class strings and
   small hooks live beside the atoms that use them, so every view imports one module. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, LockOpen, X } from 'lucide-react';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { signReceiptUrls } from '@/lib/receiptsDb';
import { formatMoney } from '@/lib/receipts';
import { toDateStr } from '@/lib/utils';
import type { ExpenseCard, Receipt, ReceiptStatus } from '@/lib/receiptTypes';

/**
 * Field styling without a width. A `w-full` inside a shared class string beats an appended
 * `w-28` by stylesheet order, so the width is always the caller's (CLAUDE.md trap 10).
 */
export const fieldClass =
  'text-[14px] sm:text-body bg-white border border-border rounded-btn px-3 py-2 text-ink focus:outline-none focus:border-sage disabled:bg-cream disabled:text-ink-soft';
export const inputClass = `w-full ${fieldClass}`;
export const labelClass = 'block text-[11px] font-semibold uppercase tracking-widest text-ink-soft mb-1';
export const selectClass =
  'rounded-btn border border-border bg-white px-2.5 py-1.5 text-[13px] font-semibold text-forest focus:border-sage focus:outline-none cursor-pointer';

export function money(n: number | null | undefined, currency = 'CAD'): string {
  return formatMoney(n, currency);
}

export function fmtDay(d: string | null): string {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The local calendar day of an instant (created_at, exported_at). Slicing the ISO string gave the
 * UTC day, so anything done after 8pm in Ontario was stamped tomorrow (CLAUDE.md trap 3).
 */
export function fmtInstantDay(iso: string | null): string {
  return iso ? fmtDay(toDateStr(new Date(iso))) : '—';
}

export const STATUS_LABEL: Record<ReceiptStatus, string> = {
  processing: 'Reading…',
  needs_review: 'Needs review',
  ready: 'Ready',
  exported: 'Exported',
};

export function StatusChip({ status }: { status: ReceiptStatus }) {
  const cls = {
    processing: 'bg-cream-dark text-ink-soft',
    needs_review: 'bg-amber-bg text-amber-text',
    ready: 'bg-green-muted-bg text-green-muted-text',
    exported: 'bg-blue-bg text-blue-text',
  }[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-tag px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** What this person is, for Receipts: finance (admin) or a card holder / submitter (staff). */
export function useReceiptsRole() {
  const { role, currentUser } = useAuth();
  const currentMember = useCampStore((s) => s.currentMember);
  const cards = useReceiptsStore((s) => s.cards);
  const myCards = useMemo(
    () => cards.filter((c) => c.active && c.holderMemberId && c.holderMemberId === currentMember?.id),
    [cards, currentMember?.id],
  );
  return { isFinance: role === 'admin', role, userId: currentUser.id, userName: currentUser.name, memberId: currentMember?.id ?? null, myCards };
}

/**
 * Escape closes the dialog that registered last. Every Receipts dialog uses this; before, only the
 * review form listened, so Escape on "Attach a receipt" or the note dialog did nothing.
 */
const escapeStack: { current: () => void }[] = [];
export function useEscape(onEscape: () => void, active = true) {
  const ref = useRef(onEscape);
  useEffect(() => { ref.current = onEscape; });
  useEffect(() => {
    if (!active) return;
    const entry = { get current() { return ref.current; } };
    escapeStack.push(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escapeStack[escapeStack.length - 1] !== entry) return;
      e.preventDefault();
      entry.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = escapeStack.indexOf(entry);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [active]);
}

/** A small confirm box, for the actions that remove or replace something. */
export function ConfirmDialog({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string; children?: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  useEscape(onCancel);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full rounded-t-modal bg-paper-card p-4 sm:max-w-md sm:rounded-modal sm:p-5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <h3 className="font-display text-[16px] font-bold text-forest">{title}</h3>
        {children && <div className="mt-2 text-[13px] leading-snug text-ink-soft">{children}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-btn px-3 py-2 text-[13px] font-semibold text-ink-soft hover:bg-cream">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} autoFocus
                  className={`rounded-btn px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50 ${danger ? 'bg-red hover:bg-red/90' : 'bg-forest hover:bg-forest/90'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The one toast Receipts shows: "Removed … Undo", and failures of things done in the background. */
export function ReceiptsToastHost() {
  const toast = useReceiptsStore((s) => s.toast);
  const showToast = useReceiptsStore((s) => s.showToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useReceiptsStore.getState().toast?.id === toast.id && showToast(null), toast.durationMs ?? (toast.actionLabel ? 8000 : 6000));
    return () => clearTimeout(t);
  }, [toast, showToast]);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex justify-center px-4 sm:bottom-6" role="status" aria-live="polite">
      <div className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-card px-4 py-2.5 text-[13.5px] shadow-xl ${toast.tone === 'error' ? 'bg-red-text text-white' : 'bg-forest text-cream'}`} data-testid="receipts-toast">
        <span className="min-w-0 flex-1">{toast.text}</span>
        {toast.actionLabel && (
          <button className="rounded-btn bg-white/15 px-2.5 py-1 text-[13px] font-bold hover:bg-white/25" onClick={() => toast.onAction?.()}>{toast.actionLabel}</button>
        )}
        <button aria-label="Dismiss" className="rounded-btn p-1 opacity-80 hover:opacity-100" onClick={() => showToast(null)}><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function cardLabel(cards: ExpenseCard[], id: string | null): string {
  if (!id) return 'No card';
  return cards.find((c) => c.id === id)?.label ?? 'Unknown card';
}

/** "Visa ··4821 · Maya Torres" */
export function cardWithHolder(cards: ExpenseCard[], id: string | null): string {
  const c = cards.find((x) => x.id === id);
  if (!c) return cardLabel(cards, id);
  return c.holderName ? `${c.label} · ${c.holderName}` : c.label;
}

/**
 * Signed URLs for the receipts on screen, fetched in one batch and cached in the store. The
 * bucket is private: a URL is only ever issued for a receipt this person can read.
 */
export function useSignedUrls(receipts: Pick<Receipt, 'filePath' | 'status'>[]) {
  const signed = useReceiptsStore((s) => s.signedUrls);
  const addSignedUrls = useReceiptsStore((s) => s.addSignedUrls);
  const missing = useMemo(
    // A receipt still `processing` may not have its file yet. Signing it then failed, and the
    // missing-path key never changed again, so a fresh snap showed no thumbnail until a reload.
    () => receipts.filter((r) => r.status !== 'processing').map((r) => r.filePath).filter((p): p is string => !!p && !signed[p]),
    [receipts, signed],
  );
  const key = missing.join('|');
  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    signReceiptUrls(missing).then((urls) => { if (!cancelled && Object.keys(urls).length) addSignedUrls(urls); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return signed;
}

export function Thumb({ receipt, url, size = 44, onClick }: {
  receipt: Pick<Receipt, 'fileType' | 'vendor' | 'filePath'>; url?: string; size?: number; onClick?: () => void;
}) {
  const isPdf = receipt.fileType === 'application/pdf' || receipt.filePath?.endsWith('.pdf');
  const style = { width: size, height: size };
  const inner = isPdf || !url ? (
    <span className="grid h-full w-full place-items-center bg-cream-dark text-ink-soft">
      <FileText className="h-4 w-4" />
    </span>
  ) : (
    <img src={url} alt={`Receipt from ${receipt.vendor ?? 'unknown vendor'}`} className="h-full w-full object-cover" loading="lazy" />
  );
  return onClick ? (
    <button type="button" onClick={onClick} style={style} className="flex-none overflow-hidden rounded-[4px] border border-border bg-white">
      {inner}
    </button>
  ) : (
    <span style={style} className="block flex-none overflow-hidden rounded-[4px] border border-border bg-white">{inner}</span>
  );
}

export function Callout({ tone = 'amber', children, className = '', 'data-testid': testId }: { tone?: 'amber' | 'red' | 'green' | 'blue'; children: React.ReactNode; className?: string; 'data-testid'?: string }) {
  const cls = {
    amber: 'bg-amber-bg text-amber-text border-amber/30',
    red: 'bg-red-bg text-red-text border-red/30',
    green: 'bg-green-muted-bg text-green-muted-text border-green-muted-text/20',
    blue: 'bg-blue-bg text-blue-text border-blue/20',
  }[tone];
  return <div data-testid={testId} className={`rounded-card border px-3.5 py-2.5 text-[13px] leading-snug ${cls} ${className}`}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-paper-raised px-5 py-8 text-center">
      <p className="font-display text-[16px] font-bold text-forest">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-soft">{children}</div>}
    </div>
  );
}

export function SectionTitle({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-2.5 pt-6 first:pt-1">
      <h2 className="font-display text-[15px] font-bold text-forest">{title}</h2>
      {count !== undefined && <span className="text-[12px] tabular-nums text-ink-soft">{count}</span>}
      <span className="hidden h-px flex-1 bg-[repeating-linear-gradient(90deg,#DED3BB_0_5px,transparent_5px_10px)] sm:block" aria-hidden="true" />
      {children && <div className="ml-auto flex flex-wrap items-center gap-2 sm:ml-0">{children}</div>}
    </div>
  );
}

/** A figure in a header band. */
export function Figure({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'green' | 'amber' | 'red' }) {
  const color = { default: 'text-forest', green: 'text-green-muted-text', amber: 'text-amber-text', red: 'text-red' }[tone];
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <p className={`font-display text-[20px] sm:text-[26px] font-bold leading-tight tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11.5px] text-ink-soft">{hint}</p>}
    </div>
  );
}

/**
 * Save a text file to the person's computer.
 *
 * The byte-order mark is for Excel, which only reads UTF-8 when one is present. QuickBooks files
 * go without it: their descriptions are plain ASCII anyway, and a BOM glued to the "Date" header
 * is one more thing for an importer's column matcher to trip on.
 */
export function downloadText(filename: string, text: string, withBom: boolean) {
  const blob = new Blob([(withBom ? '\uFEFF' : '') + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * "Unlock to correct": finance says why, and the reason is kept with the receipt or statement,
 * beside who unlocked it and when. The month then shows as needing to be exported again.
 */
export function UnlockDialog({ what, onUnlock, onCancel }: {
  what: 'receipt' | 'statement'; onUnlock: (reason: string) => Promise<string | null>; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onCancel);
  async function go() {
    if (!reason.trim()) { setError('Say what needs correcting.'); return; }
    setBusy(true); setError(null);
    const err = await onUnlock(reason.trim());
    setBusy(false);
    if (err) setError(err);
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Unlock this ${what} to correct it`}>
      <div className="w-full rounded-t-modal bg-paper-card p-4 sm:max-w-md sm:rounded-modal sm:p-5" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <h3 className="flex items-center gap-2 font-display text-[16px] font-bold text-forest"><LockOpen className="h-4 w-4" /> Unlock this {what} to correct it?</h3>
        <p className="mt-2 text-[13px] leading-snug text-ink-soft">
          It is already in QuickBooks. Unlocking lets you change it here; the month is then marked as needing to be exported again, and
          whatever you correct has to be corrected in QuickBooks too. Your name, the time and the reason are kept.
        </p>
        <label className={`${labelClass} mt-3`} htmlFor="unlock-reason">What needs correcting</label>
        <input id="unlock-reason" autoFocus className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder={what === 'receipt' ? 'e.g. Coded to Waterfront, should be Maintenance' : 'e.g. Fuel charge booked to the wrong code'}
               onKeyDown={(e) => { if (e.key === 'Enter') void go(); }} />
        {error && <p className="mt-2 text-[12.5px] font-semibold text-red">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-btn px-3 py-2 text-[13px] font-semibold text-ink-soft hover:bg-cream">Cancel</button>
          <button type="button" onClick={() => void go()} disabled={busy}
                  className="rounded-btn bg-forest px-3.5 py-2 text-[13px] font-bold text-white hover:bg-forest/90 disabled:opacity-50">
            {busy ? 'Unlocking…' : 'Unlock to correct'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Maintenance" with the code beside it, quieter: names first, since KIT and PRG mean nothing to a reviewer. */
export function CodeName({ code }: { code: { code: string; name: string } | null | undefined }) {
  if (!code) return <span className="text-ink-faint">Not coded</span>;
  return <span>{code.name} <span className="text-[11px] text-ink-faint">{code.code}</span></span>;
}
