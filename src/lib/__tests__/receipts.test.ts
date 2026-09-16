import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  toCents, parseMoney, mathCheck, parseStatementDate, guessDateOrder, guessStatementMapping,
  parseStatementCsv, autoMatch, findDuplicates, allocateCents, receiptAllocations, estimateRecoverable,
  spendSummary, reconcileSummary, toQuickBooksCsv, vendorSimilarity, qboDescription, csvText,
  dominantMonth, taxCents, sampleTaxRules, monthBounds, exportFileName, formatMoney,
} from '@/lib/receipts';
import { parseCsv } from '@/lib/csv';
import type { Receipt, StatementLine, TaxLine } from '@/lib/receiptTypes';

const root = path.resolve(__dirname, '../../..');
const fixture = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function receipt(over: Partial<Receipt>): Receipt {
  return {
    id: 'r', campId: 'camp', cardId: 'c1', submittedBy: 'u', submitterName: null, filePath: null, fileName: null,
    fileType: null, vendor: null, purchaseDate: '2026-08-01', subtotal: null, taxes: [], tip: null, total: 0,
    currency: 'CAD', budgetCodeId: null, splits: [], purpose: null, status: 'ready', aiResult: null,
    aiMinConfidence: null, reviewedBy: null, reviewedAt: null, possibleDuplicateOf: null, duplicateDismissed: false,
    exportId: null, exportedAt: null, createdAt: '2026-08-01T12:00:00Z', updatedAt: '2026-08-01T12:00:00Z',
    ...over,
  };
}

function line(over: Partial<StatementLine>): StatementLine {
  return {
    id: 'l', statementId: 's', campId: 'camp', postedDate: '2026-08-01', description: '', amount: 0,
    matchState: 'unmatched', receiptId: null, note: null, remindedAt: null, ...over,
  };
}

describe('money', () => {
  it('rounds to cents without float drift', () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-84.755)).toBe(-8476);
    expect(toCents(null)).toBe(0);
    // Forty charges of $0.10 add to $4.00, not $3.9999999.
    expect(Array(40).fill(0.1).reduce((s, v) => s + toCents(v), 0)).toBe(400);
  });

  it('reads the ways banks write money', () => {
    expect(parseMoney('$1,234.56')).toBe(1234.56);
    expect(parseMoney('-1,156.12')).toBe(-1156.12);
    expect(parseMoney('(12.00)')).toBe(-12);
    expect(parseMoney('12.00 CR')).toBe(-12);
    expect(parseMoney('12.00-')).toBe(-12);
    expect(parseMoney('1 156,12')).toBe(1156.12);
    expect(parseMoney('84,75')).toBe(84.75);
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('1,234')).toBe(1234);
    expect(parseMoney('CAD 5')).toBe(5);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });

  it('formats as Canadian dollars with two decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(null)).toBe('—');
  });

  it('flags a total that the parts do not add up to, with two cents of slack', () => {
    const taxes: TaxLine[] = [{ type: 'HST', ratePct: 13, amount: 9.75 }];
    expect(mathCheck({ subtotal: 75, taxes, tip: null, total: 84.75 }).mismatch).toBe(false);
    expect(mathCheck({ subtotal: 75, taxes, tip: null, total: 84.77 }).mismatch).toBe(false);
    expect(mathCheck({ subtotal: 75, taxes, tip: null, total: 84.78 }).mismatch).toBe(true);
    expect(mathCheck({ subtotal: 75, taxes, tip: 10, total: 94.75 }).mismatch).toBe(false);
    const unknown = mathCheck({ subtotal: null, taxes, tip: null, total: 84.75 });
    expect(unknown.checkable).toBe(false);
    expect(unknown.mismatch).toBe(false);
  });
});

