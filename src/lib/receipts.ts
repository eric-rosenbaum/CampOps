/**
 * The Receipts module's arithmetic, kept pure so every rule can be tested without a database.
 *
 *   - reading a bank's statement CSV, whatever shape that bank exports
 *   - suggesting which receipt paid for which charge
 *   - spotting a receipt snapped twice
 *   - adding a month up to the cent, by budget code and by tax type
 *   - writing the CSV QuickBooks Online imports
 *
 * Every sum is in integer cents. The first version of any money screen adds floats, and a month
 * of forty charges then "disagrees" with the Visa bill by a cent that exists nowhere but in
 * binary. Dollars come in, cents are added, dollars go out.
 */
import { parseCsv } from './csv';
import {
  TAX_TYPES,
  type BudgetCode, type CardStatement, type ExpenseCard, type ExportFormat, type Receipt,
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

/** "2026-08-03" → "03/08/2026", the order QuickBooks Online's upload recommends. */
export function toDdMmYyyy(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
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
}

type DupReceipt = Pick<Receipt, 'id' | 'cardId' | 'total' | 'purchaseDate' | 'vendor' | 'createdAt' | 'duplicateDismissed' | 'status'>;

/**
 * The same receipt snapped twice (or snapped by the holder and again by finance): same card,
 * same total, dated within a day, and a vendor name at least 60% alike.
 */
export function findDuplicates(receipts: DupReceipt[], dateWindow = 1, minSimilarity = 0.6): DuplicatePair[] {
  const rows = receipts
    .filter((r) => r.total != null && r.purchaseDate && r.status !== 'processing')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const out: DuplicatePair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]; const b = rows[j];
      if ((a.cardId ?? null) !== (b.cardId ?? null)) continue;
      if (toCents(a.total) !== toCents(b.total)) continue;
      if (Math.abs(daysBetween(a.purchaseDate!, b.purchaseDate!)) > dateWindow) continue;
      if (b.duplicateDismissed) continue;
      const sim = vendorSimilarity(a.vendor, b.vendor);
      if (sim < minSimilarity) continue;
      out.push({ originalId: a.id, duplicateId: b.id, similarity: sim });
    }
  }
  return out;
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

