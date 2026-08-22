import { useState } from 'react';
import { Link2Off } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { MealPeriod, MenuEntry } from '@/lib/types';
import {
  MEAL_PERIOD_LABELS, dateForCell, MEASURE_UNITS, toBase, formatQty, fromBase,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

interface Props {
  weekNumber: number;
  dayIndex: number;
  mealPeriod: MealPeriod;
}

type EntryType = 'recipe' | 'item' | 'free';

export function MenuEntryModal({ weekNumber, dayIndex, mealPeriod }: Props) {
  const {
    recipes, items, itemsById, activeSession, entriesForCell, addMenuEntry, closeModal,
    coursesSorted, openModal,
  } = useCommissaryStore();
  const session = activeSession();
  const byId = itemsById();
  const courses = coursesSorted();

  const [entryType, setEntryType] = useState<EntryType>('recipe');
  const [recipeId, setRecipeId] = useState('');
  const [itemId, setItemId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemUnit, setItemUnit] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [course, setCourse] = useState('');

  if (!session) return null;

  const date = dateForCell(session.startDate, weekNumber, dayIndex);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const matching = recipes.filter((r) => r.mealPeriod === mealPeriod);
  const others = recipes.filter((r) => r.mealPeriod !== mealPeriod);

  const selectedItem = itemId ? byId.get(itemId) : undefined;
  const units = selectedItem ? MEASURE_UNITS[selectedItem.dimension] : [];

  function pickItem(id: string) {
    setItemId(id);
    const item = id ? byId.get(id) : undefined;
    // Default the per-portion unit to the item's base unit, the most natural for a
    // small per-head serving (8 fl oz milk, 1 each banana).
    setItemUnit(item ? item.baseUnit : '');
  }

  /** Base-unit quantity of the item per portion, or null if unparseable. */
  function itemQtyInBase(): number | null {
    if (!selectedItem) return null;
    const n = Number(itemQty);
    if (!Number.isFinite(n) || itemQty === '') return null;
    const unitDef = MEASURE_UNITS[selectedItem.dimension].find((u) => u.value === itemUnit);
    return unitDef ? toBase(n, unitDef.inBase) : n;
  }

  const qtyBase = itemQtyInBase();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const now = new Date().toISOString();
    const base: Omit<MenuEntry, 'recipeId' | 'itemId' | 'itemQtyBase' | 'label'> = {
      id: generateId(),
      sessionId: session.id,
      weekNumber, dayIndex, mealPeriod,
      course: course || null,
      sortOrder: entriesForCell(weekNumber, dayIndex, mealPeriod).length,
      createdAt: now, updatedAt: now,
    };

    let entry: MenuEntry;
    if (entryType === 'recipe') {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      entry = { ...base, recipeId: recipe.id, itemId: null, itemQtyBase: null, label: recipe.name };
    } else if (entryType === 'item') {
      if (!selectedItem || qtyBase == null) return;
      entry = { ...base, recipeId: null, itemId: selectedItem.id, itemQtyBase: qtyBase, label: selectedItem.name };
    } else {
      const label = customLabel.trim();
      if (!label) return;
      entry = { ...base, recipeId: null, itemId: null, itemQtyBase: null, label };
    }
    addMenuEntry(entry);
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
    <Modal title={`Add to ${MEAL_PERIOD_LABELS[mealPeriod].toLowerCase()}`} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-2.5">
          <p className="text-[12px] text-ink-soft">
            {dateLabel} · week {weekNumber}
          </p>
        </div>

        {/* Type selector */}
        <div className="flex gap-1.5">
          {TYPE_TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setEntryType(t.id)}
              className={`flex-1 px-3 py-1.5 rounded-btn text-[12px] font-medium border transition-colors ${
                entryType === t.id ? 'bg-forest text-cream border-forest' : 'bg-white text-ink-soft border-border hover:border-forest/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {entryType === 'recipe' && (
          <div>
            <label className={labelClass}>Recipe</label>
            <select autoFocus value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass}>
              <option value="">— Select a recipe —</option>
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
            {recipes.length === 0 && (
              <p className="text-[11px] text-ink-faint mt-1.5">No recipes yet — add one on the Recipe guide tab.</p>
            )}
          </div>
        )}

        {entryType === 'item' && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Inventory item</label>
              <select autoFocus value={itemId} onChange={(e) => pickItem(e.target.value)} className={inputClass}>
                <option value="">— Select an item —</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed">
                A single item (milk, fruit, bread) with no recipe. It still counts toward
                ordering demand and allergen totals.
              </p>
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
                    = {formatQty(fromBase(qtyBase, selectedItem.stockUnitInBase), selectedItem.stockUnit)} per portion · scales to the meal's head count
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {entryType === 'free' && (
          <div>
            <label className={labelClass}>Item name *</label>
            <input
              autoFocus value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
              className={inputClass} placeholder="e.g. Salad bar, OJ / Milk, Fresh fruit"
            />
            <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed flex gap-1.5">
              <Link2Off className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>Free-text items appear on the menu but are invisible to ordering demand and allergen totals.</span>
            </p>
          </div>
        )}

        {/* Course bucket — applies to any chip */}
        <div>
          <label className={labelClass}>Course (optional)</label>
          <div className="flex gap-2">
            <select value={course} onChange={(e) => setCourse(e.target.value)} className={inputClass}>
              <option value="">— No course —</option>
              {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <Button type="button" variant="ghost" size="sm" className="whitespace-nowrap" onClick={() => openModal({ kind: 'courses' })}>
              Manage
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canSubmit}>Add to menu</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
