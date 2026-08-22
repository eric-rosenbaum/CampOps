import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import type { MealPeriod } from '@/lib/types';
import { MEAL_PERIOD_LABELS, TEMPLATE_DAY_LABELS } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

interface Props {
  templateId: string;
  weekNumber: number;
  dayIndex: number;
  mealPeriod: MealPeriod;
}

export function TemplateEntryModal({ templateId, weekNumber, dayIndex, mealPeriod }: Props) {
  const { recipes, addTemplateEntry, closeModal } = useCommissaryStore();
  const [recipeId, setRecipeId] = useState('');
  const [customLabel, setCustomLabel] = useState('');

  const matching = recipes.filter((r) => r.mealPeriod === mealPeriod);
  const others = recipes.filter((r) => r.mealPeriod !== mealPeriod);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const recipe = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;
    const label = recipe ? recipe.name : customLabel.trim();
    if (!label) return;
    addTemplateEntry(templateId, weekNumber, dayIndex, mealPeriod, recipe?.id ?? null, label);
    closeModal();
  }

  return (
    <Modal title={`Add to ${MEAL_PERIOD_LABELS[mealPeriod].toLowerCase()}`} onClose={closeModal} width="460px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-2.5">
          <p className="text-[12px] text-ink-soft">Week {weekNumber} · {TEMPLATE_DAY_LABELS[dayIndex]}</p>
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
                {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        {!recipeId && (
          <div>
            <label className={labelClass}>Item name *</label>
            <input autoFocus value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} className={inputClass} placeholder="e.g. Salad bar, OJ / Milk" />
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!recipeId && !customLabel.trim()}>Add</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
