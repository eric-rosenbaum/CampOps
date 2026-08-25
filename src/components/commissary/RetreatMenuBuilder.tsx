import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, UtensilsCrossed, Eye, EyeOff, ArrowLeft, ExternalLink } from 'lucide-react';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { MealPeriod, RetreatMenuEntry } from '@/lib/types';
import { MEAL_PERIOD_LABELS } from '@/lib/commissaryUnits';
import { fmtRange } from '@/components/retreats/retreatUi';

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
  const {
    retreatEntriesFor, deleteRetreatMenuEntry, openModal, recipesById, itemsById,
    retreatMenuTarget, setRetreatMenuTarget,
  } = useCommissaryStore();
  const retreats = useRetreatStore((s) => s.retreats);
  const updateRetreat = useRetreatStore((s) => s.updateRetreat);
  const enterRetreat = useRetreatStore((s) => s.enterRetreat);
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can('manageCommissary');

  const list = useMemo(
    () => retreats.filter((r) => r.status !== 'cancelled').sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate)),
    [retreats],
  );
  // Nothing is selected by default. Landing on whichever retreat happened to sort first is
  // how a dish ends up on the wrong group's menu.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Arriving from one retreat's Menu tab opens that group directly; otherwise nothing is
  // selected and the chooser shows. Derived rather than copied into state, so there is no
  // render-time write to untangle.
  const openId = selectedId ?? retreatMenuTarget;
  const retreat = list.find((r) => r.id === openId) ?? null;

  /** Back to the chooser: drop both the local pick and the incoming intent. */
  function backToChooser() {
    setSelectedId(null);
    setRetreatMenuTarget(null);
  }

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
          <p className="text-[13px] text-ink-soft leading-relaxed">Create a retreat in the Retreats module, then build its menu here.</p>
        </div>
      </div>
    );
  }
  if (!retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <h3 className="text-[14px] font-semibold text-forest mb-1">Pick a retreat to plan</h3>
        <p className="text-[12px] text-ink-soft mb-4">
          Menus are per group, so choose whose menu you are building before adding anything.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((r) => {
            const d = daysBetween(r.arrivalDate, r.departureDate);
            const count = retreatEntriesFor(r.id).length;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="text-left bg-white rounded-card border border-border px-4 py-3.5 hover:border-sage hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-forest">{r.groupName}</p>
                  {r.menuPublished && (
                    <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-sage-pale text-forest rounded-full px-2 py-0.5">
                      Published
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-soft mt-1">
                  {fmtRange(r.arrivalDate, r.departureDate)} · {r.headcount} guests · {d.length} day{d.length === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-ink-faint mt-1.5">
                  {count === 0 ? 'No dishes planned yet' : `${count} dish${count === 1 ? '' : 'es'} planned`}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const days = daysBetween(retreat.arrivalDate, retreat.departureDate);
  const gridCols = { gridTemplateColumns: `110px repeat(${days.length}, minmax(150px, 1fr))` };
  // A published menu is what the group is reading in their portal, so it is read-only until
  // someone deliberately unpublishes it.
  const locked = retreat.menuPublished;
  const editable = canManage && !locked;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <button
        onClick={backToChooser}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft hover:text-forest mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All retreats
      </button>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold text-forest">{retreat.groupName} · menu</h3>
          <p className="text-[12px] text-ink-soft">{retreat.headcount} guests · {days.length} day{days.length === 1 ? '' : 's'} · drives combined ordering + the guest portal</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        {locked && (
          <button
            onClick={() => { enterRetreat(retreat.id, 'menu'); navigate('/retreats'); }}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-btn border bg-white text-forest border-border hover:border-forest/30 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Show in Retreat manager
          </button>
        )}
        {canManage && (
          <button
            onClick={() => updateRetreat({ ...retreat, menuPublished: !locked, updatedAt: new Date().toISOString() })}
            className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-btn border transition-colors ${
              locked ? 'bg-white text-ink-soft border-border hover:border-forest/30' : 'bg-forest text-white border-forest hover:bg-forest-mid'
            }`}
          >
            {locked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {locked ? 'Unpublish to edit' : 'Publish to portal'}
          </button>
        )}
        </div>
      </div>

      {locked && (
        <div className="flex items-start gap-2.5 bg-sage-pale border border-sage/30 rounded-card px-4 py-3 mb-4">
          <Eye className="w-4 h-4 text-forest flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-forest">
            This menu is published, so the group can see it in their portal and it is read-only
            here. Unpublish it to make changes, then publish again.
          </p>
        </div>
      )}

      {/* Meals × days grid, axis matches the Commissary session menu (meals down, days across) */}
      <div className="bg-white rounded-card border border-border overflow-x-auto">
        <div className="min-w-max">
          {/* Header: days across the top */}
          <div className="grid bg-cream-dark/40 border-b border-border" style={gridCols}>
            <div className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Meal</div>
            {days.map((d, i) => (
              <div key={d} className="px-3 py-2 border-l border-border">
                <p className="text-[12px] font-semibold text-forest leading-tight">Day {i + 1}</p>
                <p className="text-[10px] text-ink-faint">{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
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
                            onClick={() => editable && openModal({ kind: 'retreatMenuEntry', retreatId: retreat.id, dayDate: d, mealPeriod: meal, editId: e.id })}
                            className={`flex-1 text-left text-forest transition-colors ${editable ? 'hover:text-sage' : 'cursor-default'}`}
                          >
                            {dishName(e)}
                            {e.allergens && e.allergens.length > 0 && (
                              <span className="ml-1 text-[10px] text-amber-text">({e.allergens.map((a) => a.replace(/_/g, ' ')).join(', ')})</span>
                            )}
                            {!e.recipeId && !e.itemId && <span className="ml-1 text-[10px] text-forest/30">· display only</span>}
                          </button>
                          {editable && (
                            <button onClick={() => deleteRetreatMenuEntry(e.id)} className="text-forest/25 hover:text-red opacity-0 group-hover:opacity-100" aria-label="Remove">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {editable && (
                      <button
                        onClick={() => openModal({ kind: 'retreatMenuEntry', retreatId: retreat.id, dayDate: d, mealPeriod: meal })}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint hover:text-forest"
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
