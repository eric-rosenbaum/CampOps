/* eslint-disable react-refresh/only-export-components -- the Receipts UI kit: class strings and
   small hooks live beside the atoms that use them, so every view imports one module. */
import { useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { signReceiptUrls } from '@/lib/receiptsDb';
import { formatMoney } from '@/lib/receipts';
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

export function cardLabel(cards: ExpenseCard[], id: string | null): string {
  if (!id) return 'No card';
  return cards.find((c) => c.id === id)?.label ?? 'Unknown card';
}

/**
 * Signed URLs for the receipts on screen, fetched in one batch and cached in the store. The
 * bucket is private: a URL is only ever issued for a receipt this person can read.
 */
export function useSignedUrls(receipts: Pick<Receipt, 'filePath'>[]) {
  const signed = useReceiptsStore((s) => s.signedUrls);
  const addSignedUrls = useReceiptsStore((s) => s.addSignedUrls);
  const missing = useMemo(
    () => receipts.map((r) => r.filePath).filter((p): p is string => !!p && !signed[p]),
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

export function Callout({ tone = 'amber', children, className = '' }: { tone?: 'amber' | 'red' | 'green' | 'blue'; children: React.ReactNode; className?: string }) {
  const cls = {
    amber: 'bg-amber-bg text-amber-text border-amber/30',
    red: 'bg-red-bg text-red-text border-red/30',
    green: 'bg-green-muted-bg text-green-muted-text border-green-muted-text/20',
    blue: 'bg-blue-bg text-blue-text border-blue/20',
  }[tone];
  return <div className={`rounded-card border px-3.5 py-2.5 text-[13px] leading-snug ${cls} ${className}`}>{children}</div>;
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
