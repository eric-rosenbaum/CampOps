// Commissary unit model, scaling, and stock math.
//
// Two DIFFERENT mechanisms live here, and conflating them is how this gets messy:
//
// 1. PER-ITEM PACK FACTORS (stored on inventory_items, load-bearing).
//    `stockUnitInBase` / `purchaseUnitInBase` convert an item's human-facing units
//    into its base unit. A case of eggs is 360 each — that is a fact about eggs,
//    not about cases, so no lookup table can know it. All stored quantities
//    (onHandBase, parLevelBase, qtyInBase, deltaBase) are in base units.
//
// 2. SAME-DIMENSION CONVERSIONS (MEASURE_UNITS below, input convenience only).
//    Quart -> fl oz and pound -> oz are universal. These exist so a cook can type
//    "5.5 qt" into a recipe form; we convert once on entry and store base units.
//    They never participate in ordering math.

import type {
  InventoryItem, MealPeriod, Recipe, RecipeIngredient, MenuEntry,
  CommissarySession, MealEvent, ProductionIngredient,
} from './types';

// ─── Allergens ───────────────────────────────────────────────────────────────
// Canonical set. Deliberately allergens only — dietary preferences (vegetarian,
// vegan, kosher) are an accommodation, not a safety hazard, and arrive with the
// camper model in the allergy-program phase.

export const ALLERGENS = [
  'gluten', 'dairy', 'peanut', 'tree_nut', 'egg', 'soy', 'fish', 'shellfish', 'sesame',
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  dairy: 'Dairy',
  peanut: 'Peanut',
  tree_nut: 'Tree nut',
  egg: 'Egg',
  soy: 'Soy',
  fish: 'Fish',
  shellfish: 'Shellfish',
  sesame: 'Sesame',
};

// ─── Dimensions & base units ─────────────────────────────────────────────────

export type UnitDimension = 'count' | 'weight' | 'volume';

export const DIMENSION_LABELS: Record<UnitDimension, string> = {
  count: 'Count',
  weight: 'Weight',
  volume: 'Volume',
};

export const BASE_UNIT: Record<UnitDimension, string> = {
  count: 'each',
  weight: 'oz',
  volume: 'fl oz',
};

export interface MeasureUnit {
  value: string;
  label: string;
  inBase: number;
}

// Universal, same-dimension conversions. Used ONLY to interpret typed input.
export const MEASURE_UNITS: Record<UnitDimension, MeasureUnit[]> = {
  count: [
    { value: 'each', label: 'each', inBase: 1 },
    { value: 'dozen', label: 'dozen', inBase: 12 },
  ],
  weight: [
    { value: 'oz', label: 'oz', inBase: 1 },
    { value: 'lb', label: 'lb', inBase: 16 },
  ],
  volume: [
    { value: 'tsp', label: 'tsp', inBase: 1 / 6 },
    { value: 'tbsp', label: 'tbsp', inBase: 0.5 },
    { value: 'fl oz', label: 'fl oz', inBase: 1 },
    { value: 'cup', label: 'cup', inBase: 8 },
    { value: 'pint', label: 'pint', inBase: 16 },
    { value: 'quart', label: 'quart', inBase: 32 },
    { value: 'gallon', label: 'gallon', inBase: 128 },
  ],
};

// ─── Friendly stock units ────────────────────────────────────────────────────
// What the Add Item form actually offers. The user picks how they COUNT a thing
// ("by the loaf", "by the pound") and never sees the words "base unit" or a
// conversion factor. Each option resolves to the (dimension, base unit, factor)
// the engine needs — for most count units the factor is 1, so it is invisible.
//
// Any pack complexity ("1 case = 24 cans") lives in the optional purchase-pack
// section instead, which is where it belongs: you stock cans, you buy cases.

export interface StockUnitOption {
  value: string;
  label: string;
  group: 'Count' | 'Weight' | 'Volume';
  dimension: UnitDimension;
  inBase: number;
}