describe('statement dates', () => {
  it('parses each order, compact and named dates', () => {
    expect(parseStatementDate('08/03/2026', 'MDY')).toBe('2026-08-03');
    expect(parseStatementDate('03/08/2026', 'DMY')).toBe('2026-08-03');
    expect(parseStatementDate('2026-08-03', 'DMY')).toBe('2026-08-03');
    expect(parseStatementDate('20260803', 'MDY')).toBe('2026-08-03');
    expect(parseStatementDate('Aug 3, 2026', 'DMY')).toBe('2026-08-03');
    expect(parseStatementDate('03-Aug-2026', 'MDY')).toBe('2026-08-03');
    expect(parseStatementDate('3 août 2026', 'MDY')).toBe('2026-08-03');
    expect(parseStatementDate('20/11/2026 TUE', 'DMY')).toBe('2026-11-20');
    expect(parseStatementDate('02/30/2026', 'MDY')).toBeNull();
    expect(parseStatementDate('hello', 'MDY')).toBeNull();
  });

  it('guesses the order from a day above 12, and from the span when nothing settles it', () => {
    expect(guessDateOrder(['08/03/2026', '08/25/2026'])).toEqual({ order: 'MDY', ambiguous: false });
    expect(guessDateOrder(['03/08/2026', '25/08/2026'])).toEqual({ order: 'DMY', ambiguous: false });
    expect(guessDateOrder(['2026-08-03'])).toEqual({ order: 'YMD', ambiguous: false });
    // 08/01..08/09 is nine days in August read MDY, or nine months read DMY.
    expect(guessDateOrder(['08/01/2026', '08/05/2026', '08/09/2026'])).toEqual({ order: 'MDY', ambiguous: false });
    expect(guessDateOrder(['01/08/2026', '05/08/2026', '09/08/2026'])).toEqual({ order: 'DMY', ambiguous: false });
    expect(guessDateOrder(['05/05/2026']).ambiguous).toBe(true);
  });
});

describe('statement CSV shapes', () => {
  // The same five transactions as six banks export them: signed amounts both ways round,
  // separate debit and credit columns, no header, compact dates, day-first dates, French
  // decimal commas and thousands separators.
  const expected = [
    { postedDate: '2026-08-03', amount: 84.75 },
    { postedDate: '2026-08-06', amount: 23.4 },
    { postedDate: '2026-08-10', amount: 1156.12 },
    { postedDate: '2026-08-12', amount: -10 },
    { postedDate: '2026-08-25', amount: -500 },
  ];
  for (const bank of ['rbc', 'td', 'scotiabank', 'bmo', 'cibc', 'desjardins']) {
    it(`reads a ${bank}-style export with the guessed mapping alone`, () => {
      const text = fixture(`test-fixtures/receipts/statements/${bank}-style.csv`);
      const { mapping, warnings } = guessStatementMapping(parseCsv(text));
      const { lines, errors } = parseStatementCsv(text, mapping);
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
      expect(lines.map((l) => ({ postedDate: l.postedDate, amount: l.amount }))).toEqual(expected);
      expect(lines[0].description).toMatch(/northwind/i);
      expect(dominantMonth(lines.map((l) => l.postedDate))).toBe('2026-08');
    });
  }

  it('recognises each bank’s columns', () => {
    const cols = (bank: string) => guessStatementMapping(parseCsv(fixture(`test-fixtures/receipts/statements/${bank}-style.csv`))).mapping;
    expect(cols('rbc')).toMatchObject({ hasHeader: true, chargeSign: 'negative', dateOrder: 'MDY' });
    expect(cols('rbc').columns).toEqual(['skip', 'skip', 'date', 'skip', 'description', 'description', 'amount', 'skip']);
    expect(cols('td')).toMatchObject({ hasHeader: false, columns: ['date', 'description', 'debit', 'credit', 'skip'] });
    expect(cols('bmo')).toMatchObject({ hasHeader: true, chargeSign: 'positive', dateOrder: 'YMD' });
    expect(cols('bmo').columns).toEqual(['skip', 'skip', 'date', 'skip', 'amount', 'description']);
    expect(cols('cibc').columns).toEqual(['date', 'description', 'debit', 'credit', 'skip']);
    expect(cols('desjardins')).toMatchObject({ dateOrder: 'DMY', columns: ['date', 'description', 'debit', 'credit'] });
  });

  it('reports a row with money but no readable date instead of dropping the charge', () => {
    const text = 'Date,Description,Amount\n08/03/2026,A,5.00\nsoon,B,6.00\n,Opening balance,\n';
    const { mapping } = guessStatementMapping(parseCsv(text));
    const { lines, errors } = parseStatementCsv(text, mapping);
    expect(lines).toHaveLength(1);
    expect(errors).toEqual([{ row: 3, message: 'Row 3: "soon" is not a date' }]);
  });
});

