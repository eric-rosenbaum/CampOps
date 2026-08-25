// Dollarised waste reporting for the Commissary Waste tab.
//
// Everything here is a COUNTED FACT. It is arithmetic over waste adjustments a human
// actually logged. Nothing in this file models, projects, or extrapolates, and nothing
// here should start: the moment a modelled dollar mixes into these totals, the whole tab
// stops being quotable. Two rules enforce that:
//
//   1. A waste row whose item has no `unitPrice` has a REAL quantity and an UNKNOWABLE
//      value. It is counted in the event totals and excluded from every dollar figure,
//      and `unpricedEvents` travels with the result so the UI can say so. Substituting an
//      average price would invent money.
//   2. A row logged before categorisation existed is `uncategorised`, never assumed into
//      a bucket, and never counted as reducible.
//
// The reducible/non-reducible split is the point of the tab. See REDUCIBLE_WASTE in
// commissaryUnits.ts for why plate waste and prep loss sit outside it.

import type { InventoryAdjustment, InventoryItem, WasteCategory } from './types';
import { isReducibleWaste } from './commissaryUnits';
import { toDateStr } from './utils';

export interface WasteRow {
  adjustmentId: string;
  itemId: string;
  itemName: string;
  category: WasteCategory | null;
  reducible: boolean;
  /** Positive magnitude, in the item's base unit. Always known. */
  qtyBase: number;
  /** null when the item carries no unit price. The quantity is real, the dollars are not knowable. */
  value: number | null;
  /** Local calendar day the waste was logged. */
  date: string;
  createdAt: string;
}

export interface WasteMonth {
  /** YYYY-MM */
  key: string;
  /** e.g. "Aug '26" */
  label: string;
  reducible: number;
  other: number;
  total: number;
}

export interface WasteCategoryTotal {
  category: WasteCategory | null;
  value: number;
  events: number;
  reducible: boolean;
}

export interface WasteItemTotal {
  itemId: string;
  itemName: string;
  value: number;
  reducibleValue: number;
  events: number;
}

export interface WasteSummary {
  rows: WasteRow[];
  /** Dollar totals, over priced rows only. */
  totalValue: number;
  reducibleValue: number;
  nonReducibleValue: number;
  uncategorisedValue: number;
  /** reducibleValue / totalValue. null when there is no priced waste to take a share of. */
  reduciblePct: number | null;
  months: WasteMonth[];
  byCategory: WasteCategoryTotal[];
  byItem: WasteItemTotal[];
  // ── Coverage caveats. These exist so no consumer can render a dollar figure without
  //    being able to say what it does and does not cover.
  /** Every waste event in range, priced or not. */
  totalEvents: number;
  /** Events excluded from all dollar figures because the item has no unit price. */
  unpricedEvents: number;
  /** Events with no category, not counted as reducible, and not counted against it either. */
  uncategorisedEvents: number;
  /** Distinct items with waste in range that have no unit price set. */
  unpricedItemNames: string[];
}

/**
 * Cost of one base unit of an item, or null if it cannot be known.
 *
 * `unitPrice` is the price of one PURCHASE unit (a case, a gallon), so it has to be
 * divided down by `purchaseUnitInBase`. A zero or missing factor would divide to Infinity
 * rather than fail loudly, so it is treated as unknown.
 */
export function costPerBase(item: Pick<InventoryItem, 'unitPrice' | 'purchaseUnitInBase'>): number | null {
  if (item.unitPrice == null || !Number.isFinite(item.unitPrice)) return null;
  if (!item.purchaseUnitInBase || !Number.isFinite(item.purchaseUnitInBase)) return null;
  return item.unitPrice / item.purchaseUnitInBase;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
  return `${name} '${String(y).slice(2)}`;
}

/**
 * Every month from `from` through `to` inclusive, so the chart shows months with no waste
 * as empty columns. Dropping them would compress the time axis and make an eight-week gap
 * in logging look like a continuous record.
 */
