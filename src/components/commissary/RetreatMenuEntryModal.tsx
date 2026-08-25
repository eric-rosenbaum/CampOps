import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useRetreatStore } from '@/store/retreatStore';
import { generateId } from '@/lib/utils';
import type { MealPeriod, RetreatMenuEntry } from '@/lib/types';
import { MEAL_PERIOD_LABELS, MEASURE_UNITS, toBase, formatQty, fromBase, ALLERGENS } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

type EntryType = 'recipe' | 'item' | 'free';

export function RetreatMenuEntryModal({ retreatId, dayDate, mealPeriod, editId }: {
  retreatId: string; dayDate: string; mealPeriod: MealPeriod; editId?: string;
}) {
  const {
    recipes, items, itemsById, retreatEntriesFor, addRetreatMenuEntry, updateRetreatMenuEntry, closeModal,
  } = useCommissaryStore();
  const retreat = useRetreatStore((s) => s.retreats.find((r) => r.id === retreatId));
  const byId = itemsById();
  const existing = editId ? retreatEntriesFor(retreatId).find((e) => e.id === editId) ?? null : null;

  const [entryType, setEntryType] = useState<EntryType>(existing?.recipeId ? 'recipe' : existing?.itemId ? 'item' : existing ? 'free' : 'recipe');
  const [recipeId, setRecipeId] = useState(existing?.recipeId ?? '');
  const [itemId, setItemId] = useState(existing?.itemId ?? '');
  const [itemQty, setItemQty] = useState('1');
  const [itemUnit, setItemUnit] = useState(existing?.itemId ? (byId.get(existing.itemId)?.baseUnit ?? '') : '');
  const [customLabel, setCustomLabel] = useState(existing?.label ?? '');
  const [allergens, setAllergens] = useState<string[]>(existing?.allergens ?? []);
  const [alternatives, setAlternatives] = useState(existing?.alternatives ?? '');
  const [portionsOverride, setPortionsOverride] = useState(existing?.portionsOverride != null ? String(existing.portionsOverride) : '');

  const dateLabel = new Date(dayDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const matching = recipes.filter((r) => r.mealPeriod === mealPeriod);
  const others = recipes.filter((r) => r.mealPeriod !== mealPeriod);
  const selectedItem = itemId ? byId.get(itemId) : undefined;
  const units = selectedItem ? MEASURE_UNITS[selectedItem.dimension] : [];

  function pickItem(id: string) {
    setItemId(id);
    const item = id ? byId.get(id) : undefined;
    setItemUnit(item ? item.baseUnit : '');
  }
  function itemQtyInBase(): number | null {
    if (!selectedItem) return null;
    const n = Number(itemQty);
    if (!Number.isFinite(n) || itemQty === '') return null;
    const unitDef = MEASURE_UNITS[selectedItem.dimension].find((u) => u.value === itemUnit);
    return unitDef ? toBase(n, unitDef.inBase) : n;
  }
  const qtyBase = itemQtyInBase();

  function toggleAllergen(a: string) {
    setAllergens((s) => s.includes(a) ? s.filter((x) => x !== a) : [...s, a]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const common = {
      id: existing?.id ?? generateId(), campId: existing?.campId ?? '', retreatId, dayDate, mealPeriod,
      allergens: allergens.length ? allergens : null,
      alternatives: alternatives.trim() || null,
      portionsOverride: portionsOverride.trim() ? Math.max(0, Math.round(Number(portionsOverride))) : null,
      sortOrder: existing?.sortOrder ?? retreatEntriesFor(retreatId, dayDate, mealPeriod).length,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    let entry: RetreatMenuEntry;
    if (entryType === 'recipe') {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      entry = { ...common, recipeId: recipe.id, itemId: null, itemQtyBase: null, label: null };
    } else if (entryType === 'item') {
      if (!selectedItem || qtyBase == null) return;
      entry = { ...common, recipeId: null, itemId: selectedItem.id, itemQtyBase: qtyBase, label: null };
    } else {
      const label = customLabel.trim();
      if (!label) return;
      entry = { ...common, recipeId: null, itemId: null, itemQtyBase: null, label };
    }
    if (existing) updateRetreatMenuEntry(entry); else addRetreatMenuEntry(entry);
    closeModal();
  }

  const canSubmit =
    (entryType === 'recipe' && !!recipeId) ||
    (entryType === 'item' && !!selectedItem && qtyBase != null) ||
    (entryType === 'free' && !!customLabel.trim());

  const TYPE_TABS: { id: EntryType; label: string }[] = [
    { id: 'recipe', label: 'Recipe' },
    { id: 'item', label: 'Single item' },
    { id: 'free', label: 'Free text' },
  ];

  return (
    <Modal title={existing ? 'Edit dish' : `Add to ${MEAL_PERIOD_LABELS[mealPeriod].toLowerCase()}`} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-2.5">
          <p className="text-[12px] text-ink-soft">{retreat?.groupName ?? 'Retreat'} · {dateLabel}</p>
        </div>

        <div className="flex gap-1.5">
          {TYPE_TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setEntryType(t.id)}
              className={`flex-1 px-3 py-1.5 rounded-btn text-[12px] font-medium border transition-colors ${
                entryType === t.id ? 'bg-forest text-cream border-forest' : 'bg-white text-ink-soft border-border hover:border-forest/30'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {entryType === 'recipe' && (
          <div>
            <label className={labelClass}>Recipe</label>
            <select autoFocus value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass}>
              <option value="">Select a recipe</option>
              {matching.length > 0 && (
                <optgroup label={MEAL_PERIOD_LABELS[mealPeriod]}>
                  {matching.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other meal periods">
                  {others.map((r) => <option key={r.id} value={r.id}>{r.name} ({MEAL_PERIOD_LABELS[r.mealPeriod]})</option>)}
                </optgroup>
              )}
            </select>
            {recipes.length === 0 && <p className="text-[11px] text-ink-faint mt-1.5">No recipes yet. Add one on the Recipe guide tab.</p>}
          </div>
        )}

        {entryType === 'item' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Inventory item</label>
              <select autoFocus value={itemId} onChange={(e) => pickItem(e.target.value)} className={inputClass}>
                <option value="">Select an item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            {selectedItem && (
              <div className="grid grid-cols-[1fr_1.2fr] gap-2 items-end">
                <div>
                  <label className={labelClass}>Per portion</label>
                  <input type="number" step="any" min="0" value={itemQty} onChange={(e) => setItemQty(e.target.value)} className={inputClass} placeholder="1" />
                </div>
                <div>
                  <label className={labelClass}>Unit</label>
                  <select value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} className={inputClass}>
                    {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                {qtyBase != null && (
                  <p className="col-span-2 -mt-1 text-[11px] text-ink-faint font-mono">
                    = {formatQty(fromBase(qtyBase, selectedItem.stockUnitInBase), selectedItem.stockUnit)} per portion
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {entryType === 'free' && (
          <div>
            <label className={labelClass}>Dish name *</label>
            <input autoFocus value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} className={inputClass} placeholder="e.g. Salad bar, Fresh fruit" />
            <p className="text-[11px] text-ink-faint mt-1.5">Free-text dishes show on the menu but don't count toward ordering.</p>
          </div>
        )}

        {/* Guest-facing allergens + alternatives (shown on the portal menu) */}
        <div>
          <label className={labelClass}>Allergens (shown to guests)</label>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <button key={a} type="button" onClick={() => toggleAllergen(a)}
                className={`px-2 py-1 rounded-tag text-[11px] font-medium border capitalize transition-colors ${
                  allergens.includes(a) ? 'bg-amber-bg text-amber-text border-amber/30' : 'bg-white text-ink-soft border-border hover:border-forest/30'
                }`}>
                {a.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>Alternatives / notes (optional)</label>
          <input value={alternatives} onChange={(e) => setAlternatives(e.target.value)} className={inputClass} placeholder="e.g. GF & veg option available" />
        </div>
        <div>
          <label className={labelClass}>Portions override (optional)</label>
          <input type="number" min="0" step="1" value={portionsOverride} onChange={(e) => setPortionsOverride(e.target.value)} className={inputClass} placeholder={`Default: ${retreat?.headcount ?? 0} (group headcount)`} />
          <p className="text-[11px] text-ink-faint mt-1.5">How many servings to make/order for. Leave blank to use the group's headcount.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canSubmit}>{existing ? 'Save' : 'Add to menu'}</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
