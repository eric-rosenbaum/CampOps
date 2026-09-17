/**
 * The Receipts module's arithmetic, kept pure so every rule can be tested without a database.
 *
 *   - reading a bank's statement CSV, whatever shape that bank exports
 *   - suggesting which receipt paid for which charge
 *   - spotting a receipt snapped twice
 *   - adding a month up to the cent, by budget code and by tax type
 *   - deciding whether a card-month agrees with the bill, and what still stands in the way
 *   - writing the files QuickBooks Online Canada imports, one card-month at a time
 *   - estimating the sales tax a camp gets back, HST split into its federal and provincial parts
 *
 * Every sum is in integer cents. The first version of any money screen adds floats, and a month
 * of forty charges then "disagrees" with the Visa bill by a cent that exists nowhere but in
 * binary. Dollars come in, cents are added, dollars go out.
 */
import { parseCsv } from './csv';
import {
  TAX_TYPES,
  type BudgetCode, type CardStatement, type ClaimBasis, type DateFormat, type ExpenseCard, type ExportFormat, type Receipt,
  type StatementLine, type TaxLine, type TaxRule, type TaxType,
} from './receiptTypes';

/** Below this, the review form highlights a field. The pool test-strip threshold. */
export const LOW_CONFIDENCE = 0.65;

/** Subtotal + taxes + tip may differ from the printed total by this much before it is flagged. */
export const MATH_TOLERANCE_CENTS = 2;

// ─── Money ───────────────────────────────────────────────────────────────────

/** Dollars → integer cents, rounding half away from zero. Null and NaN are 0. */
export function toCents(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  // The epsilon absorbs binary noise: 1.005 is stored as 1.00499999…, and is meant as 1.005.
  return sign * Math.round(Math.abs(value) * 100 + 1e-6);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
/** "$1,234.56" for CAD; "US$1,234.56" for USD. Always two decimals. */
export function formatMoney(value: number | null | undefined, currency: string = 'CAD'): string {
  if (value == null) return '—';
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFormatters.set(currency, f);
  }
  return f.format(fromCents(toCents(value)));
}

export function formatCents(cents: number, currency: string = 'CAD'): string {
  return formatMoney(fromCents(cents), currency);
}

/**
 * A money cell as banks write it: "$1,234.56", "(12.00)", "-12.00", "12.00 CR", "1 234,56",
 * "12.00-". Returns dollars, or null for a blank or unreadable cell.
 *
 * A comma is a decimal separator only when it is the last separator and exactly two digits follow
 * it with no dot anywhere ("1 234,56", from a French-language export). Otherwise commas are
 * thousands separators. Guessing the other way turned "1,234" into $1.23.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/\s*(CR|cr|Cr)\.?$/.test(s)) { negative = !negative; s = s.replace(/\s*(CR|cr|Cr)\.?$/, ''); }
  if (/\s*(DR|dr|Dr)\.?$/.test(s)) { s = s.replace(/\s*(DR|dr|Dr)\.?$/, ''); }
  s = s.replace(/(CAD|USD|C\$|US\$|\$|€|£)/g, '').replace(/[\s\u00a0\u202f]/g, '');
  if (s.endsWith('-')) { negative = !negative; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot === -1 && /,\d{2}$/.test(s) && !/,\d{3},/.test(s) && (s.match(/,/g)?.length ?? 0) === 1) {
    s = s.replace(',', '.');
  } else if (lastComma > lastDot && lastDot > -1) {
    // "1.234,56"
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return fromCents(toCents(negative ? -n : n));
}

/**
 * Do the parts add up to the total? A null total or subtotal means there is nothing to check,
 * which is not the same as "it checks out", so `checkable` says which it was.
 */
export function mathCheck(parts: { subtotal: number | null; taxes: TaxLine[]; tip: number | null; total: number | null }) {
  const checkable = parts.subtotal != null && parts.total != null;
  const expectedCents = toCents(parts.subtotal) + parts.taxes.reduce((s, t) => s + toCents(t.amount), 0) + toCents(parts.tip);
  const diffCents = toCents(parts.total) - expectedCents;
  return { checkable, expectedCents, diffCents, mismatch: checkable && Math.abs(diffCents) > MATH_TOLERANCE_CENTS };
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export type DateOrder = 'YMD' | 'MDY' | 'DMY';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  // French-language exports (Desjardins, National Bank).
  janv: 1, fevr: 2, fev: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, dece: 12,
};

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * A statement date → YYYY-MM-DD, a calendar day (never an instant).
 *
 * Numeric dates need the order, because 03/08/2026 is August 3rd at one bank and March 8th at
 * the next. Dates with a month name or a leading four-digit year are unambiguous and ignore it.
 */
export function parseStatementDate(raw: string | null | undefined, order: DateOrder): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i, '');
  if (!s) return null;
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (order === 'DMY') return validYmd(y, b, a);
    return validYmd(y, a, b);
  }
  const norm = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
  // "aug 3 2026", "august 3 2026"
  m = /^([a-z]+)[\s-](\d{1,2})[\s-](\d{2,4})$/.exec(norm);
  if (m && monthNum(m[1])) return validYmd(+m[3], monthNum(m[1])!, +m[2]);
  // "3 aug 2026", "03-aug-2026"
  m = /^(\d{1,2})[\s-]([a-z]+)[\s-](\d{2,4})$/.exec(norm);
  if (m && monthNum(m[2])) return validYmd(+m[3], monthNum(m[2])!, +m[1]);
  return null;
}

function monthNum(word: string): number | null {
  const w = word.toLowerCase();
  if (MONTHS[w]) return MONTHS[w];
  for (const len of [4, 3]) {
    if (w.length >= len && MONTHS[w.slice(0, len)]) return MONTHS[w.slice(0, len)];
  }
  return null;
}

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole days from a to b (b − a). Calendar arithmetic, immune to DST. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/**
 * Which numeric order a column of dates is in.
 *
 * A day above 12 settles it. When nothing does (every date in the first twelve days of a month),
 * the order under which the dates span the fewest days wins, because a statement covers a
 * month; and when even that ties it says so, so the mapper can ask instead of guessing.
 */
export function guessDateOrder(values: string[]): { order: DateOrder; ambiguous: boolean } {
  const cells = values.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (cells.some((v) => /^\d{4}[-/.]?\d{1,2}[-/.]?\d{1,2}/.test(v))) return { order: 'YMD', ambiguous: false };
  const triples = cells.map((v) => /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v)).filter(Boolean) as RegExpExecArray[];
  if (triples.length === 0) return { order: 'MDY', ambiguous: false };
  if (triples.some((t) => +t[1] > 12)) return { order: 'DMY', ambiguous: false };
  if (triples.some((t) => +t[2] > 12)) return { order: 'MDY', ambiguous: false };
  const span = (order: DateOrder) => {
    const days = cells.map((c) => parseStatementDate(c, order)).filter(Boolean).map((d) => dayNumber(d!));
    return days.length ? Math.max(...days) - Math.min(...days) : Infinity;
  };
  const mdy = span('MDY');
  const dmy = span('DMY');
  if (mdy === dmy) return { order: 'MDY', ambiguous: true };
  return { order: mdy < dmy ? 'MDY' : 'DMY', ambiguous: false };
}

/** "2026-08-14" → "2026-08". */
export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

