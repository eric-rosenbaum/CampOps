import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
// @ts-expect-error -- a plain .mjs module shared with the photo renderer and the seed generator
import { DEMO_CARDS, DEMO_RECEIPTS, demoReceiptMoney, demoPhotoFile } from '../../../scripts/demo-receipts.mjs';
import { formatPrintedDate } from '@/lib/demoReceiptPhotos';
import { findDuplicates, mathCheck, toCents } from '@/lib/receipts';

type DemoReceipt = { k: number; card: 'A' | 'B' | 'C'; copyOf?: number; vendor?: string; items?: [string, number, string?][]; zeroRated?: boolean; day?: number | null };

const root = path.resolve(__dirname, '../../..');
const migration = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8').includes('FUNCTION public.seed_demo_receipts_internal'))
  .sort().pop()!;
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', migration), 'utf8');

describe('the demo receipts, their photos and the seed agree', () => {
  it('the latest seed migration is generated from scripts/demo-receipts.mjs', () => {
    expect(migration).toBe('20260919092000_every_demo_receipt_has_its_photo_and_groceries_carry_no_tax.sql');
    for (const r of DEMO_RECEIPTS as DemoReceipt[]) {
      const m = demoReceiptMoney(r);
      const row = new RegExp(`\\(${r.k}, '${r.card}', [^\\n]*${m.total.toFixed(2)}, [^\\n]*'${demoPhotoFile(r)}'\\)`);
      expect(sql, `receipt ${r.k}`).toMatch(row);
    }
  });

  it('every receipt adds up: items to the subtotal, parts to the total', () => {
    for (const r of DEMO_RECEIPTS as DemoReceipt[]) {
      const src = (r.copyOf ? (DEMO_RECEIPTS as DemoReceipt[]).find((x) => x.k === r.copyOf) : r)!;
      const m = demoReceiptMoney(r);
      expect(src.items!.reduce((s, i) => s + toCents(i[1]), 0)).toBe(toCents(m.subtotal));
      expect(mathCheck({ subtotal: m.subtotal, taxes: m.taxes.map((t: { type: 'GST'; rate_pct: number; amount: number }) => ({ type: t.type, ratePct: t.rate_pct, amount: t.amount })), tip: m.tip, total: m.total }).diffCents).toBe(0);
    }
  });

  it('charges no HST on basic groceries', () => {
    const groceries = (DEMO_RECEIPTS as DemoReceipt[]).filter((r) => r.items?.some((i) => /MILK|BREAD|BUTTER|BANANAS/.test(i[0])));
    expect(groceries.length).toBeGreaterThan(0);
    for (const r of groceries) expect(demoReceiptMoney(r).taxes).toEqual([]);
  });

  it('keeps card ··4821’s story: one copy snapped twice, and no false copy across cards', () => {
    const rows = (DEMO_RECEIPTS as DemoReceipt[]).map((r) => {
      const src = (r.copyOf ? (DEMO_RECEIPTS as DemoReceipt[]).find((x) => x.k === r.copyOf) : r)!;
      return {
        id: String(r.k), cardId: r.card, total: demoReceiptMoney(r).total, vendor: src.vendor ?? null,
        purchaseDate: src.day != null ? `2026-08-${String(src.day).padStart(2, '0')}` : null,
        createdAt: `2026-08-01T00:00:${String(r.k).padStart(2, '0')}Z`, duplicateDismissed: false, status: 'ready' as const,
        aiResult: r.k > 30 ? { cardLast4: DEMO_CARDS[r.card as 'C'] } : null,
      };
    });
    expect(findDuplicates(rows, Object.entries(DEMO_CARDS).map(([id, last4]) => ({ id, last4: last4 as string })))).toEqual([
      expect.objectContaining({ originalId: '5', duplicateId: '6', crossCard: false }),
    ]);
  });

  it('has a photo for every receipt, with the date format the renderer printed', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/demo/receipts/manifest.json'), 'utf8')) as Record<string, { printedDate: string | null; format: 'YYYY-MM-DD' }>;
    for (const r of DEMO_RECEIPTS as DemoReceipt[]) {
      expect(fs.existsSync(path.join(root, 'public/demo/receipts', demoPhotoFile(r))), demoPhotoFile(r)).toBe(true);
      expect(manifest[demoPhotoFile(r)]).toBeTruthy();
    }
    expect(formatPrintedDate('2026-12-07', 'Mon D YYYY')).toBe('Dec 7 2026');
    expect(formatPrintedDate('2027-01-02', 'DD/MM/YY')).toBe('02/01/27');
    expect(formatPrintedDate('2027-01-02', 'MM/DD/YYYY')).toBe('01/02/2027');
  });
});
