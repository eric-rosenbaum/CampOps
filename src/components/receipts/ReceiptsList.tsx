import { useMemo, useState } from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useReceiptsStore } from '@/store/receiptsStore';
import { dbPatchReceipts } from '@/lib/receiptsDb';
import { findDuplicates, monthKey, monthLabel, taxCents, formatCents } from '@/lib/receipts';
import { TAX_TYPES, type Receipt } from '@/lib/receiptTypes';
import {
  Callout, CodeName, EmptyState, StatusChip, Thumb, cardLabel, fmtDay, money, selectClass, useReceiptsRole, useSignedUrls,
} from './receiptsUi';

type StatusFilter = 'all' | 'needs_review' | 'ready' | 'exported' | 'duplicates';

function taxSummary(r: Receipt): string {
  const t = taxCents(r.taxes);
  const parts = TAX_TYPES.filter((k) => t[k] !== 0).map((k) => `${k === 'other' ? 'Tax' : k} ${formatCents(t[k], r.currency)}`);
  return parts.join(' · ') || '—';
}

/**
 * Every receipt this person can see, filtered by card, month and status.
 *
 * A card holder sees only their own (row-level security, not this filter). Finance sees the
 * camp's and can code a batch at once, which is most of what the finance director did by hand in
 * Excel: pick the Amazon orders, set them all to Programs, move on.
 */
