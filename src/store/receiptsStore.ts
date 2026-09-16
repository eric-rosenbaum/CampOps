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

interface ReceiptsState {
  receipts: Receipt[];
  cards: ExpenseCard[];
  codes: BudgetCode[];
  taxSettings: TaxSettings | null;
  statements: CardStatement[];
  lines: StatementLine[];
  exports: ExpenseExport[];
  /** Signed thumbnail URLs by storage path. Cached across tabs; they last an hour. */
  signedUrls: Record<string, string>;

  apply: (d: ReceiptsData) => void;
  /** Optimistic: show a change now, before realtime brings the authoritative row back. */
  upsertReceiptLocal: (r: Receipt) => void;
  removeReceiptLocal: (id: string) => void;
  patchLinesLocal: (patch: Record<string, Partial<StatementLine>>) => void;
  addSignedUrls: (urls: Record<string, string>) => void;
  reset: () => void;
}

const EMPTY = {
  receipts: [] as Receipt[], cards: [] as ExpenseCard[], codes: [] as BudgetCode[], taxSettings: null,
  statements: [] as CardStatement[], lines: [] as StatementLine[], exports: [] as ExpenseExport[],
  signedUrls: {} as Record<string, string>,
};

export const useReceiptsStore = create<ReceiptsState>((set) => ({
  ...EMPTY,
  apply: (d) => set({
    receipts: d.receipts, cards: d.cards, codes: d.codes, taxSettings: d.taxSettings,
    statements: d.statements, lines: d.lines, exports: d.exports,
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
  reset: () => set({ ...EMPTY }),
}));