/** "2026-08" → first and last calendar day. */
export function monthBounds(yyyyMm: string): { from: string; to: string } {
  const [y, m] = yyyyMm.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${yyyyMm}-01`, to: `${yyyyMm}-${pad2(last)}` };
}

export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}


// ─── Statement CSV ───────────────────────────────────────────────────────────

export type StatementField = 'skip' | 'date' | 'description' | 'amount' | 'debit' | 'credit';

export const STATEMENT_FIELDS: { value: StatementField; label: string }[] = [
  { value: 'skip', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
  { value: 'debit', label: 'Charges (debit)' },
  { value: 'credit', label: 'Payments (credit)' },
];

export interface StatementMapping {
  /** Whether row 0 is a header rather than a transaction. */
  hasHeader: boolean;
  columns: StatementField[];
  dateOrder: DateOrder;
  /** Only for a single amount column: which sign the bank gives a purchase. */
  chargeSign: 'positive' | 'negative';
}

export interface MappingGuess {
  mapping: StatementMapping;
  /** Things the person should look at before importing. */
  warnings: string[];
}

export interface ParsedStatementLine {
  row: number;
  postedDate: string;
  description: string;
  /** Positive is a charge. */
  amount: number;
}

function looksLikeDate(v: string): boolean {
  return parseStatementDate(v, 'MDY') != null || parseStatementDate(v, 'DMY') != null;
}

function looksLikeMoney(v: string): boolean {
  const t = v.trim();
  // A bare 4-to-8 digit run is an id or a card suffix, not a price.
  if (/^\d{4,8}$/.test(t)) return false;
  return /\d/.test(t) && parseMoney(t) != null && !looksLikeDate(t);
}

function headerField(h: string): StatementField | null {
  const s = h.trim().toLowerCase();
  if (!s) return null;
  if (/(^|\s)(card|account)\s*(#|no|number|type)|item\s*#|cheque|check\s*#|balance|^#$/.test(s)) return 'skip';
  if (/post/.test(s) && /date/.test(s)) return 'skip';
  if (/date/.test(s)) return 'date';
  if (/desc|merchant|payee|details|memo|name|narrative/.test(s)) return 'description';
  if (/debit|withdraw|charge|purchase|money out|paid out/.test(s)) return 'debit';
  if (/credit|deposit|payment|money in|paid in/.test(s)) return 'credit';
  if (/amount|cad|usd|\$|total|value/.test(s)) return 'amount';
  return null;
}

/**
 * Best guess at what each column is, from the header when there is one and from the cells when
 * there is not (TD and CIBC exports have no header row at all).
 */
export function guessStatementMapping(grid: string[][]): MappingGuess {
  const warnings: string[] = [];
  const width = Math.max(0, ...grid.map((r) => r.length));
  const first = grid[0] ?? [];
  const hasHeader = first.length > 0 && !first.some((c) => looksLikeDate(c)) && first.some((c) => /[a-z]/i.test(c));
  const body = hasHeader ? grid.slice(1) : grid;
  const sample = body.slice(0, 60);
  const columns: StatementField[] = Array(width).fill('skip');

  const share = (col: number, test: (v: string) => boolean) => {
    const cells = sample.map((r) => (r[col] ?? '').trim()).filter(Boolean);
    return cells.length ? cells.filter(test).length / cells.length : 0;
  };
  const fill = (col: number) => sample.filter((r) => (r[col] ?? '').trim()).length / Math.max(1, sample.length);

  if (hasHeader) {
    first.forEach((h, i) => { columns[i] = headerField(h) ?? 'skip'; });
    // Two date headers ("Transaction Date", "Posting Date") keep the first; the posting date was
    // already skipped by name, but a bank that calls them "Date 1" and "Date 2" still gets one.
    // RBC's "CAD$" and "USD$" are both amounts; the first one is the card's own currency.
    for (const field of ['date', 'amount', 'debit', 'credit'] as const) {
      let seen = false;
      columns.forEach((c, i) => { if (c === field) { if (seen) columns[i] = 'skip'; seen = true; } });
    }
  }

  if (!columns.includes('date')) {
    const col = [...Array(width).keys()].find((i) => columns[i] === 'skip' && share(i, looksLikeDate) > 0.8);
    if (col != null) columns[col] = 'date';
  }
  const hasMoney = columns.some((c) => c === 'amount' || c === 'debit' || c === 'credit');
  if (!hasMoney) {
    const moneyCols = [...Array(width).keys()].filter((i) => columns[i] === 'skip' && share(i, looksLikeMoney) > 0.8);
    // A balance column is filled on every row; debit and credit columns take turns being blank.
    const sparse = moneyCols.filter((i) => fill(i) < 0.98);
    if (sparse.length >= 2) {
      columns[sparse[0]] = 'debit';
      columns[sparse[1]] = 'credit';
    } else if (moneyCols.length >= 1) {
      columns[sparse[0] ?? moneyCols[0]] = 'amount';
    }
  }
  if (!columns.includes('description')) {
    let best = -1; let bestLen = 0;
    for (let i = 0; i < width; i++) {
      if (columns[i] !== 'skip') continue;
      const cells = sample.map((r) => (r[i] ?? '').trim()).filter(Boolean);
      if (!cells.length || cells.filter((c) => /[a-z]/i.test(c)).length / cells.length < 0.8) continue;
      // A masked card number ("4500********1234") has letters in no cell; this skips it anyway.
      const avg = cells.reduce((s, c) => s + c.length, 0) / cells.length;
      if (avg > bestLen) { best = i; bestLen = avg; }
    }
    if (best >= 0) columns[best] = 'description';
  }

  const dateCol = columns.indexOf('date');
  const { order, ambiguous } = guessDateOrder(dateCol >= 0 ? body.map((r) => r[dateCol] ?? '') : []);
  if (ambiguous) warnings.push('Every date could be read two ways. Check the month and day look right in the preview.');

  let chargeSign: 'positive' | 'negative' = 'positive';
  const amountCol = columns.indexOf('amount');
  if (amountCol >= 0) {
    const values = body.map((r) => parseMoney(r[amountCol] ?? '')).filter((v): v is number => v != null && v !== 0);
    const neg = values.filter((v) => v < 0).length;
    // Most lines on a card statement are purchases, so the majority sign is the purchase sign.
    if (neg > values.length / 2) chargeSign = 'negative';
  }
  if (dateCol < 0) warnings.push('No date column was recognised. Pick one.');
  if (!columns.some((c) => c === 'amount' || c === 'debit')) warnings.push('No amount column was recognised. Pick one.');

  return { mapping: { hasHeader, columns, dateOrder: order, chargeSign }, warnings };
}

/**
 * Rows → statement lines with charges positive.
 *
 * A row with no money in it (a bank's "Opening balance" line, a blank spacer) is skipped
 * silently. A row with money but no readable date is an error the person sees, because silently
 * dropping a charge is exactly what makes a month refuse to agree.
 */
export function parseStatementCsv(text: string, mapping: StatementMapping): {
  lines: ParsedStatementLine[]; errors: { row: number; message: string }[];
} {
  const grid = parseCsv(text);
  return parseStatementGrid(grid, mapping);
}

export function parseStatementGrid(grid: string[][], mapping: StatementMapping): {
  lines: ParsedStatementLine[]; errors: { row: number; message: string }[];
} {
  const lines: ParsedStatementLine[] = [];
  const errors: { row: number; message: string }[] = [];
  const cols = mapping.columns;
  const idx = (f: StatementField) => cols.map((c, i) => (c === f ? i : -1)).filter((i) => i >= 0);
  const [dateCol] = idx('date');
  const descCols = idx('description');
  const [amountCol] = idx('amount');
  const [debitCol] = idx('debit');
  const [creditCol] = idx('credit');

  grid.forEach((row, i) => {
    if (i === 0 && mapping.hasHeader) return;
    const rowNo = i + 1;
    let amount: number | null = null;
    if (amountCol != null) {
      const v = parseMoney(row[amountCol]);
      if (v != null) amount = mapping.chargeSign === 'negative' ? -v : v;
    } else {
      const d = debitCol != null ? parseMoney(row[debitCol]) : null;
      const c = creditCol != null ? parseMoney(row[creditCol]) : null;
      if (d != null || c != null) {
        // Some banks write a credit as a negative number in the debit column; abs() on both
        // columns keeps "charge positive, credit negative" true either way.
        amount = fromCents(Math.abs(toCents(d ?? 0)) - Math.abs(toCents(c ?? 0)));
      }
    }
    if (amount == null) return;
    const rawDate = dateCol != null ? row[dateCol] : '';
    const postedDate = parseStatementDate(rawDate, mapping.dateOrder);
    if (!postedDate) {
      errors.push({ row: rowNo, message: `Row ${rowNo}: "${rawDate ?? ''}" is not a date` });
      return;
    }
    const description = descCols.map((c) => (row[c] ?? '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
    lines.push({ row: rowNo, postedDate, description, amount });
  });
  return { lines, errors };
}

/** The month most of the lines fall in, as YYYY-MM. */
export function dominantMonth(dates: string[]): string | null {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(monthKey(d), (counts.get(monthKey(d)) ?? 0) + 1);
  let best: string | null = null; let n = 0;
  for (const [k, v] of [...counts.entries()].sort()) if (v > n) { best = k; n = v; }
  return best;
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

const VENDOR_NOISE = new Set([
  'the', 'inc', 'ltd', 'ltee', 'llc', 'co', 'corp', 'company', 'store', 'stores', 'and', 'of',
  'sq', 'tst', 'pos', 'purchase', 'www', 'com', 'ca', 'on', 'bc', 'ab', 'qc', 'mb', 'sk', 'ns', 'nb', 'nl', 'pe',
  'canada', 'cdn',
]);

/** Merchant words, lowercased, without punctuation, store numbers, province codes or "SQ *". */
export function vendorTokens(s: string | null | undefined): string[] {
  return (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !/\d/.test(t) && !VENDOR_NOISE.has(t));
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/**
 * 0–1: how likely two strings name the same merchant. The better of word overlap and letter-pair
 * overlap, because banks truncate ("MAPLE LEAF HARDWA") and receipts abbreviate ("Maple Lf Hdwe").
 */
export function vendorSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = vendorTokens(a);
  const tb = vendorTokens(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta); const sb = new Set(tb);
  const inter = [...sa].filter((t) => sb.has(t) || [...sb].some((u) => (u.length >= 4 && t.startsWith(u)) || (t.length >= 4 && u.startsWith(t)))).length;
  const tokenScore = inter / Math.min(sa.size, sb.size);
  const ja = ta.join(''); const jb = tb.join('');
  const ba = bigrams(ja); const bb = bigrams(jb);
  if (!ba.length || !bb.length) return Math.min(1, tokenScore);
  const pool = [...bb];
  let hits = 0;
  for (const g of ba) { const k = pool.indexOf(g); if (k >= 0) { hits++; pool.splice(k, 1); } }
  const dice = (2 * hits) / (ba.length + bb.length);
  return Math.min(1, Math.max(tokenScore, dice));
}

// ─── Matching ────────────────────────────────────────────────────────────────

export interface MatchSuggestion {
  lineId: string;
  receiptId: string;
  dateDiff: number;
  similarity: number;
  /**
   * `exact`: the only receipt for the only charge. `best_of_several`: chosen over another candidate
   * by date then vendor, so worth a glance. `tie`: nothing separated two candidates.
   */
  confidence: 'exact' | 'best_of_several' | 'tie';
}

type MatchLine = Pick<StatementLine, 'id' | 'postedDate' | 'description' | 'amount' | 'matchState' | 'receiptId'>;
type MatchReceipt = Pick<Receipt, 'id' | 'purchaseDate' | 'vendor' | 'total' | 'status'>;

/**
 * Suggest which receipt paid for which charge. Suggestions only: the person accepts them.
 *
 *  1. Same amount to the cent, dated within ±3 days of the posting (card posting lags purchase).
 *  2. Several candidates: the closest date wins, then the closer vendor name.
 *  3. A receipt is never suggested for two charges, and never for a charge already resolved.
 *
 * Pairs are ranked across the whole month before any are taken, rather than line by line, so the
 * first line in the file cannot take a receipt that fits a later line exactly.
 */
export function autoMatch(lines: MatchLine[], receipts: MatchReceipt[], windowDays = 3): MatchSuggestion[] {
  const taken = new Set(lines.map((l) => l.receiptId).filter(Boolean) as string[]);
  const openLines = lines.filter((l) => l.matchState === 'unmatched' && toCents(l.amount) > 0);
  const openReceipts = receipts.filter((r) => !taken.has(r.id) && r.status !== 'processing' && r.purchaseDate && r.total != null);

  const pairs: { line: MatchLine; receipt: MatchReceipt; dateDiff: number; similarity: number }[] = [];
  for (const line of openLines) {
    for (const receipt of openReceipts) {
      if (toCents(receipt.total) !== toCents(line.amount)) continue;
      const dateDiff = Math.abs(daysBetween(receipt.purchaseDate!, line.postedDate));
      if (dateDiff > windowDays) continue;
      pairs.push({ line, receipt, dateDiff, similarity: vendorSimilarity(receipt.vendor, line.description) });
    }
  }
  const perLine = new Map<string, number>();
  const perReceipt = new Map<string, number>();
  for (const p of pairs) {
    perLine.set(p.line.id, (perLine.get(p.line.id) ?? 0) + 1);
    perReceipt.set(p.receipt.id, (perReceipt.get(p.receipt.id) ?? 0) + 1);
  }
  const round = (x: number) => Math.round(x * 1000);
  pairs.sort((a, b) => a.dateDiff - b.dateDiff
    || round(b.similarity) - round(a.similarity)
    || a.line.postedDate.localeCompare(b.line.postedDate)
    || a.line.id.localeCompare(b.line.id)
    || a.receipt.id.localeCompare(b.receipt.id));

  const usedLines = new Set<string>();
  const usedReceipts = new Set<string>();
  const out: MatchSuggestion[] = [];
  for (const p of pairs) {
    if (usedLines.has(p.line.id) || usedReceipts.has(p.receipt.id)) continue;
    usedLines.add(p.line.id);
    usedReceipts.add(p.receipt.id);
    let confidence: MatchSuggestion['confidence'] = 'exact';
    if ((perLine.get(p.line.id) ?? 0) > 1 || (perReceipt.get(p.receipt.id) ?? 0) > 1) {
      // A rival that scored identically on both keys means the order in the file decided it.
      // Judged against every candidate, taken or not: the second half of a tie is only "forced"
      // because the first half was a coin toss.
      const rival = pairs.some((q) => q !== p
        && (q.line.id === p.line.id || q.receipt.id === p.receipt.id)
        && q.dateDiff === p.dateDiff && round(q.similarity) === round(p.similarity));
      confidence = rival ? 'tie' : 'best_of_several';
    }
    out.push({ lineId: p.line.id, receiptId: p.receipt.id, dateDiff: p.dateDiff, similarity: p.similarity, confidence });
  }
  return out.sort((a, b) => a.lineId.localeCompare(b.lineId));
}

// ─── Duplicates ──────────────────────────────────────────────────────────────

export interface DuplicatePair {
  /** The receipt that was there first. */
  originalId: string;
  /** The later one, which is probably the copy. */
  duplicateId: string;
  similarity: number;
  /** The two copies are on different cards: one of them is probably on the wrong card too. */
  crossCard: boolean;
}

type DupReceipt = Pick<Receipt, 'id' | 'cardId' | 'total' | 'purchaseDate' | 'vendor' | 'createdAt' | 'duplicateDismissed' | 'status'>;

/**
 * The same receipt snapped twice: same total, dated within a day, and a vendor name at least 60%
 * alike, on any card.
 *
 * This used to require the same card, and the commonest duplicate is exactly the one that is not:
 * the holder snaps it on their card and finance, snapping the emailed copy, saves it to another.
 * The copy on the wrong card then sat in that card's "receipts with no charge" looking unrelated.
 */
export function findDuplicates(receipts: DupReceipt[], dateWindow = 1, minSimilarity = 0.6): DuplicatePair[] {
  const rows = receipts
    .filter((r) => r.total != null && r.purchaseDate && r.status !== 'processing')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const out: DuplicatePair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]; const b = rows[j];
      if (toCents(a.total) !== toCents(b.total)) continue;
      if (Math.abs(daysBetween(a.purchaseDate!, b.purchaseDate!)) > dateWindow) continue;
      if (b.duplicateDismissed) continue;
      const sim = vendorSimilarity(a.vendor, b.vendor);
      if (sim < minSimilarity) continue;
      out.push({ originalId: a.id, duplicateId: b.id, similarity: sim, crossCard: (a.cardId ?? null) !== (b.cardId ?? null) });
    }
  }
  return out;
}

/** The other half of any duplicate pair a receipt is in, newest pairing first. */
export function duplicatePartner(pairs: DuplicatePair[], id: string): { otherId: string; isCopy: boolean; crossCard: boolean } | null {
  for (let i = pairs.length - 1; i >= 0; i--) {
    const p = pairs[i];
    if (p.duplicateId === id) return { otherId: p.originalId, isCopy: true, crossCard: p.crossCard };
    if (p.originalId === id) return { otherId: p.duplicateId, isCopy: false, crossCard: p.crossCard };
  }
  return null;
}

// ─── Attaching a receipt to a charge ─────────────────────────────────────────

export interface AttachCandidate {
  receipt: Pick<Receipt, 'id' | 'cardId' | 'vendor' | 'purchaseDate' | 'total' | 'purpose' | 'submitterName' | 'status'>;
  score: number;
  similarity: number;
  /** Receipt total minus the charge, in cents. */
  diffCents: number;
  /** Days between purchase and posting; null for an undated receipt. */
  dateDiff: number | null;
  otherCard: boolean;
}

type AttachReceipt = AttachCandidate['receipt'];

/**
 * Receipts that could be the paper for a charge, best first.
 *
 * Ranked by how much the vendor name looks like the statement descriptor, then how close the
 * amount and the date are. Sorting by amount alone put a different vendor from another month at
 * the top ("Pinegrove General Store, $64.12" for "MAPLE RIDGE GAS BAR, $64.37"), because nothing
 * else was scored.
 *
 * With no search text only receipts dated within 45 days (or undated) are offered. A search looks
 * at every open receipt in the camp, on any card, by vendor, purpose, who snapped it or amount.
 */
export function rankAttachCandidates(
  line: Pick<StatementLine, 'description' | 'amount' | 'postedDate'>,
  receipts: AttachReceipt[],
  opts: { cardId: string | null; excludeIds: Set<string>; query?: string; limit?: number },
): AttachCandidate[] {
  const query = (opts.query ?? '').trim().toLowerCase();
  const lineCents = toCents(line.amount);
  const out: AttachCandidate[] = [];
  for (const r of receipts) {
    if (opts.excludeIds.has(r.id) || r.status === 'processing') continue;
    const dateDiff = r.purchaseDate ? daysBetween(r.purchaseDate, line.postedDate) : null;
    if (query) {
      const hay = [r.vendor, r.purpose, r.submitterName, r.total != null ? (toCents(r.total) / 100).toFixed(2) : ''].join(' ').toLowerCase();
      if (!query.split(/\s+/).every((word) => hay.includes(word.replace(/^\$/, '')))) continue;
    } else if (dateDiff != null && Math.abs(dateDiff) > 45) {
      continue;
    }
    const similarity = vendorSimilarity(r.vendor, line.description);
    const diffCents = toCents(r.total) - lineCents;
    const amountScore = diffCents === 0 ? 40
      : lineCents !== 0 ? Math.max(0, 25 - (Math.abs(diffCents) / Math.abs(lineCents)) * 100) : 0;
    const dateScore = dateDiff == null ? 6 : Math.max(0, 20 - 2 * Math.abs(dateDiff));
    const otherCard = !!opts.cardId && !!r.cardId && r.cardId !== opts.cardId;
    const score = similarity * 45 + amountScore + dateScore + (otherCard ? 0 : 5);
    out.push({ receipt: r, score, similarity, diffCents, dateDiff, otherCard });
  }
  return out
    .sort((a, b) => b.score - a.score || a.receipt.id.localeCompare(b.receipt.id))
    .slice(0, opts.limit ?? 30);
}

// ─── Allocation and summaries ────────────────────────────────────────────────

/**
 * Split `total` cents across `weights` so the parts add back to the total exactly: floor each
 * share, then hand the leftover cents to the largest remainders (earlier index on a tie).
 */
export function allocateCents(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * Math.max(0, w)) / sum);
  const base = raw.map((x) => Math.floor(x + 1e-9));
  let left = abs - base.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, r: x - Math.floor(x + 1e-9) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) base[order[k].i] += 1;
  return base.map((x) => sign * x);
}

export type TaxCents = Record<TaxType, number>;
export const zeroTaxes = (): TaxCents => ({ GST: 0, HST: 0, PST: 0, QST: 0, other: 0 });

export function taxCents(taxes: TaxLine[]): TaxCents {
  const out = zeroTaxes();
  for (const t of taxes) out[(TAX_TYPES as readonly string[]).includes(t.type) ? t.type : 'other'] += toCents(t.amount);
  return out;
}

// ─── HST: federal and provincial parts ───────────────────────────────────────
//
// HST is the 5% GST plus a provincial part, and the public service bodies' rebate treats the two
// parts differently (50% federal, 82% provincial for an Ontario charity), so the rebate cannot be
// estimated from an HST total without splitting it first.
//
// HST rates, verified 2026-09-16 against the CRA:
//   https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html
//   13% Ontario; 15% New Brunswick, Newfoundland and Labrador, Prince Edward Island; 14% Nova Scotia
//   from April 1, 2025 (5% federal + 9% provincial, down from 10%):
//   https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/notice342/nova-scotia-hst-rate-decrease-questions-answers-general-transitional-rules-personal-property-services.html

export const GST_RATE_PCT = 5;
export const HST_RATE_PCT: Record<string, number> = { ON: 13, NB: 15, NL: 15, NS: 14, PE: 15 };

/** Cents × percent, half away from zero, in integers (9.975% × $1.00 must not become 9.974999…). */
function pctOf(cents: number, pct: number): number {
  const milli = Math.round(pct * 1000);
  return Math.sign(cents) * Math.floor((Math.abs(cents) * milli) / 100_000 + 0.5);
}

/**
 * An HST amount's federal and provincial parts. The rate printed on the receipt wins (a camp in
 * Ontario still buys in Nova Scotia); without one, the camp's province; without that, 13%.
 * The provincial part is the remainder, so the two always add back to the HST exactly.
 */
export function hstParts(cents: number, ratePct: number | null | undefined, province?: string | null): { federal: number; provincial: number } {
  const rate = ratePct != null && ratePct > GST_RATE_PCT && ratePct <= 20 ? ratePct : HST_RATE_PCT[(province ?? '').toUpperCase()] ?? 13;
  const federal = Math.sign(cents) * Math.floor((Math.abs(cents) * GST_RATE_PCT) / rate + 0.5);
  return { federal, provincial: cents - federal };
}

export interface Allocation {
  budgetCodeId: string | null;
  subtotalCents: number;
  taxes: TaxCents;
  /** The HST in `taxes.HST`, split. federal + provincial = taxes.HST. */
  hst: { federal: number; provincial: number };
  tipCents: number;
  totalCents: number;
}

type AllocReceipt = Pick<Receipt, 'budgetCodeId' | 'splits' | 'subtotal' | 'taxes' | 'tip' | 'total'>;

/**
 * A receipt's money by budget code. Without splits it is one allocation. With splits, each code
 * takes its share of the total, and the subtotal, every tax and the tip are divided in the same
 * proportions, each summing back to the receipt exactly. A split that does not cover the whole
 * total leaves the rest on the receipt's own code.
 */
export function receiptAllocations(r: AllocReceipt, province?: string | null): Allocation[] {
  const totalCents = toCents(r.total);
  const taxes = taxCents(r.taxes);
  const hst = r.taxes.filter((t) => t.type === 'HST')
    .map((t) => hstParts(toCents(t.amount), t.ratePct, province))
    .reduce((s, p) => ({ federal: s.federal + p.federal, provincial: s.provincial + p.provincial }), { federal: 0, provincial: 0 });
  const subtotalCents = r.subtotal != null ? toCents(r.subtotal)
    : totalCents - Object.values(taxes).reduce((s, v) => s + v, 0) - toCents(r.tip);
  const splits = (r.splits ?? []).filter((s) => s.budgetCodeId && toCents(s.amount) !== 0);
  if (!splits.length) {
    return [{ budgetCodeId: r.budgetCodeId, subtotalCents, taxes, hst, tipCents: toCents(r.tip), totalCents }];
  }
  const parts: { code: string | null; cents: number }[] = splits.map((s) => ({ code: s.budgetCodeId, cents: toCents(s.amount) }));
  const covered = parts.reduce((s, p) => s + p.cents, 0);
  if (covered !== totalCents) parts.push({ code: r.budgetCodeId, cents: totalCents - covered });
  const weights = parts.map((p) => Math.abs(p.cents));
  const sub = allocateCents(subtotalCents, weights);
  const tip = allocateCents(toCents(r.tip), weights);
  const perTax = Object.fromEntries(TAX_TYPES.map((t) => [t, allocateCents(taxes[t], weights)])) as Record<TaxType, number[]>;
  const fed = allocateCents(hst.federal, weights);
  return parts.map((p, i) => ({
    budgetCodeId: p.code,
    subtotalCents: sub[i],
    taxes: Object.fromEntries(TAX_TYPES.map((t) => [t, perTax[t][i]])) as TaxCents,
    hst: { federal: fed[i], provincial: perTax.HST[i] - fed[i] },
    tipCents: tip[i],
    totalCents: p.cents,
  }));
}

/**
 * The estimated recoverable share of one allocation's taxes, per the camp's own rules. HST with
 * separate federal and provincial percentages is recovered part by part.
 *
 * Rounded here, per allocation, and only ever summed upward. It used to be rounded once on each
 * period total, and then the budget-code rows ($10.12 + $20.33 + … = $169.02) did not add up to
 * the total printed under them ($169.00). Every table's total is now the sum of its rows.
 */
export function recoverableCents(a: Pick<Allocation, 'taxes' | 'hst'>, rules: TaxRule[]): { byType: TaxCents; totalCents: number } {
  const byType = zeroTaxes();
  for (const t of TAX_TYPES) {
    const rule = rules.find((r) => r.type === t);
    if (!rule) continue;
    if (t === 'HST' && rule.federalPct != null && rule.provincialPct != null) {
      byType.HST = pctOf(a.hst.federal, rule.federalPct) + pctOf(a.hst.provincial, rule.provincialPct);
    } else if (rule.recoverablePct > 0) {
      byType[t] = pctOf(a.taxes[t], rule.recoverablePct);
    }
  }
  return { byType, totalCents: Object.values(byType).reduce((s, v) => s + v, 0) };
}

export interface SpendRow {
  key: string;
  label: string;
  count: number;
  subtotalCents: number;
  taxes: TaxCents;
  hst: { federal: number; provincial: number };
  tipCents: number;
  totalCents: number;
  recoverableCents: number;
  exportedCount: number;
}

function emptyRow(key: string, label: string): SpendRow {
  return { key, label, count: 0, subtotalCents: 0, taxes: zeroTaxes(), hst: { federal: 0, provincial: 0 }, tipCents: 0, totalCents: 0, recoverableCents: 0, exportedCount: 0 };
}

function addAlloc(row: SpendRow, a: Allocation, recoverable: number) {
  row.subtotalCents += a.subtotalCents;
  for (const t of TAX_TYPES) row.taxes[t] += a.taxes[t];
  row.hst.federal += a.hst.federal;
  row.hst.provincial += a.hst.provincial;
  row.tipCents += a.tipCents;
  row.totalCents += a.totalCents;
  row.recoverableCents += recoverable;
}

export interface SpendSummary {
  byMonth: SpendRow[];
  byCode: SpendRow[];
  totals: SpendRow;
  recoverable: { byType: TaxCents; totalCents: number };
  /** Snapped but not confirmed: left out of every figure above. */
  needsReviewCount: number;
  /** Receipts in another currency than the camp's: counted here, never added to its dollars. */
  otherCurrency: { count: number; totalCents: number; currency: string | null };
}

type SummaryReceipt = Pick<Receipt, 'id' | 'purchaseDate' | 'status' | 'currency' | 'budgetCodeId' | 'splits' | 'subtotal' | 'taxes' | 'tip' | 'total'>;

/**
 * Spend by month and by budget code, taxes by type, and the estimated recoverable tax.
 *
 * Only confirmed receipts (ready or exported) count. A receipt the AI read and nobody checked is
 * not yet a fact, and a summary built on it would move when someone finally corrects the total.
 */
export function spendSummary(
  receipts: SummaryReceipt[], codes: Pick<BudgetCode, 'id' | 'code' | 'name' | 'sortOrder'>[], rules: TaxRule[],
  currency: string = 'CAD', province: string | null = null,
): SpendSummary {
  const months = new Map<string, SpendRow>();
  const byCode = new Map<string, SpendRow>();
  const totals = emptyRow('total', 'Total');
  const recoverable = { byType: zeroTaxes(), totalCents: 0 };
  let needsReviewCount = 0;
  const other = { count: 0, totalCents: 0, currency: null as string | null };

  for (const r of receipts) {
    if (r.status === 'needs_review' || r.status === 'processing') { if (r.status === 'needs_review') needsReviewCount++; continue; }
    if (!r.purchaseDate) continue;
    if (r.currency !== currency) { other.count++; other.totalCents += toCents(r.total); other.currency = r.currency; continue; }
    const mk = monthKey(r.purchaseDate);
    const month = months.get(mk) ?? emptyRow(mk, monthLabel(mk));
    months.set(mk, month);
    month.count++; totals.count++;
    if (r.status === 'exported') { month.exportedCount++; totals.exportedCount++; }
    const seen = new Set<string>();
    for (const a of receiptAllocations(r, province)) {
      const rec = recoverableCents(a, rules);
      for (const t of TAX_TYPES) recoverable.byType[t] += rec.byType[t];
      recoverable.totalCents += rec.totalCents;
      addAlloc(month, a, rec.totalCents);
      addAlloc(totals, a, rec.totalCents);
      const key = a.budgetCodeId ?? 'uncoded';
      const code = codes.find((c) => c.id === a.budgetCodeId);
      const row = byCode.get(key) ?? emptyRow(key, code ? `${code.code} · ${code.name}` : 'Not coded yet');
      if (!byCode.has(key)) byCode.set(key, row);
      addAlloc(row, a, rec.totalCents);
      // Counted once per receipt even when it is split across codes.
      if (!seen.has(key)) { row.count++; seen.add(key); }
    }
  }

  const codeOrder = (key: string) => {
    const c = codes.find((x) => x.id === key);
    return c ? [0, c.sortOrder, c.code] as const : [1, 0, ''] as const;
  };
  return {
    byMonth: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byCode: [...byCode.values()].sort((a, b) => {
      const x = codeOrder(a.key); const y = codeOrder(b.key);
      return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
    }),
    totals,
    recoverable,
    needsReviewCount,
    otherCurrency: other,
  };
}

// ─── Does a card-month agree with the bill? ──────────────────────────────────

/** "2026-08" moved by whole months. */
export function shiftMonth(yyyyMm: string, by: number): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** The calendar day an instant falls on in a time zone, YYYY-MM-DD. */
export function dayInZone(iso: string, timeZone: string): string {
  const p: Record<string, string> = {};
  try {
    for (const part of new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))) {
      p[part.type] = part.value;
    }
  } catch {
    return iso.slice(0, 10);
  }
  return `${p.year}-${p.month}-${p.day}`;
}

export type BlockerCode =
  | 'no_statement' | 'total_missing' | 'total_mismatch' | 'unexplained' | 'amount_differs'
  | 'matched_needs_review' | 'no_charge' | 'undated';

export interface Blocker { code: BlockerCode; count: number; message: string }

type MonthReceipt = Pick<Receipt, 'id' | 'cardId' | 'purchaseDate' | 'status' | 'total' | 'deferredMonth' | 'createdAt'>;

export interface MonthInput {
  statement: Pick<CardStatement, 'statementTotal'> | null;
  cardId: string;
  /** YYYY-MM */
  month: string;
  /** This statement's lines. */
  lines: Pick<StatementLine, 'id' | 'amount' | 'matchState' | 'receiptId'>[];
  /** Every receipt id matched to a line on ANY statement: those have their charge. */
  matchedReceiptIds: Set<string>;
  receipts: MonthReceipt[];
  /** camps.timezone: an undated receipt belongs to the month it was snapped in, camp time. */
  timeZone: string;
}

/**
 * Receipts on the card that the month still has to account for.
 *
 *  - noCharge: dated this month (and not set aside from it), or set aside from last month, and
 *    matched to no charge on any statement.
 *  - undated: no date, not matched, snapped this month or next. An undated receipt used to appear
 *    nowhere on the reconcile screen, so a month could agree with one sitting on the card.
 *
 * The database's card_month_blockers_internal() applies the same rules before an export.
 */
export function openReceiptsForMonth(input: Pick<MonthInput, 'cardId' | 'month' | 'matchedReceiptIds' | 'receipts' | 'timeZone'>) {
  const first = `${input.month}-01`;
  const prev = `${shiftMonth(input.month, -1)}-01`;
  const next = shiftMonth(input.month, 1);
  const noCharge: MonthReceipt[] = [];
  const undated: MonthReceipt[] = [];
  for (const r of input.receipts) {
    if (r.cardId !== input.cardId || input.matchedReceiptIds.has(r.id)) continue;
    if (r.purchaseDate) {
      if (r.status === 'processing') continue;
      const inMonth = monthKey(r.purchaseDate) === input.month && r.deferredMonth !== first;
      if (inMonth || r.deferredMonth === prev) noCharge.push(r);
    } else {
      const snapped = monthKey(dayInZone(r.createdAt, input.timeZone));
      if (snapped === input.month || snapped === next) undated.push(r);
    }
  }
  return { noCharge, undated };
}

export interface ReconcileSummary {
  hasStatement: boolean;
  statementTotalCents: number | null;
  /** Every line, charges less credits. What the bill's total should equal. */
  netCents: number;
  chargesCents: number;
  creditsCents: number;
  statementAddsUp: boolean;
  chargeCount: number;
  matchedCount: number;
  noReceiptOkCount: number;
  personalCount: number;
  unresolvedCount: number;
  matchedLineCents: number;
  matchedReceiptCents: number;
  personalCents: number;
  noReceiptOkCents: number;
  unresolvedCents: number;
  /** Matched receipts nobody has confirmed, and matched receipts whose total is not the charge. */
  matchedNeedsReviewIds: string[];
  amountDiffersLineIds: string[];
  noCharge: MonthReceipt[];
  undated: MonthReceipt[];
  /** The month agrees with the bill. See `blockers` when it does not. */
  agrees: boolean;
  blockers: Blocker[];
  reasons: string[];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Does this card-month agree with the bill?
 *
 * Green only when nothing is left to explain:
 *  1. the imported lines add up to the statement total (nothing dropped or doubled on import);
 *  2. every charge is explained — a receipt, "no receipt needed", or personal;
 *  3. each matched receipt's total is its charge's amount, and somebody has confirmed it;
 *  4. no receipt on the card this month is left with no charge, and none is undated.
 *
 * It used to check only the first two and a sum for the third, so the header went green beside a
 * receipt still listed under "Receipts with no charge", with matched receipts still marked Needs
 * review, and with an undated receipt on the card that the screen never showed.
 */
export function reconcileSummary(input: MonthInput): ReconcileSummary {
  const { statement, lines, receipts } = input;
  const byId = new Map(receipts.map((r) => [r.id, r]));
  const open = openReceiptsForMonth(input);
  const s: ReconcileSummary = {
    hasStatement: !!statement, statementTotalCents: statement?.statementTotal != null ? toCents(statement.statementTotal) : null,
    netCents: 0, chargesCents: 0, creditsCents: 0, statementAddsUp: false,
    chargeCount: 0, matchedCount: 0, noReceiptOkCount: 0, personalCount: 0, unresolvedCount: 0,
    matchedLineCents: 0, matchedReceiptCents: 0, personalCents: 0, noReceiptOkCents: 0, unresolvedCents: 0,
    matchedNeedsReviewIds: [], amountDiffersLineIds: [], noCharge: open.noCharge, undated: open.undated,
    agrees: false, blockers: [], reasons: [],
  };
  for (const l of lines) {
    const c = toCents(l.amount);
    s.netCents += c;
    if (c <= 0) { s.creditsCents += -c; continue; }
    s.chargesCents += c;
    s.chargeCount++;
    if (l.matchState === 'matched') {
      const r = byId.get(l.receiptId ?? '');
      s.matchedCount++; s.matchedLineCents += c;
      s.matchedReceiptCents += toCents(r?.total);
      if (!r || toCents(r.total) !== c || r.total == null) s.amountDiffersLineIds.push(l.id);
      if (r && (r.status === 'needs_review' || r.status === 'processing')) s.matchedNeedsReviewIds.push(r.id);
    } else if (l.matchState === 'no_receipt_ok') { s.noReceiptOkCount++; s.noReceiptOkCents += c; }
    else if (l.matchState === 'personal') { s.personalCount++; s.personalCents += c; }
    else { s.unresolvedCount++; s.unresolvedCents += c; }
  }
  const block = (code: BlockerCode, count: number, message: string) => s.blockers.push({ code, count, message });
  if (!statement) {
    block('no_statement', 1, 'No statement imported for this card and month yet.');
  } else {
    s.statementAddsUp = s.statementTotalCents != null && s.statementTotalCents === s.netCents;
    if (s.statementTotalCents == null) block('total_missing', 1, 'Enter the statement total from the bill.');
    else if (!s.statementAddsUp) block('total_mismatch', 1, `The imported lines add up to ${formatCents(s.netCents)}, but the statement total is ${formatCents(s.statementTotalCents)}.`);
    if (s.unresolvedCount > 0) block('unexplained', s.unresolvedCount, `${s.unresolvedCount} ${plural(s.unresolvedCount, 'charge still has', 'charges still have')} no receipt or reason.`);
    const differs = s.amountDiffersLineIds.length;
    if (differs > 0) block('amount_differs', differs, `${differs} matched ${plural(differs, 'receipt does', 'receipts do')} not equal ${plural(differs, 'its charge', 'their charges')} to the cent.`);
    const review = s.matchedNeedsReviewIds.length;
    if (review > 0) block('matched_needs_review', review, `${review} matched ${plural(review, 'receipt still needs', 'receipts still need')} review.`);
  }
  if (open.noCharge.length > 0) block('no_charge', open.noCharge.length, `${open.noCharge.length} ${plural(open.noCharge.length, 'receipt', 'receipts')} on this card ${plural(open.noCharge.length, 'has', 'have')} no charge.`);
  if (open.undated.length > 0) block('undated', open.undated.length, `${open.undated.length} ${plural(open.undated.length, 'receipt', 'receipts')} on this card ${plural(open.undated.length, 'has', 'have')} no date.`);
  s.reasons = s.blockers.map((b) => b.message);
  s.agrees = !!statement && s.blockers.length === 0;
  return s;
}

// ─── Exports ─────────────────────────────────────────────────────────────────
//
// One file per card per month, built from the STATEMENT: one row per charge, at its posted date
// and amount, so the file adds up to the bill it came from. The first version exported the ready
// receipts instead, at their purchase dates, which left out every "no receipt needed" charge and
// every matched receipt still awaiting review, and so never reconciled to the card bill.
//
// What QuickBooks Online Canada can import, verified 2026-09-16 against Intuit's own help:
//
//  1. Bank transactions (Banking › Upload from file):
//     https://quickbooks.intuit.com/learn-support/en-ca/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_CA_en_CA
//     3 columns (Date, Description, Amount) or 4 (Date, Description, Credit, Debit); one date format
//     throughout, dd/mm/yyyy recommended and chosen in the upload; cells that would hold 0 left
//     blank; up to 1,000 lines and 350 KB. NO account and NO tax: every line is categorised in
//     QuickBooks after upload. Special characters in descriptions can block the import:
//     https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/common-errors-importing-bank-transactions-using/L02IgW462_US_en_US
//
//  2. Bills (Settings › Import data › Bills; Essentials, Plus, Advanced):
//     https://quickbooks.intuit.com/learn-support/en-ca/help-article/import-transactions/import-bills-quickbooks-online/L4Q6QWsRw_CA_en_CA
//     Bill no., Supplier, Bill Date, Due Date, Account, Line Amount and Line Tax Code are required;
//     Line Description, Sales Tax amount, Memo and Currency optional; tax exclusive or inclusive;
//     tax codes are mapped to the company's own codes in the last step; date format chosen in the
//     import; no credit memos; about 100 bills per import. The ONE import that carries the account
//     and GST/HST per line. They land as bills, so they are then paid from the card account.
//
//  3. Journal entries (Import data › Journal entries) are importable in Canada, with account columns
//     but no tax code: https://quickbooks.intuit.com/learn-support/en-ca/help-article/import-export-files/import-journal-entries-quickbooks-online/L4tQBwbs7_CA_en_CA
//     and Intuit confirms sales tax cannot be imported on them (January 2024):
//     https://quickbooks.intuit.com/learn-support/en-ca/other-questions/importing-journal-entries-with-sales-tax/00/1377480
//     so a journal entry would put ITCs where the GST/HST return never sees them. Not offered.
//
// There is no QuickBooks Online Canada import for credit-card expenses (purchases) with tax codes.

export const QBO_MAX_LINES = 1000;
export const QBO_MAX_BILLS = 100;

export const EXPORT_FORMATS: { value: ExportFormat; label: string; carries: string; lacks: string }[] = [
  {
    value: 'qbo_bills', label: 'QuickBooks bills import — with GST/HST',
    carries: 'One bill per charge: supplier, account, amount before tax, tax code and tax amount on each line.',
    lacks: 'Imports as bills: pay them from the card account in QuickBooks so the card balance matches. Refunds and payments are not included (bills have no credits) and are listed below.',
  },
  {
    value: 'qbo_bank_3col', label: 'QuickBooks bank upload — 3 columns',
    carries: 'Date, Description, Amount: every charge and credit, as the card account register sees them.',
    lacks: 'No account and no tax. QuickBooks cannot take GST/HST from a bank upload; use the bills import to record the tax, or categorise each line after upload.',
  },
  {
    value: 'qbo_bank_4col', label: 'QuickBooks bank upload — 4 columns',
    carries: 'Date, Description, Credit, Debit: every charge and credit.',
    lacks: 'No account and no tax. QuickBooks cannot take GST/HST from a bank upload; use the bills import to record the tax, or categorise each line after upload.',
  },
];

export const REVIEW_FORMAT = { value: 'detailed' as const, label: 'Review spreadsheet', carries: 'Every line on the statement with its receipt, account, each tax (HST split federal/provincial), note and receipt link. Marks nothing exported.' };

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'dd/mm/yyyy (QuickBooks’ recommendation)' },
  { value: 'MM/DD/YYYY', label: 'mm/dd/yyyy (most Canadian bank CSVs)' },
  { value: 'YYYY-MM-DD', label: 'yyyy-mm-dd' },
];

export function formatDate(ymd: string, fmt: DateFormat): string {
  const [y, m, d] = ymd.split('-');
  return fmt === 'DD/MM/YYYY' ? `${d}/${m}/${y}` : fmt === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : ymd;
}

/** "2026-08-03" → "03/08/2026". */
export function toDdMmYyyy(ymd: string): string {
  return formatDate(ymd, 'DD/MM/YYYY');
}

/** Money for a CSV cell: "45.20", "-3.00", and blank for zero when `blankZero`. */
function money(cents: number, blankZero = false): string {
  if (blankZero && cents === 0) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${pad2(abs % 100)}`;
}