describe('vendor similarity', () => {
  it('sees through store numbers, "SQ *", truncation and suffixes', () => {
    expect(vendorSimilarity('Northwind Hardware', 'NORTHWIND HARDWARE #214 TORONTO ON')).toBe(1);
    expect(vendorSimilarity('Birchbark Bakery', 'SQ *BIRCHBARK BAKERY')).toBe(1);
    expect(vendorSimilarity('Loons Landing Craft Supply Ltd.', 'LOONS LANDING CRAFT SUPP')).toBeGreaterThan(0.6);
    expect(vendorSimilarity('Blue Heron Marine', 'Trillium Fuel')).toBeLessThan(0.3);
    expect(vendorSimilarity(null, 'x')).toBe(0);
  });
});

describe('autoMatch', () => {
  const r = (id: string, total: number, date: string, vendor = 'Shop') => receipt({ id, total, purchaseDate: date, vendor });
  const l = (id: string, amount: number, date: string, description = 'SHOP') => line({ id, amount, postedDate: date, description });

  it('matches the only receipt of the same amount within three days, and not at four', () => {
    const out = autoMatch([l('l1', 20, '2026-08-10'), l('l2', 30, '2026-08-10')],
      [r('a', 20, '2026-08-07'), r('b', 30, '2026-08-14')]);
    expect(out).toEqual([{ lineId: 'l1', receiptId: 'a', dateDiff: 3, similarity: 1, confidence: 'exact' }]);
  });

  it('matches to the cent only', () => {
    expect(autoMatch([l('l1', 20.01, '2026-08-10')], [r('a', 20, '2026-08-10')])).toEqual([]);
  });

  it('prefers the closer date, then the closer vendor', () => {
    const byDate = autoMatch([l('l1', 50, '2026-08-10', 'NORTHWIND HARDWARE')],
      [r('far', 50, '2026-08-08', 'Northwind Hardware'), r('near', 50, '2026-08-10', 'Blue Heron Marine')]);
    expect(byDate[0]).toMatchObject({ receiptId: 'near', confidence: 'best_of_several' });
    const byVendor = autoMatch([l('l1', 50, '2026-08-10', 'NORTHWIND HARDWARE')],
      [r('x', 50, '2026-08-11', 'Blue Heron Marine'), r('y', 50, '2026-08-09', 'Northwind Hardware')]);
    expect(byVendor[0]).toMatchObject({ receiptId: 'y', confidence: 'best_of_several' });
  });

  it('never gives one receipt to two charges, and ranks the whole month before taking any', () => {
    // l1 comes first in the file but fits `a` less well than l2 does.
    const out = autoMatch([l('l1', 40, '2026-08-12'), l('l2', 40, '2026-08-10')], [r('a', 40, '2026-08-10')]);
    expect(out).toEqual([expect.objectContaining({ lineId: 'l2', receiptId: 'a' })]);
    const two = autoMatch([l('l1', 40, '2026-08-10'), l('l2', 40, '2026-08-10')], [r('a', 40, '2026-08-10'), r('b', 40, '2026-08-10')]);
    expect(new Set(two.map((m) => m.receiptId))).toEqual(new Set(['a', 'b']));
    expect(two.every((m) => m.confidence === 'tie')).toBe(true);
  });

  it('is stable: the same inputs in any order give the same pairs', () => {
    const lines = [l('l1', 40, '2026-08-10'), l('l2', 40, '2026-08-10'), l('l3', 12, '2026-08-01')];
    const receipts = [r('b', 40, '2026-08-10'), r('a', 40, '2026-08-10'), r('c', 12, '2026-08-02')];
    const one = autoMatch(lines, receipts);
    expect(autoMatch([...lines].reverse(), [...receipts].reverse())).toEqual(one);
  });

  it('skips resolved lines, credits, receipts already used and receipts still processing', () => {
    const out = autoMatch(
      [line({ id: 'done', amount: 10, postedDate: '2026-08-01', matchState: 'matched', receiptId: 'used' }),
        line({ id: 'ok', amount: 10, postedDate: '2026-08-01', matchState: 'no_receipt_ok' }),
        line({ id: 'credit', amount: -10, postedDate: '2026-08-01' }),
        line({ id: 'open', amount: 10, postedDate: '2026-08-01' })],
      [receipt({ id: 'used', total: 10, purchaseDate: '2026-08-01' }),
        receipt({ id: 'busy', total: 10, purchaseDate: '2026-08-01', status: 'processing' }),
        receipt({ id: 'free', total: 10, purchaseDate: '2026-08-04' })]);
    expect(out).toEqual([expect.objectContaining({ lineId: 'open', receiptId: 'free', dateDiff: 3 })]);
  });
});

