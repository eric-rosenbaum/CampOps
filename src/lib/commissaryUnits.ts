// Commissary unit model, scaling, and stock math.
//
// Two DIFFERENT mechanisms live here, and conflating them is how this gets messy:
//
// 1. PER-ITEM PACK FACTORS (stored on inventory_items, load-bearing).
//    `stockUnitInBase` / `purchaseUnitInBase` convert an item's human-facing units
//    into its base unit. A case of eggs is 360 each. That is a fact about eggs,
//    not about cases, so no lookup table can know it. All stored quantities
//    (onHandBase, parLevelBase, qtyInBase, deltaBase) are in base units.
//
// 2. SAME-DIMENSION CONVERSIONS (MEASURE_UNITS below, input convenience only).
//    Quart -> fl oz and pound -> oz are universal. These exist so a cook can type
//    "5.5 qt" into a recipe form; we convert once on entry and store base units.
//    They never participate in ordering math.

import type {
  InventoryItem, MealPeriod, Recipe, RecipeIngredient, MenuEntry,
  CommissarySession, MealEvent, ProductionIngredient, RecipeStep, PrepTimeSlot,
  WasteCategory,
} from './types';
import { toDateStr, todayStr, parseDateStr } from './utils';

export { toDateStr, todayStr, parseDateStr };

// ─── Allergens ───────────────────────────────────────────────────────────────
// Canonical set. Deliberately allergens only, dietary preferences (vegetarian,
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

// Item-side dietary flags. These live alongside allergens on an inventory item and flag on the
// menu builder EXACTLY like allergens · a "contains meat" item warns against vegetarian/vegan
// campers, "contains animal products" against vegans. (Replaces the old vegetarian/vegan/kosher/
// halal item tags: an item states what it CONTAINS; the camper states what they avoid.)
export const DIET_FLAGS = ['contains_meat', 'contains_animal_products'] as const;
export type DietFlag = (typeof DIET_FLAGS)[number];
export const DIET_FLAG_LABELS: Record<DietFlag, string> = {
  contains_meat: 'Contains meat',
  contains_animal_products: 'Contains animal products',
};
// One combined set of everything an inventory item can be flagged with (stored in item.allergens).
export const ITEM_FLAGS = [...ALLERGENS, ...DIET_FLAGS] as const;
// Which camper dietary restrictions each item flag conflicts with (for menu warnings).
export const DIET_FLAG_CONFLICTS: Record<string, readonly string[]> = {
  contains_meat: ['vegetarian', 'vegan'],
  contains_animal_products: ['vegan'],
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
// the engine needs, for most count units the factor is 1, so it is invisible.
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
  // Count, 1 of the thing = 1 base "each". No conversion the user ever sees.
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
  // Weight. Base is oz, factor comes from here, not from the user.
  { value: 'lb',      label: 'pound (lb)',   group: 'Weight', dimension: 'weight', inBase: 16 },
  { value: 'oz',      label: 'ounce (oz)',   group: 'Weight', dimension: 'weight', inBase: 1 },
  // Volume. Base is fl oz.
  { value: 'gallon',  label: 'gallon',       group: 'Volume', dimension: 'volume', inBase: 128 },
  { value: 'quart',   label: 'quart',        group: 'Volume', dimension: 'volume', inBase: 32 },
  { value: 'pint',    label: 'pint',         group: 'Volume', dimension: 'volume', inBase: 16 },
  { value: 'cup',     label: 'cup',          group: 'Volume', dimension: 'volume', inBase: 8 },
  { value: 'fl oz',   label: 'fluid ounce',  group: 'Volume', dimension: 'volume', inBase: 1 },
];

export const STOCK_UNIT_GROUPS: StockUnitOption['group'][] = ['Count', 'Weight', 'Volume'];

// Smart default for "Stocked by": guess how a thing is counted from its name, so the
// form pre-fills "lb" for chicken and "gallon" for milk instead of always "each". Just a
// convenience. The user can always change it, and a miss costs nothing.
const STOCK_UNIT_KEYWORDS: [RegExp, string][] = [
  [/\b(egg|eggs)\b/i, 'dozen'],
  [/\b(bread|loaf|loaves|baguette)\b/i, 'loaf'],
  [/\b(roll|rolls|bun|buns|bagel|bagels|muffin|muffins|tortilla|tortillas)\b/i, 'dozen'],
  [/\b(milk|cream|half.?and.?half|juice|oil|vinegar|syrup|broth|stock)\b/i, 'gallon'],
  [/\b(lettuce|cabbage|cauliflower|broccoli|melon|watermelon|cantaloupe|pineapple)\b/i, 'head'],
  [/\b(banana|bananas|celery|cilantro|parsley|kale|grapes|asparagus)\b/i, 'bunch'],
  [/\b(canned|can of)\b/i, 'can'],
  [/\b(chicken|beef|pork|turkey|ground|meat|steak|bacon|sausage|ham|salmon|fish|shrimp|cheese|mozzarella|cheddar|butter|flour|sugar|rice|pasta|potato|potatoes|onion|onions|carrot|carrots|apple|apples|orange|oranges|tomato|tomatoes)\b/i, 'lb'],
];

