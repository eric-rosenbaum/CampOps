import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { generateId } from '@/lib/utils';
import type { CommissarySession, MealPeriod } from '@/lib/types';
import { targetPortions, weekCount, MEAL_PERIODS, MEAL_PERIOD_LABELS, WEEKDAYS } from '@/lib/commissaryUnits';
import { inputClass, labelClass } from './commissaryUi';

export function SessionModal({ editId }: { editId?: string }) {
  const { sessions, addSession, updateSession, deleteSession, closeModal } = useCommissaryStore();
  const existing = editId ? sessions.find((s) => s.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [camperCount, setCamperCount] = useState(String(existing?.camperCount ?? ''));
  const [staffCount, setStaffCount] = useState(String(existing?.staffCount ?? ''));
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [budget, setBudget] = useState(existing?.budgetPerPersonPerDay != null ? String(existing.budgetPerPersonPerDay) : '');
  const [mealsPerDay, setMealsPerDay] = useState(String(existing?.mealsPerDay ?? 3));
  const [orderFrequencyDays, setOrderFrequencyDays] = useState(String(existing?.orderFrequencyDays ?? 7));
  const [countDay, setCountDay] = useState(existing?.countDay ?? '');
  const [orderDay, setOrderDay] = useState(existing?.orderDay ?? '');
  const [deliveryDay, setDeliveryDay] = useState(existing?.deliveryDay ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const campers = Number(camperCount) || 0;
  const staff = Number(staffCount) || 0;
  const total = targetPortions(campers, staff);

  // #8 — attendance can differ by meal. Off by default (same count for every meal).
  const [perMeal, setPerMeal] = useState(existing?.mealCounts != null);
  const [mealCounts, setMealCounts] = useState<Record<string, string>>(() => {
    const src = existing?.mealCounts ?? {};
    return Object.fromEntries(MEAL_PERIODS.map((m) => [m, src[m] != null ? String(src[m]) : '']));
  });
  const datesValid = Boolean(startDate && endDate && endDate >= startDate);
  const weeks = datesValid ? weekCount(startDate, endDate) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !datesValid) return;
    const now = new Date().toISOString();
    // Only keep meal counts that were actually filled in; a blank meal falls back to
    // the session total. null = "same for every meal".
    let mealCountsValue: Partial<Record<MealPeriod, number>> | null = null;
    if (perMeal) {
      const filled: Partial<Record<MealPeriod, number>> = {};
      for (const m of MEAL_PERIODS) {
        const v = mealCounts[m];
        if (v !== '' && Number.isFinite(Number(v))) filled[m] = Math.max(0, Number(v));
      }
      mealCountsValue = Object.keys(filled).length ? filled : null;
    }
    const shared = {
      name: name.trim(), startDate, endDate,
      camperCount: campers, staffCount: staff, isActive,
      budgetPerPersonPerDay: budget === '' ? null : Number(budget),
      mealsPerDay: Math.max(1, Number(mealsPerDay) || 3),
      mealCounts: mealCountsValue,
      orderFrequencyDays: Math.max(1, Number(orderFrequencyDays) || 7),
      countDay: countDay || null,
      orderDay: orderDay || null,
      deliveryDay: deliveryDay || null,
      notes: notes.trim() || null,
    };
    if (existing) {
      updateSession({ ...existing, ...shared, updatedAt: now });
    } else {
      const s: CommissarySession = { id: generateId(), ...shared, createdAt: now, updatedAt: now };
      addSession(s);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.name}"? Its entire menu will be deleted too.`)) {
      deleteSession(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit session' : 'New session'} onClose={closeModal} width="500px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Session name *</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Session 2" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Start date *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>End date *</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        {startDate && endDate && !datesValid && (
          <p className="text-[11px] text-red">End date must fall on or after the start date.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Campers</label>
            <input type="number" min="0" value={camperCount} onChange={(e) => setCamperCount(e.target.value)} className={inputClass} placeholder="0" />
          </div>
          <div>
            <label className={labelClass}>Staff</label>
            <input type="number" min="0" value={staffCount} onChange={(e) => setStaffCount(e.target.value)} className={inputClass} placeholder="0" />
          </div>
        </div>

        <div className="rounded-card border border-border bg-cream-dark/30 px-4 py-3">
          <p className="text-[12px] text-forest/60">
            Head count <span className="font-mono font-medium text-forest">{total.toLocaleString()}</span>
            {datesValid && <> · <span className="font-mono font-medium text-forest">{weeks}</span> menu week{weeks === 1 ? '' : 's'}</>}
          </p>
          <p className="text-[11px] text-forest/45 mt-1 leading-relaxed">
            Staff are counted separately from campers because seasonal counselors eat but do
            not have app accounts. Recipe yields and ordering quantities scale to the total.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Budget per person / day</label>
            <input type="number" step="0.01" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} placeholder="e.g. 8.50" />
            <p className="text-[11px] text-forest/40 mt-1">The per-diem the Cost tab measures against.</p>
          </div>
          <div>
            <label className={labelClass}>Meals per day</label>
            <input type="number" min="1" max="6" value={mealsPerDay} onChange={(e) => setMealsPerDay(e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* #8 — per-meal attendance */}
        <div className="rounded-card border border-border px-4 py-3 space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={perMeal} onChange={(e) => setPerMeal(e.target.checked)} className="accent-sage" />
            <span className="text-[13px] text-forest/80">Attendance differs by meal</span>
          </label>
          <p className="text-[11px] text-forest/45 leading-relaxed">
            {perMeal
              ? `Set the head count for each meal — some campers go home for dinner, or arrive early for breakfast. Leave a meal blank to use the ${total.toLocaleString()} total. Recipe and ordering quantities scale per meal. One-off changes for a single date are handled on the menu with meal events.`
              : `Every meal is cooked for the ${total.toLocaleString()} total. Turn this on if some meals have fewer or more people.`}
          </p>
          {perMeal && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MEAL_PERIODS.map((m) => (
                <div key={m}>
                  <label className="block text-[11px] font-medium text-forest/60 mb-1">{MEAL_PERIOD_LABELS[m]}</label>
                  <input
                    type="number" min="0" value={mealCounts[m] ?? ''}
                    onChange={(e) => setMealCounts((prev) => ({ ...prev, [m]: e.target.value }))}
                    className={inputClass} placeholder={String(total)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ordering cadence — the weekly rhythm the order coverage window is built from. */}
        <div className="rounded-card border border-border px-4 py-3 space-y-3">
          <p className="text-[13px] font-medium text-forest/80">Ordering cadence</p>
          <p className="text-[11px] text-forest/45 leading-relaxed">
            When you take inventory, place orders, and receive them. The ordering view covers you until the
            delivery after the next one — no "generate" needed. Days are optional; blank uses the start date's weekday.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([['Count day', countDay, setCountDay], ['Order day', orderDay, setOrderDay], ['Delivery day', deliveryDay, setDeliveryDay]] as const).map(([lbl, val, set]) => (
              <div key={lbl}>
                <label className="block text-[11px] font-medium text-forest/60 mb-1">{lbl}</label>
                <select value={val} onChange={(e) => set(e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {WEEKDAYS.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-[11px] font-medium text-forest/60 mb-1">Repeat every (days)</label>
              <input type="number" min="1" value={orderFrequencyDays} onChange={(e) => setOrderFrequencyDays(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-sage" />
          <span className="text-[13px] text-forest/70">Active session (the one the module opens to)</span>
        </label>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={!name.trim() || !datesValid}>
            {existing ? 'Save changes' : 'Create session'}
          </Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
