import { useState } from 'react';
import { Link2Off } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { MealPeriod, MenuEntry } from '@/lib/types';
import {
  MEAL_PERIOD_LABELS, DAY_LABELS, dateForCell,
} from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

interface Props {
  weekNumber: number;
  dayIndex: number;
  mealPeriod: MealPeriod;
}

export function MenuEntryModal({ weekNumber, dayIndex, mealPeriod }: Props) {
  const {
    recipes, activeSession, entriesForCell, addMenuEntry, closeModal,
  } = useCommissaryStore();
  const session = activeSession();

  const [recipeId, setRecipeId] = useState('');
  const [customLabel, setCustomLabel] = useState('');

  if (!session) return null;

  const date = dateForCell(session.startDate, weekNumber, dayIndex);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Suggest recipes written for this meal period first, but never hide the others —
  // plenty of camps serve breakfast for dinner.
  const matching = recipes.filter((r) => r.mealPeriod === mealPeriod);
  const others = recipes.filter((r) => r.mealPeriod !== mealPeriod);

  const usingCustom = !recipeId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const recipe = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;
    const label = recipe ? recipe.name : customLabel.trim();
    if (!label) return;

    const now = new Date().toISOString();
    const entry: MenuEntry = {
      id: generateId(),
      sessionId: session.id,
      weekNumber,
      dayIndex,
      mealPeriod,
      recipeId: recipe?.id ?? null,
      // Always store the label, even for a recipe: if the recipe is later deleted
      // the FK nulls out and this is what keeps the chip readable.
      label,
      sortOrder: entriesForCell(weekNumber, dayIndex, mealPeriod).length,
      createdAt: now,
      updatedAt: now,
    };
    addMenuEntry(entry);
    closeModal();
  }

  return (
    <Modal title={`Add to ${MEAL_PERIOD_LABELS[mealPeriod].toLowerCase()}`} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-2.5">
          <p className="text-[12px] text-forest/60">
            {DAY_LABELS[dayIndex]} · {dateLabel} · week {weekNumber}
          </p>
        </div>

        <div>
          <label className={labelClass}>Recipe</label>
          <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass}>
            <option value="">— No recipe (free text) —</option>
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
        </div>

        {usingCustom && (
          <div>
            <label className={labelClass}>Item name *</label>
            <input
              autoFocus value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
              className={inputClass} placeholder="e.g. Salad bar, OJ / Milk, Fresh fruit"
            />
            <p className="text-[11px] text-forest/45 mt-1.5 leading-relaxed flex gap-1.5">
              <Link2Off className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                Free-text items appear on the menu but are invisible to ordering demand and
                allergen totals. Attach a recipe if this meal should count toward what you order.
              </span>
            </p>
          </div>
        )}

        {recipes.length === 0 && (
          <p className="text-[11px] text-forest/45">
            No recipes yet — add one on the Recipes tab and it will appear here.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!recipeId && !customLabel.trim()}>
            Add to menu
          </Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
