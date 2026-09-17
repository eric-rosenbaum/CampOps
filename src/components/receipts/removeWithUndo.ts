import { useReceiptsStore } from '@/store/receiptsStore';
import { dbMergeDuplicate, dbRemoveReceipt, dbRestoreRemoval, refreshReceipts } from '@/lib/receiptsDb';
import type { Receipt } from '@/lib/receiptTypes';

/** How long the toast offers Undo. The removal itself is already saved by then. */
export const UNDO_MS = 10000;

/**
 * Remove a receipt the way people expect: it disappears, the removal is SAVED at once, and a toast
 * offers Undo, which restores it on the server.
 *
 * It used to wait out the Undo window on the screen and only then send the removal, so closing the
 * tab or leaving Receipts inside those seconds quietly brought the duplicate back (an operations
 * lead removed one, went to the dashboard, and found it still there). Now nothing depends on the
 * page staying open: the server keeps the removed row in receipt_removals, and Undo asks for it back.
 *
 * With `keepId`, this is a duplicate merge: the kept receipt takes over the removed copy's
 * statement match (and its photo, with `takePhoto`), so the reconciliation does not lose a charge's paper.
 */
export async function removeReceiptWithUndo(opts: { receipt: Receipt; keepId: string | null; takePhoto?: boolean; campId: string; label: string }) {
  const store = useReceiptsStore.getState();
  const { receipt, keepId, campId } = opts;
  const lineSnapshot = store.lines.filter((l) => l.receiptId === receipt.id).map((l) => ({ ...l }));

  store.setPendingRemoval(receipt.id, true);
  store.removeReceiptLocal(receipt.id);
  if (keepId && lineSnapshot.length) {
    store.patchLinesLocal(Object.fromEntries(lineSnapshot.map((l) => [l.id, { receiptId: keepId, matchState: l.matchState }])));
  }

  const res = keepId ? await dbMergeDuplicate(keepId, receipt.id, !!opts.takePhoto) : await dbRemoveReceipt(receipt.id);
  const s = useReceiptsStore.getState();
  s.setPendingRemoval(receipt.id, false);
  if (res.error || !res.removalId) {
    s.upsertReceiptLocal(receipt);
    if (lineSnapshot.length) s.patchLinesLocal(Object.fromEntries(lineSnapshot.map((l) => [l.id, { receiptId: l.receiptId, matchState: l.matchState }])));
    s.showToast({ text: `Not removed: ${res.error ?? 'the removal was not recorded'}`, tone: 'error' });
    void refreshReceipts(campId, s.apply);
    return;
  }
  void refreshReceipts(campId, s.apply);

  const removalId = res.removalId;
  let undone = false;
  s.showToast({
    text: opts.label,
    actionLabel: 'Undo',
    durationMs: UNDO_MS,
    onAction: async () => {
      if (undone) return;
      undone = true;
      useReceiptsStore.getState().showToast({ text: 'Putting it back…' });
      const r = await dbRestoreRemoval(removalId);
      const after = useReceiptsStore.getState();
      if (r.error) {
        after.showToast({ text: `Could not put it back: ${r.error}`, tone: 'error' });
      } else {
        after.upsertReceiptLocal(receipt);
        after.showToast({ text: r.linesNotRestored ? 'Put back. Its charge had been matched to something else since, so match it again on Reconcile.' : 'Put back.' });
      }
      void refreshReceipts(campId, after.apply);
    },
  });
}