function monthSpan(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  // Bounded independently of the loop condition: a bad clock or a corrupt date must not
  // spin here. 25 years of months is far past any real range.
  for (let i = 0; cur <= end && i < 300; i++) {
    out.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/**
 * Build the waste report.
 *
 * @param monthsBack how far back to include, counting the current month. null = all time.
 */
export function buildWasteSummary(
  adjustments: InventoryAdjustment[],
  items: InventoryItem[],
  monthsBack: number | null,
  now: Date = new Date(),
): WasteSummary {
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Inclusive lower bound: the first day of the month `monthsBack - 1` months ago, so
  // "last 6 months" means six calendar columns on the chart, not 180 days.
  const cutoff = monthsBack == null
    ? null
    : new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const rows: WasteRow[] = [];
  for (const a of adjustments) {
    if (a.reason !== 'waste') continue;
    const when = new Date(a.createdAt);
    if (Number.isNaN(when.getTime())) continue;
    if (cutoff && when < cutoff) continue;

    const item = itemById.get(a.itemId);
    // An adjustment whose item was deleted still happened; report it rather than drop it.
    const cpb = item ? costPerBase(item) : null;
    const qtyBase = Math.abs(a.deltaBase);

    rows.push({
      adjustmentId: a.id,
      itemId: a.itemId,
      itemName: item?.name ?? 'Deleted item',
      category: a.wasteCategory,
      reducible: isReducibleWaste(a.wasteCategory),
      qtyBase,
      value: cpb == null ? null : qtyBase * cpb,
      date: toDateStr(when),
      createdAt: a.createdAt,
    });
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let totalValue = 0;
  let reducibleValue = 0;
  let nonReducibleValue = 0;
  let uncategorisedValue = 0;
  let unpricedEvents = 0;
  let uncategorisedEvents = 0;
  const unpricedItems = new Map<string, string>();

  const catMap = new Map<string, WasteCategoryTotal>();
  const itemMap = new Map<string, WasteItemTotal>();
  const monthMap = new Map<string, { reducible: number; other: number }>();

  for (const r of rows) {
    if (r.category == null) uncategorisedEvents++;
    if (r.value == null) {
      unpricedEvents++;
      unpricedItems.set(r.itemId, r.itemName);
    }

    // Category and item rollups count EVENTS for every row but only add dollars for
    // priced ones, so an item with no price still shows up as a thing being thrown away.
    const catKey = r.category ?? '__none';
    const cat = catMap.get(catKey) ?? { category: r.category, value: 0, events: 0, reducible: r.reducible };
    cat.events++;
    const item = itemMap.get(r.itemId) ?? { itemId: r.itemId, itemName: r.itemName, value: 0, reducibleValue: 0, events: 0 };
    item.events++;

    if (r.value != null) {
      totalValue += r.value;
      cat.value += r.value;
      item.value += r.value;
      if (r.reducible) { reducibleValue += r.value; item.reducibleValue += r.value; }
      else { nonReducibleValue += r.value; }
      if (r.category == null) uncategorisedValue += r.value;

      const mk = monthKey(new Date(r.createdAt));
      const m = monthMap.get(mk) ?? { reducible: 0, other: 0 };
      if (r.reducible) m.reducible += r.value; else m.other += r.value;
      monthMap.set(mk, m);
    }

    catMap.set(catKey, cat);
    itemMap.set(r.itemId, item);
  }

  // Chart span: the selected window, or (for all-time) from the oldest waste row.
  // Either way it always runs through the current month so "nothing lately" is visible.
  const oldest = rows.length ? new Date(rows[rows.length - 1].createdAt) : now;
  const spanStart = cutoff ?? (rows.length ? new Date(oldest.getFullYear(), oldest.getMonth(), 1) : now);
  const months: WasteMonth[] = monthSpan(spanStart, now).map((key) => {
    const m = monthMap.get(key) ?? { reducible: 0, other: 0 };
    return { key, label: monthLabel(key), reducible: m.reducible, other: m.other, total: m.reducible + m.other };
  });

  return {
    rows,
    totalValue,
    reducibleValue,
    nonReducibleValue,
    uncategorisedValue,
    reduciblePct: totalValue > 0 ? reducibleValue / totalValue : null,
    months,
    byCategory: [...catMap.values()].sort((a, b) => b.value - a.value || b.events - a.events),
    byItem: [...itemMap.values()].sort((a, b) => b.value - a.value || b.events - a.events),
    totalEvents: rows.length,
    unpricedEvents,
    uncategorisedEvents,
    unpricedItemNames: [...unpricedItems.values()].sort((a, b) => a.localeCompare(b)),
  };
}
