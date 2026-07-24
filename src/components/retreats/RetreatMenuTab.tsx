import { Utensils } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { MealPeriod, Retreat, RetreatMeal } from '@/lib/types';
import { fmtDate, fmtRange } from './retreatUi';

/** Columns shown in the menu table (snack meals are still editable, just not columned). */
const MENU_COLUMNS: MealPeriod[] = ['breakfast', 'lunch', 'dinner'];
const COLUMN_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

const DIET_LABELS: Record<string, string> = {
  vegetarian: 'vegetarian', vegan: 'vegan', gluten_free: 'gluten-free', dairy_free: 'dairy-free',
  kosher: 'kosher', halal: 'halal', nut_allergy: 'nut allergy', shellfish_allergy: 'shellfish allergy',
};
function dietLabel(k: string): string {
  return DIET_LABELS[k] ?? k.replace(/_/g, ' ');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Every calendar day from arrival → departure, inclusive. */
function retreatDays(arrival: string, departure: string): string[] {
  const start = new Date(`${arrival}T00:00:00`);
  const end = new Date(`${departure}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  for (let d = new Date(start); d <= end && out.length < 60; d.setDate(d.getDate() + 1)) {
    out.push(ymd(d));
  }
  return out;
}

function dayLabel(dayDate: string): string {
  const weekday = new Date(`${dayDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${fmtDate(dayDate)}`;
}

function MealBlock({ meal, canManage, onEdit }: { meal: RetreatMeal; canManage: boolean; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={() => canManage && onEdit()}
      className={`w-full text-left rounded-btn px-2 py-1.5 transition-colors ${
        canManage ? 'hover:bg-cream-dark cursor-pointer' : 'cursor-default'
      }`}
    >
      <p className="text-[13px] font-medium text-forest leading-snug">{meal.name || 'Untitled meal'}</p>
      {meal.items && <p className="text-[11px] text-forest/50 mt-0.5 leading-relaxed">{meal.items}</p>}
      {meal.allergens.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {meal.allergens.map((a) => (
            <span key={a} className="text-[10px] bg-amber-bg text-amber-text px-1.5 py-0.5 rounded-tag">{a}</span>
          ))}
        </div>
      )}
      {meal.alternatives && <p className="text-[10px] text-green-muted-text mt-1 leading-snug">{meal.alternatives}</p>}
    </button>
  );
}

function MenuTable({ retreat, canManage }: { retreat: Retreat; canManage: boolean }) {
  const { mealsFor, openModal } = useRetreatStore();
  const meals = mealsFor(retreat.id);
  const days = retreatDays(retreat.arrivalDate, retreat.departureDate);

  const mealAt = (dayDate: string, period: MealPeriod) =>
    meals.filter((m) => m.dayDate === dayDate && m.mealPeriod === period);

  if (days.length === 0) {
    return (
      <div className="bg-white rounded-card border border-border px-5 py-8 text-center text-[13px] text-forest/45">
        This retreat's arrival and departure dates don't form a valid range.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="grid grid-cols-[110px_1fr_1fr_1fr] bg-cream-dark/60 border-b border-border">
        <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-forest/50">Day</div>
        {MENU_COLUMNS.map((c) => (
          <div key={c} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-forest/50 border-l border-border">
            {COLUMN_LABELS[c]}
          </div>
        ))}
      </div>

      {days.map((dayDate) => (
        <div key={dayDate} className="grid grid-cols-[110px_1fr_1fr_1fr] border-b border-cream-dark last:border-b-0">
          <div className="px-4 py-3 text-[12px] font-semibold text-forest/60">{dayLabel(dayDate)}</div>
          {MENU_COLUMNS.map((period) => {
            const cellMeals = mealAt(dayDate, period);
            return (
              <div key={period} className="px-2 py-2 border-l border-cream-dark min-h-[64px] flex flex-col gap-1">
                {cellMeals.map((m) => (
                  <MealBlock
                    key={m.id}
                    meal={m}
                    canManage={canManage}
                    onEdit={() => openModal({ kind: 'addMeal', retreatId: retreat.id, mealId: m.id })}
                  />
                ))}
                {cellMeals.length === 0 && canManage && (
                  <button
                    type="button"
                    onClick={() => openModal({ kind: 'addMeal', retreatId: retreat.id, dayDate, mealPeriod: period })}
                    className="text-[11px] text-forest/30 hover:text-forest/70 text-left px-2 py-1 transition-colors"
                  >
                    + add
                  </button>
                )}
                {cellMeals.length === 0 && !canManage && (
                  <span className="text-[11px] text-forest/25 px-2 py-1">—</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function RetreatMenuTab() {
  const { retreats, activeRetreatId, selectedRetreat, setActiveRetreat, openModal, updateRetreat } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  if (retreats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Utensils className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">
            Create a retreat first, then build its meal plan here.
          </p>
        </div>
      </div>
    );
  }

  const retreat = selectedRetreat();

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {/* Pill bar — one per retreat */}
      <div className="flex flex-wrap gap-2 mb-5">
        {retreats.map((r) => (
          <FilterPill
            key={r.id}
            label={r.groupName}
            active={(activeRetreatId ?? retreat?.id) === r.id}
            onClick={() => setActiveRetreat(r.id)}
          />
        ))}
      </div>

      {!retreat ? (
        <div className="bg-white rounded-card border border-border px-5 py-8 text-center text-[13px] text-forest/45">
          Select a retreat to view its menu.
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-[14px] font-semibold text-forest">
              Menu — {retreat.groupName} · {fmtRange(retreat.arrivalDate, retreat.departureDate)}
            </h2>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'addMeal', retreatId: retreat.id })}>
                  + Add meal
                </Button>
                <Button
                  size="sm"
                  variant={retreat.menuPublished ? 'ghost' : 'primary'}
                  onClick={() => updateRetreat({ ...retreat, menuPublished: !retreat.menuPublished, updatedAt: new Date().toISOString() })}
                >
                  {retreat.menuPublished ? '✓ Published — unpublish' : 'Publish to portal'}
                </Button>
              </div>
            )}
          </div>

          {/* Dietary flags banner */}
          {retreat.dietaryFlags && Object.keys(retreat.dietaryFlags).length > 0 && (
            <div className="bg-blue-bg border border-blue/20 rounded-card px-4 py-3 mb-4 text-[12px] text-blue-text leading-relaxed">
              <strong className="font-semibold">Dietary flags for this group:</strong>{' '}
              {Object.entries(retreat.dietaryFlags).map(([k, v]) => `${v} ${dietLabel(k)}`).join(' · ')}. GF and
              vegetarian alternatives are noted on each meal where applicable.
            </div>
          )}

          <MenuTable retreat={retreat} canManage={canManage} />

          {!retreat.menuPublished && (
            <p className="text-[11px] text-forest/40 mt-3">
              This menu is a draft — it is not yet visible to the group. Use “Publish to portal” to share it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
