import { Utensils, Pencil, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useRetreatStore } from '@/store/retreatStore';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import type { MealPeriod, Retreat, RetreatMenuEntry } from '@/lib/types';
import { fmtDate, fmtRange } from './retreatUi';

// The menu is authored in Commissary (retreats mode); this tab is a read-only preview + publish control.
// Axis matches the Commissary menu: meal periods are rows, days are columns.
const MEAL_ROWS: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

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

function MenuTable({ retreat }: { retreat: Retreat }) {
  const { retreatEntriesFor, recipesById, itemsById } = useCommissaryStore();
  const recById = recipesById();
  const itById = itemsById();
  const days = retreatDays(retreat.arrivalDate, retreat.departureDate);
  const dishName = (e: RetreatMenuEntry) =>
    e.label || (e.recipeId ? recById.get(e.recipeId)?.name : null) || (e.itemId ? itById.get(e.itemId)?.name : null) || 'Untitled';

  if (days.length === 0) {
    return (
      <div className="bg-white rounded-card border border-border px-5 py-8 text-center text-[13px] text-forest/45">
        This retreat's arrival and departure dates don't form a valid range.
      </div>
    );
  }
  // Only show a meal row if the retreat actually has entries in it (always keep B/L/D).
  const mealsToShow = MEAL_ROWS.filter((m) =>
    ['breakfast', 'lunch', 'dinner'].includes(m) || days.some((d) => retreatEntriesFor(retreat.id, d, m).length > 0),
  );
  const gridCols = { gridTemplateColumns: `100px repeat(${days.length}, minmax(150px, 1fr))` };

  return (
    <div className="bg-white rounded-card border border-border overflow-x-auto">
      <div className="min-w-max">
        {/* Header: days across the top */}
        <div className="grid bg-cream-dark/60 border-b border-border" style={gridCols}>
          <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-forest/50">Meal</div>
          {days.map((d) => (
            <div key={d} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-forest/50 border-l border-border">{dayLabel(d)}</div>
          ))}
        </div>
        {/* One row per meal period */}
        {mealsToShow.map((meal) => (
          <div key={meal} className="grid border-b border-cream-dark last:border-b-0" style={gridCols}>
            <div className="px-4 py-3 text-[12px] font-semibold text-forest/60">{MEAL_LABELS[meal]}</div>
            {days.map((d) => {
              const cell = retreatEntriesFor(retreat.id, d, meal);
              return (
                <div key={d} className="px-3 py-2 border-l border-cream-dark min-h-[64px] flex flex-col gap-1.5">
                  {cell.map((e) => (
                    <div key={e.id}>
                      <p className="text-[13px] font-medium text-forest leading-snug">{dishName(e)}</p>
                      {e.allergens && e.allergens.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {e.allergens.map((a) => <span key={a} className="text-[10px] bg-amber-bg text-amber-text px-1.5 py-0.5 rounded-tag capitalize">{a.replace(/_/g, ' ')}</span>)}
                        </div>
                      )}
                      {e.alternatives && <p className="text-[10px] text-green-muted-text mt-0.5 leading-snug">{e.alternatives}</p>}
                    </div>
                  ))}
                  {cell.length === 0 && <span className="text-[11px] text-forest/25 px-1 py-1">—</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RetreatMenuTab() {
  const { retreats, activeRetreatId, selectedRetreat, setActiveRetreat, updateRetreat } = useRetreatStore();
  const setMode = useCommissaryStore((s) => s.setMode);
  const setCommissaryTab = useCommissaryStore((s) => s.setActiveTab);
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  function editInCommissary() {
    setMode('retreats');
    setCommissaryTab('menu');
    navigate('/commissary');
  }

  if (retreats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Utensils className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">Create a retreat first, then plan its menu in Commissary.</p>
        </div>
      </div>
    );
  }

  const retreat = selectedRetreat();

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="flex flex-wrap gap-2 mb-5">
        {retreats.map((r) => (
          <FilterPill key={r.id} label={r.groupName} active={(activeRetreatId ?? retreat?.id) === r.id} onClick={() => setActiveRetreat(r.id)} />
        ))}
      </div>

      {!retreat ? (
        <div className="bg-white rounded-card border border-border px-5 py-8 text-center text-[13px] text-forest/45">Select a retreat to view its menu.</div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-[14px] font-semibold text-forest">
              Menu — {retreat.groupName} · {fmtRange(retreat.arrivalDate, retreat.departureDate)}
            </h2>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={editInCommissary}>
                  <Pencil className="w-3.5 h-3.5" /> Edit in Commissary
                </Button>
                <Button
                  size="sm"
                  variant={retreat.menuPublished ? 'ghost' : 'primary'}
                  onClick={() => updateRetreat({ ...retreat, menuPublished: !retreat.menuPublished, updatedAt: new Date().toISOString() })}
                >
                  {retreat.menuPublished ? <><Eye className="w-3.5 h-3.5" /> Published — unpublish</> : <><EyeOff className="w-3.5 h-3.5" /> Publish to portal</>}
                </Button>
              </div>
            )}
          </div>

          <div className="bg-cream-dark/40 border border-border rounded-card px-4 py-2.5 mb-4 text-[12px] text-forest/55">
            This menu is planned in <span className="font-medium text-forest">Commissary → Retreats → Menu builder</span>, where it also drives food ordering. This tab is a preview of what the group sees.
          </div>

          {retreat.dietaryFlags && Object.keys(retreat.dietaryFlags).length > 0 && (
            <div className="bg-blue-bg border border-blue/20 rounded-card px-4 py-3 mb-4 text-[12px] text-blue-text leading-relaxed">
              <strong className="font-semibold">Dietary flags for this group:</strong>{' '}
              {Object.entries(retreat.dietaryFlags).map(([k, v]) => `${v} ${dietLabel(k)}`).join(' · ')}.
            </div>
          )}

          <MenuTable retreat={retreat} />

          {!retreat.menuPublished && (
            <p className="text-[11px] text-forest/40 mt-3">This menu is a draft — not yet visible to the group. Use “Publish to portal” to share it.</p>
          )}
        </>
      )}
    </div>
  );
}