export const STOCK_UNIT_OPTIONS: StockUnitOption[] = [
  // Count — 1 of the thing = 1 base "each". No conversion the user ever sees.
  { value: 'each',    label: 'each / unit',  group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'loaf',    label: 'loaf',         group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'can',     label: 'can',          group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'jar',     label: 'jar',          group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'bottle',  label: 'bottle',       group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'bag',     label: 'bag',          group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'box',     label: 'box',          group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'package', label: 'package',      group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'head',    label: 'head',         group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'bunch',   label: 'bunch',        group: 'Count', dimension: 'count', inBase: 1 },
  { value: 'dozen',   label: 'dozen',        group: 'Count', dimension: 'count', inBase: 12 },
  // Weight — base is oz, factor comes from here, not from the user.
  { value: 'lb',      label: 'pound (lb)',   group: 'Weight', dimension: 'weight', inBase: 16 },
  { value: 'oz',      label: 'ounce (oz)',   group: 'Weight', dimension: 'weight', inBase: 1 },
  // Volume — base is fl oz.
  { value: 'gallon',  label: 'gallon',       group: 'Volume', dimension: 'volume', inBase: 128 },
  { value: 'quart',   label: 'quart',        group: 'Volume', dimension: 'volume', inBase: 32 },
  { value: 'pint',    label: 'pint',         group: 'Volume', dimension: 'volume', inBase: 16 },
  { value: 'cup',     label: 'cup',          group: 'Volume', dimension: 'volume', inBase: 8 },
  { value: 'fl oz',   label: 'fluid ounce',  group: 'Volume', dimension: 'volume', inBase: 1 },
];

export const STOCK_UNIT_GROUPS: StockUnitOption['group'][] = ['Count', 'Weight', 'Volume'];

/**
 * Resolve a stored stockUnit back to a friendly option. Falls back to a synthetic
 * option carrying the item's own factor, so an item created with the old (advanced)
 * form still edits cleanly even if its unit isn't in the list above.
 */
export function resolveStockUnit(
  stockUnit: string,
  dimension: UnitDimension,
  inBase: number,
): StockUnitOption {
  const hit = STOCK_UNIT_OPTIONS.find((o) => o.value === stockUnit && o.inBase === inBase);
  if (hit) return hit;
  return {
    value: stockUnit,
    label: `${stockUnit}${inBase !== 1 ? ` (${inBase} ${BASE_UNIT[dimension]})` : ''}`,
    group: dimension === 'weight' ? 'Weight' : dimension === 'volume' ? 'Volume' : 'Count',
    dimension,
    inBase,
  };
}

// ─── Conversion primitives ───────────────────────────────────────────────────

export function toBase(qty: number, unitInBase: number): number {
  return qty * unitInBase;
}

export function fromBase(base: number, unitInBase: number): number {
  if (unitInBase <= 0) return 0;
  return base / unitInBase;
}

/** Trim float noise: 5.240000000001 -> 5.24, 655.0 -> 655. */
export function tidy(n: number, places = 2): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** places) / 10 ** places;
}

/** "18 lb", "4 cases", "5.5 gallons" — pluralizes only multi-char word units. */
export function formatQty(qty: number, unit: string): string {
  const n = tidy(qty);
  const plural = n !== 1 && unit.length > 2 && !unit.endsWith('s') ? `${unit}s` : unit;
  return `${n.toLocaleString()} ${plural}`;
}

export function formatInStockUnit(item: InventoryItem, base: number): string {
  return formatQty(fromBase(base, item.stockUnitInBase), item.stockUnit);
}

export function onHandInStockUnit(item: InventoryItem): number {
  return tidy(fromBase(item.onHandBase, item.stockUnitInBase));
}

export function parInStockUnit(item: InventoryItem): number {
  return tidy(fromBase(item.parLevelBase, item.stockUnitInBase));
}

// ─── Stock status ────────────────────────────────────────────────────────────
// The mock's fourth bucket ("Order soon — within 3 days of par") needs a
// consumption rate we do not have until production logging exists, so it is not
// invented here. Three honest buckets instead.

export type StockStatus = 'ok' | 'low' | 'critical';

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  ok: 'Fully stocked',
  low: 'Low stock',
  critical: 'Critically low',
};

export const CRITICAL_FRACTION = 0.5;

