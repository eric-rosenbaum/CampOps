import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { dbDeleteReceipt, dbPatchReceipts } from '@/lib/receiptsDb';
import { taxCents, formatCents } from '@/lib/receipts';
import { TAX_TYPES } from '@/lib/receiptTypes';
import { Callout, StatusChip, cardLabel, fmtDay, money, useReceiptsRole, useSignedUrls } from './receiptsUi';

/**
 * Two receipts side by side, to decide whether they are the same purchase.
 *
 * The usual cause is ordinary: the holder snapped it at the till and finance snapped the emailed
 * copy a week later. The one that is matched to a statement charge is the one to keep, so the
 * screen says which one that is rather than leaving it to be worked out.
 */
export function DuplicateCompare({ originalId, duplicateId, onClose }: { originalId: string; duplicateId: string; onClose: () => void }) {
  const receipts = useReceiptsStore((s) => s.receipts);
  const lines = useReceiptsStore((s) => s.lines);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const removeLocal = useReceiptsStore((s) => s.removeReceiptLocal);
  const upsertLocal = useReceiptsStore((s) => s.upsertReceiptLocal);
  const { isFinance, userId } = useReceiptsRole();
  const pair = useMemo(() => [originalId, duplicateId].map((id) => receipts.find((r) => r.id === id)).filter(Boolean) as typeof receipts, [receipts, originalId, duplicateId]);
  const signed = useSignedUrls(pair);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pair.length < 2) {
    return null;
  }

  async function remove(id: string) {
    const r = pair.find((x) => x.id === id)!;
    setBusy(true); setError(null);
    const res = await dbDeleteReceipt(r);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    removeLocal(id);
    onClose();
  }

  async function notDuplicate() {
    const newer = pair[1];
    setBusy(true); setError(null);
    const res = await dbPatchReceipts([newer.id], { duplicate_dismissed: true, possible_duplicate_of: null });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    upsertLocal({ ...newer, duplicateDismissed: true, possibleDuplicateOf: null });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Compare receipts">
      <div className="flex h-full w-full flex-col overflow-hidden bg-paper-card sm:h-auto sm:max-h-[92vh] sm:max-w-[880px] sm:rounded-modal sm:shadow-2xl">
        <div className="flex flex-none items-center gap-3 border-b border-border px-4 py-3 sm:px-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <h2 className="flex-1 font-display text-[17px] font-bold text-forest">Same purchase twice?</h2>
          <button onClick={onClose} className="rounded-btn p-2 text-ink-soft hover:bg-cream" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <p className="mb-3 text-[13px] text-ink-soft">Same card, same total, dated within a day, and a similar vendor. Keep one and delete the other, or mark them as two real purchases.</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {pair.map((r, i) => {
              const matched = lines.find((l) => l.receiptId === r.id);
              const canDelete = isFinance || (r.submittedBy === userId && r.status !== 'exported');
              const t = taxCents(r.taxes);
              return (
                <div key={r.id} className="min-w-0 rounded-card border border-border bg-white" data-compare={i === 0 ? 'original' : 'duplicate'}>
                  <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-card bg-[#3d3a35] sm:h-64">
                    {r.filePath && signed[r.filePath] && r.fileType !== 'application/pdf'
                      ? <img src={signed[r.filePath]} alt={`Receipt ${i + 1}`} className="h-full w-full object-contain" />
                      : <span className="text-[12px] text-cream/70">{r.fileType === 'application/pdf' ? 'PDF' : 'No photo'}</span>}
                  </div>
                  <dl className="space-y-1 p-3 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2"><dt className="text-ink-soft">{i === 0 ? 'Saved first' : 'Saved later'}</dt><dd><StatusChip status={r.status} /></dd></div>
                    <p className="truncate font-bold text-ink">{r.vendor}</p>
                    <p className="text-ink-soft">{fmtDay(r.purchaseDate)} · {cardLabel(cards, r.cardId)}</p>
                    <p className="text-[16px] font-bold tabular-nums">{money(r.total, r.currency)}</p>
                    <p className="text-ink-soft">{TAX_TYPES.filter((k) => t[k]).map((k) => `${k} ${formatCents(t[k])}`).join(' · ') || 'No tax'}</p>
                    <p className="text-ink-soft">{codes.find((c) => c.id === r.budgetCodeId)?.name ?? 'Not coded'}{r.submitterName ? ` · ${r.submitterName}` : ''}</p>
                    {matched && <p className="font-semibold text-green-muted-text">Matched to a statement charge — keep this one</p>}
                  </dl>
                  {canDelete && (
                    <div className="border-t border-border p-2">
                      <button disabled={busy} onClick={() => remove(r.id)} className="w-full rounded-btn px-2 py-2 text-[13px] font-bold text-red hover:bg-red-bg disabled:opacity-50">
                        Delete this copy
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {error && <Callout tone="red" className="mt-3">{error}</Callout>}
        </div>
        <div className="flex flex-none justify-end gap-2 border-t border-border bg-paper-raised px-4 py-3 sm:px-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button variant="ghost" onClick={notDuplicate} disabled={busy}>Not a duplicate</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
