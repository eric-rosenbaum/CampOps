import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  toCents, parseMoney, mathCheck, parseStatementDate, guessDateOrder, guessStatementMapping,
  parseStatementCsv, autoMatch, findDuplicates, allocateCents, receiptAllocations,
  spendSummary, reconcileSummary, vendorSimilarity, qboDescription, csvText,
  dominantMonth, monthBounds, exportFileName, formatMoney, recoverableCents, hstParts, taxPreset,
  detectClaimBasis, rankAttachCandidates, buildStatementExport, toStatementCsv, openReceiptsForMonth, formatDate,
  duplicatePartner, type MonthInput,
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
    deferredMonth: null, deferredNote: null, exportId: null, exportedAt: null, createdAt: '2026-08-01T12:00:00Z', updatedAt: '2026-08-01T12:00:00Z',
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
  it('pairs the same total, a day apart and a similar vendor, oldest first', () => {
    const out = findDuplicates([
      receipt({ ...base, id: 'second', purchaseDate: '2026-08-21', vendor: 'Blue Heron Marine Ltd.', createdAt: '2026-08-22T10:00:00Z' }),
      receipt({ ...base, id: 'first', purchaseDate: '2026-08-20', createdAt: '2026-08-21T10:00:00Z' }),
    ]);
    expect(out).toEqual([{ originalId: 'first', duplicateId: 'second', similarity: 1, crossCard: false }]);
  });
  it('finds the copy snapped onto another card, and says so', () => {
    // The finance director's case: the holder's copy on ··4821, finance's copy of the emailed
    // invoice on ··1156. Detection used to require the same card and missed it.
    const a = receipt({ ...base, id: 'a', purchaseDate: '2026-08-20', createdAt: '2026-08-20T00:00:00Z' });
    const b = receipt({ ...base, id: 'b', cardId: 'c2', purchaseDate: '2026-08-21', createdAt: '2026-08-27T00:00:00Z' });
    const pairs = findDuplicates([b, a]);
    expect(pairs).toEqual([{ originalId: 'a', duplicateId: 'b', similarity: 1, crossCard: true }]);
    expect(duplicatePartner(pairs, 'b')).toEqual({ otherId: 'a', isCopy: true, crossCard: true });
    expect(duplicatePartner(pairs, 'a')).toEqual({ otherId: 'b', isCopy: false, crossCard: true });
    expect(duplicatePartner(pairs, 'x')).toBeNull();
  });
  it('ignores a different cent, two days apart, another vendor or a dismissed flag', () => {
    const a = receipt({ ...base, id: 'a', purchaseDate: '2026-08-20', createdAt: '2026-08-20T00:00:00Z' });
    const b = (over: Partial<Receipt>) => receipt({ ...base, id: 'b', purchaseDate: '2026-08-20', createdAt: '2026-08-21T00:00:00Z', ...over });
    expect(findDuplicates([a, b({ total: 212.48 })])).toEqual([]);
    expect(findDuplicates([a, b({ purchaseDate: '2026-08-22' })])).toEqual([]);
    expect(findDuplicates([a, b({ vendor: 'Trillium Fuel' })])).toEqual([]);
    expect(findDuplicates([a, b({ duplicateDismissed: true })])).toEqual([]);
    expect(findDuplicates([a, b({ purchaseDate: '2026-08-19' })])).toHaveLength(1);
  });
});

