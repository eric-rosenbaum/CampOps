import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { MealEvent, MealEventKind, MealEventCountMode, MealPeriod } from '@/lib/types';
import { MEAL_PERIODS, MEAL_PERIOD_LABELS, todayStr } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

const KIND_LABELS: Record<MealEventKind, string> = {
  override: 'Head-count change',
  bag_lunch: 'Bag lunches (off-site)',
  event: 'Special event',
};

export function MealEventModal({ editId, date }: { editId?: string; date?: string }) {
  const { mealEvents, activeSessionId, addMealEvent, updateMealEvent, deleteMealEvent, closeModal } = useCommissaryStore();
  const existing = editId ? mealEvents.find((e) => e.id === editId) ?? null : null;

  const [kind, setKind] = useState<MealEventKind>(existing?.kind ?? 'override');
  const [eventDate, setEventDate] = useState(existing?.date ?? date ?? todayStr());
  const [mealPeriod, setMealPeriod] = useState<MealPeriod | ''>(existing?.mealPeriod ?? 'lunch');
  const [countMode, setCountMode] = useState<MealEventCountMode>(existing?.countMode ?? 'absolute');
  const [count, setCount] = useState(existing ? String(existing.count) : '');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // Bag lunches are their own separate meal at an absolute head count.
  const isBag = kind === 'bag_lunch';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSessionId || !label.trim() || count === '') return;
    const now = new Date().toISOString();
    const shared = {
      sessionId: activeSessionId,
      date: eventDate,
      mealPeriod: (mealPeriod || null) as MealPeriod | null,
      kind,
      countMode: (isBag ? 'absolute' : countMode) as MealEventCountMode,
      count: Number(count) || 0,
      label: label.trim(),
      notes: notes.trim() || null,
    };
    if (existing) updateMealEvent({ ...existing, ...shared, updatedAt: now });
    else addMealEvent({ id: generateId(), ...shared, createdAt: now, updatedAt: now } as MealEvent);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.label}"?`)) { deleteMealEvent(existing.id); closeModal(); }
  }

  return (
    <Modal title={existing ? 'Edit event' : 'Add event'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Type</label>
          <div className="flex gap-1.5">
            {(Object.keys(KIND_LABELS) as MealEventKind[]).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)}
                className={`flex-1 px-2 py-1.5 rounded-btn text-[11px] font-medium border transition-colors ${
                  kind === k ? 'bg-forest text-cream border-forest' : 'bg-white text-ink-soft border-border hover:border-forest/30'
                }`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Label *</label>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}
                 placeholder={isBag ? 'e.g. Hiking trip bag lunches' : 'e.g. Visiting day lunch'} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Meal</label>
            <select value={mealPeriod} onChange={(e) => setMealPeriod(e.target.value as MealPeriod | '')} className={inputClass}>
              {!isBag && <option value="">Whole day</option>}
              {MEAL_PERIODS.map((m) => <option key={m} value={m}>{MEAL_PERIOD_LABELS[m]}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!isBag && (
            <div>
              <label className={labelClass}>Count is…</label>
              <select value={countMode} onChange={(e) => setCountMode(e.target.value as MealEventCountMode)} className={inputClass}>
                <option value="absolute">A total head count</option>
                <option value="delta">A change (+/−)</option>
              </select>
            </div>
          )}
          <div className={isBag ? 'col-span-2' : ''}>
            <label className={labelClass}>{isBag ? 'Number of bag lunches' : countMode === 'delta' ? 'Change (use − to subtract)' : 'Head count for this meal'}</label>
            <input type="number" step="1" value={count} onChange={(e) => setCount(e.target.value)} className={inputClass}
                   placeholder={countMode === 'delta' ? 'e.g. -40' : 'e.g. 300'} />
          </div>
        </div>

        <p className="text-[11px] text-ink-faint leading-relaxed">
          {isBag
            ? 'Bag lunches are prepped as their own item. Kids leaving a regular meal for a trip should also get a −N head-count change on that meal.'
            : countMode === 'delta'
              ? 'Adds to (or subtracts from) the session head count for the chosen meal only.'
              : 'Replaces the session head count for the chosen meal.'}
        </p>

        <div>
          <label className={labelClass}>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="optional" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!label.trim() || count === ''}>
            {existing ? 'Save' : 'Add event'}
          </Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
