import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { useCampStore } from '@/store/campStore';
import { dbPatchReceipts } from '@/lib/receiptsDb';
import { taxCents, formatCents } from '@/lib/receipts';
import { TAX_TYPES, type Receipt } from '@/lib/receiptTypes';
import {
  Callout, ConfirmDialog, StatusChip, cardWithHolder, fmtDay, fmtInstantDay, money, useEscape, useReceiptsRole, useSignedUrls,
} from './receiptsUi';
import { removeReceiptWithUndo } from './removeWithUndo';

/**
 * Two receipts side by side, to decide whether they are the same purchase.
 *
 * The usual cause is ordinary: the holder snapped it at the till and finance snapped the emailed
 * copy a week later, sometimes onto another card. Keeping one removes the other; a statement match
 * on the removed copy moves to the one kept. Removing asks first and can be undone for a few
 * seconds: "Delete this copy" used to delete on the first click.
 */
export function DuplicateCompare({ originalId, duplicateId, onClose }: { originalId: string; duplicateId: string; onClose: () => void }) {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const receipts = useReceiptsStore((s) => s.receipts);
  const lines = useReceiptsStore((s) => s.lines);
  const cards = useReceiptsStore((s) => s.cards);
  const codes = useReceiptsStore((s) => s.codes);
  const upsertLocal = useReceiptsStore((s) => s.upsertReceiptLocal);
  const { isFinance, userId } = useReceiptsRole();
  const pair = useMemo(() => [originalId, duplicateId].map((id) => receipts.find((r) => r.id === id)).filter(Boolean) as Receipt[], [receipts, originalId, duplicateId]);
  const signed = useSignedUrls(pair);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Receipt | null>(null);
  useEscape(onClose, !confirmRemove);

  if (pair.length < 2) {
    return null;
  }

  const matchOf = (r: Receipt) => lines.find((l) => l.receiptId === r.id) ?? null;
  const crossCard = (pair[0].cardId ?? null) !== (pair[1].cardId ?? null);

  function remove(r: Receipt) {
    const keep = pair.find((x) => x.id !== r.id)!;
    if (!campId) return;
    setConfirmRemove(null);
    removeReceiptWithUndo({
      receipt: r, keepId: keep.id, campId,
      label: `Removed the copy of ${r.vendor ?? 'the receipt'} (${money(r.total, r.currency)})${matchOf(r) ? '; its statement match moved to the one kept' : ''}.`,
    });
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

  // Which one to remove is only obvious when exactly one is matched to the bill.
  const bothMatched = pair.every((r) => matchOf(r));

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Compare receipts">
      <div className="flex h-full w-full flex-col overflow-hidden bg-paper-card sm:h-auto sm:max-h-[92vh] sm:max-w-[880px] sm:rounded-modal sm:shadow-2xl">
        <div className="flex flex-none items-center gap-3 border-b border-border px-4 py-3 sm:px-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <h2 className="flex-1 font-display text-[17px] font-bold text-forest">Same purchase twice?</h2>
          <button onClick={onClose} className="rounded-btn p-2 text-ink-soft hover:bg-cream" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <p className="mb-3 text-[13px] text-ink-soft">
            Same total, dated within a day, and a similar vendor{crossCard ? <>, <b className="text-amber-text">on two different cards</b></> : ''}.
            Keep one and remove the other, or say they are two real purchases.
          </p>
          {bothMatched && <Callout tone="amber" className="mb-3">Both are matched to statement charges. If they really are one purchase, undo one of the matches on Reconcile first.</Callout>}
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {pair.map((r, i) => {
              const matched = matchOf(r);
              const canRemove = !bothMatched && (isFinance || (r.submittedBy === userId && r.status !== 'exported' && !matched));
              const t = taxCents(r.taxes);
              return (
                <div key={r.id} className="flex min-w-0 flex-col rounded-card border border-border bg-white" data-compare={i === 0 ? 'original' : 'duplicate'}>
                  <div className={`flex items-center justify-center overflow-hidden rounded-t-card bg-[#3d3a35] ${r.filePath ? 'h-40 sm:h-64' : 'h-16'}`}>
                    {r.filePath && signed[r.filePath] && r.fileType !== 'application/pdf'
                      ? <img src={signed[r.filePath]} alt={`Receipt ${i + 1}`} className="h-full w-full object-contain" />
                      : <span className="text-[12px] text-cream/70">{r.fileType === 'application/pdf' ? 'PDF' : 'No photo'}</span>}
                  </div>
                  <dl className="flex-1 space-y-1 p-3 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2"><dt className="text-ink-soft">{i === 0 ? 'Saved first' : 'Saved later'}</dt><dd><StatusChip status={r.status} /></dd></div>
                    <p className="truncate font-bold text-ink">{r.vendor}</p>
                    <p className="text-ink-soft">{fmtDay(r.purchaseDate)}</p>
                    <p className={crossCard ? 'font-semibold text-amber-text' : 'text-ink-soft'}>{cardWithHolder(cards, r.cardId)}</p>
                    <p className="text-[16px] font-bold tabular-nums">{money(r.total, r.currency)}</p>
                    <p className="text-ink-soft">{TAX_TYPES.filter((k) => t[k]).map((k) => `${k} ${formatCents(t[k])}`).join(' · ') || 'No tax'}</p>
                    <p className="text-ink-soft">{codes.find((c) => c.id === r.budgetCodeId)?.name ?? 'Not coded'}</p>
                    <p className="text-ink-soft">{r.submitterName ? `Snapped by ${r.submitterName}` : 'Snapped'} · {fmtInstantDay(r.createdAt)}</p>
                    {matched && <p className="font-semibold text-green-muted-text">Matched to the {fmtDay(matched.postedDate)} charge</p>}
                  </dl>
                  {canRemove && (
                    <div className="border-t border-border p-2">
                      <button disabled={busy} onClick={() => setConfirmRemove(r)} className="w-full rounded-btn px-2 py-2 text-[13px] font-bold text-red hover:bg-red-bg disabled:opacity-50">
                        Remove this copy
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
          <Button variant="ghost" onClick={notDuplicate} disabled={busy}>Two real purchases</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
      {confirmRemove && (() => {
        const keep = pair.find((x) => x.id !== confirmRemove.id)!;
        const m = matchOf(confirmRemove);
        return (
          <ConfirmDialog title="Remove this copy?" confirmLabel="Remove copy" danger onCancel={() => setConfirmRemove(null)} onConfirm={() => remove(confirmRemove)}>
            <p>
              The copy of <b>{confirmRemove.vendor}</b>, {money(confirmRemove.total, confirmRemove.currency)}, snapped by {confirmRemove.submitterName ?? 'someone'}{confirmRemove.filePath ? ', and its photo are' : ' is'} removed.
              {keep.cardId !== confirmRemove.cardId && <> The one kept is on {cardWithHolder(cards, keep.cardId)}.</>}
            </p>
            {m && <p className="mt-1.5 font-semibold text-ink">Its match to the {fmtDay(m.postedDate)} charge moves to the copy you keep.</p>}
            <p className="mt-1.5">You can undo this for a few seconds.</p>
          </ConfirmDialog>
        );
      })()}
    </div>
  );
}