describe('findDuplicates', () => {
  const base = { cardId: 'c1', total: 212.49, vendor: 'Blue Heron Marine' };
  it('pairs the same card, same total, a day apart and a similar vendor, oldest first', () => {
    const out = findDuplicates([
      receipt({ ...base, id: 'second', purchaseDate: '2026-08-21', vendor: 'Blue Heron Marine Ltd.', createdAt: '2026-08-22T10:00:00Z' }),
      receipt({ ...base, id: 'first', purchaseDate: '2026-08-20', createdAt: '2026-08-21T10:00:00Z' }),
    ]);
    expect(out).toEqual([{ originalId: 'first', duplicateId: 'second', similarity: 1 }]);
  });
  it('ignores a different card, a different cent, two days apart, another vendor or a dismissed flag', () => {
    const a = receipt({ ...base, id: 'a', purchaseDate: '2026-08-20', createdAt: '2026-08-20T00:00:00Z' });
    const b = (over: Partial<Receipt>) => receipt({ ...base, id: 'b', purchaseDate: '2026-08-20', createdAt: '2026-08-21T00:00:00Z', ...over });
    expect(findDuplicates([a, b({ cardId: 'c2' })])).toEqual([]);
    expect(findDuplicates([a, b({ total: 212.48 })])).toEqual([]);
    expect(findDuplicates([a, b({ purchaseDate: '2026-08-22' })])).toEqual([]);
    expect(findDuplicates([a, b({ vendor: 'Trillium Fuel' })])).toEqual([]);
    expect(findDuplicates([a, b({ duplicateDismissed: true })])).toEqual([]);
    expect(findDuplicates([a, b({ purchaseDate: '2026-08-19' })])).toHaveLength(1);
  });
});

