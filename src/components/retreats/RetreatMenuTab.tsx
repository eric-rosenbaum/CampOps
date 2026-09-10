// The menu, typed straight in.
//
// It used to be authored in Commissary's retreats mode -- structured entries pointing at recipes
// and inventory items -- and this tab was a read-only preview with a button that sent you to a
// different module to change a Tuesday lunch. That coupling bought food ordering, and cost every
// camp that just wants to tell a group what is for dinner.
//
// So: a grid. Meal periods down, days across, free text in every cell, saved as you leave it.
// Allergens and alternatives stay on the row for the portal to show, typed rather than derived.
import { useState } from 'react';
import { Utensils, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { MealPeriod, Retreat, RetreatMenuEntry } from '@/lib/types';
import { fmtDate, fmtRange } from './retreatUi';

const MEAL_ROWS: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

const DIET_LABELS: Record<string, string> = {
  vegetarian: 'vegetarian', vegan: 'vegan', gluten_free: 'gluten-free', dairy_free: 'dairy-free',
  kosher: 'kosher', halal: 'halal', nut_allergy: 'nut allergy', shellfish_allergy: 'shellfish allergy',
};
function dietLabel(k: string): string { return DIET_LABELS[k] ?? k.replace(/_/g, ' '); }

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
function dayLabel(dayDate: string): string {
  const weekday = new Date(`${dayDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${fmtDate(dayDate)}`;
}

/** One cell: whatever is being served, or nothing. */
function Cell({ retreat, day, meal, editable }: {
  retreat: Retreat; day: string; meal: MealPeriod; editable: boolean;
}) {
  const entries = useCommissaryStore((s) => s.retreatMenuEntries);
  const addEntry = useCommissaryStore((s) => s.addRetreatMenuEntry);
  const updateEntry = useCommissaryStore((s) => s.updateRetreatMenuEntry);
  const deleteEntry = useCommissaryStore((s) => s.deleteRetreatMenuEntry);
  const campId = useCampStore((s) => s.currentCamp?.id ?? '');

  const row = entries.find(
    (e) => e.retreatId === retreat.id && e.dayDate === day && e.mealPeriod === meal,
  ) ?? null;
  const [text, setText] = useState(row?.label ?? '');

  function commit() {
    const next = text.trim();
    const was = (row?.label ?? '').trim();
    if (next === was) return;
    if (!row) {
      if (!next) return;
      const now = new Date().toISOString();
      addEntry({
        id: generateId(), campId, retreatId: retreat.id, dayDate: day, mealPeriod: meal,
        recipeId: null, itemId: null, itemQtyBase: null, label: next,
        allergens: [], alternatives: null, portionsOverride: null, sortOrder: 0,
        createdAt: now, updatedAt: now,
      } as RetreatMenuEntry);
      return;
    }
    // Cleared: the row goes rather than sitting there empty.
    if (!next) { deleteEntry(row.id); return; }
    updateEntry({ ...row, label: next, updatedAt: new Date().toISOString() });
  }

  return (
    <textarea
      value={text}
      disabled={!editable}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      rows={2}
      placeholder="—"
      className="w-full min-w-[9rem] resize-y rounded-btn border border-transparent bg-transparent px-2 py-1.5
                 text-[12.5px] text-ink placeholder:text-ink-faint/50
                 hover:border-border focus:border-sage focus:bg-white focus:outline-none disabled:opacity-70"
    />
  );
}

function MenuGrid({ retreat, editable }: { retreat: Retreat; editable: boolean }) {
  const days = retreatDays(retreat.arrivalDate ?? '', retreat.departureDate ?? '');
  if (days.length === 0) {
    return (
      <p className="rounded-card border border-border bg-white px-4 py-6 text-center text-[13px] text-ink-soft">
        Set the arrival and departure dates and the days will appear here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-white">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-cream-dark/60 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">
              Meal
            </th>
            {days.map((d) => (
              <th key={d} className="border-l border-border bg-cream-dark/60 px-3 py-2 text-left text-[11px] font-semibold text-forest whitespace-nowrap">
                {dayLabel(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEAL_ROWS.map((meal) => (
            <tr key={meal} className="border-t border-border">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[12px] font-semibold text-forest whitespace-nowrap">
                {MEAL_LABELS[meal]}
              </th>
              {days.map((d) => (
                <td key={d} className="border-l border-border align-top p-0.5">
                  <Cell retreat={retreat} day={d} meal={meal} editable={editable} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RetreatMenuTab() {
  const { selectedRetreat, updateRetreat } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');
  const retreat = selectedRetreat();

  if (!retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Utensils className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed">Create a retreat first, then write its menu here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-[14px] font-semibold text-forest">
          Menu · {retreat.groupName} · {fmtRange(retreat.arrivalDate, retreat.departureDate)}
        </h2>
        {canManage && (
          <Button
            size="sm"
            variant={retreat.menuPublished ? 'ghost' : 'primary'}
            onClick={() => updateRetreat({ ...retreat, menuPublished: !retreat.menuPublished, updatedAt: new Date().toISOString() })}
          >
            {retreat.menuPublished
              ? <><Eye className="w-3.5 h-3.5" /> Published · unpublish</>
              : <><EyeOff className="w-3.5 h-3.5" /> Publish to portal</>}
          </Button>
        )}
      </div>

      {retreat.dietaryFlags && Object.keys(retreat.dietaryFlags).length > 0 && (
        <div className="bg-blue-bg border border-blue/20 rounded-card px-4 py-3 mb-4 text-[12px] text-blue-text leading-relaxed">
          <strong className="font-semibold">Dietary flags for this group:</strong>{' '}
          {Object.entries(retreat.dietaryFlags).map(([k, v]) => `${v} ${dietLabel(k)}`).join(' · ')}.
        </div>
      )}

      <MenuGrid retreat={retreat} editable={canManage} />

      {!retreat.menuPublished && (
        <p className="text-[11px] text-ink-faint mt-3">
          A draft. The group cannot see it until you publish.
        </p>
      )}
    </div>
  );
}
