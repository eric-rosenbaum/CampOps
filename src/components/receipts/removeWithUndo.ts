import { useReceiptsStore } from '@/store/receiptsStore';
import { dbDeleteReceipt, dbMergeDuplicate, refreshReceipts } from '@/lib/receiptsDb';
import type { Receipt } from '@/lib/receiptTypes';

/** How long "Undo" is offered before the removal is sent. */
export const UNDO_MS = 8000;

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> }>();

/**
 * Remove a receipt the way people expect to be able to take it back: it disappears at once, a
 * toast offers Undo, and only when that runs out is the removal sent. "Delete this copy" used to
 * delete on the first click, and the copy it deleted was sometimes the one matched to the bill.
 *
 * With `keepId`, this is a duplicate merge: the kept receipt takes over the removed copy's
 * statement match, so the reconciliation does not lose a charge's paper.
 */
export function removeReceiptWithUndo(opts: { receipt: Receipt; keepId: string | null; campId: string; label: string }) {
  const store = useReceiptsStore.getState();
  const { receipt, keepId, campId } = opts;
  const lineSnapshot = store.lines.filter((l) => l.receiptId === receipt.id).map((l) => ({ ...l }));

  store.setPendingRemoval(receipt.id, true);
  store.removeReceiptLocal(receipt.id);
  if (keepId && lineSnapshot.length) {
    store.patchLinesLocal(Object.fromEntries(lineSnapshot.map((l) => [l.id, { receiptId: keepId, matchState: l.matchState }])));
  }

  const restore = () => {
    const s = useReceiptsStore.getState();
    s.setPendingRemoval(receipt.id, false);
    s.upsertReceiptLocal(receipt);
    if (lineSnapshot.length) s.patchLinesLocal(Object.fromEntries(lineSnapshot.map((l) => [l.id, { receiptId: l.receiptId, matchState: l.matchState }])));
  };

  const commit = async () => {
    pending.delete(receipt.id);
    const res = keepId ? await dbMergeDuplicate(keepId, receipt.id) : await dbDeleteReceipt(receipt);
    const s = useReceiptsStore.getState();
    if (res.error) {
      restore();
      s.showToast({ text: `Not removed: ${res.error}`, tone: 'error' });
    } else {
      s.setPendingRemoval(receipt.id, false);
    }
    void refreshReceipts(campId, s.apply);
  };

  const timer = setTimeout(() => { void commit(); }, UNDO_MS);
  pending.set(receipt.id, { timer, commit });

  store.showToast({
    text: opts.label,
    actionLabel: 'Undo',
    onAction: () => {
      const p = pending.get(receipt.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(receipt.id);
      restore();
      useReceiptsStore.getState().showToast(null);
    },
  });
}

/**
 * Send every removal still waiting out its Undo window. Called when the Receipts page unmounts, so
 * leaving the page does not quietly cancel a removal the person saw happen. Closing the tab inside
 * the window does cancel it, which leaves the receipt in place: the safe way to fail.
 */
export function flushPendingRemovals() {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    void p.commit();
  }
}