export interface Allocation {
  budgetCodeId: string | null;
  subtotalCents: number;
  taxes: TaxCents;
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
export function receiptAllocations(r: AllocReceipt): Allocation[] {
  const totalCents = toCents(r.total);
  const taxes = taxCents(r.taxes);
  const subtotalCents = r.subtotal != null ? toCents(r.subtotal)
    : totalCents - Object.values(taxes).reduce((s, v) => s + v, 0) - toCents(r.tip);
  const splits = (r.splits ?? []).filter((s) => s.budgetCodeId && toCents(s.amount) !== 0);
  if (!splits.length) {
    return [{ budgetCodeId: r.budgetCodeId, subtotalCents, taxes, tipCents: toCents(r.tip), totalCents }];
  }
  const parts: { code: string | null; cents: number }[] = splits.map((s) => ({ code: s.budgetCodeId, cents: toCents(s.amount) }));
  const covered = parts.reduce((s, p) => s + p.cents, 0);
  if (covered !== totalCents) parts.push({ code: r.budgetCodeId, cents: totalCents - covered });
  const weights = parts.map((p) => Math.abs(p.cents));
  const sub = allocateCents(subtotalCents, weights);
  const tip = allocateCents(toCents(r.tip), weights);
  const perTax = Object.fromEntries(TAX_TYPES.map((t) => [t, allocateCents(taxes[t], weights)])) as Record<TaxType, number[]>;
  return parts.map((p, i) => ({
    budgetCodeId: p.code,
    subtotalCents: sub[i],
    taxes: Object.fromEntries(TAX_TYPES.map((t) => [t, perTax[t][i]])) as TaxCents,
    tipCents: tip[i],
    totalCents: p.cents,
  }));
}

/**
 * The estimated recoverable share of each tax, per the camp's own settings. Rounded once per tax
 * type on the period total (half up), not per receipt, so the estimate does not drift by a cent
 * for every receipt in the month. It is an estimate and every screen that shows it says so.
 */
export function estimateRecoverable(taxes: TaxCents, rules: TaxRule[]): { byType: TaxCents; totalCents: number } {
  const byType = zeroTaxes();
  for (const t of TAX_TYPES) {
    const rule = rules.find((r) => r.type === t);
    if (!rule || !(rule.recoverablePct > 0)) continue;
    // Percent to three decimals, as integers: 9.975% × $1.00 must not become 9.974999…
    const milli = Math.round(rule.recoverablePct * 1000);
    byType[t] = Math.sign(taxes[t]) * Math.floor((Math.abs(taxes[t]) * milli) / 100_000 + 0.5);
  }
  return { byType, totalCents: Object.values(byType).reduce((s, v) => s + v, 0) };
}

export interface SpendRow {
  key: string;
  label: string;
  count: number;
  subtotalCents: number;
  taxes: TaxCents;
  tipCents: number;
  totalCents: number;
  recoverableCents: number;
  exportedCount: number;
}

function emptyRow(key: string, label: string): SpendRow {
  return { key, label, count: 0, subtotalCents: 0, taxes: zeroTaxes(), tipCents: 0, totalCents: 0, recoverableCents: 0, exportedCount: 0 };
}

function addAlloc(row: SpendRow, a: Allocation) {
  row.subtotalCents += a.subtotalCents;
  for (const t of TAX_TYPES) row.taxes[t] += a.taxes[t];
  row.tipCents += a.tipCents;
  row.totalCents += a.totalCents;
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
export function spendSummary(receipts: SummaryReceipt[], codes: Pick<BudgetCode, 'id' | 'code' | 'name' | 'sortOrder'>[], rules: TaxRule[], currency: string = 'CAD'): SpendSummary {
  const months = new Map<string, SpendRow>();
  const byCode = new Map<string, SpendRow>();
  const totals = emptyRow('total', 'Total');
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
    for (const a of receiptAllocations(r)) {
      addAlloc(month, a);
      addAlloc(totals, a);
      const key = a.budgetCodeId ?? 'uncoded';
      const code = codes.find((c) => c.id === a.budgetCodeId);
      const row = byCode.get(key) ?? emptyRow(key, code ? `${code.code} · ${code.name}` : 'Not coded yet');
      if (!byCode.has(key)) byCode.set(key, row);
      addAlloc(row, a);
    }
    // Counted once per receipt even when it is split across codes.
    const seen = new Set<string>();
    for (const a of receiptAllocations(r)) {
      const key = a.budgetCodeId ?? 'uncoded';
      if (!seen.has(key)) { byCode.get(key)!.count++; seen.add(key); }
    }
  }
  for (const row of [...months.values(), ...byCode.values()]) row.recoverableCents = estimateRecoverable(row.taxes, rules).totalCents;
  const recoverable = estimateRecoverable(totals.taxes, rules);
  totals.recoverableCents = recoverable.totalCents;

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
  /** The month agrees with the Visa bill. See `reasons` when it does not. */
  agrees: boolean;
  reasons: string[];
}

/**
 * Does this card-month agree with the bill?
 *
 * Three things have to be true, and the header shows each so nobody has to trust a tick:
 *  1. the imported lines add up to the statement total (nothing dropped or doubled on import);
 *  2. every charge is explained — a receipt, "no receipt needed", or personal;
 *  3. the matched receipts add up to the charges they explain, to the cent.
 */
export function reconcileSummary(
  statement: Pick<CardStatement, 'statementTotal'> | null,
  lines: Pick<StatementLine, 'amount' | 'matchState' | 'receiptId'>[],
  receipts: Pick<Receipt, 'id' | 'total'>[],
): ReconcileSummary {
  const byId = new Map(receipts.map((r) => [r.id, r]));
  const s: ReconcileSummary = {
    hasStatement: !!statement, statementTotalCents: statement?.statementTotal != null ? toCents(statement.statementTotal) : null,
    netCents: 0, chargesCents: 0, creditsCents: 0, statementAddsUp: false,
    chargeCount: 0, matchedCount: 0, noReceiptOkCount: 0, personalCount: 0, unresolvedCount: 0,
    matchedLineCents: 0, matchedReceiptCents: 0, personalCents: 0, noReceiptOkCents: 0, unresolvedCents: 0,
    agrees: false, reasons: [],
  };
  for (const l of lines) {
    const c = toCents(l.amount);
    s.netCents += c;
    if (c <= 0) { s.creditsCents += -c; continue; }
    s.chargesCents += c;
    s.chargeCount++;
    if (l.matchState === 'matched') {
      s.matchedCount++; s.matchedLineCents += c;
      s.matchedReceiptCents += toCents(byId.get(l.receiptId ?? '')?.total);
    } else if (l.matchState === 'no_receipt_ok') { s.noReceiptOkCount++; s.noReceiptOkCents += c; }
    else if (l.matchState === 'personal') { s.personalCount++; s.personalCents += c; }
    else { s.unresolvedCount++; s.unresolvedCents += c; }
  }
  if (!statement) {
    s.reasons.push('No statement imported for this card and month yet.');
    return s;
  }
  s.statementAddsUp = s.statementTotalCents != null && s.statementTotalCents === s.netCents;
  if (s.statementTotalCents == null) s.reasons.push('Enter the statement total from the bill.');
  else if (!s.statementAddsUp) s.reasons.push(`The imported lines add up to ${formatCents(s.netCents)}, but the statement total is ${formatCents(s.statementTotalCents)}.`);
  if (s.unresolvedCount > 0) s.reasons.push(`${s.unresolvedCount} charge${s.unresolvedCount === 1 ? '' : 's'} still ${s.unresolvedCount === 1 ? 'has' : 'have'} no receipt.`);
  if (s.matchedReceiptCents !== s.matchedLineCents) s.reasons.push(`Matched receipts total ${formatCents(s.matchedReceiptCents)} against ${formatCents(s.matchedLineCents)} of charges.`);
  s.agrees = s.reasons.length === 0;
  return s;
}

// ─── QuickBooks export ───────────────────────────────────────────────────────
//
// QuickBooks Online imports bank and credit-card transactions from a CSV in one of two shapes
// (verified 2026-09-16 against Intuit's own help articles):
//   https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US
//   https://quickbooks.intuit.com/learn-support/en-global/help-article/bank-transactions/format-csv-files-excel-get-bank-transactions/L4BjLWckq_ROW_en
//   https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/common-errors-importing-bank-transactions-using/L02IgW462_US_en_US
//   - 3 columns: Date, Description, Amount (money spent is negative, e.g. -100.00)
//   - 4 columns: Date, Description, Credit, Debit (the word "amount" removed from the headers)
//   - one date format throughout; dd/mm/yyyy recommended
//   - a cell that would only hold 0 is left blank
//   - plain numbers: no currency symbols, no thousands commas
//   - special characters in the description can block the import
//   - at most 1,000 lines per upload; English; saved as a Windows CSV (CRLF)
// QuickBooks Online has no CSV import for expenses with categories, so the account and budget
// code travel in the description, where a bank rule or the reviewer can pick them up. The
// detailed CSV carries every field for the finance director's own spreadsheet.

export const QBO_MAX_LINES = 1000;

export const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'qbo_3col', label: 'QuickBooks Online — 3 columns', hint: 'Date, Description, Amount. Spending is negative. For Banking › Upload from file.' },
  { value: 'qbo_4col', label: 'QuickBooks Online — 4 columns', hint: 'Date, Description, Credit, Debit. Spending is in Debit. For Banking › Upload from file.' },
  { value: 'detailed', label: 'Detailed spreadsheet', hint: 'Every field: account, budget code, card, each tax, tip, total, purpose. One row per budget code.' },
];

