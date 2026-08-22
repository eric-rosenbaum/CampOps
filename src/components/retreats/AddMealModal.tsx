import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { MealPeriod, RetreatMeal } from '@/lib/types';
import { inputClass, labelClass, ALLERGENS, MEAL_PERIODS, MEAL_PERIOD_LABELS, fmtDate } from './retreatUi';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function retreatDays(arrival: string, departure: string): string[] {
  const start = new Date(`${arrival}T00:00:00`);
  const end = new Date(`${departure}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  for (let d = new Date(start); d <= end && out.length < 60; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
}
function dayOptionLabel(dayDate: string): string {
  const weekday = new Date(`${dayDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${fmtDate(dayDate)}`;
}

export function AddMealModal({
  retreatId, mealId, dayDate, mealPeriod,
}: { retreatId: string; mealId?: string; dayDate?: string; mealPeriod?: MealPeriod }) {
  const { retreatById, mealsFor, addMeal, updateMeal, deleteMeal, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = retreatById(retreatId);
  const existing = mealId ? mealsFor(retreatId).find((m) => m.id === mealId) ?? null : null;
  const days = retreat ? retreatDays(retreat.arrivalDate, retreat.departureDate) : [];

  const [day, setDay] = useState(existing?.dayDate ?? dayDate ?? days[0] ?? '');
  const [period, setPeriod] = useState<MealPeriod>(existing?.mealPeriod ?? mealPeriod ?? 'breakfast');
  const [name, setName] = useState(existing?.name ?? '');
  const [items, setItems] = useState(existing?.items ?? '');
  const [allergens, setAllergens] = useState<string[]>(existing?.allergens ?? []);
  const [alternatives, setAlternatives] = useState(existing?.alternatives ?? '');

  function toggleAllergen(a: string) {
    setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !day) return;
    const now = new Date().toISOString();
    const shared = {
      retreatId,
      dayDate: day,
      mealPeriod: period,
      name: name.trim() || null,
      items: items.trim() || null,
      allergens,
      alternatives: alternatives.trim() || null,
    };
    if (existing) {
      updateMeal({ ...existing, ...shared, updatedAt: now });
    } else {
      const sortOrder = mealsFor(retreatId).filter((m) => m.dayDate === day && m.mealPeriod === period).length;
      addMeal({ id: generateId(), campId: '', ...shared, sortOrder, createdAt: now, updatedAt: now } as RetreatMeal);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.name ?? 'this meal'}"?`)) {
      deleteMeal(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit meal' : 'Add meal'} onClose={closeModal} width="520px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Day</label>
            <select value={day} onChange={(e) => setDay(e.target.value)} className={inputClass}>
              {days.length === 0 && <option value="">No dates</option>}
              {days.map((d) => (
                <option key={d} value={d}>{dayOptionLabel(d)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Meal period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as MealPeriod)} className={inputClass}>
              {MEAL_PERIODS.map((m) => (
                <option key={m} value={m}>{MEAL_PERIOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Meal name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
                 placeholder="e.g. Roast chicken dinner" />
        </div>

        <div>
          <label className={labelClass}>Items</label>
          <textarea value={items} onChange={(e) => setItems(e.target.value)} rows={3}
                    className={`${inputClass} resize-y`}
                    placeholder="e.g. Roast chicken · Mashed potatoes · Green beans · Dinner rolls · Salad" />
        </div>

        <div>
          <label className={labelClass}>Allergens</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {ALLERGENS.map((a) => {
              const on = allergens.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  className={`px-2 py-1.5 rounded-btn text-[11px] font-medium border text-center transition-colors ${
                    on ? 'bg-amber-bg border-amber text-amber-text' : 'bg-white border-border text-ink-soft hover:border-forest/30'
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelClass}>Alternatives</label>
          <input value={alternatives} onChange={(e) => setAlternatives(e.target.value)} className={inputClass}
                 placeholder="e.g. GF bagels available · Vegetarian: stuffed portobello" />
          <p className="text-[11px] text-ink-faint mt-1">Shown in green under the meal — GF / vegetarian / vegan swaps.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!canManage || !day}>
            {existing ? 'Save meal' : 'Add meal'}
          </Button>
          {existing && canManage && (
            <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>
          )}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
