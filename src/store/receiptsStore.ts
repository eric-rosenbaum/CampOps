/**
 * Receipts state.
 *
 * Holds what RLS let this person load, nothing more: a card holder's store has their own
 * receipts and no statements, an admin's has everything. Screens never filter by role for
 * privacy; they filter for convenience.
 *
 * Selector rule (React 19 + zustand v5): select raw slices only and derive with useMemo. A
 * selector that builds a new array each render white-screens the app.
 */
import { create } from 'zustand';
import type { ReceiptsData } from '@/lib/receiptsDb';
import type {
  BudgetCode, CardStatement, ExpenseCard, ExpenseExport, Receipt, StatementLine, TaxSettings,
} from '@/lib/receiptTypes';

export interface ReceiptsToast {
  id: number;
  text: string;
  tone?: 'default' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface ReceiptsState {
  receipts: Receipt[];
  cards: ExpenseCard[];
  codes: BudgetCode[];
  taxSettings: TaxSettings | null;
  statements: CardStatement[];
  lines: StatementLine[];
  exports: ExpenseExport[];
  timeZone: string;
  /**
   * Receipts removed on screen whose removal has not been committed yet: the Undo window. Reloads
   * during that window keep them hidden, or a realtime echo would put a "deleted" receipt back.
   */
  pendingRemovals: Record<string, true>;
  toast: ReceiptsToast | null;
  /** Signed thumbnail URLs by storage path. Cached across tabs; they last an hour. */
  signedUrls: Record<string, string>;

  apply: (d: ReceiptsData) => void;
  /** Optimistic: show a change now, before realtime brings the authoritative row back. */
  upsertReceiptLocal: (r: Receipt) => void;
  removeReceiptLocal: (id: string) => void;
  patchLinesLocal: (patch: Record<string, Partial<StatementLine>>) => void;
  addSignedUrls: (urls: Record<string, string>) => void;
  setPendingRemoval: (id: string, pending: boolean) => void;
  showToast: (t: Omit<ReceiptsToast, 'id'> | null) => void;
  reset: () => void;
}

const EMPTY = {
  receipts: [] as Receipt[], cards: [] as ExpenseCard[], codes: [] as BudgetCode[], taxSettings: null,
  statements: [] as CardStatement[], lines: [] as StatementLine[], exports: [] as ExpenseExport[],
  timeZone: 'America/Toronto', pendingRemovals: {} as Record<string, true>, toast: null as ReceiptsToast | null,
  signedUrls: {} as Record<string, string>,
};

let toastSeq = 0;

export const useReceiptsStore = create<ReceiptsState>((set) => ({
  ...EMPTY,
  apply: (d) => set((s) => {
    const hidden = s.pendingRemovals;
    return {
      receipts: d.receipts.filter((r) => !hidden[r.id]), cards: d.cards, codes: d.codes, taxSettings: d.taxSettings,
      statements: d.statements, lines: d.lines, exports: d.exports, timeZone: d.timeZone,
    };
  }),
  upsertReceiptLocal: (r) => set((s) => {
    const i = s.receipts.findIndex((x) => x.id === r.id);
    if (i < 0) return { receipts: [r, ...s.receipts] };
    const next = s.receipts.slice();
    next[i] = r;
    return { receipts: next };
  }),
  removeReceiptLocal: (id) => set((s) => ({
    receipts: s.receipts.filter((r) => r.id !== id),
    lines: s.lines.map((l) => (l.receiptId === id ? { ...l, receiptId: null, matchState: 'unmatched' } : l)),
  })),
  patchLinesLocal: (patch) => set((s) => ({
    lines: s.lines.map((l) => (patch[l.id] ? { ...l, ...patch[l.id] } : l)),
  })),
  addSignedUrls: (urls) => set((s) => ({ signedUrls: { ...s.signedUrls, ...urls } })),
  setPendingRemoval: (id, pending) => set((s) => {
    const next = { ...s.pendingRemovals };
    if (pending) next[id] = true; else delete next[id];
    return { pendingRemovals: next };
  }),
  showToast: (t) => set({ toast: t ? { ...t, id: ++toastSeq } : null }),
  reset: () => set({ ...EMPTY }),
}));
