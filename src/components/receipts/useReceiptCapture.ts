import { useCallback, useRef, useState } from 'react';
import { useCampStore } from '@/store/campStore';
import { useReceiptsStore } from '@/store/receiptsStore';
import {
  dbDeleteReceipt, dbInsertReceipt, dbResolveLines, dbUpdateReceipt, readReceiptWithAi, refreshReceipts, uploadReceiptFile,
} from '@/lib/receiptsDb';
import { prepareReceiptFile, ReceiptFileError } from '@/lib/receiptImage';
import { findDuplicates } from '@/lib/receipts';
import type { ExpenseCard, Receipt, ReceiptAiResult } from '@/lib/receiptTypes';
import { useReceiptsRole } from './receiptsUi';

export type CaptureStage = 'preparing' | 'uploading' | 'reading' | 'done' | 'failed';

export interface CaptureItem {
  key: string;
  fileName: string;
  /** A local object URL, so the photo is on screen before a byte has been uploaded. */
  previewUrl: string | null;
  isPdf: boolean;
  receiptId: string | null;
  stage: CaptureStage;
  /** Why the AI could not help. The receipt still exists and is typed in by hand. */
  aiError: string | null;
  /** Why there is no receipt at all (the upload failed). */
  error: string | null;
  startedAt: number;
  /** Uploaded from a statement charge: the receipt goes on that card and is matched to that charge. */
  forLineId: string | null;
}

export interface CaptureOptions {
  cardId?: string;
  lineId?: string;
}

/** Prefill a receipt from what the AI read. Values only: the status stays needs_review. */
export function applyAiResult(r: Receipt, ai: ReceiptAiResult, cards: ExpenseCard[], keepCard = false): Receipt {
  // A card number printed on the slip is better evidence than "the snapper's own card": finance
  // snapping a holder's receipt, or a holder who borrowed a colleague's card.
  // Not when finance uploaded it from a particular charge: then the charge says which card, and
  // the review form flags a different number printed on the slip instead of silently moving it.
  const printed = ai.cardLast4 && !keepCard ? cards.find((c) => c.active && c.last4 === ai.cardLast4) : null;
  return {
    ...r,
    vendor: ai.vendor,
    purchaseDate: ai.purchaseDate,
    subtotal: ai.subtotal,
    taxes: ai.taxes ?? [],
    tip: ai.tip,
    total: ai.total,
    currency: ai.currency ?? r.currency,
    cardId: printed?.id ?? r.cardId,
    budgetCodeId: printed && printed.id !== r.cardId ? (printed.defaultBudgetCodeId ?? r.budgetCodeId) : r.budgetCodeId,
    aiResult: ai,
    aiMinConfidence: ai.minConfidence,
    status: 'needs_review',
  };
}

/**
 * Photo → stored file → AI draft → a receipt waiting for its person to confirm it.
 *
 * The row is created FIRST, as `processing`, and the file uploaded under its id. The storage
 * policy only lets a file in for a receipt that exists and is yours, so the order is the
 * security model, not just bookkeeping. A failed upload deletes the row again so nobody is left
 * with a receipt that has no paper behind it.
 */
