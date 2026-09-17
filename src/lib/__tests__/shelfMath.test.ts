// The kitchen reviewer's camp is in Toronto, and the count that broke the numbers was taken at
// 9:56pm local, which is already the next day in UTC. Pin the zone so the test means the same
// thing on every machine.
process.env.TZ = 'America/Toronto';

import { describe, it, expect } from 'vitest';
import type { InventoryItem } from '@/lib/types';
import {
  countedDay, shelfBreakdown, orderLineMath, roundForDisplay, formatInStockUnit, addDaysStr,
  type ShelfInput,
} from '@/lib/commissaryUnits';

const LB = 453.592;
const TODAY = '2026-09-16'; // a Wednesday
const FRI = '2026-09-18';
const HORIZON = '2026-10-11';

function item(p: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'x', name: 'x', category: 'dry_goods', storageLocation: 'dry_storage', dimension: 'weight',
    baseUnit: 'g', stockUnit: 'lb', stockUnitInBase: LB, purchaseUnit: 'bag', purchaseUnitInBase: 50 * LB,
    unitPrice: 30, onHandBase: 0, parLevelBase: 0, lastCountedAt: '2026-09-17T01:56:38Z',
    shelfLifeDays: null, vendorId: null, allergens: [], dietary: [], notes: null, sortOrder: 0,
    createdAt: '', updatedAt: '', kosherType: null, ...p,
  };
}

/** Every day from `from` through the horizon, `perDay` base units. */
function daily(perDay: number, from = TODAY, to = HORIZON): Map<string, number> {
  const m = new Map<string, number>();
  for (let d = from; d <= to; d = addDaysStr(d, 1)) m.set(d, perDay);
  return m;
}

function input(p: Partial<ShelfInput>): ShelfInput {
  return { today: TODAY, menuByDate: new Map(), promisedByDate: new Map(), incomingByDate: new Map(), ...p };
}

describe('the shelf, with the kitchen reviewer’s numbers', () => {
  it('reads a 9:56pm count as that evening, not tomorrow (flour “154, counted 150”)', () => {
    expect('2026-09-17T01:56:38Z'.slice(0, 10)).toBe('2026-09-17'); // what the code used to do
    expect(countedDay('2026-09-17T01:56:38Z')).toBe(TODAY);
    const flour = item({ onHandBase: 150 * LB, parLevelBase: 50 * LB });
    const promised = new Map([[TODAY, 4 * LB], [FRI, 3 * LB]]);
    const s = shelfBreakdown(flour, input({ menuByDate: daily(5 * LB), promisedByDate: promised }), FRI, HORIZON);
    // On shelf is the count: nothing was cooked since, and today's promise is still here AND promised.
    expect(s.onShelf / LB).toBeCloseTo(150);
    expect(s.promised / LB).toBeCloseTo(7);
    expect(s.menuUse / LB).toBeCloseTo(15); // Wed, Thu, Fri
    expect(s.left / LB).toBeCloseTo(150 - 7 - 15);
  });

  it('counts menu use since an earlier count, and says so as its own term', () => {
    const flour = item({ onHandBase: 150 * LB, lastCountedAt: '2026-09-13T21:00:00Z' }); // Sun 5pm
    const s = shelfBreakdown(flour, input({ menuByDate: daily(5 * LB, '2026-09-10') }), FRI, HORIZON);
    expect(s.countedOn).toBe('2026-09-13');
    expect(s.usedSinceCount / LB).toBeCloseTo(10); // Mon, Tue
    expect(s.onShelf / LB).toBeCloseTo(140);
  });

  it('approving 5 lb moves “left” by exactly 5 lb, whatever the pickup day (was 89.4 → 20.4)', () => {
    const flour = item({ onHandBase: 150 * LB, parLevelBase: 50 * LB });
    const menu = daily(5 * LB);
    const before = shelfBreakdown(flour, input({ menuByDate: menu, promisedByDate: new Map([[FRI, 3 * LB]]) }), FRI, HORIZON);
    const after = shelfBreakdown(flour, input({ menuByDate: menu, promisedByDate: new Map([[FRI, 3 * LB], ['2026-09-25', 5 * LB]]) }), FRI, HORIZON);
    expect(after.through).toBe(before.through);
    expect((before.left - after.left) / LB).toBeCloseTo(5);
    expect(after.onShelf).toBeCloseTo(before.onShelf);
  });

  it('picking up 1.5 lb of chips changes the shelf, not what is left (was 0 left → 8.5 left)', () => {
    const menu = daily(0.9 * LB);
    const before = shelfBreakdown(item({ onHandBase: 10 * LB, parLevelBase: 6 * LB }),
      input({ menuByDate: menu, promisedByDate: new Map([[TODAY, 1.5 * LB]]) }), FRI, HORIZON);
    // mark_food_request_picked_up writes a 1.5 lb 'used' adjustment and the promise ends.
    const after = shelfBreakdown(item({ onHandBase: 8.5 * LB, parLevelBase: 6 * LB }),
      input({ menuByDate: menu }), FRI, HORIZON);
    expect((before.onShelf - after.onShelf) / LB).toBeCloseTo(1.5);
    expect(after.left / LB).toBeCloseTo(before.left / LB);
    expect(after.runOut).toBe(before.runOut);
  });

  it('a missed pickup returns the food: on shelf is unchanged and left goes up (was mozzarella 39 → 35)', () => {
    const mozz = item({ onHandBase: 35 * LB, parLevelBase: 25 * LB });
    const menu = daily(2 * LB);
    const before = shelfBreakdown(mozz, input({ menuByDate: menu, promisedByDate: new Map([[TODAY, 4 * LB]]) }), FRI, HORIZON);
    const after = shelfBreakdown(mozz, input({ menuByDate: menu }), FRI, HORIZON);
    expect(before.onShelf / LB).toBeCloseTo(35);
    expect(after.onShelf / LB).toBeCloseTo(35);
    expect((after.left - before.left) / LB).toBeCloseTo(4);
  });

  it('a past-due pickup is still promised until someone taps Picked up or Missed', () => {
    const mozz = item({ onHandBase: 35 * LB });
    const s = shelfBreakdown(mozz, input({ promisedByDate: new Map([[TODAY, 4 * LB]]) }), FRI, HORIZON);
    expect(s.promised / LB).toBeCloseTo(4);
  });

  it('“0 left” and “runs out in 9 days” cannot both be true: left and the run-out come from the same terms (apples)', () => {
    const apples = item({ dimension: 'count', baseUnit: 'each', stockUnit: 'each', stockUnitInBase: 1, onHandBase: 320, parLevelBase: 100 });
    const s = shelfBreakdown(apples, input({ menuByDate: daily(30), promisedByDate: new Map([[FRI, 40]]) }), FRI, HORIZON);
    expect(s.left).toBe(320 - 40 - 90);
    // Runs out on the first day the running shelf goes below zero: 320 − 40 on Fri − 30 a day.
    expect(s.runOut).toBe('2026-09-25');
    expect(s.cover).toBe(9);
  });

  it('a short item says how short, not 0', () => {
    const s = shelfBreakdown(item({ onHandBase: 2 * LB }), input({ menuByDate: daily(5 * LB) }), FRI, HORIZON);
    expect(s.left / LB).toBeCloseTo(-13);
    expect(s.runOut).toBe(TODAY);
    expect(s.status).toBe('critical');
  });

  it('a delivery due before the “through” date is part of what is left', () => {
    const s = shelfBreakdown(item({ onHandBase: 20 * LB }), input({ menuByDate: daily(5 * LB), incomingByDate: new Map([['2026-09-17', 50 * LB]]) }), FRI, HORIZON);
    expect(s.incoming / LB).toBeCloseTo(50);
    expect(s.left / LB).toBeCloseTo(20 - 15 + 50);
  });
});

