import { useMemo, useState } from 'react';
import { Plus, X, UtensilsCrossed, Eye, EyeOff } from 'lucide-react';
import { FilterPill } from '@/components/shared/FilterPill';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { MealPeriod, RetreatMenuEntry } from '@/lib/types';
import { MEAL_PERIOD_LABELS } from '@/lib/commissaryUnits';

const MEALS: MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  let guard = 0;
  while (cur <= last && guard++ < 60) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function RetreatMenuBuilder() {
  const { retreatEntriesFor, deleteRetreatMenuEntry, openModal, recipesById, itemsById } = useCommissaryStore();
  const retreats = useRetreatStore((s) => s.retreats);
  const updateRetreat = useRetreatStore((s) => s.updateRetreat);
  const { can } = useAuth();
  const canManage = can('manageCommissary');

  const list = useMemo(
    () => retreats.filter((r) => r.status !== 'cancelled').sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate)),
    [retreats],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const retreat = list.find((r) => r.id === selectedId) ?? list[0] ?? null;

  const recById = recipesById();
  const itById = itemsById();
  const dishName = (e: RetreatMenuEntry) =>
    e.label || (e.recipeId ? recById.get(e.recipeId)?.name : null) || (e.itemId ? itById.get(e.itemId)?.name : null) || 'Untitled';

  if (list.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <UtensilsCrossed className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats to plan</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed">Create a retreat in the Retreats module, then build its menu here.</p>
        </div>
      </div>
    );
  }
  if (!retreat) return null;

  const days = daysBetween(retreat.arrivalDate, retreat.departureDate);
  const gridCols = { gridTemplateColumns: `110px repeat(${days.length}, minmax(150px, 1fr))` };

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Retreat picker */}
      <div className="flex flex-wrap gap-2 mb-4">
        {list.map((r) => (
          <FilterPill key={r.id} label={r.groupName} active={r.id === retreat.id} onClick={() => setSelectedId(r.id)} />
        ))}
      </div>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold text-forest">{retreat.groupName} — menu</h3>
          <p className="text-[12px] text-forest/50">{retreat.headcount} guests · {days.length} day{days.length === 1 ? '' : 's'} · drives combined ordering + the guest portal</p>
        </div>
        {canManage && (
          <button
            onClick={() => updateRetreat({ ...retreat, menuPublished: !retreat.menuPublished, updatedAt: new Date().toISOString() })}
            className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-btn border transition-colors ${
              retreat.menuPublished ? 'bg-sage-pale text-forest border-sage/40' : 'bg-white text-forest/55 border-border hover:border-forest/30'
            }`}
          >
            {retreat.menuPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {retreat.menuPublished ? 'Published to portal' : 'Not published'}
          </button>
        )}
      </div>

      {/* Meals × days grid — axis matches the Commissary session menu (meals down, days across) */}
      <div className="bg-white rounded-card border border-border overflow-x-auto">
        <div className="min-w-max">
          {/* Header: days across the top */}
          <div className="grid bg-cream-dark/40 border-b border-border" style={gridCols}>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-forest/50">Meal</div>
            {days.map((d, i) => (
              <div key={d} className="px-3 py-2 border-l border-border">
                <p className="text-[12px] font-semibold text-forest leading-tight">Day {i + 1}</p>
                <p className="text-[10px] text-forest/45">{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              </div>
            ))}
          </div>
          {/* One row per meal period */}
          {MEALS.map((meal) => (
            <div key={meal} className="grid border-b border-cream-dark last:border-b-0" style={gridCols}>
              <div className="px-4 py-3 flex items-start">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-sage">{MEAL_PERIOD_LABELS[meal]}</span>
              </div>
              {days.map((d) => {
                const entries = retreatEntriesFor(retreat.id, d, meal);
                return (
                  <div key={d} className="px-3 py-2.5 border-l border-cream-dark min-h-[84px]">
                    <div className="space-y-1">
                      {entries.map((e) => (
                        <div key={e.id} className="group flex items-start gap-1.5 text-[12px]">
                          <button
                            onClick={() => canManage && openModal({ kind: 'retreatMenuEntry', retreatId: retreat.id, dayDate: d, mealPeriod: meal, editId: e.id })}
                            className="flex-1 text-left text-forest hover:text-sage transition-colors"
                          >
                            {dishName(e)}
                            {e.allergens && e.allergens.length > 0 && (
                              <span className="ml-1 text-[10px] text-amber-text">({e.allergens.map((a) => a.replace(/_/g, ' ')).join(', ')})</span>
                            )}
                            {!e.recipeId && !e.itemId && <span className="ml-1 text-[10px] text-forest/30">· display only</span>}
                          </button>
                          {canManage && (
                            <button onClick={() => deleteRetreatMenuEntry(e.id)} className="text-forest/25 hover:text-red opacity-0 group-hover:opacity-100" aria-label="Remove">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {canManage && (
                      <button
                        onClick={() => openModal({ kind: 'retreatMenuEntry', retreatId: retreat.id, dayDate: d, mealPeriod: meal })}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-forest/45 hover:text-forest"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
