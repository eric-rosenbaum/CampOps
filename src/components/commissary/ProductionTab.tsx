import { useMemo } from 'react';
import { ChefHat, AlertTriangle, Link2Off, RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import { Printer, Snowflake } from 'lucide-react';
import {
  MEAL_PERIODS, MEAL_PERIOD_LABELS, DAY_LABELS, dateForCell, ALLERGEN_LABELS,
  restrictionLabel, formatInStockUnit, productionPlanToPrintHtml,
  type Allergen, type PrintTask,
} from '@/lib/commissaryUnits';
import { useCampStore } from '@/store/campStore';
import type { ProductionTask } from '@/lib/types';

function TaskRow({ task }: { task: ProductionTask }) {
  const { toggleProductionTask, conflictsForRecipe } = useCommissaryStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageCommissary');

  // Conflicts are recomputed live rather than read off the snapshot: the ingredient
  // quantities are frozen at generation, but who is allergic to what is not.
  const conflicts = task.recipeId ? conflictsForRecipe(task.recipeId) : [];
  const anaphylactic = conflicts.some((c) => c.anaphylacticCount > 0);

  return (
    <div className={`px-4 py-3 border-b border-border last:border-0 ${task.isComplete ? 'bg-cream-dark/20' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.isComplete}
          disabled={!canManage}
          onChange={() => toggleProductionTask(task.id, currentUser.name || 'Unknown')}
          className="mt-0.5 accent-sage w-4 h-4 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-[13px] font-medium ${task.isComplete ? 'text-forest/40 line-through' : 'text-forest'}`}>
              {task.title}
            </p>
            <span className="font-mono text-[11px] text-forest/40">{task.portions} portions</span>
            {task.prepTime && <span className="text-[11px] text-forest/40">prep {task.prepTime}</span>}
            {task.cookTime && <span className="text-[11px] text-forest/40">cook {task.cookTime}</span>}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {task.ingredients.map((ing, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-tag text-[11px] border ${
                  ing.linked
                    ? 'bg-cream-dark text-forest/70 border-border'
                    : 'bg-white text-forest/40 border-dashed border-border'
                }`}
                title={ing.linked ? undefined : 'Unlinked ingredient — not scaled'}
              >
                {!ing.linked && <Link2Off className="w-2.5 h-2.5" />}
                <span className="font-mono">{ing.qty}</span> {ing.label}
              </span>
            ))}
          </div>

          {conflicts.length > 0 && (
            <p className={`text-[11px] mt-2 flex items-start gap-1.5 ${anaphylactic ? 'text-red' : 'text-amber-text'}`}>
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                Contains {conflicts.map((c) => ALLERGEN_LABELS[c.allergen as Allergen] ?? c.allergen).join(', ').toLowerCase()} —{' '}
                {conflicts.map((c) => `${c.camperCount} camper${c.camperCount === 1 ? '' : 's'}`).join(', ')} affected
                {anaphylactic && '. One or more is ANAPHYLACTIC — prepare a separate portion with dedicated equipment.'}
              </span>
            </p>
          )}

          {task.isComplete && task.completedBy && (
            <p className="text-[11px] text-forest/35 mt-1.5">Done by {task.completedBy}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductionTab() {
  const {
    activeSession, activeWeek, activeDayIndex, setActiveDayIndex,
    planFor, tasksForPlan, isPlanStale, generatePlan, entriesForDay,
    setActiveTab, portions, conflictsForRecipe, dietCountsForSession, thawListForDay,
  } = useCommissaryStore();
  const { can, currentUser } = useAuth();
  const { currentCamp } = useCampStore();
  const canManage = can('manageCommissary');
  const session = activeSession();

  const plan = session ? planFor(activeWeek, activeDayIndex) : null;
  const stale = session ? isPlanStale(activeWeek, activeDayIndex) : false;
  const tasks = useMemo(() => (plan ? tasksForPlan(plan.id) : []), [plan, tasksForPlan]);

  const dayEntries = session ? entriesForDay(activeWeek, activeDayIndex) : [];
  const linkedCount = dayEntries.filter((e) => e.recipeId).length;
  const unlinkedCount = dayEntries.length - linkedCount;

  const done = tasks.filter((t) => t.isComplete).length;
  const thaw = session ? thawListForDay(activeWeek, activeDayIndex) : [];

  // Substitution worklist: per-recipe allergen conflicts + standing dietary counts +
  // camp-wide kosher. This is the plating instruction a line cook actually works from.
  const worklist = useMemo(() => {
    const lines: string[] = [];
    if (currentCamp?.dietaryDefaults?.kosher) lines.push('Whole kitchen is kosher — no meat + dairy on the same plate.');
    for (const d of dietCountsForSession()) {
      lines.push(`${d.count} ${restrictionLabel(d.restriction).toLowerCase()} portion${d.count === 1 ? '' : 's'} — plate a compliant alternative.`);
    }
    for (const t of tasks) {
      if (!t.recipeId) continue;
      const conflicts = conflictsForRecipe(t.recipeId);
      for (const c of conflicts) {
        const ana = c.anaphylacticCount > 0;
        lines.push(`${t.title}: ${c.camperCount} camper${c.camperCount === 1 ? '' : 's'} allergic to ${ALLERGEN_LABELS[c.allergen as Allergen] ?? c.allergen}${ana ? ' — ANAPHYLACTIC, dedicated prep' : ''}.`);
      }
    }
    return lines;
  }, [tasks, conflictsForRecipe, dietCountsForSession, currentCamp]);

  function handlePrint() {
    if (!plan) return;
    const printTasks: PrintTask[] = tasks.map((t) => {
      const conflicts = t.recipeId ? conflictsForRecipe(t.recipeId) : [];
      const note = conflicts.length
        ? `Allergen: ${conflicts.map((c) => `${ALLERGEN_LABELS[c.allergen as Allergen] ?? c.allergen} (${c.camperCount})`).join(', ')}`
        : null;
      return {
        mealLabel: MEAL_PERIOD_LABELS[t.mealPeriod],
        title: t.title, portions: t.portions,
        ingredients: t.ingredients, prepTime: t.prepTime, cookTime: t.cookTime,
        conflictNote: note,
      };
    });
    const dayLabel = `${DAY_LABELS[activeDayIndex]} ${dateForCell(session!.startDate, activeWeek, activeDayIndex).toLocaleDateString()}`;
    const html = productionPlanToPrintHtml(dayLabel, printTasks, worklist);
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print the plan.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  if (!session) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <ChefHat className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No session yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            Production quantities scale from a session's head count. Create one on the Menu
            tab, plan a week of meals, then generate a prep plan for each day.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setActiveTab('menu')}>Go to menu</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {/* Day selector */}
      <div className="flex items-center gap-1.5 mb-5">
        {DAY_LABELS.map((day, i) => {
          const d = dateForCell(session.startDate, activeWeek, i);
          const active = i === activeDayIndex;
          return (
            <button
              key={day}
              onClick={() => setActiveDayIndex(i)}
              className={`px-3 py-2 rounded-btn border text-center transition-colors ${
                active
                  ? 'bg-forest text-cream border-forest'
                  : 'bg-white text-forest/60 border-border hover:border-forest/30'
              }`}
            >
              <span className="block text-[11px] font-semibold">{day}</span>
              <span className={`block text-[10px] ${active ? 'text-cream/60' : 'text-forest/35'}`}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        {plan && (
          <Button size="sm" variant="ghost" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        )}
        {canManage && (
          <Button
            size="sm"
            variant={plan ? 'ghost' : 'primary'}
            disabled={linkedCount === 0}
            onClick={() => {
              if (plan && !confirm('Regenerate this plan? Every task will be reset to not-started, and any completion recorded today will be lost.')) return;
              generatePlan(activeWeek, activeDayIndex, currentUser.name || null);
            }}
          >
            {plan ? <><RefreshCw className="w-3.5 h-3.5" /> Regenerate plan</> : 'Generate plan'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Head count" value={portions()} hint="Campers + staff" />
        <StatCard label="Portions today" value={plan ? plan.portions * MEAL_PERIODS.length : 0} hint="Across all meal periods" />
        <StatCard label="Tasks complete" value={`${done} of ${tasks.length}`} hint={tasks.length ? `${Math.round((done / tasks.length) * 100)}% done` : 'No plan generated'} />
        <StatCard label="Meals on menu" value={dayEntries.length} hint={unlinkedCount > 0 ? `${unlinkedCount} unlinked` : 'All linked to recipes'} />
      </div>

      {stale && (
        <div className="flex items-center gap-3 rounded-card border border-amber/30 bg-amber-bg px-4 py-3.5 mb-5">
          <AlertTriangle className="w-4 h-4 text-amber flex-shrink-0" />
          <p className="flex-1 text-body text-amber-text leading-relaxed">
            This day's menu changed after the plan was generated{plan?.generatedAt && ` on ${new Date(plan.generatedAt).toLocaleString()}`}.
            The tasks below are out of date. Regenerating resets every task to not-started.
          </p>
          {canManage && (
            <Button
              size="sm" variant="ghost"
              className="text-amber-text border-amber/40 hover:bg-amber-bg whitespace-nowrap"
              onClick={() => {
                if (confirm('Regenerate this plan? Every task will be reset to not-started.')) {
                  generatePlan(activeWeek, activeDayIndex, currentUser.name || null);
                }
              }}
            >
              Regenerate
            </Button>
          )}
        </div>
      )}

      {!plan ? (
        <div className="bg-white rounded-card border border-border px-6 py-10 text-center">
          <ChefHat className="w-7 h-7 text-stone-300 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-forest mb-1">No plan for {DAY_LABELS[activeDayIndex]}</p>
          <p className="text-[13px] text-forest/50 max-w-md mx-auto leading-relaxed">
            {linkedCount === 0
              ? "Nothing on this day's menu is linked to a recipe, so there is nothing to prep against. Attach recipes on the Menu tab."
              : `Generate a prep plan from the ${linkedCount} recipe${linkedCount === 1 ? '' : 's'} on this day's menu, scaled to ${portions()} portions.`}
          </p>
          {unlinkedCount > 0 && linkedCount > 0 && (
            <p className="text-[11px] text-forest/40 mt-3">
              {unlinkedCount} free-text item{unlinkedCount === 1 ? '' : 's'} will be skipped — no recipe to prep.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {MEAL_PERIODS.map((meal) => {
            const mealTasks = tasks.filter((t) => t.mealPeriod === meal);
            if (!mealTasks.length) return null;
            const mealDone = mealTasks.filter((t) => t.isComplete).length;
            return (
              <div key={meal} className="bg-white rounded-card border border-border overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-cream-dark/40 border-b border-border">
                  <p className="text-[13px] font-semibold text-forest">{MEAL_PERIOD_LABELS[meal]}</p>
                  <div className="flex-1" />
                  <span className={`text-[11px] font-medium ${
                    mealDone === mealTasks.length ? 'text-green-muted-text' : 'text-forest/45'
                  }`}>
                    {mealDone} of {mealTasks.length} complete
                  </span>
                </div>
                {mealTasks.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            );
          })}

          {worklist.length > 0 && (
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[13px] font-semibold text-forest mb-2">Substitutions to plate</p>
              <ul className="space-y-1.5">
                {worklist.map((w, i) => (
                  <li key={i} className={`text-[12px] flex gap-2 ${/ANAPHYLACTIC/.test(w) ? 'text-red' : 'text-forest/70'}`}>
                    <span className="text-forest/30">•</span><span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {thaw.length > 0 && (
            <div className="bg-white rounded-card border border-border p-4">
              <p className="text-[13px] font-semibold text-forest mb-2 flex items-center gap-1.5">
                <Snowflake className="w-3.5 h-3.5 text-forest/50" /> Pull from freezer
              </p>
              <div className="space-y-1">
                {thaw.map(({ item, neededBase }) => (
                  <div key={item.id} className="flex items-center gap-3 text-[12px]">
                    <span className="text-forest/30">☐</span>
                    <span className="text-forest/70 flex-1">{item.name}</span>
                    <span className="font-mono text-forest">{formatInStockUnit(item, neededBase)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-forest/40 mt-2">Pull tonight to thaw for this day's menu.</p>
            </div>
          )}

          <p className="text-[11px] text-forest/40 leading-relaxed">
            Quantities are frozen from when the plan was generated, so a printout and this
            screen always agree. Allergy warnings are live — they reflect the current roster.
          </p>
        </div>
      )}
    </div>
  );
}