describe('attaching a receipt to a charge', () => {
  const charge = line({ id: 'gas', description: 'MAPLE RIDGE GAS BAR #0423 HUNTSVILLE ON', amount: 64.37, postedDate: '2026-08-22' });
  const receipts = [
    // The reviewer's case: a different vendor, close in amount and date, came first.
    receipt({ id: 'pine', cardId: 'c1', vendor: 'Pinegrove General Store', total: 64.12, purchaseDate: '2026-08-20' }),
    receipt({ id: 'maple', cardId: 'c2', vendor: 'Maple Ridge Gas Bar', total: 64.37, purchaseDate: '2026-09-18' }),
    receipt({ id: 'heron', cardId: 'c1', vendor: 'Blue Heron Marine', total: 64.37, purchaseDate: '2026-06-01' }),
    receipt({ id: 'undated', cardId: 'c1', vendor: 'Birchbark Bakery', total: 12, purchaseDate: null }),
    receipt({ id: 'taken', cardId: 'c1', vendor: 'Maple Ridge Gas Bar', total: 64.37, purchaseDate: '2026-08-21' }),
    receipt({ id: 'busy', cardId: 'c1', vendor: 'Maple Ridge Gas Bar', total: 64.37, purchaseDate: '2026-08-21', status: 'processing' }),
  ];
  const opts = { cardId: 'c1', excludeIds: new Set(['taken']) };

  it('ranks by vendor likeness first, then amount and date, on any card', () => {
    const out = rankAttachCandidates(charge, receipts, opts);
    expect(out.map((c) => c.receipt.id)).toEqual(['maple', 'pine', 'undated']);
    expect(out[0]).toMatchObject({ diffCents: 0, dateDiff: -27, otherCard: true });
    expect(out[0].similarity).toBeGreaterThan(0.9);
  });
  it('without a search, leaves out receipts dated more than 45 days away, matched ones and ones still reading', () => {
    const ids = rankAttachCandidates(charge, receipts, opts).map((c) => c.receipt.id);
    expect(ids).not.toContain('heron');
    expect(ids).not.toContain('taken');
    expect(ids).not.toContain('busy');
  });
  it('searches every open receipt by vendor text or amount', () => {
    // "gas" found nothing before, because the list was filtered to the card's own week.
    expect(rankAttachCandidates(charge, receipts, { ...opts, query: 'gas' }).map((c) => c.receipt.id)).toEqual(['maple']);
    expect(rankAttachCandidates(charge, receipts, { ...opts, query: 'heron' }).map((c) => c.receipt.id)).toEqual(['heron']);
    expect(rankAttachCandidates(charge, receipts, { ...opts, query: '$64.37' }).map((c) => c.receipt.id)).toEqual(['maple', 'heron']);
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
      { budgetCodeId: 'PRG', subtotalCents: 71428, taxes: { GST: 3572, HST: 0, PST: 5000, QST: 0, other: 0 }, hst: { federal: 0, provincial: 0 }, tipCents: 0, totalCents: 80000 },
      { budgetCodeId: 'ARTS', subtotalCents: 30884, taxes: { GST: 1544, HST: 0, PST: 2162, QST: 0, other: 0 }, hst: { federal: 0, provincial: 0 }, tipCents: 0, totalCents: 34590 },
    ]);
  });

  it('splits a split receipt’s HST into federal and provincial parts that add back per code', () => {
    const allocs = receiptAllocations(receipt({
      subtotal: 300, taxes: [{ type: 'HST', ratePct: 13, amount: 39 }], total: 339, budgetCodeId: 'A', splits: [{ budgetCodeId: 'B', amount: 113 }],
    }));
    expect(allocs.map((a) => a.hst)).toEqual([{ federal: 500, provincial: 800 }, { federal: 1000, provincial: 1600 }]);
    for (const a of allocs) expect(a.hst.federal + a.hst.provincial).toBe(a.taxes.HST);
  });

  it('sums a month to the cent, by code and by tax type, leaving out unconfirmed and foreign-currency receipts', () => {
    const codes = [{ id: 'PRG', code: 'PRG', name: 'Programs', sortOrder: 1 }, { id: 'KIT', code: 'KIT', name: 'Kitchen', sortOrder: 2 }];
    const receipts = [
      // Forty $0.10 + 1¢ HST receipts: the float sum drifts, the cent sum does not.
      ...Array.from({ length: 40 }, (_, i) => receipt({ id: `p${i}`, purchaseDate: '2026-08-02', subtotal: 0.09, taxes: [{ type: 'HST', ratePct: 13, amount: 0.01 }], total: 0.1, budgetCodeId: 'PRG' })),
      receipt({ id: 'k', purchaseDate: '2026-07-30', subtotal: 100, taxes: [{ type: 'GST', ratePct: 5, amount: 5 }, { type: 'PST', ratePct: 7, amount: 7 }], total: 112, budgetCodeId: 'KIT', status: 'exported' }),
      receipt({ id: 'n', purchaseDate: '2026-08-03', total: 999, status: 'needs_review' }),
      receipt({ id: 'u', purchaseDate: '2026-08-03', total: 50, currency: 'USD' }),
      receipt({ id: 'x', purchaseDate: '2026-08-04', total: 3.33, budgetCodeId: null }),
    ];
    const s = spendSummary(receipts, codes, [{ type: 'HST', recoverablePct: 50 }, { type: 'GST', recoverablePct: 50 }]);
    expect(s.totals.totalCents).toBe(400 + 11200 + 333);
    expect(s.totals.taxes).toEqual({ GST: 500, HST: 40, PST: 700, QST: 0, other: 0 });
    // Rounded per receipt (half a cent up, forty times) and then added: 40¢ of HST at 50% is an
    // estimate of 40¢, where rounding once on the total said 20¢ and disagreed with its own rows.
    expect(s.recoverable).toEqual({ byType: { GST: 250, HST: 40, PST: 0, QST: 0, other: 0 }, totalCents: 290 });
    expect(s.byMonth.map((m) => [m.key, m.count, m.totalCents, m.exportedCount])).toEqual([['2026-07', 1, 11200, 1], ['2026-08', 41, 733, 0]]);
    expect(s.byCode.map((c) => [c.label, c.count, c.totalCents])).toEqual([['PRG · Programs', 40, 400], ['KIT · Kitchen', 1, 11200], ['Not coded yet', 1, 333]]);
    expect(s.needsReviewCount).toBe(1);
    expect(s.otherCurrency).toEqual({ count: 1, totalCents: 5000, currency: 'USD' });
  });

  it('every table’s recoverable total is the sum of its rounded rows (no $169.02 against $169.00)', () => {
    // The demo month that showed it: eight budget codes whose rows added to $169.02 under a total
    // of $169.00. Twenty receipts of assorted HST amounts, across codes and two months.
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c, i) => ({ id: c, code: c, name: c, sortOrder: i }));
    const subtotals = [188.04, 75, 30.47, 42.65, 312.39, 77.46, 18.99, 142, 264.18, 612.4, 58.2, 129.75, 22.1, 96.33, 146.8, 64.12, 88.45, 119.99, 35.6, 50.5];
    const receipts = subtotals.map((sub, i) => {
      const hst = Math.round(sub * 13) / 100;
      return receipt({ id: `r${i}`, purchaseDate: i % 3 ? '2026-08-10' : '2026-07-10', subtotal: sub, taxes: [{ type: 'HST', ratePct: 13, amount: hst }], total: Math.round((sub + hst) * 100) / 100, budgetCodeId: codes[i % 8].id });
    });
    for (const rules of [[{ type: 'HST' as const, recoverablePct: 50 }], taxPreset('psb', 'ON'), taxPreset('itc', 'ON')]) {
      const s = spendSummary(receipts, codes, rules, 'CAD', 'ON');
      const sum = (rows: { recoverableCents: number }[]) => rows.reduce((t, r) => t + r.recoverableCents, 0);
      expect(sum(s.byCode)).toBe(s.totals.recoverableCents);
      expect(sum(s.byMonth)).toBe(s.totals.recoverableCents);
      expect(Object.values(s.recoverable.byType).reduce((t, v) => t + v, 0)).toBe(s.totals.recoverableCents);
      expect(s.recoverable.totalCents).toBe(s.totals.recoverableCents);
    }
  });
});