describe('allocation and summaries', () => {
  it('splits cents so the parts add back exactly', () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateCents(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocateCents(102312, [80000, 34590])).toEqual([71428, 30884]);
    expect(allocateCents(5, [0, 0])).toEqual([5, 0]);
    for (const total of [1, 7, 999, 123457]) {
      const parts = allocateCents(total, [3, 7, 11, 13]);
      expect(parts.reduce((s, x) => s + x, 0)).toBe(total);
    }
  });

  it('divides a split receipt’s subtotal, each tax and tip in proportion, to the cent', () => {
    const allocs = receiptAllocations(receipt({
      subtotal: 1023.12, taxes: [{ type: 'GST', ratePct: 5, amount: 51.16 }, { type: 'PST', ratePct: 7, amount: 71.62 }],
      total: 1145.9, budgetCodeId: 'ARTS', splits: [{ budgetCodeId: 'PRG', amount: 800 }],
    }));
    expect(allocs).toEqual([
      { budgetCodeId: 'PRG', subtotalCents: 71428, taxes: { GST: 3572, HST: 0, PST: 5000, QST: 0, other: 0 }, tipCents: 0, totalCents: 80000 },
      { budgetCodeId: 'ARTS', subtotalCents: 30884, taxes: { GST: 1544, HST: 0, PST: 2162, QST: 0, other: 0 }, tipCents: 0, totalCents: 34590 },
    ]);
  });

  it('estimates recoverable tax once per type on the period total, half up', () => {
    // 3 receipts of $0.05 GST at 50%: per receipt that is 3 × round(2.5) = 9 cents; on the total it is round(7.5) = 8.
    const taxes = taxCents([{ type: 'GST', ratePct: 5, amount: 0.05 }, { type: 'GST', ratePct: 5, amount: 0.05 }, { type: 'GST', ratePct: 5, amount: 0.05 }]);
    expect(estimateRecoverable(taxes, [{ type: 'GST', recoverablePct: 50 }]).totalCents).toBe(8);
    // QST at a fractional percentage stays exact in integer arithmetic.
    expect(estimateRecoverable({ GST: 0, HST: 0, PST: 0, QST: 10000, other: 0 }, [{ type: 'QST', recoverablePct: 9.975 }]).byType.QST).toBe(998);
    expect(estimateRecoverable({ GST: 100, HST: 100, PST: 100, QST: 0, other: 0 }, []).totalCents).toBe(0);
  });

  it('sums a month to the cent, by code and by tax type, leaving out unconfirmed and foreign-currency receipts', () => {
    const codes = [{ id: 'PRG', code: 'PRG', name: 'Programs', sortOrder: 1 }, { id: 'KIT', code: 'KIT', name: 'Kitchen', sortOrder: 2 }];
    const receipts = [
      // Forty $0.10 + 1.3¢-ish HST receipts: the float sum drifts, the cent sum does not.
      ...Array.from({ length: 40 }, (_, i) => receipt({ id: `p${i}`, purchaseDate: '2026-08-02', subtotal: 0.09, taxes: [{ type: 'HST', ratePct: 13, amount: 0.01 }], total: 0.1, budgetCodeId: 'PRG' })),
      receipt({ id: 'k', purchaseDate: '2026-07-30', subtotal: 100, taxes: [{ type: 'GST', ratePct: 5, amount: 5 }, { type: 'PST', ratePct: 7, amount: 7 }], total: 112, budgetCodeId: 'KIT', status: 'exported' }),
      receipt({ id: 'n', purchaseDate: '2026-08-03', total: 999, status: 'needs_review' }),
      receipt({ id: 'u', purchaseDate: '2026-08-03', total: 50, currency: 'USD' }),
      receipt({ id: 'x', purchaseDate: '2026-08-04', total: 3.33, budgetCodeId: null }),
    ];
    const s = spendSummary(receipts, codes, [{ type: 'HST', recoverablePct: 50 }, { type: 'GST', recoverablePct: 50 }]);
    expect(s.totals.totalCents).toBe(400 + 11200 + 333);
    expect(s.totals.taxes).toEqual({ GST: 500, HST: 40, PST: 700, QST: 0, other: 0 });
    expect(s.recoverable).toEqual({ byType: { GST: 250, HST: 20, PST: 0, QST: 0, other: 0 }, totalCents: 270 });
    expect(s.byMonth.map((m) => [m.key, m.count, m.totalCents, m.exportedCount])).toEqual([['2026-07', 1, 11200, 1], ['2026-08', 41, 733, 0]]);
    expect(s.byCode.map((c) => [c.label, c.count, c.totalCents])).toEqual([['PRG · Programs', 40, 400], ['KIT · Kitchen', 1, 11200], ['Not coded yet', 1, 333]]);
    expect(s.needsReviewCount).toBe(1);
    expect(s.otherCurrency).toEqual({ count: 1, totalCents: 5000, currency: 'USD' });
  });

  it('says a month agrees only when the lines add up, every charge is explained and receipts equal charges', () => {
    const receipts = [receipt({ id: 'a', total: 84.75 }), receipt({ id: 'b', total: 23.4 })];
    const lines = [
      line({ id: '1', amount: 84.75, matchState: 'matched', receiptId: 'a' }),
      line({ id: '2', amount: 23.4, matchState: 'matched', receiptId: 'b' }),
      line({ id: '3', amount: 62, matchState: 'unmatched' }),
      line({ id: '4', amount: -500 }),
    ];
    const open = reconcileSummary({ statementTotal: -329.85 }, lines, receipts);
    expect(open).toMatchObject({ netCents: -32985, chargesCents: 17015, creditsCents: 50000, statementAddsUp: true, unresolvedCount: 1, agrees: false });
    expect(open.reasons).toEqual(['1 charge still has no receipt.']);

    lines[2] = { ...lines[2], matchState: 'no_receipt_ok' };
    expect(reconcileSummary({ statementTotal: -329.85 }, lines, receipts)).toMatchObject({ agrees: true, reasons: [], matchedReceiptCents: 10815, noReceiptOkCents: 6200 });
    expect(reconcileSummary({ statementTotal: -329.84 }, lines, receipts).agrees).toBe(false);
    expect(reconcileSummary(null, lines, receipts).agrees).toBe(false);
  });
});