/** Suggested "Stocked by" unit value for a new item, from its name. Null = no guess (use default). */
export function suggestStockUnit(name: string): string | null {
  const n = name.trim();
  if (!n) return null;
  for (const [re, unit] of STOCK_UNIT_KEYWORDS) if (re.test(n)) return unit;
  return null;
}

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

// Short symbol units (lb, oz, ea, tsp…) never pluralize; word units follow basic
// English rules so a cook never sees "4 boxs" or "2 loafs".
// "dozen" is a count word: "2 dozen eggs", never "2 dozens".
const NO_PLURAL = new Set(['oz', 'lb', 'fl oz', 'tsp', 'tbsp', 'each', 'ea', 'dozen']);
const IRREGULAR_PLURALS: Record<string, string> = { loaf: 'loaves', leaf: 'leaves', half: 'halves' };

/** Pluralize a stock/purchase unit for display: box→boxes, loaf→loaves, berry→berries. */
export function pluralizeUnit(unit: string, n: number): string {
  // "Dozen" typed with a capital is still dozen: it used to come out "Dozens".
  if (n === 1 || NO_PLURAL.has(unit.trim().toLowerCase())) return unit;
  // "case of 12" is counted in cases: "2 cases of 12", never "2 case of 12s".
  const of = /^(.+?) (of .+)$/.exec(unit);
  if (of) return `${pluralizeUnit(of[1], n)} ${of[2]}`;
  if (IRREGULAR_PLURALS[unit]) return IRREGULAR_PLURALS[unit];
  if (/(s|x|z|ch|sh)$/i.test(unit)) return `${unit}es`;          // box→boxes, dish→dishes
  if (/[^aeiou]y$/i.test(unit)) return `${unit.slice(0, -1)}ies`; // berry→berries
  return `${unit}s`;
}

/** "18 lb", "4 cases", "5.5 gallons"pluralizes word units correctly. */
export function formatQty(qty: number, unit: string): string {
  const n = tidy(qty);
  return `${n.toLocaleString()} ${pluralizeUnit(unit, n)}`;
}

// Units a kitchen only ever counts whole: nobody has 319.6 apples.
const WHOLE_ONLY_UNITS = new Set(['each', 'ea', 'head', 'piece', 'pc', 'count', 'unit']);

/**
 * A shelf quantity at the precision a cook reads it: whole for things counted whole, whole when a
 * pack count is within a tenth of whole ("15.99 bags" is 16 bags), one decimal otherwise
 * ("0.48 lb" is 0.5 lb). The demo showed "12.07 dozen" eggs and "15.99 bags".
 */
export function roundForDisplay(n: number, dimension: UnitDimension, unit: string): number {
  if (!Number.isFinite(n)) return 0;
  const whole = Math.round(n);
  if (dimension === 'count' && WHOLE_ONLY_UNITS.has(unit.trim().toLowerCase())) return whole;
  if (Math.abs(n - whole) < (dimension === 'count' ? 0.1 : 0.05)) return whole;
  if (Math.abs(n) < 0.1) return Math.round(n * 100) / 100;
  return Math.round(n * 10) / 10;
}

/** "12 dozen", "0.5 lb", "60 heads": a base quantity in the item's stock unit, rounded for reading. */
export function formatInStockUnit(item: Pick<InventoryItem, 'stockUnitInBase' | 'stockUnit' | 'dimension'>, base: number): string {
  const n = roundForDisplay(fromBase(base, item.stockUnitInBase), item.dimension, item.stockUnit);
  return `${n.toLocaleString()} ${pluralizeUnit(item.stockUnit, n)}`;
}

export function onHandInStockUnit(item: InventoryItem): number {
  return tidy(fromBase(item.onHandBase, item.stockUnitInBase));
}

export function parInStockUnit(item: InventoryItem): number {
  return tidy(fromBase(item.parLevelBase, item.stockUnitInBase));
}

// ─── Stock status ────────────────────────────────────────────────────────────
// The mock's fourth bucket ("Order soon, within 3 days of par") needs a
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
  if (!item || ing.qtyInBase == null) return ing.freeTextQty ?? '-';
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