describe('HST parts and how a camp claims tax back', () => {
  it('splits HST at the rate on the receipt, else the province’s, to the cent', () => {
    expect(hstParts(975, 13)).toEqual({ federal: 375, provincial: 600 });
    expect(hstParts(1007, 13)).toEqual({ federal: 387, provincial: 620 });
    expect(hstParts(1400, null, 'NS')).toEqual({ federal: 500, provincial: 900 });
    expect(hstParts(1500, null, 'NB')).toEqual({ federal: 500, provincial: 1000 });
    // A 15% Nova Scotia receipt from before April 2025 keeps its own rate.
    expect(hstParts(1500, 15, 'NS')).toEqual({ federal: 500, provincial: 1000 });
    expect(hstParts(-975, 13)).toEqual({ federal: -375, provincial: -600 });
    for (const c of [1, 2, 3, 99, 1001, 123457]) {
      const p = hstParts(c, 13);
      expect(p.federal + p.provincial).toBe(c);
    }
  });

  it('offers the three presets, filled in for the province (CRA RC4034, Revenu Québec)', () => {
    expect(taxPreset('psb', 'ON')).toEqual([
      { type: 'HST', recoverablePct: 69.69, federalPct: 50, provincialPct: 82 },
      { type: 'GST', recoverablePct: 50 },
    ]);
    expect(taxPreset('psb', 'NS')[0]).toEqual({ type: 'HST', recoverablePct: 50, federalPct: 50, provincialPct: 50 });
    expect(taxPreset('psb', 'PE')[0]).toMatchObject({ federalPct: 50, provincialPct: 50 });
    expect(taxPreset('psb', 'QC')).toEqual([{ type: 'GST', recoverablePct: 50 }, { type: 'QST', recoverablePct: 50 }]);
    expect(taxPreset('psb', 'BC')).toEqual([{ type: 'GST', recoverablePct: 50 }, { type: 'PST', recoverablePct: 0 }]);
    // Resident outside the HST provinces: no rebate of HST's provincial part (CRA GI-178).
    expect(taxPreset('psb', 'AB')).toEqual([{ type: 'GST', recoverablePct: 50 }, { type: 'HST', recoverablePct: 19.23, federalPct: 50, provincialPct: 0 }]);
    expect(taxPreset('itc', 'ON')).toEqual([{ type: 'HST', recoverablePct: 100, federalPct: 100, provincialPct: 100 }, { type: 'GST', recoverablePct: 100 }]);
    expect(taxPreset('itc', 'SK')).toEqual([{ type: 'GST', recoverablePct: 100 }, { type: 'PST', recoverablePct: 0 }]);
    expect(taxPreset('none', 'ON').every((r) => r.recoverablePct === 0 && (r.federalPct ?? 0) === 0 && (r.provincialPct ?? 0) === 0)).toBe(true);
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('recognises a preset, and calls anything edited custom', () => {
    expect(detectClaimBasis(taxPreset('psb', 'ON'), 'ON')).toBe('psb');
    expect(detectClaimBasis([...taxPreset('itc', 'QC')].reverse(), 'QC')).toBe('itc');
    const edited = taxPreset('psb', 'ON').map((r) => (r.type === 'HST' ? { ...r, provincialPct: 80 } : r));
    expect(detectClaimBasis(edited, 'ON')).toBe('custom');
    expect(detectClaimBasis([{ type: 'HST', recoverablePct: 50 }, { type: 'GST', recoverablePct: 50 }], 'ON')).toBe('custom');
  });

  it('estimates an Ontario charity’s rebate part by part, cent-exact', () => {
    const [a] = receiptAllocations(receipt({ subtotal: 75, taxes: [{ type: 'HST', ratePct: 13, amount: 9.75 }], total: 84.75 }), 'ON');
    // Federal $3.75 × 50% = $1.875 → $1.88; provincial $6.00 × 82% = $4.92.
    expect(recoverableCents(a, taxPreset('psb', 'ON'))).toEqual({ byType: { GST: 0, HST: 680, PST: 0, QST: 0, other: 0 }, totalCents: 680 });
    expect(recoverableCents(a, taxPreset('itc', 'ON')).totalCents).toBe(975);
    expect(recoverableCents(a, taxPreset('none', 'ON')).totalCents).toBe(0);
    // A flat rule on an unsplit HST still works, as typed.
    expect(recoverableCents(a, [{ type: 'HST', recoverablePct: 50 }]).totalCents).toBe(488);
    // QST at a fractional percentage stays exact in integer arithmetic.
    expect(recoverableCents({ taxes: { GST: 0, HST: 0, PST: 0, QST: 10000, other: 0 }, hst: { federal: 0, provincial: 0 } }, [{ type: 'QST', recoverablePct: 9.975 }]).byType.QST).toBe(998);
  });
});

describe('does a card-month agree with the bill?', () => {
  const tz = 'America/Toronto';
  const input = (over: Partial<MonthInput>): MonthInput => ({
    statement: { statementTotal: -329.85 }, cardId: 'c1', month: '2026-08', lines: [], matchedReceiptIds: new Set(), receipts: [], timeZone: tz, ...over,
  });
  const receipts = [receipt({ id: 'a', total: 84.75, purchaseDate: '2026-08-02' }), receipt({ id: 'b', total: 23.4, purchaseDate: '2026-08-06' })];
  const baseLines = () => [
    line({ id: '1', amount: 84.75, matchState: 'matched', receiptId: 'a' }),
    line({ id: '2', amount: 23.4, matchState: 'matched', receiptId: 'b' }),
    line({ id: '3', amount: 62, matchState: 'unmatched' }),
    line({ id: '4', amount: -500 }),
  ];
  const matchedIds = new Set(['a', 'b']);
  const codes = (s: { blockers: { code: string }[] }) => s.blockers.map((b) => b.code);

  it('agrees only when the lines add up and every charge is explained', () => {
    const lines = baseLines();
    const open = reconcileSummary(input({ lines, receipts, matchedReceiptIds: matchedIds }));
    expect(open).toMatchObject({ netCents: -32985, chargesCents: 17015, creditsCents: 50000, statementAddsUp: true, unresolvedCount: 1, agrees: false });
    expect(open.reasons).toEqual(['1 charge still has no receipt or reason.']);

    lines[2] = { ...lines[2], matchState: 'no_receipt_ok' };
    expect(reconcileSummary(input({ lines, receipts, matchedReceiptIds: matchedIds }))).toMatchObject({ agrees: true, blockers: [], matchedReceiptCents: 10815, noReceiptOkCents: 6200 });
    expect(codes(reconcileSummary(input({ statement: { statementTotal: -329.84 }, lines, receipts, matchedReceiptIds: matchedIds })))).toEqual(['total_mismatch']);
    expect(codes(reconcileSummary(input({ statement: { statementTotal: null }, lines, receipts, matchedReceiptIds: matchedIds })))).toEqual(['total_missing']);
    expect(reconcileSummary(input({ statement: null, lines: [], receipts, matchedReceiptIds: matchedIds })).agrees).toBe(false);
  });

  const settled = () => baseLines().map((l) => (l.id === '3' ? { ...l, matchState: 'no_receipt_ok' as const } : l));

  it('does not agree while a matched receipt still needs review', () => {
    const r = [receipts[0], { ...receipts[1], status: 'needs_review' as const }];
    const s = reconcileSummary(input({ lines: settled(), receipts: r, matchedReceiptIds: matchedIds }));
    expect(s.agrees).toBe(false);
    expect(s.blockers).toEqual([{ code: 'matched_needs_review', count: 1, message: '1 matched receipt still needs review.' }]);
    expect(s.matchedNeedsReviewIds).toEqual(['b']);
  });

  it('checks each matched receipt against its own charge, not only the sums', () => {
    // $1 too much on one and $1 too little on the other add up to the right total.
    const r = [{ ...receipts[0], total: 85.75 }, { ...receipts[1], total: 22.4 }];
    const s = reconcileSummary(input({ lines: settled(), receipts: r, matchedReceiptIds: matchedIds }));
    expect(s.matchedReceiptCents).toBe(s.matchedLineCents);
    expect(codes(s)).toEqual(['amount_differs']);
    expect(s.amountDiffersLineIds).toEqual(['1', '2']);
  });

  it('does not agree with a receipt on the card that has no charge, until it is resolved', () => {
    const orphan = receipt({ id: 'o', total: 212.49, purchaseDate: '2026-08-20' });
    const all = [...receipts, orphan];
    const s = reconcileSummary(input({ lines: settled(), receipts: all, matchedReceiptIds: matchedIds }));
    expect(s.blockers).toEqual([{ code: 'no_charge', count: 1, message: '1 receipt on this card has no charge.' }]);
    expect(s.noCharge.map((r) => r.id)).toEqual(['o']);
    // Posts next month: set aside from August, it stops blocking August…
    const aside = [...receipts, { ...orphan, deferredMonth: '2026-08-01' }];
    expect(reconcileSummary(input({ lines: settled(), receipts: aside, matchedReceiptIds: matchedIds })).agrees).toBe(true);
    // …and turns up in September, where its charge should be.
    expect(openReceiptsForMonth({ cardId: 'c1', month: '2026-09', matchedReceiptIds: matchedIds, receipts: aside, timeZone: tz }).noCharge.map((r) => r.id)).toEqual(['o']);
    // Wrong card: moved off, it is the other card's to explain.
    expect(reconcileSummary(input({ lines: settled(), receipts: [...receipts, { ...orphan, cardId: 'c2' }], matchedReceiptIds: matchedIds })).agrees).toBe(true);
    // Matched to a charge on another statement: accounted for.
    expect(reconcileSummary(input({ lines: settled(), receipts: all, matchedReceiptIds: new Set(['a', 'b', 'o']) })).agrees).toBe(true);
    // Still being read: not yet anyone's to explain.
    expect(reconcileSummary(input({ lines: settled(), receipts: [...receipts, { ...orphan, status: 'processing' as const }], matchedReceiptIds: matchedIds })).agrees).toBe(true);
  });

  it('shows an undated receipt snapped this month or next, by camp time, and does not agree with it', () => {
    // 02:00 UTC on September 1st is still August 31st in Ontario.
    const undated = receipt({ id: 'u', total: 87.53, purchaseDate: null, createdAt: '2026-09-01T02:00:00Z' });
    const s = reconcileSummary(input({ lines: settled(), receipts: [...receipts, undated], matchedReceiptIds: matchedIds }));
    expect(codes(s)).toEqual(['undated']);
    expect(s.undated.map((r) => r.id)).toEqual(['u']);
    expect(openReceiptsForMonth({ cardId: 'c1', month: '2026-06', matchedReceiptIds: matchedIds, receipts: [undated], timeZone: tz }).undated).toEqual([]);
    expect(openReceiptsForMonth({ cardId: 'c1', month: '2026-08', matchedReceiptIds: matchedIds, receipts: [{ ...undated, createdAt: '2026-10-02T12:00:00Z' }], timeZone: tz }).undated).toEqual([]);
    expect(openReceiptsForMonth({ cardId: 'c1', month: '2026-08', matchedReceiptIds: matchedIds, receipts: [{ ...undated, createdAt: '2026-09-20T12:00:00Z' }], timeZone: tz }).undated).toHaveLength(1);
  });

  it('lists every blocker at once', () => {
    const lines = baseLines();
    const r = [receipts[0], { ...receipts[1], status: 'needs_review' as const }, receipt({ id: 'o', total: 5, purchaseDate: '2026-08-09' }), receipt({ id: 'u', total: 6, purchaseDate: null, createdAt: '2026-08-30T15:00:00Z' })];
    const s = reconcileSummary(input({ statement: { statementTotal: 1 }, lines, receipts: r, matchedReceiptIds: matchedIds }));
    expect(codes(s)).toEqual(['total_mismatch', 'unexplained', 'matched_needs_review', 'no_charge', 'undated']);
  });
});

describe('QuickBooks exports follow the statement', () => {
  const golden = (name: string) => fixture(`src/lib/__tests__/fixtures/receipts/${name}`);
  const codes = [
    { id: 'MAINT', code: 'MAINT', name: 'Maintenance', qbAccount: 'Repairs & Maintenance' },
    { id: 'FOOD', code: 'FOOD', name: 'Food', qbAccount: 'Program Food' },
    { id: 'PRG', code: 'PRG', name: 'Programs', qbAccount: 'Program Supplies' },
    { id: 'ARTS', code: 'ARTS', name: 'Arts', qbAccount: 'Program Supplies:Arts' },
    { id: 'TRIP', code: 'TRIP', name: 'Trips', qbAccount: 'Travel' },
  ];
  const card = { id: 'c1', label: 'Visa ··4821', holderName: 'Hana Holder', last4: '4821', defaultBudgetCodeId: 'MAINT' };
  const receipts = [
    receipt({ id: 'a1', vendor: 'Northwind Hardware', purchaseDate: '2026-08-03', subtotal: 75, taxes: [{ type: 'HST', ratePct: 13, amount: 9.75 }], total: 84.75, budgetCodeId: 'MAINT', purpose: 'Dock hinges + screws', submitterName: 'Hana Holder' }),
    receipt({ id: 'b2', vendor: 'Café Birchbark, Bakery', purchaseDate: '2026-08-06', subtotal: 23.4, taxes: [], total: 23.4, budgetCodeId: 'FOOD', purpose: '=cmd', submitterName: 'Teddy Admin' }),
    receipt({ id: 'c3', vendor: 'Loons Landing Craft Supply', purchaseDate: '2026-08-10', subtotal: 1023.12, taxes: [{ type: 'GST', ratePct: 5, amount: 51.16 }, { type: 'PST', ratePct: 7, amount: 71.62 }], total: 1145.9, budgetCodeId: 'ARTS', splits: [{ budgetCodeId: 'PRG', amount: 800 }], purpose: 'Craft week' }),
    receipt({ id: 'd4', vendor: "The Loon's Nest Grill", purchaseDate: '2026-08-08', subtotal: 142, taxes: [{ type: 'HST', ratePct: 13, amount: 18.46 }], tip: 25, total: 185.46, budgetCodeId: 'TRIP', purpose: 'Staff dinner, canoe trip' }),
  ];
  // Deliberately out of order: rows are sorted by posted date, so the same statement always gives the same bytes.
  const lines = [
    line({ id: 'l7', postedDate: '2026-08-25', description: 'PAYMENT - THANK YOU', amount: -500 }),
    line({ id: 'l1', postedDate: '2026-08-04', description: 'NORTHWIND HARDWARE #214', amount: 84.75, matchState: 'matched', receiptId: 'a1' }),
    line({ id: 'l5', postedDate: '2026-08-23', description: 'NETFLIX.COM', amount: 16.99, matchState: 'personal', note: 'Hana repays in September' }),
    line({ id: 'l2', postedDate: '2026-08-07', description: 'SQ *BIRCHBARK BAKERY', amount: 23.4, matchState: 'matched', receiptId: 'b2' }),
    line({ id: 'l3', postedDate: '2026-08-11', description: 'LOONS LANDING CRAFT', amount: 1145.9, matchState: 'matched', receiptId: 'c3' }),
    line({ id: 'l4', postedDate: '2026-08-22', description: 'MAPLE RIDGE GAS BAR', amount: 64.37, matchState: 'no_receipt_ok', note: 'Pump receipt lost + truck fuel' }),
    line({ id: 'l6', postedDate: '2026-08-13', description: 'NORTHWIND HARDWARE RETURN', amount: -10 }),
    line({ id: 'l8', postedDate: '2026-08-09', description: 'THE LOONS NEST GRILL', amount: 185.46, matchState: 'matched', receiptId: 'd4' }),
  ];
  const statementTotal = 1010.87;
  const ex = buildStatementExport({ card, month: '2026-08', statement: { statementTotal }, lines, receipts, codes, province: 'ON' });
  const col = (csv: string, name: string) => {
    const grid = parseCsv(csv);
    const i = grid[0].indexOf(name);
    return grid.slice(1).reduce((s, r) => s + toCents(Number(r[i] || 0)), 0);
  };

  it('reconciles to the statement: exported rows + personal (+ credits for bills) = the bill', () => {
    expect(ex.netCents).toBe(101087);
    expect(ex).toMatchObject({ bankRowCount: 7, personalCount: 1, personalCents: 1699, creditCount: 2, creditsCents: -51000, billCount: 5 });
    expect(ex.bankRowsCents + ex.personalCents).toBe(toCents(statementTotal));
    expect(ex.billsCents + ex.personalCents + ex.creditsCents).toBe(toCents(statementTotal));
    // The no-receipt-needed charge is in, under the card's default account, with its note.
    const gas = ex.rows.find((r) => r.lineId === 'l4')!;
    expect(gas).toMatchObject({ treatment: 'no_receipt', amountCents: 6437, note: 'Pump receipt lost + truck fuel' });
    expect(gas.parts).toEqual([expect.objectContaining({ account: 'Repairs & Maintenance', totalCents: 6437 })]);
  });

  it('writes files whose amounts add up to that reconciliation, in every format', () => {
    const b3 = toStatementCsv(ex, 'qbo_bank_3col', 'DD/MM/YYYY');
    expect(-col(b3, 'Amount')).toBe(ex.bankRowsCents);
    const b4 = toStatementCsv(ex, 'qbo_bank_4col', 'DD/MM/YYYY');
    expect(col(b4, 'Debit') - col(b4, 'Credit')).toBe(ex.bankRowsCents);
    const bills = toStatementCsv(ex, 'qbo_bills', 'DD/MM/YYYY');
    expect(col(bills, 'Line Amount') + col(bills, 'Line Tax Amount')).toBe(ex.billsCents);
    const review = toStatementCsv(ex, 'detailed', 'YYYY-MM-DD');
    expect(col(review, 'Charge amount')).toBe(toCents(statementTotal));
    expect(col(review, 'Total')).toBe(toCents(statementTotal));
    expect(col(review, 'HST federal part') + col(review, 'HST provincial part')).toBe(col(review, 'HST'));
  });

  // Golden files. Regenerated deliberately on 2026-09-16 when exports moved from receipts to the
  // statement: each was read line by line against the statement above before being committed.
  it('writes the bank upload, 3 columns, exactly', () => {
    expect(toStatementCsv(ex, 'qbo_bank_3col', 'DD/MM/YYYY')).toBe(golden('statement_bank_3col.golden.csv'));
  });
  it('writes the bank upload, 4 columns, exactly, in mm/dd/yyyy when asked', () => {
    expect(toStatementCsv(ex, 'qbo_bank_4col', 'MM/DD/YYYY')).toBe(golden('statement_bank_4col.golden.csv'));
  });
  it('writes the bills import exactly: account and tax per line, tips untaxed, no personal or credits', () => {
    expect(toStatementCsv(ex, 'qbo_bills', 'DD/MM/YYYY', { last4: '4821' })).toBe(golden('statement_bills.golden.csv'));
  });
  it('writes the review spreadsheet exactly, every line including personal and credits', () => {
    expect(toStatementCsv(ex, 'detailed', 'YYYY-MM-DD', { appOrigin: 'https://app.example' })).toBe(golden('statement_review.golden.csv'));
  });

  it('keeps QuickBooks text to what its importer accepts, without eating ordinary punctuation', () => {
    expect(qboDescription('Café « Ôrange » — #12, "Best"')).toBe('Cafe Orange - #12, Best');
    expect(qboDescription('Pump receipt lost + truck fuel: 50% off!')).toBe('Pump receipt lost + truck fuel: 50% off!');
    expect(qboDescription('=cmd')).toBe('cmd');
    expect(qboDescription('x'.repeat(150))).toHaveLength(100);
  });
  it('defuses spreadsheet formulas in text cells, and only those', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText('+cmd|x')).toBe(`'+cmd|x`);
    expect(csvText('+2 bags of ice')).toBe('+2 bags of ice');
    expect(csvText('- returned')).toBe('- returned');
    expect(csvText('plain')).toBe('plain');
  });
  it('names each file by format, card and month, and writes the date format asked for', () => {
    expect(exportFileName('qbo_bills', ex.cardSlug, '2026-08')).toBe('quickbooks-bills-visa-4821-2026-08.csv');
    expect(exportFileName('detailed', 'visa-1156', '2026-08')).toBe('receipts-review-visa-1156-2026-08.csv');
    expect(formatDate('2026-08-03', 'DD/MM/YYYY')).toBe('03/08/2026');
    expect(formatDate('2026-08-03', 'MM/DD/YYYY')).toBe('08/03/2026');
    expect(formatDate('2026-08-03', 'YYYY-MM-DD')).toBe('2026-08-03');
  });
});
