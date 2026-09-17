import { describe, it, expect } from 'vitest';
import type { InventoryItem, RecipeIngredient } from '@/lib/types';
import { derivedKosherType, kosherTypeOf, recipeKosher, kosherFlagsForDay, type DishKosherInfo } from '@/lib/kosher';

function item(name: string, category: InventoryItem['category'], allergens: string[] = [], kosherType: InventoryItem['kosherType'] = null): InventoryItem {
  return {
    id: name, name, category, storageLocation: 'other', dimension: 'weight', baseUnit: 'g', stockUnit: 'lb', stockUnitInBase: 453.592,
    purchaseUnit: 'lb', purchaseUnitInBase: 453.592, unitPrice: null, onHandBase: 0, parLevelBase: 0, lastCountedAt: null,
    shelfLifeDays: null, vendorId: null, allergens, dietary: [], kosherType, notes: null, sortOrder: 0, createdAt: '', updatedAt: '',
  };
}
function ing(itemId: string): RecipeIngredient {
  return { id: `i-${itemId}`, recipeId: 'r', itemId, label: itemId, qtyInBase: 1, freeTextQty: null, allergenOverride: null, sortOrder: 0, createdAt: '', updatedAt: '' };
}

// The demo kitchen's pantry, as seeded.
const pantry = [
  item('Ground beef', 'protein'), item('Chicken thighs', 'protein'),
  item('Large eggs', 'dairy', ['egg']), item('Whole milk', 'dairy', ['dairy']), item('Unsalted butter', 'dairy', ['dairy']),
  item('Shredded mozzarella', 'dairy', ['dairy']), item('Semi-sweet chocolate chips', 'dry_goods', ['dairy', 'soy']),
  item('Dairy-free chocolate chips', 'dry_goods', ['soy']), item('Vegetable oil', 'pantry'), item('All-purpose flour', 'dry_goods', ['gluten']),
  item('Salmon fillets', 'protein', ['fish']),
];
const byId = new Map(pantry.map((i) => [i.id, i]));

describe('kosher types', () => {
  it('works out meat, dairy and pareve from what the item already says', () => {
    expect(derivedKosherType(byId.get('Ground beef')!)).toBe('meat');
    expect(derivedKosherType(byId.get('Chicken thighs')!)).toBe('meat');
    expect(derivedKosherType(byId.get('Whole milk')!)).toBe('dairy');
    expect(derivedKosherType(byId.get('Semi-sweet chocolate chips')!)).toBe('dairy');
    // Eggs sit in the dairy fridge and fish in protein; both are pareve.
    expect(derivedKosherType(byId.get('Large eggs')!)).toBe('pareve');
    expect(derivedKosherType(byId.get('Salmon fillets')!)).toBe('pareve');
    expect(derivedKosherType(byId.get('Dairy-free chocolate chips')!)).toBe('pareve');
    expect(derivedKosherType(item('Veggie sausage', 'protein', ['contains_meat']))).toBe('meat');
  });

  it('the kitchen’s own setting wins', () => {
    expect(kosherTypeOf(item('Parve margarine', 'dairy', [], 'pareve'))).toBe('pareve');
  });

  it('rolls a recipe up, and calls meat with dairy mixed', () => {
    expect(recipeKosher([ing('Ground beef'), ing('All-purpose flour')], byId).type).toBe('meat');
    expect(recipeKosher([ing('Dairy-free chocolate chips'), ing('Vegetable oil'), ing('Large eggs')], byId).type).toBe('pareve');
    const cheeseburger = recipeKosher([ing('Ground beef'), ing('Shredded mozzarella')], byId);
    expect(cheeseburger).toEqual({ type: 'mixed', meat: ['Ground beef'], dairy: ['Shredded mozzarella'] });
  });
});

describe('menu flags', () => {
  const kinds: Record<string, DishKosherInfo> = {
    tacos: { type: 'meat', meat: ['Ground beef'], dairy: [] },
    salad: { type: 'pareve', meat: [], dairy: [] },
    cookiesPareve: { type: 'pareve', meat: [], dairy: [] },
    cookiesButter: { type: 'dairy', meat: [], dairy: ['Unsalted butter'] },
    pizza: { type: 'dairy', meat: [], dairy: ['Shredded mozzarella'] },
    cheeseburger: { type: 'mixed', meat: ['Ground beef'], dairy: ['Shredded mozzarella'] },
  };
  const kindOf = (id: string) => kinds[id.split(':')[0]] ?? null;
  const e = (id: string, mealPeriod: 'breakfast' | 'lunch' | 'dinner' | 'snack', label = id) => ({ id, mealPeriod, label });

  it('a pareve dessert after a meat dinner is fine (the demo’s Wed and Sat)', () => {
    const flags = kosherFlagsForDay([e('tacos', 'dinner'), e('salad', 'dinner'), e('cookiesPareve', 'snack')], kindOf);
    expect(flags.size).toBe(0);
  });

  it('flags a dairy snack after a meat dinner, and explains the rule', () => {
    const flags = kosherFlagsForDay([e('tacos', 'dinner', 'Beef tacos'), e('cookiesButter', 'snack', 'Cookies')], kindOf);
    expect([...flags.keys()]).toEqual(['cookiesButter']);
    expect(flags.get('cookiesButter')![0]).toMatch(/after a meat dinner \(Beef tacos\)/);
  });

  it('a dairy snack after a dairy lunch with no dinner planned is fine', () => {
    expect(kosherFlagsForDay([e('tacos', 'breakfast'), e('pizza', 'lunch'), e('cookiesButter', 'snack')], kindOf).size).toBe(0);
  });

  it('flags meat and dairy in the same meal, on both dishes', () => {
    const flags = kosherFlagsForDay([e('tacos', 'lunch', 'Beef tacos'), e('pizza', 'lunch', 'Pizza'), e('salad', 'lunch')], kindOf);
    expect([...flags.keys()].sort()).toEqual(['pizza', 'tacos']);
    expect(flags.get('pizza')![0]).toBe('Dairy in the same lunch as Beef tacos (meat).');
  });

  it('flags a dish that is meat and dairy by itself', () => {
    const flags = kosherFlagsForDay([e('cheeseburger', 'dinner', 'Cheeseburger')], kindOf);
    expect(flags.get('cheeseburger')![0]).toBe('Meat and dairy in one dish: Ground beef with Shredded mozzarella.');
  });

  it('ignores free-text chips it cannot judge', () => {
    expect(kosherFlagsForDay([e('tacos', 'dinner'), e('mystery', 'dinner')], kindOf).size).toBe(0);
  });
});