/** Union across a recipe's ingredients (allergens + diet flags), in canonical order. */
export function recipeAllergens(
  ingredients: RecipeIngredient[],
  itemsById: Map<string, InventoryItem>,
): string[] {
  const found = new Set<string>();
  for (const ing of ingredients) {
    const item = ing.itemId ? itemsById.get(ing.itemId) : undefined;
    for (const a of ingredientAllergens(ing, item)) found.add(a);
  }
  return ITEM_FLAGS.filter((a) => found.has(a));
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
 * `portionsFor` yields the head count each entry scales to, a constant for the whole
 * week, or a per-meal count when the session/date varies attendance (see #8). A chip
 * may drive demand two ways: a recipe (via its linked ingredients) OR a directly linked
 * inventory item with a per-portion quantity. Free-text chips and unlinked ingredients
 * contribute nothing, by design, and the UI marks them so the shortfall is visible.
 */
export function demandForEntries(
  entries: MenuEntry[],
  recipesById: Map<string, Recipe>,
  ingredientsByRecipe: Map<string, RecipeIngredient[]>,
  portionsFor: number | ((entry: MenuEntry) => number),
): Map<string, DemandRow> {
  const demand = new Map<string, DemandRow>();
  const portionsOf = typeof portionsFor === 'function' ? portionsFor : () => portionsFor;

  const addDemand = (itemId: string, add: number, from: string) => {
    const row = demand.get(itemId);
    if (row) {
      row.neededBase += add;
      if (!row.fromRecipes.includes(from)) row.fromRecipes.push(from);
    } else {
      demand.set(itemId, { itemId, neededBase: add, fromRecipes: [from] });
    }
  };

  for (const entry of entries) {
    const portions = portionsOf(entry);
    if (entry.recipeId) {
      const recipe = recipesById.get(entry.recipeId);
      if (!recipe) continue;
      for (const ing of ingredientsByRecipe.get(recipe.id) ?? []) {
        if (!ing.itemId || ing.qtyInBase == null) continue;
        addDemand(ing.itemId, scaledIngredientBase(ing, recipe, portions), recipe.name);
      }
    } else if (entry.itemId && entry.itemQtyBase != null) {
      // A single-item chip: quantity is per portion, so scale straight by head count.
      addDemand(entry.itemId, entry.itemQtyBase * portions, entry.label ?? 'Item');
    }
  }
  return demand;
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/**
 * Whole purchase units required to cover `neededBase`, given what is on hand.
 * Rounds UP. You cannot buy 1.82 cases of eggs.
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

export const WASTE_CATEGORIES: WasteCategory[] = [
  'spoilage', 'overproduction', 'prep_loss', 'plate_waste', 'damage', 'other',
];

export const WASTE_CATEGORY_LABELS: Record<WasteCategory, string> = {
  spoilage: 'Spoiled / expired before use',
  overproduction: 'Cooked more than was needed',
  prep_loss: 'Trim, peel, bone loss',
  plate_waste: 'Served but not eaten',
  damage: 'Dropped, contaminated, equipment failure',
  other: 'Other',
};

/** Short form for chart legends and table cells, where the full sentence is too long. */
export const WASTE_CATEGORY_SHORT: Record<WasteCategory, string> = {
  spoilage: 'Spoilage',
  overproduction: 'Overproduction',
  prep_loss: 'Prep loss',
  plate_waste: 'Plate waste',
  damage: 'Damage',
  other: 'Other',
};

/**
 * Categories that better ordering, rotation and forecasting can actually move.
 *
 * `prep_loss` and `plate_waste` are deliberately excluded: trim loss is a property of the
 * ingredient, and ReFED puts roughly 70% of foodservice waste at the plate, which does not
 * respond to how you buy. `other` is excluded too. It is unknown, and counting unknowns
 * as reducible would inflate the only number on this tab anyone will quote.
 */
export const REDUCIBLE_WASTE: ReadonlySet<WasteCategory> = new Set<WasteCategory>([
  'spoilage', 'overproduction', 'damage',
]);

export function isReducibleWaste(c: WasteCategory | null): boolean {
  return c != null && REDUCIBLE_WASTE.has(c);
}

export const MEAL_PERIODS: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

// A session week runs from the session's OWN start date, so day 0 is whatever weekday the
// session begins on, not Monday. Labelling the columns Mon–Sun produced impossible dates
// ("Mon Aug 4" for a session starting Tuesday Aug 4) and put the menu a day out of step
// with inventory, which reads real calendar dates. Weekday names must come from the date.
//
// Templates are not tied to a calendar at all (they are applied to any week of any
// session), so they are numbered rather than named.
export const TEMPLATE_DAY_LABELS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

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
  const start = parseDateStr(startDate);
  start.setDate(start.getDate() + (weekNumber - 1) * 7 + dayIndex);
  return start;
}

/** Same cell, as a YYYY-MM-DD calendar day. */
export function dateStrForCell(startDate: string, weekNumber: number, dayIndex: number): string {
  return toDateStr(dateForCell(startDate, weekNumber, dayIndex));
}

/** The real weekday of a cell, 'Tue' for a session that starts on a Tuesday. */
export function dayLabelForCell(startDate: string, weekNumber: number, dayIndex: number): string {
  return dateForCell(startDate, weekNumber, dayIndex).toLocaleDateString('en-US', { weekday: 'short' });
}

/** The seven real weekday labels of one session week, in column order. */
export function dayLabelsForWeek(startDate: string, weekNumber: number): string[] {
  return Array.from({ length: 7 }, (_, i) => dayLabelForCell(startDate, weekNumber, i));
}

// ─── Restrictions: allergens vs dietary ──────────────────────────────────────
// The mock conflated these, its add-allergy modal listed Vegetarian/Vegan/Kosher
// alongside Peanut/Anaphylactic in one checkbox list, and used three mutually
// inconsistent taxonomies across the matrix (8), the modal (12) and the summary (10).
// One canonical set, with a `kind` that separates a safety hazard from an
// accommodation. Severity is only meaningful for allergens.

// Camper dietary preferences (what a person avoids). Kosher/halal were dropped.
export const DIETARY_RESTRICTIONS = ['vegetarian', 'vegan'] as const;
export type DietaryRestriction = (typeof DIETARY_RESTRICTIONS)[number];

export const DIETARY_LABELS: Record<DietaryRestriction, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
};

export function restrictionLabel(slug: string): string {
  return (ALLERGEN_LABELS as Record<string, string>)[slug]
    ?? (DIET_FLAG_LABELS as Record<string, string>)[slug]
    ?? (DIETARY_LABELS as Record<string, string>)[slug]
    ?? slug;
}

export function restrictionKind(slug: string): 'allergen' | 'dietary' {
  return (ALLERGENS as readonly string[]).includes(slug) ? 'allergen' : 'dietary';
}

export const SEVERITY_LABELS: Record<string, string> = {
  intolerance: 'Intolerance / sensitivity',
  confirmed: 'Confirmed allergy',
  anaphylactic: 'Anaphylactic · EpiPen required',
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
 *. Which is what the mock's warning icon always claimed to mean and never computed.
 *
 * Driven by the aggregate summary, so a kitchen user with no access to camper names
 * still gets the warning.
 */
export function menuConflicts(
  recipeAllergenSlugs: readonly string[],
  summary: Map<string, { camperCount: number; anaphylacticCount: number }>,
): MenuConflict[] {
  // Conflicts are keyed by the CAMPER RESTRICTION, never by the item flag that implied it.
  // A "contains meat" item does not conflict with "contains meat"it conflicts with the
  // vegetarians and vegans in camp. Reporting the flag slug here used to make replacement
  // meals unmatchable: a substitution is saved against a restriction ('vegetarian'), so
  // nothing ever matched 'contains_meat' and the chip stayed amber however many
  // replacements were plated. Two flags can implicate the same restriction (meat and
  // animal products both hit vegan), hence the merge.
  const byRestriction = new Map<string, MenuConflict>();
  const add = (restriction: string) => {
    const row = summary.get(restriction);
    if (!row || row.camperCount <= 0) return;
    byRestriction.set(restriction, {
      allergen: restriction,
      camperCount: row.camperCount,
      anaphylacticCount: row.anaphylacticCount,
    });
  };

  for (const a of recipeAllergenSlugs) {
    const dietConflicts = DIET_FLAG_CONFLICTS[a];
    if (dietConflicts) for (const s of dietConflicts) add(s);
    else add(a);
  }

  return [...byRestriction.values()]
    .sort((x, y) => y.anaphylacticCount - x.anaphylacticCount || y.camperCount - x.camperCount);
}

// ─── Recipe-step prep timing ─────────────────────────────────────────────────
// A step can carry a lead time so the production prep calendar can schedule it to
// the right slot ("night before", "morning of", "2 days before").

export const PREP_TIME_SLOTS: PrepTimeSlot[] = ['morning', 'afternoon', 'evening'];

export const PREP_TIME_SLOT_LABELS: Record<PrepTimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** Human label for a step's timing, or null when it's ordinary day-of prep. */
export function stepTimingLabel(step: Pick<RecipeStep, 'leadDays' | 'timeSlot'>): string | null {
  const d = step.leadDays ?? 0;
  const slot = step.timeSlot ?? null;
  if (d === 0 && !slot) return null;
  if (d === 0) return `${PREP_TIME_SLOT_LABELS[slot!]} of`;
  if (d === 1 && !slot) return 'Night before';
  if (d === 1) return `${PREP_TIME_SLOT_LABELS[slot!]}, night before`;
  return slot ? `${PREP_TIME_SLOT_LABELS[slot]}, ${d} days before` : `${d} days before`;
}

/** Sort key so earlier prep (more lead days, earlier slot) comes first on a calendar. */
export function stepTimingRank(step: Pick<RecipeStep, 'leadDays' | 'timeSlot'>): number {
  const slotRank = step.timeSlot ? PREP_TIME_SLOTS.indexOf(step.timeSlot) : 1.5;
  // More lead days first (descending); within a day, morning before evening.
  return -(step.leadDays ?? 0) * 10 + slotRank;
}

/** The timing options offered in the recipe editor, as friendly presets. */
export interface PrepTimingPreset { value: string; label: string; leadDays: number; timeSlot: PrepTimeSlot | null; }
export const PREP_TIMING_PRESETS: PrepTimingPreset[] = [
  { value: 'day_of', label: 'Day of', leadDays: 0, timeSlot: null },
  { value: 'morning_of', label: 'Morning of', leadDays: 0, timeSlot: 'morning' },
  { value: 'afternoon_of', label: 'Afternoon of', leadDays: 0, timeSlot: 'afternoon' },
  { value: 'night_before', label: 'Night before', leadDays: 1, timeSlot: null },
  { value: '2_days_before', label: '2 days before', leadDays: 2, timeSlot: null },
  { value: '3_days_before', label: '3 days before', leadDays: 3, timeSlot: null },
];

export function presetForStep(step: Pick<RecipeStep, 'leadDays' | 'timeSlot'>): string {
  const d = step.leadDays ?? 0;
  const slot = step.timeSlot ?? null;
  return PREP_TIMING_PRESETS.find((p) => p.leadDays === d && p.timeSlot === slot)?.value ?? 'day_of';
}
export function presetByValue(value: string): PrepTimingPreset {
  return PREP_TIMING_PRESETS.find((p) => p.value === value) ?? PREP_TIMING_PRESETS[0];
}

// The production prep calendar resolves each recipe step to the slot it must be done in.
export type PrepSlotKey = PrepTimeSlot | 'any';
export const PREP_SLOT_LABELS: Record<PrepSlotKey, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time',
};
export const PREP_SLOT_ORDER: Record<PrepSlotKey, number> = { morning: 0, afternoon: 1, evening: 2, any: 3 };

export interface PrepScheduleItem {
  recipeName: string;
  mealLabel: string;
  portions: number;
  instruction: string;
  serviceDateStr: string;
  leadDays: number;
}
export interface PrepScheduleSlot {
  dateStr: string;
  slot: PrepSlotKey;
  items: PrepScheduleItem[];
}

// ─── Production: stale-plan detection ────────────────────────────────────────

/**
 * A fingerprint of a day's menu. Stored on the plan at generation; recomputed on
 * render. When they differ the menu changed and the plan is stale. The UI says so
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
 * zero. The mock rendered a $0.00 flour line, which is noise on a purchase order.
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
      <td class="num">${l.unitPrice == null ? '-' : formatCurrency(l.unitPrice)}</td>
      <td class="num">${l.unitPrice == null ? '-' : formatCurrency(l.lineTotal)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Order · ${order.vendorName}</title>
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
    <h1>Purchase order · ${order.vendorName}</h1>
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

/** A printable receiving checklist, carry it to the dock and check items off as they arrive. */
export function receivingSheetToPrintHtml(
  vendorName: string,
  dateLabel: string,
  lines: { itemName: string; orderedQty: number; purchaseUnit: string }[],
): string {
  const rows = lines.map((l) => `
    <tr>
      <td>☐&nbsp;&nbsp;${l.itemName}</td>
      <td class="num">${tidy(l.orderedQty).toLocaleString()} ${l.purchaseUnit}</td>
      <td class="num"><span class="box"></span></td>
      <td><span class="line"></span></td>
    </tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receiving · ${vendorName}</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; color: #1a2e1a; padding: 32px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; border-bottom: 2px solid #d4cfc4; padding: 6px 8px; font-size: 11px; text-transform: uppercase; color: #666; }
    td { border-bottom: 1px solid #eee; padding: 8px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .box { display: inline-block; width: 60px; border-bottom: 1px solid #999; }
    .line { display: inline-block; width: 100%; min-width: 120px; border-bottom: 1px solid #ccc; }
  </style></head><body>
    <h1>Receiving checklist · ${vendorName}</h1>
    <div class="meta">${dateLabel} · received by ______________</div>
    <table>
      <thead><tr><th>Item (✓ as arrived)</th><th class="num">Ordered</th><th class="num">Received</th><th>Notes (short / sub)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
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
    if (e.recipeId) {
      const recipe = recipesById.get(e.recipeId);
      if (!recipe) continue;
      total += recipeCost(recipe, ingredientsByRecipe.get(recipe.id) ?? [], itemsById, portions);
    } else if (e.itemId && e.itemQtyBase != null) {
      const item = itemsById.get(e.itemId);
      const cpb = item ? costPerBase(item) : null;
      if (cpb != null) total += e.itemQtyBase * portions * cpb;
    }
  }
  return tidy(total);
}

// ─── Head count with meal-level events ───────────────────────────────────────
// bag_lunch events are their own separate meals (their own production task and their
// own count). They do NOT change the dining-hall count. An off-site trip is modeled
// as a -N delta on the affected meal PLUS a +N bag_lunch.

/**
 * The session's baseline head count for one meal, before any per-date events. Uses the
 * session's per-meal override if set, else the plain total (camperCount + staffCount).
 */
export function sessionMealBase(session: CommissarySession, meal: MealPeriod): number {
  const override = session.mealCounts?.[meal];
  return override != null ? override : session.camperCount + session.staffCount;
}

/** Effective head count for one meal on one day, after per-date overrides. */
export function mealHeadCount(
  session: CommissarySession,
  events: MealEvent[],
  dateStr: string,
  meal: MealPeriod,
): number {
  let count = sessionMealBase(session, meal);
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
  const d = parseDateStr(startDate);
  const end = parseDateStr(endDate);
  while (d <= end) {
    out.push(toDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ─── Date helpers for the reconciled projection ──────────────────────────────

/** Inclusive list of YYYY-MM-DD between two dates. */
export function datesInRange(startDate: string, endDate: string): string[] {
  if (endDate < startDate) return [];
  return eachDay(startDate, endDate);
}

/** Shift a YYYY-MM-DD by n days (n may be negative). */
export function addDaysStr(dateStr: string, n: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Whole days from a → b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateStr(b).getTime() - parseDateStr(a).getTime()) / 86_400_000);
}

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Next date on/after `fromDateStr` that falls on the given weekday name. null if unknown day. */
export function nextWeekdayOnOrAfter(weekday: string | null, fromDateStr: string): string | null {
  if (!weekday) return null;
  const target = WEEKDAYS.indexOf(weekday.trim().toLowerCase());
  if (target < 0) return null;
  const from = new Date(`${fromDateStr}T00:00:00`);
  const delta = (target - from.getDay() + 7) % 7;
  return addDaysStr(fromDateStr, delta);
}

// ─── The shelf: one set of numbers every tab explains the same way ──────────────
//
// Found in a kitchen manager's review of the demo, where the Inventory row said "On shelf 154 ·
// promised 7 · left 94" for flour counted at 150 and the numbers jumped when anything happened:
//
//   * The count's DAY was read as `lastCountedAt.slice(0, 10)`, the UTC date. A count taken at
//     9:56pm in Toronto is "tomorrow" in UTC, so the menu use since the count started tomorrow,
//     and "on shelf" added today's promised pickups back on top of an unreduced count: 150 + 4 = 154.
//     Marking that pickup Missed took the 4 back off, which read as food vanishing (39 → 35).
//   * "Left after promises" silently subtracted the MENU as well, through the last promised pickup
//     day. Approving 5 lb for a pickup next week stretched that window by a week of meals
//     (89.4 → 20.4); picking up the only chips promise collapsed it to today (0 → 8.5 left).
//
// Now there are named terms, each on screen, and the window is a stated date that does not move
// when a request is approved or handed over:
//
//   counted       the book: last count, plus deliveries received and adjustments (pickups write one)
//   usedSinceCount planned menu use on the days after the count day, up to yesterday
//   onShelf       counted − usedSinceCount
//   promised      every approved/ready program request not yet picked up (past-due ones included:
//                 the food is still set aside until someone taps Picked up or Missed)
//   menuUse       planned menu use from today through `through` (the next delivery)
//   incoming      sent orders due from today through `through`
//   left          onShelf − promised − menuUse + incoming
//
// Ordering uses the same onShelf and the same terms over its own window (orderLineMath).

export type BaseByDate = Map<string, number>;

export interface ShelfInput {
  today: string;
  /** Planned menu use per date (base units). Never written to the book. */
  menuByDate: BaseByDate;
  /** Promised pickups per date (base). The caller files past-due pickups under today. */
  promisedByDate: BaseByDate;
  /** Sent, not-yet-received deliveries per expected date (base). */
  incomingByDate: BaseByDate;
}

/** The camp-local calendar day a count was taken on. Never the UTC date of the instant. */
export function countedDay(lastCountedAt: string | null): string | null {
  if (!lastCountedAt) return null;
  // A bare YYYY-MM-DD is already a calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastCountedAt)) return lastCountedAt;
  const d = new Date(lastCountedAt);
  return Number.isNaN(d.getTime()) ? null : toDateStr(d);
}

function sumBetween(m: BaseByDate, from: string, to: string): number {
  let sum = 0;
  for (const [d, base] of m) if (d >= from && d <= to) sum += base;
  return sum;
}

function sumAll(m: BaseByDate): number {
  let sum = 0;
  for (const base of m.values()) sum += base;
  return sum;
}

export interface ShelfNow {
  counted: number;
  countedOn: string | null;
  usedSinceCount: number;
  onShelf: number;
}

/** What should physically be on the shelf this morning. */
export function shelfNow(item: Pick<InventoryItem, 'onHandBase' | 'lastCountedAt'>, menuByDate: BaseByDate, today: string): ShelfNow {
  const countedOn = countedDay(item.lastCountedAt);
  // Meals on the count day itself are taken to be in the count (counts are taken after service).
  const usedSinceCount = countedOn && countedOn < today
    ? tidy(sumBetween(menuByDate, addDaysStr(countedOn, 1), addDaysStr(today, -1)), 4)
    : 0;
  return {
    counted: item.onHandBase,
    countedOn,
    usedSinceCount,
    onShelf: tidy(Math.max(0, item.onHandBase - usedSinceCount), 4),
  };
}

export interface ShelfBreakdown extends ShelfNow {
  promised: number;
  /** Last day the menu use and deliveries are counted through. */
  through: string;
  menuUse: number;
  incoming: number;
  /** onShelf − promised − menuUse + incoming. Negative means short. */
  left: number;
  /** First day (today … horizon) the shelf is projected to be empty, or null. */
  runOut: string | null;
  cover: number | null;
  status: StockStatus;
}

export function shelfBreakdown(
  item: InventoryItem,
  inp: ShelfInput,
  through: string,
  horizon: string,
): ShelfBreakdown {
  const now = shelfNow(item, inp.menuByDate, inp.today);
  const promised = tidy(sumAll(inp.promisedByDate), 4);
  const menuUse = tidy(sumBetween(inp.menuByDate, inp.today, through), 4);
  const incoming = tidy(sumBetween(inp.incomingByDate, inp.today, through), 4);
  const left = tidy(now.onShelf - promised - menuUse + incoming, 4);

  let runOut: string | null = null;
  let level = now.onShelf;
  // Anything promised for a day before today (past due) is filed under today by the caller.
  for (const d of datesInRange(inp.today, horizon)) {
    level += (inp.incomingByDate.get(d) ?? 0) - (inp.menuByDate.get(d) ?? 0) - (inp.promisedByDate.get(d) ?? 0);
    if (tidy(level, 4) <= 0) {
      runOut = d;
      break;
    }
  }
  const cover = runOut == null ? null : Math.max(0, daysBetween(inp.today, runOut));

  let status: StockStatus;
  if (item.lastCountedAt == null && promised <= 0) {
    // Never counted and nothing promised: nothing worth projecting, keep the count rule.
    status = stockStatus(item);
  } else {
    const par = item.parLevelBase;
    if (left <= 0 || (cover != null && cover <= 3) || (par > 0 && left < par * CRITICAL_FRACTION)) status = 'critical';
    else if ((par > 0 && left < par) || (cover != null && cover <= 7)) status = 'low';
    else status = 'ok';
  }
  return { ...now, promised, through, menuUse, incoming, left, runOut, cover, status };
}

/** "Fri Sep 18" from a camp-local YYYY-MM-DD. */
export function shortDay(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "counted 150 lb on Wed Sep 16", or null for an item never counted. */
export function countedPhrase(item: Pick<InventoryItem, 'stockUnitInBase' | 'stockUnit' | 'dimension'>, s: ShelfNow): string | null {
  if (!s.countedOn) return null;
  return `counted ${formatInStockUnit(item, s.counted)} on ${shortDay(s.countedOn)}`;
}

/**
 * The shelf as one sentence, every term named, so a number on screen can always be checked:
 * "150 lb on shelf − 7 lb promised − 15 lb menu through Fri Sep 18 = 128 lb left".
 */
export function shelfEquation(item: Pick<InventoryItem, 'stockUnitInBase' | 'stockUnit' | 'dimension'>, s: ShelfBreakdown, extraPromised = 0): string {
  const f = (b: number) => formatInStockUnit(item, b);
  const left = s.left - extraPromised;
  const parts = [`${f(s.onShelf)} on shelf`];
  if (s.promised + extraPromised > 0) parts.push(`− ${f(s.promised + extraPromised)} promised to programs`);
  parts.push(`− ${f(s.menuUse)} planned menu use through ${shortDay(s.through)}`);
  if (s.incoming > 0) parts.push(`+ ${f(s.incoming)} arriving by then`);
  return `${parts.join(' ')} = ${left < 0 ? `short ${f(-left)}` : `${f(left)} left`}`;
}

export interface OrderLineMath extends ShelfNow {
  /** Planned menu use today … windowEnd. */
  menuUse: number;
  /** Promised pickups up to windowEnd (past due included). */
  promised: number;
  inTransit: number;
  floor: number;
  projectedAtEnd: number;
  need: number;
}

/**
 * How much to order so the item ends the window at or above its minimum on hand. The same
 * on-shelf figure and the same terms as the Inventory row; perishables are capped at roughly a
 * shelf-life of use plus the minimum.
 */
export function orderLineMath(
  item: InventoryItem,
  inp: ShelfInput,
  windowEnd: string,
): OrderLineMath {
  const now = shelfNow(item, inp.menuByDate, inp.today);
  const menuUse = tidy(sumBetween(inp.menuByDate, inp.today, windowEnd), 4);
  const promised = tidy(sumBetween(inp.promisedByDate, '0000-01-01', windowEnd), 4);
  const inTransit = tidy(sumBetween(inp.incomingByDate, inp.today, windowEnd), 4);
  const floor = item.parLevelBase;
  const projectedAtEnd = tidy(now.onShelf - menuUse - promised + inTransit, 4);
  let need = Math.max(0, floor - projectedAtEnd);
  if (need > 0 && item.shelfLifeDays != null) {
    const capEnd = addDaysStr(inp.today, item.shelfLifeDays);
    const shelfUse = sumBetween(inp.menuByDate, inp.today, capEnd) + sumBetween(inp.promisedByDate, '0000-01-01', capEnd);
    need = Math.min(need, shelfUse + floor);
  }
  return { ...now, menuUse, promised, inTransit, floor, projectedAtEnd, need: tidy(need, 4) };
}

/**
 * "2 × 50 lb bags", "3 cases": a count of packs. A pack whose name starts with a number read as
 * "1 50 lb bag" when the two numbers were simply put side by side.
 */
export function formatPackQty(qty: number, packUnit: string): string {
  const n = tidy(qty);
  const unit = pluralizeUnit(packUnit, n);
  return /^\d/.test(packUnit.trim()) ? `${n.toLocaleString()} × ${unit}` : `${n.toLocaleString()} ${unit}`;
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
  ul, ol { margin: 4px 0; padding-left: 18px; font-size: 12px; }
  ol li { margin-bottom: 4px; line-height: 1.4; }
  .pagebreak { page-break-after: always; }
  .recipe h1 { font-size: 20px; }
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
  let body = `<h1>Production plan · ${dayLabel}</h1><div class="meta">Prep sheet</div>`;
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
  return printDoc(`Production · ${dayLabel}`, body);
}

export interface PrintMenuCell { meal: string; day: string; items: string[]; }

export function menuWeekToPrintHtml(weekLabel: string, days: string[], meals: string[], cells: PrintMenuCell[]): string {
  const at = (meal: string, day: string) => cells.find((c) => c.meal === meal && c.day === day)?.items ?? [];
  let body = `<h1>Menu · ${weekLabel}</h1><table><thead><tr><th></th>${days.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>`;
  for (const meal of meals) {
    body += `<tr><td><strong>${meal}</strong></td>${days.map((d) => `<td>${at(meal, d).join('<br>')}</td>`).join('')}</tr>`;
  }
  body += `</tbody></table>`;
  return printDoc(`Menu · ${weekLabel}`, body);
}

// ─── Recipe export (print) ───────────────────────────────────────────────────

export interface PrintRecipeStep { instruction: string; timing: string | null; }
export interface PrintRecipe {
  name: string;
  mealLabel: string;
  baseYield: number;
  scaledTo: number;
  prepTime: string | null;
  cookTime: string | null;
  allergens: string[];
  ingredients: { label: string; qty: string; unlinked: boolean }[];
  steps: PrintRecipeStep[];
}

/** One or many recipes as a printable recipe book. Quantities are pre-scaled by the caller. */
export function recipesToPrintHtml(recipes: PrintRecipe[]): string {
  const one = (r: PrintRecipe) => {
    const meta = [
      r.mealLabel,
      r.scaledTo === r.baseYield ? `${r.baseYield} portions` : `${r.scaledTo} portions (base ${r.baseYield})`,
      r.prepTime && `prep ${r.prepTime}`,
      r.cookTime && `cook ${r.cookTime}`,
    ].filter(Boolean).join(' · ');
    const allergens = r.allergens.length
      ? `<div class="meta"><strong>Allergens:</strong> ${r.allergens.map((a) => ALLERGEN_LABELS[a as Allergen] ?? a).join(', ')}</div>`
      : '';
    const ings = r.ingredients.map((i) =>
      `<tr><td>${i.unlinked ? '• ' : ''}${i.label}</td><td class="num">${i.qty}</td></tr>`).join('');
    const steps = r.steps.length
      ? `<ol>${r.steps.map((s) => `<li>${s.timing ? `<strong>[${s.timing}]</strong> ` : ''}${s.instruction}</li>`).join('')}</ol>`
      : '<p class="meta">No method recorded.</p>';
    return `<section class="recipe"><h1>${r.name}</h1><div class="meta">${meta}</div>${allergens}
      <h2>Ingredients</h2><table><tbody>${ings || '<tr><td class="meta">No ingredients.</td></tr>'}</tbody></table>
      <h2>Method</h2>${steps}</section>`;
  };
  const title = recipes.length === 1 ? recipes[0].name : `Recipe book (${recipes.length})`;
  return printDoc(`Recipe · ${title}`, recipes.map(one).join('<div class="pagebreak"></div>'));
}

export interface PrintCountGroup { location: string; items: { name: string; unit: string; reorderAt: string; onHand: string }[]; }

// ─── CSV import ──────────────────────────────────────────────────────────────
// A vendor order guide is a spreadsheet. Parse it into rows the import mapper can align
// to our fields. Handles quoted cells, escaped quotes, and \r\n, enough for real
// exports from Sysco/US Foods/Excel. Not a full RFC parser; it doesn't need to be.

// Moved to lib/csv.ts so Receipts can use it without importing a Commissary module.
export { parseCsv } from './csv';

/** The fields a CSV column can be mapped to. `skip` = ignore the column. */
export const CSV_FIELDS = [
  { value: 'skip', label: 'ignore' },
  { value: 'name', label: 'Item name' },
  { value: 'category', label: 'Category' },
  { value: 'stockUnit', label: 'Stocked by (unit)' },
  { value: 'packUnit', label: 'Vendor pack unit (case…)' },
  { value: 'packSize', label: 'Pack size (stock units per pack)' },
  { value: 'price', label: 'Price per pack' },
  { value: 'onHand', label: 'On hand' },
  { value: 'reorderAt', label: 'Reorder at' },
] as const;
export type CsvField = (typeof CSV_FIELDS)[number]['value'];

/** Best-guess field for a header name, so the mapper starts pre-aligned. */
export function guessCsvField(header: string): CsvField {
  const h = header.trim().toLowerCase();
  if (/(^|[^a-z])(item|product|description|name)([^a-z]|$)/.test(h)) return 'name';
  if (/categ|class|group/.test(h)) return 'category';
  if (/pack.*size|per\s*case|count|qty.*pack|split/.test(h)) return 'packSize';
  if (/pack|case|unit\s*of|uom|sold/.test(h)) return 'packUnit';
  if (/price|cost|each\s*\$|\$/.test(h)) return 'price';
  if (/on.?hand|in.?stock|current/.test(h)) return 'onHand';
  if (/reorder|par|min/.test(h)) return 'reorderAt';
  if (/stock.*by|base.*unit|unit/.test(h)) return 'stockUnit';
  return 'skip';
}

/** Match a free-text category string to a known category slug, else 'other'. */
export function matchCategory(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return 'other';
  for (const [slug, label] of Object.entries(CATEGORY_LABELS)) {
    if (s === slug || s === label.toLowerCase() || label.toLowerCase().includes(s) || s.includes(slug)) return slug;
  }
  if (/meat|beef|chicken|pork|poultry|protein/.test(s)) return 'protein';
  if (/veg|fruit|produce/.test(s)) return 'produce';
  if (/dairy|milk|cheese/.test(s)) return 'dairy';
  if (/frozen/.test(s)) return 'frozen';
  if (/dry|grocery|canned|pantry/.test(s)) return 'dry_goods';
  if (/drink|beverage|juice|soda/.test(s)) return 'beverage';
  return 'other';
}

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