describe('QuickBooks export', () => {
  const golden = (name: string) => fixture(`src/lib/__tests__/fixtures/receipts/${name}`);
  const ctx = {
    codes: [
      { id: 'MAINT', code: 'MAINT', name: 'Maintenance', qbAccount: 'Repairs & Maintenance' },
      { id: 'FOOD', code: 'FOOD', name: 'Food', qbAccount: 'Program Food' },
      { id: 'PRG', code: 'PRG', name: 'Programs', qbAccount: 'Program Supplies' },
      { id: 'ARTS', code: 'ARTS', name: 'Arts', qbAccount: 'Arts Supplies' },
    ],
    cards: [{ id: 'c1', label: 'Visa ··4821', holderName: 'Hana Holder' }, { id: 'c2', label: 'Visa ··7390', holderName: 'Omar Holder' }],
    appOrigin: 'https://app.example',
  };
  // Deliberately out of order: the file is sorted, so the same receipts always give the same bytes.
  const receipts = [
    receipt({ id: 'd4', cardId: 'c1', vendor: 'Northwind Hardware', purchaseDate: '2026-08-12', subtotal: -8.85, taxes: [{ type: 'HST', ratePct: 13, amount: -1.15 }], total: -10, budgetCodeId: 'MAINT', purpose: 'Returned hinge' }),
    receipt({ id: 'c3', cardId: 'c2', vendor: 'Loons Landing Craft Supply', purchaseDate: '2026-08-10', subtotal: 1023.12, taxes: [{ type: 'GST', ratePct: 5, amount: 51.16 }, { type: 'PST', ratePct: 7, amount: 71.62 }], total: 1145.9, budgetCodeId: 'ARTS', splits: [{ budgetCodeId: 'PRG', amount: 800 }], purpose: 'Craft week' }),
    receipt({ id: 'a1', cardId: 'c1', vendor: 'Northwind Hardware', purchaseDate: '2026-08-03', subtotal: 75, taxes: [{ type: 'HST', ratePct: 13, amount: 9.75 }], total: 84.75, budgetCodeId: 'MAINT', purpose: 'Dock hinges' }),
    receipt({ id: 'b2', cardId: 'c1', vendor: 'Café Birchbark, Bakery', purchaseDate: '2026-08-06', subtotal: 23.4, taxes: [], total: 23.4, budgetCodeId: 'FOOD', purpose: '=cmd' }),
  ];

  it('writes the QuickBooks Online 3-column file exactly', () => {
    expect(toQuickBooksCsv(receipts, 'qbo_3col', ctx)).toBe(golden('qbo_3col.golden.csv'));
  });
  it('writes the QuickBooks Online 4-column file exactly', () => {
    expect(toQuickBooksCsv(receipts, 'qbo_4col', ctx)).toBe(golden('qbo_4col.golden.csv'));
  });
  it('writes the detailed file exactly, one row per budget code', () => {
    expect(toQuickBooksCsv(receipts, 'detailed', ctx)).toBe(golden('detailed.golden.csv'));
  });

  it('keeps QuickBooks descriptions to characters its importer accepts', () => {
    expect(qboDescription('Café « Ôrange » — #12, "Best"')).toBe('Cafe Orange - 12 Best');
    expect(qboDescription('x'.repeat(150))).toHaveLength(100);
  });
  it('defuses spreadsheet formulas in text cells', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText('+1')).toBe(`'+1`);
    expect(csvText('plain')).toBe('plain');
  });
  it('the detailed total equals the summary total to the cent', () => {
    const csv = parseCsv(toQuickBooksCsv(receipts, 'detailed', ctx));
    const col = csv[0].indexOf('Total');
    const fileCents = csv.slice(1).reduce((s, r) => s + toCents(Number(r[col])), 0);
    expect(fileCents).toBe(spendSummary(receipts, ctx.codes.map((c, i) => ({ ...c, sortOrder: i })), []).totals.totalCents);
  });
  it('names the file by format and period', () => {
    expect(exportFileName('qbo_3col', '2026-08-01', '2026-08-31')).toBe('quickbooks-3col-2026-08.csv');
    expect(exportFileName('detailed', '2026-07-01', '2026-08-31')).toBe('receipts-detailed-2026-07-01_to_2026-08-31.csv');
  });
});

describe('tax setting samples', () => {
  it('offers the taxes each province charges, never a rate', () => {
    expect(sampleTaxRules('ON').map((r) => r.type)).toEqual(['HST']);
    expect(sampleTaxRules('BC').map((r) => r.type)).toEqual(['GST', 'PST']);
    expect(sampleTaxRules('QC').map((r) => r.type)).toEqual(['GST', 'QST']);
    expect(sampleTaxRules('AB').map((r) => r.type)).toEqual(['GST']);
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
