/**
 * Meat, dairy and pareve, for a kitchen that serves fully kosher.
 *
 * A kitchen manager at a kosher camp reviewed the demo and found the menu builder could not tell a
 * dairy dessert from a pareve one, so nothing warned when cookies made with butter followed a beef
 * dinner. Items now carry a kosher type (set by the kitchen, or worked out from what the item
 * already says about itself), recipes roll up from their ingredients, and the menu flags two
 * things: meat and dairy in the same meal, and a dairy snack after a meat meal.
 *
 * Pure: no store, no Supabase, so the rules are unit-tested in isolation.
 */
import type { InventoryItem, KosherType, MealPeriod, MenuEntry, RecipeIngredient } from './types';

export const KOSHER_TYPES: KosherType[] = ['meat', 'dairy', 'pareve'];
export const KOSHER_LABELS: Record<KosherType, string> = { meat: 'Meat', dairy: 'Dairy', pareve: 'Pareve' };
export const KOSHER_LETTER: Record<KosherType | 'mixed', string> = { meat: 'M', dairy: 'D', pareve: 'P', mixed: 'M+D' };

/**
 * What an item is when the kitchen has not said: meat for anything flagged "contains meat" or kept
 * as a protein (fish and eggs excepted, which are pareve), dairy for anything with the dairy
 * allergen or kept as dairy (eggs excepted: they live in the dairy fridge and are pareve), pareve
 * otherwise.
 */
export function derivedKosherType(item: Pick<InventoryItem, 'name' | 'category' | 'allergens'>): KosherType {
  const flags = new Set(item.allergens);
  const name = item.name.toLowerCase();
  const eggOrFish = flags.has('egg') || flags.has('fish') || /\beggs?\b|\bfish\b|salmon|tuna|tilapia|cod\b/.test(name);
  if (flags.has('dairy')) return 'dairy';
  if (flags.has('contains_meat')) return 'meat';
  if (item.category === 'protein' && !eggOrFish && !/\btofu\b|\bbeans?\b|lentil|chickpea|tempeh/.test(name)) return 'meat';
  if (item.category === 'dairy' && !eggOrFish) return 'dairy';
  return 'pareve';
}

export function kosherTypeOf(item: Pick<InventoryItem, 'name' | 'category' | 'allergens' | 'kosherType'>): KosherType {
  return item.kosherType ?? derivedKosherType(item);
}

export type DishKosher = KosherType | 'mixed';

export interface DishKosherInfo {
  type: DishKosher;
  /** Names of the meat and dairy ingredients, for the tooltip. */
  meat: string[];
  dairy: string[];
}

/** A recipe's type from its linked ingredients: meat and dairy together is 'mixed' (and flagged). */
export function recipeKosher(ingredients: RecipeIngredient[], itemsById: Map<string, InventoryItem>): DishKosherInfo {
  const meat = new Set<string>();
  const dairy = new Set<string>();
  for (const ing of ingredients) {
    const item = ing.itemId ? itemsById.get(ing.itemId) : undefined;
    if (!item) continue;
    const t = kosherTypeOf(item);
    if (t === 'meat') meat.add(item.name);
    if (t === 'dairy') dairy.add(item.name);
  }
  const type: DishKosher = meat.size && dairy.size ? 'mixed' : meat.size ? 'meat' : dairy.size ? 'dairy' : 'pareve';
  return { type, meat: [...meat], dairy: [...dairy] };
}

export interface KosherFlag {
  entryId: string;
  message: string;
}

const MEAL_ORDER: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The menu's kosher problems for one day, per chip. `kindOf` gives each entry's type, or null for a
 * free-text chip nobody can judge.
 *
 *   * a dish that is itself meat and dairy
 *   * dairy in a meal that also serves meat
 *   * a dairy snack when the meal before it that day serves meat. The menu does not know how many
 *     hours apart they are, so a snack is judged against the meal listed before it.
 */
export function kosherFlagsForDay(
  entries: Pick<MenuEntry, 'id' | 'mealPeriod' | 'label'>[],
  kindOf: (entryId: string) => DishKosherInfo | null,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, msg: string) => { const a = out.get(id); if (a) a.push(msg); else out.set(id, [msg]); };
  const byMeal = new Map<MealPeriod, { id: string; label: string; k: DishKosherInfo }[]>();
  for (const e of entries) {
    const k = kindOf(e.id);
    if (!k) continue;
    const arr = byMeal.get(e.mealPeriod) ?? [];
    arr.push({ id: e.id, label: e.label ?? 'this dish', k });
    byMeal.set(e.mealPeriod, arr);
  }
  const hasMeat = (k: DishKosherInfo) => k.type === 'meat' || k.type === 'mixed';
  const hasDairy = (k: DishKosherInfo) => k.type === 'dairy' || k.type === 'mixed';

  for (const [meal, dishes] of byMeal) {
    for (const d of dishes) {
      if (d.k.type === 'mixed') {
        add(d.id, `Meat and dairy in one dish: ${d.k.meat.join(', ')} with ${d.k.dairy.join(', ')}.`);
      }
    }
    const meatDish = dishes.find((d) => hasMeat(d.k));
    const dairyDish = dishes.find((d) => hasDairy(d.k));
    if (meatDish && dairyDish && meatDish.id !== dairyDish.id) {
      for (const d of dishes) {
        if (d.k.type === 'dairy') add(d.id, `Dairy in the same ${meal} as ${meatDish.label} (meat).`);
        if (d.k.type === 'meat') add(d.id, `Meat in the same ${meal} as ${dairyDish.label} (dairy).`);
      }
    }
    if (meal === 'snack') {
      const before = [...MEAL_ORDER.slice(0, MEAL_ORDER.indexOf('snack'))].reverse().find((m) => (byMeal.get(m) ?? []).length > 0);
      const meatBefore = before ? byMeal.get(before)!.find((d) => hasMeat(d.k)) : undefined;
      if (before && meatBefore) {
        for (const d of dishes) {
          if (d.k.type === 'dairy') {
            add(d.id, `Dairy snack after a meat ${before} (${meatBefore.label}). A kosher kitchen waits after meat before serving dairy; make it pareve or move it.`);
          }
        }
      }
    }
  }
  return out;
}