describe('Ordering starts from the same shelf as Inventory (was 150 on one tab, 154 on the other)', () => {
  it('uses the same on-shelf figure and names every term', () => {
    const flour = item({ onHandBase: 150 * LB, parLevelBase: 50 * LB, lastCountedAt: '2026-09-13T21:00:00Z' });
    const inp = input({ menuByDate: daily(5 * LB, '2026-09-10'), promisedByDate: new Map([[TODAY, 4 * LB], [FRI, 3 * LB], ['2026-10-05', 9 * LB]]) });
    const shelf = shelfBreakdown(flour, inp, FRI, HORIZON);
    const order = orderLineMath(flour, inp, '2026-09-28');
    expect(order.onShelf).toBeCloseTo(shelf.onShelf);
    expect(order.menuUse / LB).toBeCloseTo(13 * 5); // Sep 16 … Sep 28
    expect(order.promised / LB).toBeCloseTo(7); // the Oct 5 pickup is past the window
    expect(order.projectedAtEnd / LB).toBeCloseTo(140 - 65 - 7);
    expect(order.need / LB).toBeCloseTo(0);
  });
});

describe('quantities at a precision a cook reads', () => {
  it('rounds per unit type', () => {
    expect(roundForDisplay(12.07, 'count', 'dozen')).toBe(12);
    expect(roundForDisplay(15.99, 'count', 'bag')).toBe(16);
    expect(roundForDisplay(9.6, 'count', 'can')).toBe(9.6);
    expect(roundForDisplay(319.6, 'count', 'each')).toBe(320);
    expect(roundForDisplay(0.48, 'weight', 'lb')).toBe(0.5);
    expect(roundForDisplay(89.44, 'weight', 'lb')).toBe(89.4);
    expect(roundForDisplay(20.02, 'weight', 'lb')).toBe(20);
  });

  it('formats and pluralizes in the stock unit', () => {
    const eggs = item({ dimension: 'count', baseUnit: 'each', stockUnit: 'dozen', stockUnitInBase: 12 });
    expect(formatInStockUnit(eggs, 144.84)).toBe('12 dozen');
    const lettuce = item({ dimension: 'count', baseUnit: 'each', stockUnit: 'head', stockUnitInBase: 1 });
    expect(formatInStockUnit(lettuce, 35)).toBe('35 heads');
    const crackers = item({ dimension: 'count', baseUnit: 'each', stockUnit: 'box', stockUnitInBase: 1 });
    expect(formatInStockUnit(crackers, 3)).toBe('3 boxes');
  });
});