export function stockFraction(item: InventoryItem): number {
  if (item.parLevelBase <= 0) return 1;
  return item.onHandBase / item.parLevelBase;
}

export function stockStatus(item: InventoryItem): StockStatus {
  const f = stockFraction(item);
  if (f >= 1) return 'ok';
  if (f < CRITICAL_FRACTION) return 'critical';
  return 'low';
}

/** Bar width 0..100. Capped, since 300% of par should not overflow the track. */
export function stockPercent(item: InventoryItem): number {
  return Math.max(0, Math.min(100, Math.round(stockFraction(item) * 100)));
}

// ─── Recipe scaling ──────────────────────────────────────────────────────────

export function targetPortions(camperCount: number, staffCount: number): number {
  return camperCount + staffCount;
}

export function scaleFactor(recipe: Recipe, portions: number): number {
  if (recipe.baseYield <= 0) return 0;
  return portions / recipe.baseYield;
}

/** Scaled quantity of one ingredient, in base units. Unlinked ingredients yield 0. */
export function scaledIngredientBase(
  ing: RecipeIngredient,
  recipe: Recipe,
  portions: number,
): number {
  if (ing.qtyInBase == null) return 0;
  return ing.qtyInBase * scaleFactor(recipe, portions);
}

/**
 * How an ingredient reads on a scaled recipe card.
 * Linked  -> converted into the item's stock unit ("22 cases", "5.5 gallons").
 * Unlinked-> its free-text quantity, unscaled, because we cannot scale prose.
 */
export function scaledIngredientLabel(
  ing: RecipeIngredient,
  recipe: Recipe,
  portions: number,
  item: InventoryItem | undefined,
): string {
  if (!item || ing.qtyInBase == null) return ing.freeTextQty ?? '—';
  const base = scaledIngredientBase(ing, recipe, portions);
  return formatInStockUnit(item, base);
}

// ─── Allergens: item -> ingredient -> recipe ─────────────────────────────────

/**
 * An ingredient's allergens. A null override inherits the item's; a non-null one
 * (including []) replaces them, which is how "GF buns, separate prep" is said.
 */
export function ingredientAllergens(
  ing: RecipeIngredient,
  item: InventoryItem | undefined,
): string[] {
  if (ing.allergenOverride != null) return ing.allergenOverride;
  return item?.allergens ?? [];
}

/** Union across a recipe's ingredients, in canonical ALLERGENS order. */
export function recipeAllergens(
  ingredients: RecipeIngredient[],
  itemsById: Map<string, InventoryItem>,
): Allergen[] {
  const found = new Set<string>();
  for (const ing of ingredients) {
    const item = ing.itemId ? itemsById.get(ing.itemId) : undefined;
    for (const a of ingredientAllergens(ing, item)) found.add(a);
  }
  return ALLERGENS.filter((a) => found.has(a));
}

// ─── Menu demand ─────────────────────────────────────────────────────────────

export interface DemandRow {
  itemId: string;
  neededBase: number;
  /** Menu chips that drove this demand, for "why do I need 302 lb of chicken?" */
  fromRecipes: string[];
}

/**
 * Total base-unit demand per inventory item across a set of menu entries.
 *
 * Free-text chips and unlinked ingredients contribute nothing — by design, and the
 * UI marks them so the shortfall is visible rather than a surprise at delivery.
 */
export function demandForEntries(
  entries: MenuEntry[],
  recipesById: Map<string, Recipe>,
  ingredientsByRecipe: Map<string, RecipeIngredient[]>,
  portions: number,
): Map<string, DemandRow> {
  const demand = new Map<string, DemandRow>();

  for (const entry of entries) {
    if (!entry.recipeId) continue;
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe) continue;

    for (const ing of ingredientsByRecipe.get(recipe.id) ?? []) {
      if (!ing.itemId || ing.qtyInBase == null) continue;
      const add = scaledIngredientBase(ing, recipe, portions);
      const row = demand.get(ing.itemId);
      if (row) {
        row.neededBase += add;
        if (!row.fromRecipes.includes(recipe.name)) row.fromRecipes.push(recipe.name);
      } else {
        demand.set(ing.itemId, {
          itemId: ing.itemId,
          neededBase: add,
          fromRecipes: [recipe.name],
        });
      }
    }
  }
  return demand;
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/**
 * Whole purchase units required to cover `neededBase`, given what is on hand.
 * Rounds UP — you cannot buy 1.82 cases of eggs.
 */