export interface ExportContext {
  codes: Pick<BudgetCode, 'id' | 'code' | 'name' | 'qbAccount'>[];
  cards: Pick<ExpenseCard, 'id' | 'label' | 'holderName'>[];
  /** Absolute origin for "Receipt link", e.g. https://app.campcommand.app. */
  appOrigin?: string;
}

type ExportReceipt = Pick<Receipt, 'id' | 'cardId' | 'vendor' | 'purchaseDate' | 'subtotal' | 'taxes' | 'tip' | 'total' | 'currency' | 'budgetCodeId' | 'splits' | 'purpose' | 'status'>;

/** Money for a CSV cell: "45.20", "-3.00", and blank for zero when `blankZero`. */
function money(cents: number, blankZero = false): string {
  if (blankZero && cents === 0) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${pad2(abs % 100)}`;
}

/** Quote when needed, and defuse a text cell a spreadsheet would run as a formula. */
export function csvText(v: string | null | undefined): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return csvCell(s);
}

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** What QuickBooks will accept in a description: plain letters, digits and a little punctuation. */
export function qboDescription(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[·•—–]/g, '-')
    .replace(/[^A-Za-z0-9 &'.()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export function sortForExport<T extends Pick<Receipt, 'purchaseDate' | 'vendor' | 'id' | 'cardId'>>(receipts: T[], cards: Pick<ExpenseCard, 'id' | 'label'>[]): T[] {
  const label = (id: string | null) => cards.find((c) => c.id === id)?.label ?? '';
  return [...receipts].sort((a, b) => (a.purchaseDate ?? '').localeCompare(b.purchaseDate ?? '')
    || label(a.cardId).localeCompare(label(b.cardId))
    || (a.vendor ?? '').localeCompare(b.vendor ?? '')
    || a.id.localeCompare(b.id));
}

function codeLabel(ctx: ExportContext, id: string | null): string {
  const c = ctx.codes.find((x) => x.id === id);
  return c ? (c.qbAccount || c.name) : '';
}

/**
 * The file finance uploads. Rows are sorted by date, card, vendor and id so the same receipts
 * always produce the same bytes (the e2e journey compares the download to a golden file).
 */
export function toQuickBooksCsv(receipts: ExportReceipt[], format: ExportFormat, ctx: ExportContext): string {
  const rows = sortForExport(receipts, ctx.cards);
  const out: string[] = [];
  if (format === 'qbo_3col' || format === 'qbo_4col') {
    out.push(format === 'qbo_3col' ? 'Date,Description,Amount' : 'Date,Description,Credit,Debit');
    for (const r of rows) {
      if (!r.purchaseDate) continue;
      const allocs = receiptAllocations(r);
      const account = allocs.length > 1
        ? 'Split ' + allocs.map((a) => `${codeLabel(ctx, a.budgetCodeId) || 'Uncoded'} ${money(a.totalCents)}`).join(' / ')
        : codeLabel(ctx, r.budgetCodeId);
      const desc = qboDescription([r.vendor || 'Receipt', account, r.purpose].filter(Boolean).join(' - '));
      const cents = toCents(r.total);
      if (format === 'qbo_3col') {
        out.push([toDdMmYyyy(r.purchaseDate), csvCell(desc), money(-cents, true)].join(','));
      } else {
        // A purchase is a debit to the card; a refund comes back as a credit.
        out.push([toDdMmYyyy(r.purchaseDate), csvCell(desc), cents < 0 ? money(-cents, true) : '', cents > 0 ? money(cents, true) : ''].join(','));
      }
    }
    return out.join('\r\n') + '\r\n';
  }

  out.push(['Date', 'Vendor', 'QuickBooks account', 'Budget code', 'Budget name', 'Card', 'Card holder', 'Currency',
    'Subtotal', 'GST', 'HST', 'PST', 'QST', 'Other tax', 'Tip', 'Total', 'Purpose', 'Split', 'Receipt ID', 'Receipt link'].join(','));
  for (const r of rows) {
    const allocs = receiptAllocations(r);
    const card = ctx.cards.find((c) => c.id === r.cardId);
    allocs.forEach((a, i) => {
      const code = ctx.codes.find((c) => c.id === a.budgetCodeId);
      out.push([
        r.purchaseDate ?? '',
        csvText(r.vendor),
        csvText(code?.qbAccount ?? ''),
        csvText(code?.code ?? ''),
        csvText(code?.name ?? ''),
        csvText(card?.label ?? ''),
        csvText(card?.holderName ?? ''),
        r.currency,
        money(a.subtotalCents), money(a.taxes.GST), money(a.taxes.HST), money(a.taxes.PST), money(a.taxes.QST), money(a.taxes.other),
        money(a.tipCents), money(a.totalCents),
        csvText(r.purpose),
        allocs.length > 1 ? `${i + 1} of ${allocs.length}` : '',
        r.id,
        ctx.appOrigin ? `${ctx.appOrigin}/receipts?receipt=${r.id}` : '',
      ].join(','));
    });
  }
  return out.join('\r\n') + '\r\n';
}

export function exportFileName(format: ExportFormat, from: string | null, to: string | null): string {
  const span = from && to ? (monthKey(from) === monthKey(to) ? monthKey(from) : `${from}_to_${to}`) : 'all';
  const kind = format === 'detailed' ? 'receipts-detailed' : `quickbooks-${format === 'qbo_3col' ? '3col' : '4col'}`;
  return `${kind}-${span}.csv`;
}

// ─── Tax settings samples ────────────────────────────────────────────────────

/**
 * Which taxes a province charges, with SAMPLE recoverable percentages.
 *
 * The percentages are placeholders to edit, never facts: what a camp recovers depends on whether
 * it is a charity or public service body, what it bought and where. Every screen that offers
 * these says "Confirm these with your finance director".
 */
export function sampleTaxRules(province: string | null): TaxRule[] {
  const p = (province ?? '').toUpperCase();
  const sample: Record<TaxType, number> = { GST: 50, HST: 50, PST: 0, QST: 50, other: 0 };
  let types: TaxType[];
  if (['ON', 'NB', 'NL', 'NS', 'PE'].includes(p)) types = ['HST'];
  else if (['BC', 'SK', 'MB'].includes(p)) types = ['GST', 'PST'];
  else if (p === 'QC') types = ['GST', 'QST'];
  else types = ['GST'];
  return types.map((type) => ({ type, recoverablePct: sample[type] }));
}

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;