export function useReceiptCapture() {
  const campId = useCampStore((s) => s.currentCamp?.id ?? null);
  const { userId, userName, myCards } = useReceiptsRole();
  const [items, setItems] = useState<CaptureItem[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((key: string, p: Partial<CaptureItem>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }, []);

  const processOne = useCallback(async (key: string, original: File, opts: CaptureOptions = {}) => {
    if (!campId) return;
    const store = useReceiptsStore.getState();
    let prepared;
    try {
      prepared = await prepareReceiptFile(original);
    } catch (e) {
      patch(key, { stage: 'failed', error: e instanceof ReceiptFileError ? e.message : 'That file could not be prepared.' });
      return;
    }

    const id = crypto.randomUUID();
    const path = `${campId}/${id}.${prepared.ext}`;
    const store0 = useReceiptsStore.getState();
    const myCard = (opts.cardId ? store0.cards.find((c) => c.id === opts.cardId) : null) ?? myCards[0] ?? null;
    const now = new Date().toISOString();
    const receipt: Receipt = {
      id, campId, cardId: myCard?.id ?? null, submittedBy: userId, submitterName: userName || null,
      filePath: path, fileName: original.name, fileType: prepared.type,
      vendor: null, purchaseDate: null, subtotal: null, taxes: [], tip: null, total: null, currency: 'CAD',
      budgetCodeId: myCard?.defaultBudgetCodeId ?? null, splits: [], purpose: null, status: 'processing',
      aiResult: null, aiMinConfidence: null, reviewedBy: null, reviewedAt: null,
      possibleDuplicateOf: null, duplicateDismissed: false, deferredMonth: null, deferredNote: null, exportId: null, exportedAt: null,
      createdAt: now, updatedAt: now,
    };
    patch(key, { stage: 'uploading', receiptId: id });
    const ins = await dbInsertReceipt(receipt);
    if (ins.error) { patch(key, { stage: 'failed', error: ins.error }); return; }
    store.upsertReceiptLocal(receipt);

    try {
      await uploadReceiptFile(path, prepared.file);
    } catch (e) {
      await dbDeleteReceipt({ id, filePath: null });
      store.removeReceiptLocal(id);
      patch(key, { stage: 'failed', error: e instanceof Error ? e.message : 'The upload failed. Try again.' });
      return;
    }

    patch(key, { stage: 'reading' });
    const { result, error } = await readReceiptWithAi(campId, path);
    const current = useReceiptsStore.getState().receipts.find((r) => r.id === id) ?? receipt;
    let next: Receipt = result?.readable
      ? applyAiResult(current, result, useReceiptsStore.getState().cards, !!opts.cardId)
      : { ...current, status: 'needs_review', aiResult: result ?? { readable: false, error: error ?? undefined } as ReceiptAiResult };
    if (next.purchaseDate && next.total != null) {
      const dup = findDuplicates(useReceiptsStore.getState().receipts.filter((r) => r.id !== id).concat(next))
        .find((p) => p.duplicateId === id);
      if (dup) next = { ...next, possibleDuplicateOf: dup.originalId };
    }
    useReceiptsStore.getState().upsertReceiptLocal(next);
    const upd = await dbUpdateReceipt(next);
    let matchError: string | null = null;
    if (opts.lineId && !upd.error) {
      const res = await dbResolveLines([{ lineId: opts.lineId, matchState: 'matched', receiptId: id }]);
      matchError = res.error;
      void refreshReceipts(campId, useReceiptsStore.getState().apply);
    }
    patch(key, { stage: 'done', aiError: result?.readable ? null : (error ?? 'This could not be read.'), error: upd.error ?? matchError });
  }, [campId, myCards, patch, userId, userName]);

  /** Files are read one after another: twenty at once would hit the quota and the rate limit together. */
  const addFiles = useCallback((files: File[], opts: CaptureOptions = {}) => {
    const fresh: CaptureItem[] = files.map((f) => ({
      key: crypto.randomUUID(), fileName: f.name,
      previewUrl: f.type.startsWith('image/') && !/hei[cf]/i.test(f.type) ? URL.createObjectURL(f) : null,
      isPdf: f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
      receiptId: null, stage: 'preparing', aiError: null, error: null, startedAt: Date.now(), forLineId: opts.lineId ?? null,
    }));
    setItems((xs) => [...xs, ...fresh]);
    fresh.forEach((item, i) => {
      queue.current = queue.current.then(() => processOne(item.key, files[i], opts));
    });
    return fresh.map((f) => f.key);
  }, [processOne]);

  const dismiss = useCallback((key: string) => {
    setItems((xs) => {
      const gone = xs.find((x) => x.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return xs.filter((x) => x.key !== key);
    });
  }, []);

  return { items, addFiles, dismiss };
}