export function orderQtyInPurchaseUnits(item: InventoryItem, neededBase: number): number {
  const shortfall = Math.max(0, neededBase - item.onHandBase);
  if (shortfall === 0) return 0;
  return Math.ceil(shortfall / item.purchaseUnitInBase);
}

/** Order enough to reach par. The phase-1 ordering rule, before menus drive demand. */
export function orderQtyToPar(item: InventoryItem): number {
  return orderQtyInPurchaseUnits(item, item.parLevelBase);
}

export function lineTotal(item: InventoryItem, qtyInPurchaseUnits: number): number {
  return tidy((item.unitPrice ?? 0) * qtyInPurchaseUnits);
}

export function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  protein: 'Protein',
  dairy: 'Dairy',
  produce: 'Produce',
  dry_goods: 'Dry goods',
  pantry: 'Pantry',
  frozen: 'Frozen',
  snacks: 'Snacks',
  beverage: 'Beverage',
  other: 'Other',
};

export const STORAGE_LABELS: Record<string, string> = {
  walk_in_refrigerator: 'Walk-in refrigerator',
  walk_in_freezer: 'Walk-in freezer',
  dry_storage: 'Dry storage',
  reach_in_refrigerator: 'Reach-in refrigerator',
  other: 'Other',
};

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  received: 'Received delivery',
  used: 'Used in production',
  waste: 'Waste / spoilage',
  count_correction: 'Inventory count correction',
  other: 'Other',
};

export const MEAL_PERIODS: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Session weeks ───────────────────────────────────────────────────────────
// Weeks are derived from the session's own dates, not a hardcoded list of four.

export function weekCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

/** Calendar date of a given weekNumber (1-based) + dayIndex (0-based). */
export function dateForCell(startDate: string, weekNumber: number, dayIndex: number): Date {
  const start = new Date(`${startDate}T00:00:00`);
  start.setDate(start.getDate() + (weekNumber - 1) * 7 + dayIndex);
  return start;
}

// ─── Restrictions: allergens vs dietary ──────────────────────────────────────
// The mock conflated these — its add-allergy modal listed Vegetarian/Vegan/Kosher
// alongside Peanut/Anaphylactic in one checkbox list, and used three mutually
// inconsistent taxonomies across the matrix (8), the modal (12) and the summary (10).
// One canonical set, with a `kind` that separates a safety hazard from an
// accommodation. Severity is only meaningful for allergens.

export const DIETARY_RESTRICTIONS = ['vegetarian', 'vegan', 'kosher', 'halal'] as const;
export type DietaryRestriction = (typeof DIETARY_RESTRICTIONS)[number];

export const DIETARY_LABELS: Record<DietaryRestriction, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  kosher: 'Kosher',
  halal: 'Halal',
};

export function restrictionLabel(slug: string): string {
  return (ALLERGEN_LABELS as Record<string, string>)[slug]
    ?? (DIETARY_LABELS as Record<string, string>)[slug]
    ?? slug;
}

export function restrictionKind(slug: string): 'allergen' | 'dietary' {
  return (ALLERGENS as readonly string[]).includes(slug) ? 'allergen' : 'dietary';
}

export const SEVERITY_LABELS: Record<string, string> = {
  intolerance: 'Intolerance / sensitivity',
  confirmed: 'Confirmed allergy',
  anaphylactic: 'Anaphylactic — EpiPen required',
};

/** Rank for "worst severity wins" when summarising a camper or a conflict. */
export const SEVERITY_RANK: Record<string, number> = {
  intolerance: 0,
  confirmed: 1,
  anaphylactic: 2,
};

// ─── Menu conflict detection ─────────────────────────────────────────────────

export interface MenuConflict {
  allergen: string;
  camperCount: number;
  anaphylacticCount: number;
}

