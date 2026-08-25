import { useState } from 'react';
import { Plus, X, Link2Off } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { Recipe, RecipeIngredient, RecipeStep, MealPeriod } from '@/lib/types';
import {
  MEAL_PERIODS, MEAL_PERIOD_LABELS, MEASURE_UNITS,
  toBase, fromBase, formatQty, tidy, recipeAllergens,
  PREP_TIMING_PRESETS, presetForStep, presetByValue,
} from '@/lib/commissaryUnits';
import { AllergenChips, inputClass, labelClass } from './commissaryUi';

// A row in the editor. Quantity is typed in whatever unit suits the cook ("5.5 qt")
// and converted to the item's base unit on save, via the item's own dimension.
interface DraftIngredient {
  key: string;
  itemId: string;      // '' = unlinked, free text
  label: string;
  qty: string;
  unit: string;        // one of MEASURE_UNITS[dimension]
  freeTextQty: string; // used only when unlinked
}

function newDraft(): DraftIngredient {
  return { key: generateId(), itemId: '', label: '', qty: '', unit: '', freeTextQty: '' };
}

// A step row in the editor, with a prep-timing preset value (see PREP_TIMING_PRESETS).
interface DraftStep {
  key: string;
  instruction: string;
  preset: string;
}

export function AddEditRecipeModal({ editId }: { editId?: string }) {
  const {
    recipes, items, itemsById, ingredientsFor, stepsFor,
    saveRecipe, deleteRecipe, closeModal,
  } = useCommissaryStore();
  const existing = editId ? recipes.find((r) => r.id === editId) ?? null : null;
  const byId = itemsById();

  const [name, setName] = useState(existing?.name ?? '');
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(existing?.mealPeriod ?? 'dinner');
  const [baseYield, setBaseYield] = useState(String(existing?.baseYield ?? 50));
  const [prepTime, setPrepTime] = useState(existing?.prepTime ?? '');
  const [cookTime, setCookTime] = useState(existing?.cookTime ?? '');

  const [drafts, setDrafts] = useState<DraftIngredient[]>(() => {
    if (!existing) return [newDraft()];
    const rows = ingredientsFor(existing.id).map<DraftIngredient>((g) => {
      const item = g.itemId ? byId.get(g.itemId) : undefined;
      // Round-trip the stored base quantity back into the item's stock unit, which
      // is the unit a cook most likely typed it in.
      const unit = item ? item.baseUnit : '';
      return {
        key: g.id,
        itemId: g.itemId ?? '',
        label: g.label,
        qty: g.qtyInBase != null ? String(tidy(g.qtyInBase, 4)) : '',
        unit,
        freeTextQty: g.freeTextQty ?? '',
      };
    });
    return rows.length ? rows : [newDraft()];
  });

  // Each step carries an optional prep-timing preset ("night before") so the production
  // prep calendar can schedule it. Early recipes may carry prose in `method` with no step
  // rows, seed from that so saving migrates it into steps rather than dropping it.
  const [stepDrafts, setStepDrafts] = useState<DraftStep[]>(() => {
    if (existing) {
      const rows = stepsFor(existing.id);
      if (rows.length) return rows.map((s) => ({ key: s.id, instruction: s.instruction, preset: presetForStep(s) }));
      if (existing.method) {
        return existing.method.split('\n').map((l) => l.trim()).filter(Boolean)
          .map((instruction) => ({ key: generateId(), instruction, preset: 'day_of' }));
      }
    }
    return [{ key: generateId(), instruction: '', preset: 'day_of' }];
  });

  function patchStep(key: string, p: Partial<DraftStep>) {
    setStepDrafts((d) => d.map((x) => x.key === key ? { ...x, ...p } : x));
  }

  function patch(key: string, p: Partial<DraftIngredient>) {
    setDrafts((d) => d.map((x) => x.key === key ? { ...x, ...p } : x));
  }

  function pickItem(key: string, itemId: string) {
    const item = itemId ? byId.get(itemId) : undefined;
    patch(key, {
      itemId,
      label: item ? item.name : '',
      // Default the entry unit to the item's base unit; the cook can widen it.
      unit: item ? item.baseUnit : '',
    });
  }

  /** Base-unit value for a draft row, or null if unlinked / unparseable. */
  function draftQtyInBase(d: DraftIngredient): number | null {
    const item = d.itemId ? byId.get(d.itemId) : undefined;
    if (!item) return null;
    const n = Number(d.qty);
    if (!Number.isFinite(n) || d.qty === '') return null;
    const unitDef = MEASURE_UNITS[item.dimension].find((u) => u.value === d.unit);
    // Unknown unit => the number was already typed in base units.
    return unitDef ? toBase(n, unitDef.inBase) : n;
  }

  // Live allergen preview: the union the recipe will inherit from its linked items.
  const previewIngredients: RecipeIngredient[] = drafts
    .filter((d) => d.itemId)
    .map((d) => ({
      id: d.key, recipeId: existing?.id ?? '', itemId: d.itemId, label: d.label,
      qtyInBase: draftQtyInBase(d), freeTextQty: null, allergenOverride: null,
      sortOrder: 0, createdAt: '', updatedAt: '',
    }));
  const previewAllergens = recipeAllergens(previewIngredients, byId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const yieldN = Number(baseYield);
    if (!name.trim() || !Number.isFinite(yieldN) || yieldN <= 0) return;
    const now = new Date().toISOString();
    const recipeId = existing?.id ?? generateId();

    const recipe: Recipe = {
      id: recipeId,
      name: name.trim(),
      mealPeriod,
      baseYield: yieldN,
      // Not edited here. The scale lives on the recipe card, so preserve whatever it holds.
      scaleTo: existing?.scaleTo ?? null,
      prepTime: prepTime.trim() || null,
      cookTime: cookTime.trim() || null,
      // The editor writes steps, not prose. Clearing `method` prevents a legacy
      // recipe from rendering its old prose alongside the steps it just became.
      method: null,
      notes: existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const ingredients: RecipeIngredient[] = drafts
      .filter((d) => d.label.trim() || d.itemId)
      .map((d, idx) => {
        const linked = Boolean(d.itemId);
        const qtyInBase = draftQtyInBase(d);
        return {
          id: generateId(),
          recipeId,
          // A linked row with no parseable quantity would violate the table's CHECK,
          // so it degrades to an unlinked free-text ingredient rather than failing.
          itemId: linked && qtyInBase != null ? d.itemId : null,
          label: (d.label.trim() || byId.get(d.itemId)?.name) ?? 'Ingredient',
          qtyInBase: linked && qtyInBase != null ? qtyInBase : null,
          freeTextQty: linked && qtyInBase != null ? null : (d.freeTextQty.trim() || d.qty.trim() || null),
          allergenOverride: null,
          sortOrder: idx,
          createdAt: now,
          updatedAt: now,
        };
      });

    const steps: RecipeStep[] = stepDrafts
      .filter((s) => s.instruction.trim())
      .map((s, i) => {
        const preset = presetByValue(s.preset);
        return {
          id: generateId(), recipeId, stepNumber: i + 1, instruction: s.instruction.trim(),
          leadDays: preset.leadDays, timeSlot: preset.timeSlot,
          createdAt: now, updatedAt: now,
        };
      });

    saveRecipe(recipe, ingredients, steps, !existing);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete recipe "${existing.name}"? Menu chips using it will keep its name as plain text.`)) {
      deleteRecipe(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit recipe' : 'Add recipe'} onClose={closeModal} width="720px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
          <div>
            <label className={labelClass}>Recipe name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Scrambled eggs" />
          </div>
          <div>
            <label className={labelClass}>Meal period</label>
            <select value={mealPeriod} onChange={(e) => setMealPeriod(e.target.value as MealPeriod)} className={inputClass}>
              {MEAL_PERIODS.map((m) => <option key={m} value={m}>{MEAL_PERIOD_LABELS[m]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Base yield (portions) *</label>
            <input type="number" min={1} value={baseYield} onChange={(e) => setBaseYield(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Prep time</label>
            <input value={prepTime} onChange={(e) => setPrepTime(e.target.value)} className={inputClass} placeholder="e.g. 20 min" />
          </div>
          <div>
            <label className={labelClass}>Cook time</label>
            <input value={cookTime} onChange={(e) => setCookTime(e.target.value)} className={inputClass} placeholder="e.g. 45 min" />
          </div>
        </div>

        {/* ── Ingredients ────────────────────────────────────────────────────── */}
        <div>
          <label className={labelClass}>Ingredients</label>
          <p className="text-[11px] text-ink-faint mb-2">
            Quantities are for <strong>{baseYield || '-'} portions</strong> and scale from there.
            Link an ingredient to inventory to include it in ordering demand and allergen totals.
          </p>

          <div className="space-y-2">
            {drafts.map((d) => {
              const item = d.itemId ? byId.get(d.itemId) : undefined;
              const units = item ? MEASURE_UNITS[item.dimension] : [];
              const base = draftQtyInBase(d);
              return (
                <div key={d.key} className="grid grid-cols-[2fr_1fr_1.1fr_auto] min-w-[640px] sm:min-w-0 gap-2 items-start">
                  <select
                    value={d.itemId}
                    onChange={(e) => pickItem(d.key, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Unlinked ingredient</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>

                  {item ? (
                    <input
                      type="number" step="any" min="0" value={d.qty}
                      onChange={(e) => patch(d.key, { qty: e.target.value })}
                      className={inputClass} placeholder="0"
                    />
                  ) : (
                    <input
                      value={d.label} onChange={(e) => patch(d.key, { label: e.target.value })}
                      className={inputClass} placeholder="Ingredient name"
                    />
                  )}

                  {item ? (
                    <select value={d.unit} onChange={(e) => patch(d.key, { unit: e.target.value })} className={inputClass}>
                      {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  ) : (
                    <input
                      value={d.freeTextQty} onChange={(e) => patch(d.key, { freeTextQty: e.target.value })}
                      className={inputClass} placeholder="Amount"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setDrafts((rows) => rows.length > 1 ? rows.filter((x) => x.key !== d.key) : rows)}
                    className="p-2 text-forest/30 hover:text-red transition-colors"
                    aria-label="Remove ingredient"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {item && base != null && d.qty !== '' && (
                    <p className="col-span-4 -mt-1 text-[11px] text-ink-faint font-mono">
                      = {formatQty(fromBase(base, item.stockUnitInBase), item.stockUnit)} for {baseYield || '-'} portions
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setDrafts((d) => [...d, newDraft()])}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft hover:text-forest"
          >
            <Plus className="w-3.5 h-3.5" /> Add ingredient
          </button>

          {drafts.some((d) => !d.itemId && (d.label.trim() || d.freeTextQty.trim())) && (
            <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
              <Link2Off className="w-3 h-3 inline mr-1" />
              Unlinked ingredients appear on the recipe card but are not scaled and contribute
              nothing to ordering demand or allergen totals.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Allergens</label>
          <div className="rounded-card border border-border bg-cream-dark/30 px-3 py-2.5">
            <AllergenChips allergens={previewAllergens} />
            <p className="text-[11px] text-ink-faint mt-1.5">
              Derived from the linked ingredients, tag allergens on the inventory item, not here.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Method</label>
          <p className="text-[11px] text-ink-faint mb-2">
            Tag any step that must be done ahead ("night before", "2 days before") so it
            appears on the production prep calendar at the right time.
          </p>
          <div className="space-y-2">
            {stepDrafts.map((s, idx) => (
              <div key={s.key} className="grid grid-cols-[auto_1fr_auto_auto] min-w-[640px] sm:min-w-0 gap-2 items-start">
                <span className="font-mono text-[12px] text-ink-faint pt-2.5">{idx + 1}.</span>
                <textarea
                  value={s.instruction}
                  onChange={(e) => patchStep(s.key, { instruction: e.target.value })}
                  className={`${inputClass} resize-none font-normal`} rows={2}
                  placeholder="e.g. Whisk eggs with milk"
                />
                <select
                  value={s.preset}
                  onChange={(e) => patchStep(s.key, { preset: e.target.value })}
                  className="text-[12px] bg-white border border-border rounded-btn px-2 py-2 focus:outline-none focus:border-sage"
                  title="When must this step be done?"
                >
                  {PREP_TIMING_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setStepDrafts((rows) => rows.length > 1 ? rows.filter((x) => x.key !== s.key) : rows)}
                  className="p-2 text-forest/30 hover:text-red transition-colors"
                  aria-label="Remove step"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStepDrafts((d) => [...d, { key: generateId(), instruction: '', preset: 'day_of' }])}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft hover:text-forest"
          >
            <Plus className="w-3.5 h-3.5" /> Add step
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save recipe' : 'Add recipe'}</Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