export function ReceiptsList({ onOpen, onCompare }: { onOpen: (id: string) => void; onCompare: (a: string, b: string) => void }) {
  const receipts = useReceiptsStore((s) => s.receipts);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const upsertLocal = useReceiptsStore((s) => s.upsertReceiptLocal);
  const { isFinance, userId } = useReceiptsRole();

  const [cardFilter, setCardFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCode, setBulkCode] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const months = useMemo(
    () => [...new Set(receipts.map((r) => (r.purchaseDate ? monthKey(r.purchaseDate) : null)).filter(Boolean) as string[])].sort().reverse(),
    [receipts],
  );
  const duplicates = useMemo(() => findDuplicates(receipts, cards), [receipts, cards]);
  const dupOf = useMemo(() => new Map(duplicates.map((d) => [d.duplicateId, d.originalId])), [duplicates]);
  const crossCard = useMemo(() => new Set(duplicates.filter((d) => d.crossCard).map((d) => d.duplicateId)), [duplicates]);

  const base = useMemo(() => receipts.filter((r) =>
    (cardFilter === 'all' || (cardFilter === 'none' ? !r.cardId : r.cardId === cardFilter))
    && (monthFilter === 'all' || (r.purchaseDate && monthKey(r.purchaseDate) === monthFilter))), [receipts, cardFilter, monthFilter]);

  const counts = useMemo(() => ({
    all: base.length,
    needs_review: base.filter((r) => r.status === 'needs_review' || r.status === 'processing').length,
    ready: base.filter((r) => r.status === 'ready').length,
    exported: base.filter((r) => r.status === 'exported').length,
    duplicates: base.filter((r) => dupOf.has(r.id)).length,
  }), [base, dupOf]);

  const visible = useMemo(() => {
    const rows = base.filter((r) => {
      if (status === 'all') return true;
      if (status === 'duplicates') return dupOf.has(r.id);
      if (status === 'needs_review') return r.status === 'needs_review' || r.status === 'processing';
      return r.status === status;
    });
    // Waiting-for-you first, then newest purchase first.
    return rows.sort((a, b) => Number(b.status === 'needs_review') - Number(a.status === 'needs_review')
      || (b.purchaseDate ?? '9999').localeCompare(a.purchaseDate ?? '9999')
      || b.createdAt.localeCompare(a.createdAt));
  }, [base, status, dupOf]);

  const signed = useSignedUrls(visible.slice(0, 80));
  const myWaiting = receipts.filter((r) => r.status === 'needs_review' && r.submittedBy === userId).length;
  const visibleTotalCents = visible.reduce((s, r) => s + (r.currency === 'CAD' ? Math.round((r.total ?? 0) * 100) : 0), 0);

  const selectable = (r: Receipt) => isFinance || (r.submittedBy === userId && r.status !== 'exported');
  const allSelected = visible.length > 0 && visible.filter(selectable).every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function applyBulkCode() {
    if (!bulkCode || !selected.size) return;
    setBusy(true); setBulkError(null);
    const ids = [...selected];
    const codeId = bulkCode === 'none' ? null : bulkCode;
    const res = await dbPatchReceipts(ids, { budget_code_id: codeId });
    setBusy(false);
    if (res.error) { setBulkError(res.error); return; }
    for (const r of receipts) if (selected.has(r.id)) upsertLocal({ ...r, budgetCodeId: codeId });
    setSelected(new Set()); setBulkCode('');
  }

  return (
    <div>
      {myWaiting > 0 && status !== 'needs_review' && (
        <Callout tone="amber" className="mb-3 flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="flex-1"><b>{myWaiting} receipt{myWaiting === 1 ? '' : 's'}</b> you snapped still need{myWaiting === 1 ? 's' : ''} a quick check before finance can use {myWaiting === 1 ? 'it' : 'them'}.</span>
          <button className="font-bold underline" onClick={() => setStatus('needs_review')}>Show</button>
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Card" className={selectClass} value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}>
          <option value="all">All cards</option>
          {cards.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value="none">No card</option>
        </select>
        <select aria-label="Month" className={selectClass} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className="ml-auto text-[12.5px] tabular-nums text-ink-soft">
          {visible.length} receipt{visible.length === 1 ? '' : 's'} · {formatCents(visibleTotalCents)}
        </span>
      </div>

      <div className="-mx-4 mt-2 flex overflow-x-auto overflow-y-hidden border-b border-border px-4 no-scrollbar sm:mx-0 sm:px-0">
        <FilterPill label="All" count={counts.all} active={status === 'all'} onClick={() => setStatus('all')} />
        <FilterPill label="Needs review" count={counts.needs_review} active={status === 'needs_review'} onClick={() => setStatus('needs_review')} />
        <FilterPill label="Ready" count={counts.ready} active={status === 'ready'} onClick={() => setStatus('ready')} />
        <FilterPill label="Exported" count={counts.exported} active={status === 'exported'} onClick={() => setStatus('exported')} />
        {(counts.duplicates > 0 || status === 'duplicates') && (
          <FilterPill label="Possible duplicates" count={counts.duplicates} active={status === 'duplicates'} onClick={() => setStatus('duplicates')} />
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-card border border-forest/30 bg-forest px-3 py-2 text-cream shadow-md">
          <span className="text-[13px] font-semibold">{selected.size} selected</span>
          <select aria-label="Budget code for selected" className="min-w-0 rounded-btn border-0 bg-white px-2 py-1.5 text-[13px] text-forest" value={bulkCode} onChange={(e) => setBulkCode(e.target.value)}>
            <option value="">Set budget code…</option>
            {codes.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            <option value="none">Clear the code</option>
          </select>
          <button className="rounded-btn bg-white/15 px-3 py-1.5 text-[13px] font-bold hover:bg-white/25 disabled:opacity-50" disabled={!bulkCode || busy} onClick={applyBulkCode}>
            {busy ? 'Applying…' : 'Apply'}
          </button>
          <button className="ml-auto text-[12.5px] underline" onClick={() => setSelected(new Set())}>Clear</button>
          {bulkError && <p className="w-full text-[12.5px] text-amber-bg">{bulkError}</p>}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={receipts.length === 0 ? 'No receipts yet' : 'Nothing matches these filters'}>
            {receipts.length === 0
              ? 'Tap “Snap receipt” right after you pay. The photo is read for you, and you check the numbers.'
              : 'Try another card, month or status.'}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-3 hidden overflow-x-auto rounded-card border border-border bg-white md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-paper-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" aria-label="Select all" checked={allSelected}
                           onChange={() => setSelected(allSelected ? new Set() : new Set(visible.filter(selectable).map((r) => r.id)))} />
                  </th>
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Vendor</th>
                  <th className="px-2 py-2">Card</th>
                  <th className="px-2 py-2">Budget code</th>
                  <th className="px-2 py-2">Taxes</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const code = codes.find((c) => c.id === r.budgetCodeId);
                  const dup = dupOf.get(r.id);
                  return (
                    <tr key={r.id} className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-cream/60" onClick={() => onOpen(r.id)} data-receipt={r.id}>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {selectable(r) && <input type="checkbox" aria-label={`Select ${r.vendor ?? 'receipt'}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}
                      </td>
                      <td className="px-2 py-1.5"><Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={36} /></td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-ink-soft">{fmtDay(r.purchaseDate)}</td>
                      <td className="px-2 py-2">
                        <span className="font-semibold text-ink">{r.vendor ?? <i className="font-normal text-ink-soft">Not read yet</i>}</span>
                        {dup && (
                          <button className="ml-2 inline-flex items-center gap-1 rounded-tag bg-amber-bg px-1.5 py-0.5 text-[11px] font-bold text-amber-text hover:underline"
                                  onClick={(e) => { e.stopPropagation(); onCompare(dup, r.id); }}>
                            <Copy className="h-3 w-3" /> Possible duplicate{crossCard.has(r.id) ? ' on another card' : ''}
                          </button>
                        )}
                        {r.purpose && <span className="block truncate text-[12px] text-ink-soft">{r.purpose}</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-soft">{cardLabel(cards, r.cardId)}</td>
                      <td className="px-2 py-2">{code ? <span title={code.qbAccount ?? ''}><CodeName code={code} /></span> : <span className="text-ink-faint">—</span>}{r.splits.length > 0 && <span className="ml-1 text-[11px] text-ink-soft">+ split</span>}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-[12px] tabular-nums text-ink-soft">{taxSummary(r)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums">{money(r.total, r.currency)}{r.currency === 'USD' && <span className="ml-1 text-[10px] font-semibold text-ink-soft">USD</span>}</td>
                      <td className="px-3 py-2"><StatusChip status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="mt-3 space-y-2 md:hidden">
            {visible.map((r) => {
              const dup = dupOf.get(r.id);
              const code = codes.find((c) => c.id === r.budgetCodeId);
              return (
                <li key={r.id} data-receipt={r.id} className="flex items-center gap-3 rounded-card border border-border bg-white p-2.5 active:bg-cream" onClick={() => onOpen(r.id)}>
                  {selected.size > 0 && selectable(r) && (
                    <input type="checkbox" className="h-5 w-5" aria-label={`Select ${r.vendor ?? 'receipt'}`} checked={selected.has(r.id)}
                           onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} />
                  )}
                  <Thumb receipt={r} url={r.filePath ? signed[r.filePath] : undefined} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-ink">{r.vendor ?? 'Not read yet'}</p>
                    <p className="truncate text-[12px] text-ink-soft">{fmtDay(r.purchaseDate)} · {cardLabel(cards, r.cardId)}{code ? ` · ${code.name}` : ''}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusChip status={r.status} />
                      {dup && (
                        <button className="inline-flex items-center gap-1 rounded-tag bg-amber-bg px-1.5 py-0.5 text-[11px] font-bold text-amber-text"
                                onClick={(e) => { e.stopPropagation(); onCompare(dup, r.id); }}>
                          <Copy className="h-3 w-3" /> {crossCard.has(r.id) ? 'Duplicate on another card?' : 'Duplicate?'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="flex-none text-right text-[15px] font-bold tabular-nums">{money(r.total, r.currency)}</p>
                </li>
              );
            })}
          </ul>
          {isFinance && selected.size === 0 && visible.length > 1 && (
            <div className="mt-3 md:hidden">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set([visible.find(selectable)!.id]))}>Select several…</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