/**
 * Which of a recipe's allergens actually collide with a camper in this camp.
 *
 * Phase 1 could only say "this meal contains dairy" (composition). With the allergy
 * program present we can say "this meal conflicts with 22 campers, 3 anaphylactic"
 * — which is what the mock's ⚠ always claimed to mean and never computed.
 *
 * Driven by the aggregate summary, so a kitchen user with no access to camper names
 * still gets the warning.
 */
export function menuConflicts(
  recipeAllergenSlugs: readonly string[],
  summary: Map<string, { camperCount: number; anaphylacticCount: number }>,
): MenuConflict[] {
  const out: MenuConflict[] = [];
  for (const a of recipeAllergenSlugs) {
    const row = summary.get(a);
    if (row && row.camperCount > 0) {
      out.push({ allergen: a, camperCount: row.camperCount, anaphylacticCount: row.anaphylacticCount });
    }
  }
  return out.sort((x, y) => y.anaphylacticCount - x.anaphylacticCount || y.camperCount - x.camperCount);
}

// ─── Production: stale-plan detection ────────────────────────────────────────

/**
 * A fingerprint of a day's menu. Stored on the plan at generation; recomputed on
 * render. When they differ the menu changed and the plan is stale — the UI says so
 * and offers regeneration. Nothing regenerates on its own, because that would erase
 * a half-completed prep list.
 *
 * Includes updatedAt so editing a chip in place (not just adding/removing) counts.
 */
export function menuSignature(entries: { id: string; updatedAt: string }[]): string {
  if (!entries.length) return 'empty';
  const ids = entries.map((e) => e.id).sort();
  const latest = entries.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), '');
  return `${ids.join(',')}|${latest}`;
}

// ─── Ordering ────────────────────────────────────────────────────────────────

export interface DraftOrderLine {
  itemId: string;
  itemName: string;
  stockUnit: string;
  purchaseUnit: string;
  purchaseUnitInBase: number;
  onHandBase: number;
  neededBase: number;
  orderQty: number;
  unitPrice: number | null;
  lineTotal: number;
}

export interface DraftOrder {
  vendorId: string | null;
  vendorName: string;
  lines: DraftOrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

/**
 * Build one draft order per vendor from a set of items and their required base-unit
 * quantities. Items already at or above the requirement are dropped, not listed at
 * zero — the mock rendered a $0.00 flour line, which is noise on a purchase order.
 */
export function buildDraftOrders(
  items: InventoryItem[],
  neededBaseByItem: Map<string, number>,
  vendorsById: Map<string, { id: string; name: string; deliveryFee: number | null }>,
): DraftOrder[] {
  const byVendor = new Map<string, DraftOrder>();

  for (const item of items) {
    const needed = neededBaseByItem.get(item.id) ?? 0;
    if (needed <= 0) continue;
    const qty = orderQtyInPurchaseUnits(item, needed);
    if (qty <= 0) continue;

    const vendor = item.vendorId ? vendorsById.get(item.vendorId) : undefined;
    const key = vendor?.id ?? '__unassigned';
    let order = byVendor.get(key);
    if (!order) {
      order = {
        vendorId: vendor?.id ?? null,
        vendorName: vendor?.name ?? 'No vendor assigned',
        lines: [],
        subtotal: 0,
        deliveryFee: vendor?.deliveryFee ?? 0,
        total: 0,
      };
      byVendor.set(key, order);
    }

    const line: DraftOrderLine = {
      itemId: item.id,
      itemName: item.name,
      stockUnit: item.stockUnit,
      purchaseUnit: item.purchaseUnit,
      purchaseUnitInBase: item.purchaseUnitInBase,
      onHandBase: item.onHandBase,
      neededBase: needed,
      orderQty: qty,
      unitPrice: item.unitPrice,
      lineTotal: lineTotal(item, qty),
    };
    order.lines.push(line);
    order.subtotal = tidy(order.subtotal + line.lineTotal);
  }

  for (const order of byVendor.values()) {
    order.lines.sort((a, b) => a.itemName.localeCompare(b.itemName));
    order.total = tidy(order.subtotal + order.deliveryFee);
  }

  // Unassigned-vendor bucket sorts last; it is a prompt to go set a vendor.
  return [...byVendor.values()].sort((a, b) => {
    if (!a.vendorId) return 1;
    if (!b.vendorId) return -1;
    return a.vendorName.localeCompare(b.vendorName);
  });
}

/** Requirement map for the "order up to par" rule. */
export function parRequirements(items: InventoryItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    if (item.parLevelBase > 0) m.set(item.id, item.parLevelBase);
  }
  return m;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  received: 'Received',
  cancelled: 'Cancelled',
};

