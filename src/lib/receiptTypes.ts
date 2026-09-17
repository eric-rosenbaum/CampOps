/**
 * Types for the Receipts module. Kept out of lib/types.ts, which three parallel builds edit.
 *
 * Money is carried as a number of dollars with two decimals (what Postgres numeric(12,2) sends
 * back) and every sum or comparison goes through cents in lib/receipts.ts. Adding dollars as
 * floats is how a month that agrees to the cent ends up "off by $0.01".
 */

export const TAX_TYPES = ['GST', 'HST', 'PST', 'QST', 'other'] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export const TAX_LABELS: Record<TaxType, string> = {
  GST: 'GST', HST: 'HST', PST: 'PST', QST: 'QST', other: 'Other tax',
};

export interface TaxLine {
  type: TaxType;
  ratePct: number | null;
  amount: number;
}

export type ReceiptStatus = 'processing' | 'needs_review' | 'ready' | 'exported';
export type ReceiptCurrency = 'CAD' | 'USD';

export interface ReceiptSplit {
  budgetCodeId: string;
  amount: number;
}

/** Fields the AI reads and scores. */
export type AiField = 'vendor' | 'date' | 'subtotal' | 'taxes' | 'tip' | 'total' | 'currency';

/** What `read-receipt` returns. Never saved as final: it prefills a form a person confirms. */
export interface ReceiptAiResult {
  readable: boolean;
  error?: string;
  vendor: string | null;
  purchaseDate: string | null;
  subtotal: number | null;
  taxes: TaxLine[];
  tip: number | null;
  total: number | null;
  currency: ReceiptCurrency | null;
  cardLast4: string | null;
  confidence: Partial<Record<AiField, number>>;
  minConfidence: number | null;
  flags: { mathMismatch: boolean; dateOutOfRange: boolean; currencyUnsupported: boolean };
  model?: string;
}

export interface Receipt {
  id: string;
  campId: string;
  cardId: string | null;
  submittedBy: string | null;
  submitterName: string | null;
  filePath: string | null;
  fileName: string | null;
  fileType: string | null;
  vendor: string | null;
  purchaseDate: string | null;
  subtotal: number | null;
  taxes: TaxLine[];
  tip: number | null;
  total: number | null;
  currency: ReceiptCurrency;
  budgetCodeId: string | null;
  splits: ReceiptSplit[];
  purpose: string | null;
  status: ReceiptStatus;
  aiResult: ReceiptAiResult | null;
  aiMinConfidence: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  possibleDuplicateOf: string | null;
  duplicateDismissed: boolean;
  /** Finance set it aside from this month (YYYY-MM-01): "posts next month". */
  deferredMonth: string | null;
  deferredNote: string | null;
  exportId: string | null;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCard {
  id: string;
  campId: string;
  label: string;
  holderMemberId: string | null;
  holderName: string | null;
  holderEmail: string | null;
  last4: string | null;
  defaultBudgetCodeId: string | null;
  active: boolean;
}

export interface BudgetCode {
  id: string;
  campId: string;
  code: string;
  name: string;
  qbAccount: string | null;
  active: boolean;
  sortOrder: number;
}

export interface TaxRule {
  type: TaxType;
  /** The share recovered, for any tax without a federal/provincial split. */
  recoverablePct: number;
  /**
   * HST only: the federal part (5 points of it) and the provincial part are recovered at different
   * rates under the public service bodies' rebate, e.g. 50% and 82% for an Ontario charity.
   */
  federalPct?: number | null;
  provincialPct?: number | null;
}

/** How the camp gets sales tax back. `custom` is anything typed by hand. */
export type ClaimBasis = 'itc' | 'psb' | 'none' | 'custom';

export interface TaxSettings {
  campId: string;
  currency: ReceiptCurrency;
  province: string | null;
  taxRules: TaxRule[];
  claimBasis: ClaimBasis | null;
  confirmedAt: string | null;
}

export interface CardStatement {
  id: string;
  campId: string;
  cardId: string;
  /** First of the month, YYYY-MM-01. */
  periodMonth: string;
  statementTotal: number | null;
  fileName: string | null;
  exportId: string | null;
  exportedAt: string | null;
  createdAt: string;
}

export type MatchState = 'unmatched' | 'matched' | 'no_receipt_ok' | 'personal';

export interface StatementLine {
  id: string;
  statementId: string;
  campId: string;
  postedDate: string;
  description: string;
  /** Positive is a charge, negative a payment or refund, whatever sign the bank used. */
  amount: number;
  matchState: MatchState;
  receiptId: string | null;
  note: string | null;
  remindedAt: string | null;
}

/**
 * `qbo_bank_*` and `qbo_bills` are QuickBooks Online imports; `detailed` is the review spreadsheet.
 * `qbo_3col` / `qbo_4col` are the receipt-based exports from before exports followed the
 * statement; they only appear in the history now.
 */
export type ExportFormat = 'qbo_bank_3col' | 'qbo_bank_4col' | 'qbo_bills' | 'detailed' | 'qbo_3col' | 'qbo_4col';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface ExpenseExport {
  id: string;
  campId: string;
  periodFrom: string | null;
  periodTo: string | null;
  cardIds: string[];
  format: ExportFormat;
  fileName: string | null;
  includeExported: boolean;
  rowCount: number;
  total: number;
  createdByName: string | null;
  statementId: string | null;
  personalTotal: number | null;
  dateFormat: string | null;
  createdAt: string;
}