/**
 * Quote when needed, and defuse a cell a spreadsheet would run as a formula. Only a cell that
 * could start a formula is touched: a note like "+2 bags of ice" or "- returned" is left as typed.
 */
export function csvText(v: string | null | undefined): string {
  let s = v ?? '';
  if (/^[=@\t\r]/.test(s) || /^[+-][A-Za-z(=@]/.test(s)) s = `'${s}`;
  return csvCell(s);
}

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Text for a QuickBooks import cell. Intuit says only that "special characters" in a description
 * can block an upload, so accents are folded and anything outside printable ASCII goes; ordinary
 * punctuation people type in notes (+ # % : , ! ?) stays. An earlier allow-list stripped "+".
 * A leading "=" or "@" is dropped so a spreadsheet opened on the way does not run it.
 */
export function qboDescription(s: string, max = 100): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // "Visa ··4821" is a card, not a range: the dots go. A single · between words is a separator.
    .replace(/\s*[·•]{2,}\s*/g, ' ')
    .replace(/[·•—–]/g, '-')
    .replace(/[‘’]/g, "'").replace(/[“”«»]/g, '')
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/["\\;<>]/g, ' ')
    .replace(/^[\s=@]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(new RegExp(`^(.{0,${max}})(\\s.*)?$`), (whole, head: string) => (whole.length <= max ? whole : head))
    .slice(0, max)
    .trim();
}

export type ExportTreatment = 'receipt' | 'no_receipt' | 'personal' | 'credit' | 'unexplained';

export interface ExportPart {
  account: string;
  codeLabel: string;
  subtotalCents: number;
  taxes: TaxCents;
  hst: { federal: number; provincial: number };
  tipCents: number;
  totalCents: number;
}

export interface ExportRow {
  lineId: string;
  postedDate: string;
  purchaseDate: string | null;
  description: string;
  /** The receipt's vendor, else the statement's descriptor. */
  supplier: string;
  treatment: ExportTreatment;
  amountCents: number;
  parts: ExportPart[];
  /** The ratePct of the receipt's taxes, for the tax code label. */
  taxRates: { type: TaxType; ratePct: number | null }[];
  note: string | null;
  receiptId: string | null;
  receiptStatus: Receipt['status'] | null;
  snappedBy: string | null;
  currency: string;
}

export interface StatementExport {
  cardLabel: string;
  cardSlug: string;
  holderName: string | null;
  month: string;
  rows: ExportRow[];
  statementTotalCents: number | null;
  netCents: number;
  /** Rows a bank upload writes: everything but personal charges. */
  bankRowsCents: number;
  bankRowCount: number;
  /** Rows the bills import writes: charges but not personal ones. */
  billsCents: number;
  billCount: number;
  personalCents: number;
  personalCount: number;
  creditsCents: number;
  creditCount: number;
}

export interface ExportContext {
  card: Pick<ExpenseCard, 'id' | 'label' | 'holderName' | 'last4' | 'defaultBudgetCodeId'>;
  month: string;
  statement: Pick<CardStatement, 'statementTotal'>;
  lines: Pick<StatementLine, 'id' | 'postedDate' | 'description' | 'amount' | 'matchState' | 'receiptId' | 'note'>[];
  receipts: Pick<Receipt, 'id' | 'vendor' | 'purchaseDate' | 'subtotal' | 'taxes' | 'tip' | 'total' | 'currency' | 'budgetCodeId' | 'splits' | 'purpose' | 'status' | 'submitterName'>[];
  codes: Pick<BudgetCode, 'id' | 'code' | 'name' | 'qbAccount'>[];
  province?: string | null;
}

/** When nothing better is known. QuickBooks Online Canada's own default expense account. */
export const FALLBACK_ACCOUNT = 'Uncategorised Expense';

function accountFor(codes: ExportContext['codes'], id: string | null): { account: string; codeLabel: string } {
  const c = codes.find((x) => x.id === id);
  return c ? { account: c.qbAccount || c.name, codeLabel: c.code } : { account: FALLBACK_ACCOUNT, codeLabel: '' };
}

export function cardSlug(card: Pick<ExpenseCard, 'label' | 'last4'>): string {
  const base = card.last4 ? `${card.label.replace(/[^A-Za-z]+.*$/, '') || 'card'}-${card.last4}` : card.label;
  return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';
}

/**
 * Every line on a card-month's statement, with what the books need to know about it. The single
 * source for every export format and for the totals the export screen reconciles on.
 */
export function buildStatementExport(ctx: ExportContext): StatementExport {
  const byId = new Map(ctx.receipts.map((r) => [r.id, r]));
  const defaultAcct = accountFor(ctx.codes, ctx.card.defaultBudgetCodeId);
  const rows: ExportRow[] = [...ctx.lines]
    .sort((a, b) => a.postedDate.localeCompare(b.postedDate) || a.id.localeCompare(b.id))
    .map((l) => {
      const cents = toCents(l.amount);
      const r = l.matchState === 'matched' ? byId.get(l.receiptId ?? '') ?? null : null;
      const treatment: ExportTreatment = cents <= 0 ? 'credit'
        : l.matchState === 'personal' ? 'personal'
          : l.matchState === 'no_receipt_ok' ? 'no_receipt'
            : r ? 'receipt' : 'unexplained';
      const plain = (acct: { account: string; codeLabel: string }): ExportPart => ({
        ...acct, subtotalCents: cents, taxes: zeroTaxes(), hst: { federal: 0, provincial: 0 }, tipCents: 0, totalCents: cents,
      });
      const parts: ExportPart[] = r && treatment === 'receipt'
        ? receiptAllocations(r, ctx.province).map((a) => ({ ...accountFor(ctx.codes, a.budgetCodeId), subtotalCents: a.subtotalCents, taxes: a.taxes, hst: a.hst, tipCents: a.tipCents, totalCents: a.totalCents }))
        // A credit is not an expense, and a personal or unexplained charge has no account yet.
        : [plain(treatment === 'no_receipt' ? defaultAcct : { account: '', codeLabel: '' })];
      return {
        lineId: l.id, postedDate: l.postedDate, purchaseDate: r?.purchaseDate ?? null, description: l.description,
        supplier: (r?.vendor || l.description || 'Card charge').trim(), treatment, amountCents: cents, parts,
        taxRates: r ? r.taxes.map((t) => ({ type: t.type, ratePct: t.ratePct })) : [],
        note: (treatment === 'receipt' ? r?.purpose : l.note) ?? null,
        receiptId: r?.id ?? null, receiptStatus: r?.status ?? null, snappedBy: r?.submitterName ?? null,
        currency: r?.currency ?? 'CAD',
      };
    });
  const sum = (xs: ExportRow[]) => xs.reduce((s, x) => s + x.amountCents, 0);
  const bank = rows.filter((x) => x.treatment !== 'personal');
  const bills = rows.filter((x) => x.treatment !== 'personal' && x.treatment !== 'credit');
  const personal = rows.filter((x) => x.treatment === 'personal');
  const credits = rows.filter((x) => x.treatment === 'credit');
  return {
    cardLabel: ctx.card.label, cardSlug: cardSlug(ctx.card), holderName: ctx.card.holderName, month: ctx.month, rows,
    statementTotalCents: ctx.statement.statementTotal != null ? toCents(ctx.statement.statementTotal) : null,
    netCents: sum(rows),
    bankRowsCents: sum(bank), bankRowCount: bank.length,
    billsCents: sum(bills), billCount: bills.length,
    personalCents: sum(personal), personalCount: personal.length,
    creditsCents: sum(credits), creditCount: credits.length,
  };
}

/** The tax code a bill line is imported with, mapped to the company's own codes in QuickBooks. */
export function taxCodeLabel(part: Pick<ExportPart, 'taxes'>, rates: ExportRow['taxRates']): string {
  const has = (t: TaxType) => part.taxes[t] !== 0;
  const rate = (t: TaxType) => rates.find((x) => x.type === t && x.ratePct != null)?.ratePct;
  if (has('HST')) return rate('HST') != null ? `HST ${rate('HST')}%` : 'HST';
  if (has('GST') && has('QST')) return 'GST/QST';
  if (has('GST') && has('PST')) return 'GST/PST';
  if (has('GST')) return 'GST 5%';
  if (has('PST')) return 'PST';
  if (has('QST')) return 'QST';
  if (has('other')) return 'Other tax';
  return 'No tax';
}

function accountSummary(row: ExportRow): string {
  if (row.parts.length > 1) return 'Split ' + row.parts.map((p) => p.account).join(' / ');
  return row.parts[0]?.account ?? '';
}

export type StatementExportFormat = 'qbo_bank_3col' | 'qbo_bank_4col' | 'qbo_bills' | 'detailed';

/**
 * The file. The same statement always gives the same bytes (the e2e journey compares a download
 * to a golden file). Windows line endings, as QuickBooks asks for.
 */
export function toStatementCsv(ex: StatementExport, format: StatementExportFormat, dateFormat: DateFormat,
  opts: { appOrigin?: string; last4?: string | null } = {}): string {
  const out: string[] = [];
  const date = (d: string) => formatDate(d, dateFormat);
  if (format === 'qbo_bank_3col' || format === 'qbo_bank_4col') {
    out.push(format === 'qbo_bank_3col' ? 'Date,Description,Amount' : 'Date,Description,Credit,Debit');
    for (const r of ex.rows) {
      if (r.treatment === 'personal') continue;
      const desc = qboDescription([r.supplier, r.treatment === 'credit' ? '' : accountSummary(r), r.note].filter(Boolean).join(' - '));
      if (format === 'qbo_bank_3col') {
        out.push([date(r.postedDate), csvCell(desc), money(-r.amountCents, true)].join(','));
      } else {
        // A purchase is a debit to the card; a payment or refund comes back as a credit.
        out.push([date(r.postedDate), csvCell(desc), r.amountCents < 0 ? money(-r.amountCents, true) : '', r.amountCents > 0 ? money(r.amountCents, true) : ''].join(','));
      }
    }
    return out.join('\r\n') + '\r\n';
  }

  if (format === 'qbo_bills') {
    out.push(['Bill no.', 'Supplier', 'Bill Date', 'Due Date', 'Memo', 'Account', 'Line Description', 'Line Amount', 'Line Tax Code', 'Line Tax Amount', 'Currency'].join(','));
    let n = 0;
    for (const r of ex.rows) {
      if (r.treatment === 'personal' || r.treatment === 'credit') continue;
      n++;
      const billNo = `${opts.last4 ?? 'CARD'}-${r.postedDate.replace(/-/g, '')}-${pad2(n)}`;
      const memo = qboDescription(`${ex.cardLabel} charge posted ${r.postedDate}: ${r.description}`, 1000);
      const supplier = qboDescription(r.supplier, 100);
      const lineDesc = qboDescription([r.note, r.treatment === 'no_receipt' ? 'No receipt' : ''].filter(Boolean).join(' - '), 1000);
      const push = (account: string, amountCents: number, code: string, taxCentsTotal: number, desc = lineDesc) => out.push([
        csvCell(billNo), csvCell(supplier), date(r.postedDate), date(r.postedDate), csvCell(memo), csvCell(qboDescription(account, 200)),
        csvCell(desc), money(amountCents), csvCell(code), money(taxCentsTotal), r.currency,
      ].join(','));
      for (const p of r.parts) {
        const tax = TAX_TYPES.reduce((s, t) => s + p.taxes[t], 0);
        push(p.account, p.subtotalCents, taxCodeLabel(p, r.taxRates), tax);
        // A tip carries no sales tax, so it is its own untaxed line.
        if (p.tipCents !== 0) push(p.account, p.tipCents, 'No tax', 0, 'Tip');
      }
    }
    return out.join('\r\n') + '\r\n';
  }

  out.push(['Posted date', 'Purchase date', 'Card', 'Card holder', 'Statement description', 'Vendor', 'Treatment',
    'QuickBooks account', 'Budget code', 'Subtotal', 'GST', 'HST', 'HST federal part', 'HST provincial part', 'PST', 'QST',
    'Other tax', 'Tip', 'Total', 'Charge amount', 'Receipt status', 'Snapped by', 'Note', 'Split', 'Receipt link'].join(','));
  const treatmentLabel: Record<ExportTreatment, string> = {
    receipt: 'Receipt', no_receipt: 'No receipt needed', personal: 'Personal - not exported', credit: 'Payment or credit', unexplained: 'Not explained yet',
  };
  for (const r of ex.rows) {
    r.parts.forEach((p, i) => {
      out.push([
        date(r.postedDate), r.purchaseDate ? date(r.purchaseDate) : '', csvText(ex.cardLabel), csvText(ex.holderName), csvText(r.description),
        csvText(r.supplier), treatmentLabel[r.treatment], csvText(p.account), csvText(p.codeLabel),
        money(p.subtotalCents), money(p.taxes.GST), money(p.taxes.HST), money(p.hst.federal), money(p.hst.provincial),
        money(p.taxes.PST), money(p.taxes.QST), money(p.taxes.other), money(p.tipCents), money(p.totalCents),
        // On the first row of a charge only, so the column adds up to the statement.
        i === 0 ? money(r.amountCents) : '',
        r.receiptStatus ? r.receiptStatus.replace('_', ' ') : '', csvText(r.snappedBy), csvText(r.note),
        r.parts.length > 1 ? `${i + 1} of ${r.parts.length}` : '',
        r.receiptId && opts.appOrigin ? `${opts.appOrigin}/receipts?receipt=${r.receiptId}` : '',
      ].join(','));
    });
  }
  return out.join('\r\n') + '\r\n';
}

export function exportFileName(format: StatementExportFormat, slug: string, month: string): string {
  const kind = { qbo_bank_3col: 'quickbooks-bank-3col', qbo_bank_4col: 'quickbooks-bank-4col', qbo_bills: 'quickbooks-bills', detailed: 'receipts-review' }[format];
  return `${kind}-${slug}-${month}.csv`;
}

// ─── How a camp claims sales tax back ────────────────────────────────────────
//
//  itc   Registered for GST/HST (and QST): input tax credits recover all of it. PST in BC, SK and
//        MB is not recoverable that way and stays at 0.
//  psb   Charity or qualifying non-profit: the public service bodies' rebate. CRA RC4034, Rev. 25:
//        https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4034/rc4034-gst-hst-public-service-bodies-rebate.html
//        50% of the GST and the federal part of HST; of the provincial part, 82% in Ontario, 50%
//        in Nova Scotia, New Brunswick (claim periods ending on or after April 1, 2024),
//        Newfoundland and Labrador, and Prince Edward Island (from January 1, 2023; 35% before).
//        Ontario charities, worked example: https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/gi-176/public-service-bodies-rebate-charities-resident-only-ontario.html
//        A body resident only in non-participating provinces gets no rebate of HST's provincial
//        part: https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/gi-178/public-service-bodies-rebate-charities-resident-non-participating-provinces.html
//        Quebec's QST rebate for charities and qualifying NPOs is 50% (Revenu Québec):
//        https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/special-cases-gsthst-and-qst/public-service-bodies-gsthst-and-qst/gst-and-qst-rebates-for-public-service-bodies/
//  none  Not registered and no rebate.
//
// These are presets a person chooses, never applied silently, and the settings screen asks them
// to check the result matches how their camp actually claims.

export const PSB_PROVINCIAL_PCT: Record<string, number> = { ON: 82, NS: 50, NB: 50, NL: 50, PE: 50 };

export const CLAIM_BASES: { value: Exclude<ClaimBasis, 'custom'>; label: string; hint: string }[] = [
  { value: 'itc', label: 'Registered for GST/HST — claim input tax credits (100%)', hint: 'The camp files GST/HST returns and claims back all the GST/HST (and QST) it pays. PST is not recoverable.' },
  { value: 'psb', label: 'Charity or qualifying non-profit — public service bodies’ rebate', hint: '50% of GST and of the federal part of HST, plus the province’s share of the provincial part (Ontario 82%; NS, NB, NL, PE 50%). QST 50%.' },
  { value: 'none', label: 'Not registered, no rebate', hint: 'Nothing is recovered; tax is part of the cost.' },
];

function taxTypesFor(province: string | null): TaxType[] {
  const p = (province ?? '').toUpperCase();
  if (HST_RATE_PCT[p]) return ['HST', 'GST'];
  if (['BC', 'SK', 'MB'].includes(p)) return ['GST', 'PST'];
  if (p === 'QC') return ['GST', 'QST'];
  // Alberta and the territories charge GST, and a camp there still pays HST buying from Ontario.
  return ['GST', 'HST'];
}

function round2(x: number): number { return Math.round(x * 100) / 100; }

/** The rules for a claim basis in a province. HST always carries its federal/provincial split. */
export function taxPreset(basis: Exclude<ClaimBasis, 'custom'>, province: string | null): TaxRule[] {
  const p = (province ?? '').toUpperCase();
  const hstRate = HST_RATE_PCT[p] ?? 13;
  return taxTypesFor(province).map((type): TaxRule => {
    if (type === 'HST') {
      const federalPct = basis === 'itc' ? 100 : basis === 'psb' ? 50 : 0;
      const provincialPct = basis === 'itc' ? 100 : basis === 'psb' ? PSB_PROVINCIAL_PCT[p] ?? 0 : 0;
      // The blended share at the province's rate, for anything that only reads recoverable_pct.
      const recoverablePct = round2((GST_RATE_PCT * federalPct + (hstRate - GST_RATE_PCT) * provincialPct) / hstRate);
      return { type, recoverablePct, federalPct, provincialPct };
    }
    if (type === 'PST') return { type, recoverablePct: 0 };
    return { type, recoverablePct: basis === 'itc' ? 100 : basis === 'psb' ? 50 : 0 };
  });
}

/** Which preset these rules are, or `custom` when someone has changed a number. */
export function detectClaimBasis(rules: TaxRule[], province: string | null): ClaimBasis {
  const norm = (rs: TaxRule[]) => JSON.stringify([...rs].map((r) => [r.type, r.recoverablePct, r.federalPct ?? null, r.provincialPct ?? null]).sort());
  for (const b of CLAIM_BASES) if (norm(taxPreset(b.value, province)) === norm(rules)) return b.value;
  return 'custom';
}

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;