// ─── Order export (download / print) ─────────────────────────────────────────
// Minimal shapes so these helpers don't depend on the DB row types.

export interface ExportOrderLine {
  itemName: string;
  orderQty: number;
  purchaseUnit: string;
  unitPrice: number | null;
  lineTotal: number;
}
export interface ExportOrder {
  vendorName: string;
  accountNumber?: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryInstructions?: string | null;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function orderToCsv(order: ExportOrder, lines: ExportOrderLine[]): string {
  const rows: (string | number)[][] = [
    ['Item', 'Quantity', 'Unit', 'Unit price', 'Line total'],
    ...lines.map((l) => [
      l.itemName, tidy(l.orderQty), l.purchaseUnit,
      l.unitPrice == null ? '' : tidy(l.unitPrice), tidy(l.lineTotal),
    ]),
    [],
    ['', '', '', 'Subtotal', tidy(order.subtotal)],
    ['', '', '', 'Delivery', tidy(order.deliveryFee)],
    ['', '', '', 'Total', tidy(order.total)],
  ];
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** A self-contained printable HTML document for one order. */
export function orderToPrintHtml(order: ExportOrder, lines: ExportOrderLine[], dateLabel: string): string {
  const rowsHtml = lines.map((l) => `
    <tr>
      <td>${l.itemName}</td>
      <td class="num">${tidy(l.orderQty).toLocaleString()} ${l.purchaseUnit}</td>
      <td class="num">${l.unitPrice == null ? '—' : formatCurrency(l.unitPrice)}</td>
      <td class="num">${l.unitPrice == null ? '—' : formatCurrency(l.lineTotal)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Order — ${order.vendorName}</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; color: #1a2e1a; padding: 32px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; border-bottom: 2px solid #d4cfc4; padding: 6px 8px; font-size: 11px; text-transform: uppercase; color: #666; }
    td { border-bottom: 1px solid #eee; padding: 6px 8px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { border: 0; padding-top: 6px; font-weight: 600; }
    .instr { margin-top: 20px; font-size: 12px; }
  </style></head><body>
    <h1>Purchase order — ${order.vendorName}</h1>
    <div class="meta">${order.accountNumber ? `Account ${order.accountNumber} · ` : ''}${dateLabel}</div>
    <table>
      <thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Unit price</th><th class="num">Total</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr><td colspan="3" class="num">Subtotal</td><td class="num">${formatCurrency(order.subtotal)}</td></tr>
        ${order.deliveryFee > 0 ? `<tr><td colspan="3" class="num">Delivery</td><td class="num">${formatCurrency(order.deliveryFee)}</td></tr>` : ''}
        <tr><td colspan="3" class="num">Total</td><td class="num">${formatCurrency(order.total)}</td></tr>
      </tfoot>
    </table>
    ${order.deliveryInstructions ? `<div class="instr"><strong>Delivery instructions:</strong> ${order.deliveryInstructions}</div>` : ''}
  </body></html>`;
}

// ─── Cost & per-diem ─────────────────────────────────────────────────────────
// Per-diem (cost per person per day) is the number camps run on. We can compute a
// FORECAST from the planned menu and recipe costs, and an ACTUAL from received POs +
// manual expenses divided by people-days.

/** Cost of one base unit of an item, from its price-per-purchase-unit. Null if unpriced. */
export function costPerBase(item: InventoryItem): number | null {
  if (item.unitPrice == null || item.purchaseUnitInBase <= 0) return null;
  return item.unitPrice / item.purchaseUnitInBase;
}

/** Cost of a recipe scaled to `portions`. Unlinked/unpriced ingredients contribute 0. */
export function recipeCost(
  recipe: Recipe,
  ingredients: RecipeIngredient[],
  itemsById: Map<string, InventoryItem>,
  portions: number,
): number {
  let total = 0;
  for (const ing of ingredients) {
    if (!ing.itemId || ing.qtyInBase == null) continue;
    const item = itemsById.get(ing.itemId);
    if (!item) continue;
    const cpb = costPerBase(item);
    if (cpb == null) continue;
    total += scaledIngredientBase(ing, recipe, portions) * cpb;
  }
  return total;
}

/** Forecast food cost of a set of menu entries at `portions` (session default count). */
export function menuForecastCost(
  entries: MenuEntry[],
  recipesById: Map<string, Recipe>,
  ingredientsByRecipe: Map<string, RecipeIngredient[]>,
  itemsById: Map<string, InventoryItem>,
  portions: number,
): number {
  let total = 0;
  for (const e of entries) {
    if (!e.recipeId) continue;
    const recipe = recipesById.get(e.recipeId);
    if (!recipe) continue;
    total += recipeCost(recipe, ingredientsByRecipe.get(recipe.id) ?? [], itemsById, portions);
  }
  return tidy(total);
}

// ─── Head count with meal-level events ───────────────────────────────────────
// bag_lunch events are their own separate meals (their own production task and their
// own count) — they do NOT change the dining-hall count. An off-site trip is modeled
// as a -N delta on the affected meal PLUS a +N bag_lunch.

/** Effective head count for one meal on one day, after overrides. */
export function mealHeadCount(
  session: CommissarySession,
  events: MealEvent[],
  dateStr: string,
  meal: MealPeriod,
): number {
  let count = session.camperCount + session.staffCount;
  const relevant = events.filter((e) => e.date === dateStr && e.kind !== 'bag_lunch');
  // Whole-day overrides first, then meal-specific.
  for (const e of relevant.filter((e) => e.mealPeriod === null)) {
    count = e.countMode === 'absolute' ? e.count : count + e.count;
  }
  for (const e of relevant.filter((e) => e.mealPeriod === meal)) {
    count = e.countMode === 'absolute' ? e.count : count + e.count;
  }
  return Math.max(0, count);
}

/**
 * One day's person-day contribution. Whole-day overrides move the base; each
 * meal-level override counts as 1/mealsPerDay of a person-day, so a visiting-day
 * lunch of 300 adds (300−base)/mealsPerDay and an off-site dinner subtracts.
 */
export function effectiveDayCount(session: CommissarySession, events: MealEvent[], dateStr: string): number {
  let base = session.camperCount + session.staffCount;
  const relevant = events.filter((e) => e.date === dateStr && e.kind !== 'bag_lunch');
  for (const e of relevant.filter((e) => e.mealPeriod === null)) {
    base = e.countMode === 'absolute' ? e.count : base + e.count;
  }
  let dayCount = base;
  const meals = Math.max(1, session.mealsPerDay);
  for (const e of relevant.filter((e) => e.mealPeriod !== null)) {
    const mealCount = e.countMode === 'absolute' ? e.count : base + e.count;
    dayCount += (mealCount - base) / meals;
  }
  return Math.max(0, dayCount);
}

function eachDay(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Sum of effective day counts across [startDate, endDate]. The per-diem denominator. */
export function peopleDays(
  session: CommissarySession,
  events: MealEvent[],
  startDate: string,
  endDate: string,
): number {
  if (endDate < startDate) return 0;
  return tidy(eachDay(startDate, endDate).reduce((sum, d) => sum + effectiveDayCount(session, events, d), 0));
}

export interface PerDiem {
  actualSpend: number;
  peopleDays: number;
  perDiemActual: number | null;   // null when no people-days yet
  budget: number | null;
  variance: number | null;        // perDiemActual − budget
}

export function perDiem(
  actualSpend: number,
  pDays: number,
  budget: number | null,
): PerDiem {
  const per = pDays > 0 ? tidy(actualSpend / pDays) : null;
  return {
    actualSpend: tidy(actualSpend),
    peopleDays: tidy(pDays),
    perDiemActual: per,
    budget,
    variance: per != null && budget != null ? tidy(per - budget) : null,
  };
}

// ─── Print helpers (production plan / menu / count sheet) ─────────────────────

const PRINT_STYLE = `
  body { font-family: -apple-system, system-ui, sans-serif; color: #1a2e1a; padding: 32px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 20px 0 6px; border-bottom: 1px solid #d4cfc4; padding-bottom: 3px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
  th { text-align: left; border-bottom: 2px solid #d4cfc4; padding: 5px 8px; font-size: 10px; text-transform: uppercase; color: #666; }
  td { border-bottom: 1px solid #eee; padding: 5px 8px; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .box { display: inline-block; width: 60px; border-bottom: 1px solid #999; }
  .warn { color: #c0392b; font-weight: 600; }
  ul { margin: 4px 0; padding-left: 18px; font-size: 12px; }
`;

function printDoc(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLE}</style></head><body>${body}</body></html>`;
}

export interface PrintTask {
  mealLabel: string;
  title: string;
  portions: number;
  ingredients: ProductionIngredient[];
  prepTime: string | null;
  cookTime: string | null;
  conflictNote: string | null;
}

export function productionPlanToPrintHtml(dayLabel: string, tasks: PrintTask[], worklist: string[]): string {
  const byMeal = new Map<string, PrintTask[]>();
  for (const t of tasks) {
    const arr = byMeal.get(t.mealLabel);
    if (arr) arr.push(t); else byMeal.set(t.mealLabel, [t]);
  }
  let body = `<h1>Production plan — ${dayLabel}</h1><div class="meta">Prep sheet</div>`;
  for (const [meal, list] of byMeal) {
    body += `<h2>${meal}</h2><table><thead><tr><th>Dish</th><th class="num">Portions</th><th>Ingredients</th><th>Times</th></tr></thead><tbody>`;
    for (const t of list) {
      const ings = t.ingredients.map((i) => `${i.qty} ${i.label}`).join(', ');
      const times = [t.prepTime && `prep ${t.prepTime}`, t.cookTime && `cook ${t.cookTime}`].filter(Boolean).join(' · ');
      body += `<tr><td>${t.title}${t.conflictNote ? `<br><span class="warn">${t.conflictNote}</span>` : ''}</td><td class="num">${t.portions}</td><td>${ings}</td><td>${times}</td></tr>`;
    }
    body += `</tbody></table>`;
  }
  if (worklist.length) {
    body += `<h2>Allergen & dietary substitutions</h2><ul>${worklist.map((w) => `<li>${w}</li>`).join('')}</ul>`;
  }
  return printDoc(`Production — ${dayLabel}`, body);
}

export interface PrintMenuCell { meal: string; day: string; items: string[]; }

export function menuWeekToPrintHtml(weekLabel: string, days: string[], meals: string[], cells: PrintMenuCell[]): string {
  const at = (meal: string, day: string) => cells.find((c) => c.meal === meal && c.day === day)?.items ?? [];
  let body = `<h1>Menu — ${weekLabel}</h1><table><thead><tr><th></th>${days.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>`;
  for (const meal of meals) {
    body += `<tr><td><strong>${meal}</strong></td>${days.map((d) => `<td>${at(meal, d).join('<br>')}</td>`).join('')}</tr>`;
  }
  body += `</tbody></table>`;
  return printDoc(`Menu — ${weekLabel}`, body);
}

export interface PrintCountGroup { location: string; items: { name: string; unit: string; reorderAt: string; onHand: string }[]; }

export function countSheetToPrintHtml(dateLabel: string, groups: PrintCountGroup[]): string {
  let body = `<h1>Inventory count sheet</h1><div class="meta">${dateLabel} · counted by ______________</div>`;
  for (const g of groups) {
    body += `<h2>${g.location}</h2><table><thead><tr><th>Item</th><th>Unit</th><th class="num">Reorder at</th><th class="num">Last known</th><th class="num">Counted</th></tr></thead><tbody>`;
    for (const it of g.items) {
      body += `<tr><td>${it.name}</td><td>${it.unit}</td><td class="num">${it.reorderAt}</td><td class="num">${it.onHand}</td><td class="num"><span class="box"></span></td></tr>`;
    }
    body += `</tbody></table>`;
  }
  return printDoc('Count sheet', body);
}
