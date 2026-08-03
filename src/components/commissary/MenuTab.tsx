import { CalendarDays, ChevronLeft, ChevronRight, Link2Off, X, Printer, CalendarClock, Sandwich, Package, Replace, LayoutGrid, Utensils } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import type { MealPeriod } from '@/lib/types';
import {
  MEAL_PERIODS, MEAL_PERIOD_LABELS, DAY_LABELS, dateForCell, restrictionLabel,
  menuWeekToPrintHtml, type PrintMenuCell,
} from '@/lib/commissaryUnits';
import { TemplatesView } from './TemplatesView';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MenuCell({ week, dayIndex, meal }: { week: number; dayIndex: number; meal: MealPeriod }) {
  const {
    entriesForCell, entryAllergens, conflictsForEntry, deleteMenuEntry, openModal,
    coursesSorted, substitutionsForCell,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');

  const courseRank = new Map(coursesSorted().map((c, i) => [c.name, i]));
  const entries = [...entriesForCell(week, dayIndex, meal)].sort((a, b) => {
    const ra = a.course ? (courseRank.get(a.course) ?? 998) : 999;
    const rb = b.course ? (courseRank.get(b.course) ?? 998) : 999;
    return ra - rb || a.sortOrder - b.sortOrder;
  });

  const subs = substitutionsForCell(week, dayIndex, meal);
  // A conflict is "covered" if a substitution targets its restriction (or a general one exists).
  const coveredSlugs = new Set(subs.map((s) => s.forRestriction).filter(Boolean) as string[]);
  const hasGeneralSub = subs.some((s) => !s.forRestriction);

  return (
    <div className="border-r border-b border-border p-1.5 min-h-[76px] flex flex-col gap-1">
      {entries.map((e) => {
        const allergens = entryAllergens(e);
        const isItem = !e.recipeId && !!e.itemId;
        const unlinked = !e.recipeId && !e.itemId;
        // A chip is only a WARNING when its allergens actually collide with a camper.
        const conflicts = conflictsForEntry(e);
        const anaphylactic = conflicts.some((c) => c.anaphylacticCount > 0);
        const conflicted = conflicts.length > 0;
        // Green tint when every conflicting restriction has a replacement plated.
        const allCovered = conflicted && conflicts.every((c) => hasGeneralSub || coveredSlugs.has(c.allergen));
        return (
          <div
            key={e.id}
            className={`group relative rounded-tag px-2 py-1 text-[11px] leading-tight border ${
              unlinked
                ? 'bg-white border-dashed border-border text-forest/55'
                : allCovered
                  ? 'bg-green-muted-bg border-sage/30 text-green-muted-text'
                  : anaphylactic
                    ? 'bg-red-bg border-red/25 text-red'
                    : conflicted
                      ? 'bg-amber-bg border-amber/25 text-amber-text'
                      : 'bg-cream-dark border-border text-forest/80'
            }`}
            title={
              unlinked
                ? 'Free text — excluded from ordering demand and allergen totals'
                : conflicted
                  ? `Conflicts with campers: ${conflicts.map((c) => `${restrictionLabel(c.allergen)} (${c.camperCount}${c.anaphylacticCount > 0 ? `, ${c.anaphylacticCount} anaphylactic` : ''})`).join('; ')}${allCovered ? ' — replacement plated' : ''}`
                  : allergens.length
                    ? `Contains ${allergens.map((a) => restrictionLabel(a)).join(', ')} — no camper affected`
                    : 'No major allergens'
            }
          >
            {e.course && <span className="block text-[8px] font-bold uppercase tracking-wider opacity-50 leading-none mb-0.5">{e.course}</span>}
            <span className="flex items-center gap-1">
              {unlinked && <Link2Off className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />}
              {isItem && <Package className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />}
              <span className="truncate">{e.label ?? '—'}</span>
              {anaphylactic && !allCovered && <span className="font-bold flex-shrink-0">⚠</span>}
              {allCovered && <span className="flex-shrink-0" title="Replacement plated">✓</span>}
            </span>
            {canManage && (
              <button
                onClick={() => deleteMenuEntry(e.id)}
                className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-forest text-cream items-center justify-center"
                aria-label="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Replacement meals for this cell */}
      {subs.map((s) => (
        <button
          key={s.id}
          onClick={() => canManage && openModal({ kind: 'substitution', weekNumber: week, dayIndex, mealPeriod: meal, editId: s.id })}
          className="text-left rounded-tag px-2 py-1 text-[10px] leading-tight border border-sage/30 bg-green-muted-bg/60 text-green-muted-text"
          title="Replacement meal"
        >
          <span className="flex items-center gap-1">
            <Replace className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">
              {s.forRestriction ? `${restrictionLabel(s.forRestriction)}: ` : ''}{s.mainLabel}{s.sideLabel ? ` + ${s.sideLabel}` : ''}
            </span>
          </span>
        </button>
      ))}

      {canManage && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openModal({ kind: 'menuEntry', weekNumber: week, dayIndex, mealPeriod: meal })}
            className="text-[11px] text-forest/30 hover:text-forest/70 text-left px-1 py-0.5 transition-colors"
          >
            + add
          </button>
          {entries.length > 0 && (
            <button
              onClick={() => openModal({ kind: 'substitution', weekNumber: week, dayIndex, mealPeriod: meal })}
              className="text-[10px] text-forest/25 hover:text-forest/60 text-left px-1 py-0.5 transition-colors"
              title="Add a replacement meal for allergy-affected campers"
            >
              + replacement
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ menuView, setMenuView }: { menuView: string; setMenuView: (v: 'session' | 'templates') => void }) {
  return (
    <div className="flex items-center gap-2 px-7 pt-5">
      <FilterPill label="Session menu" active={menuView === 'session'} onClick={() => setMenuView('session')} />
      <FilterPill label="Templates" active={menuView === 'templates'} onClick={() => setMenuView('templates')} />
    </div>
  );
}

export function MenuTab() {
  const {
    activeSession, activeWeek, setActiveWeek, weeksInSession, portions,
    openModal, copyWeek, clearWeek, unlinkedEntryCount, entriesForWeek,
    menuView, setMenuView, eventsForSession, templates,
  } = useCommissaryStore();
  const { can } = useAuth();
  const canManage = can('manageCommissary');

  if (menuView === 'templates') {
    return (
      <>
        <ViewToggle menuView={menuView} setMenuView={setMenuView} />
        <TemplatesView />
      </>
    );
  }

  const session = activeSession();

  if (!session) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
            <CalendarDays className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No session yet</h3>
          <p className="text-[13px] text-forest/50 leading-relaxed mb-4">
            A session sets the dates and the head count. Every recipe yield and every
            ordering quantity scales from that number, so the menu needs one first.
          </p>
          {canManage && <Button size="sm" onClick={() => openModal({ kind: 'session' })}>+ Create a session</Button>}
        </div>
      </div>
    );
  }

  const weeks = weeksInSession();
  const total = portions();
  const unlinked = unlinkedEntryCount(activeWeek);
  const hasEntries = entriesForWeek(activeWeek).length > 0;

  const weekStart = dateForCell(session.startDate, activeWeek, 0);
  const weekEnd = dateForCell(session.startDate, activeWeek, 6);

  // This week's meal-level events (visiting day, off-site trips, bag lunches).
  const weekEvents = eventsForSession().filter((e) => {
    const dayIdx = Math.floor((new Date(`${e.date}T00:00:00`).getTime() - weekStart.getTime()) / 86_400_000);
    return dayIdx >= 0 && dayIdx <= 6;
  });

  function handlePrintMenu() {
    const cells: PrintMenuCell[] = [];
    for (const meal of MEAL_PERIODS) {
      for (let d = 0; d < 7; d++) {
        const items = entriesForWeek(activeWeek)
          .filter((e) => e.dayIndex === d && e.mealPeriod === meal)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((e) => e.label ?? '—');
        cells.push({ meal: MEAL_PERIOD_LABELS[meal], day: DAY_LABELS[d], items });
      }
    }
    const html = menuWeekToPrintHtml(
      `Week ${activeWeek} (${fmtDate(weekStart)} – ${fmtDate(weekEnd)})`,
      DAY_LABELS, MEAL_PERIODS.map((m) => MEAL_PERIOD_LABELS[m]), cells,
    );
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print the menu.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      <ViewToggle menuView={menuView} setMenuView={setMenuView} />
      <div className="px-7 pt-4">
      {/* Head count — the number everything downstream scales from. */}
      <div className="flex items-center gap-3 bg-white rounded-card border border-border px-4 py-3 mb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-forest/40">Session head count</p>
          <p className="font-mono text-[20px] text-forest leading-tight mt-0.5">{total.toLocaleString()}</p>
        </div>
        <p className="text-[11px] text-forest/50 leading-relaxed max-w-md">
          {session.camperCount.toLocaleString()} campers + {session.staffCount.toLocaleString()} staff.
          All recipe yields and ordering quantities scale to this number.
        </p>
        <div className="flex-1" />
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'session', editId: session.id })}>
            Edit session
          </Button>
        )}
      </div>

      {unlinked > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-forest/50 bg-cream-dark/40 border border-border rounded-card px-3 py-2 mb-4">
          <Link2Off className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            {unlinked} item{unlinked === 1 ? '' : 's'} on this week's menu {unlinked === 1 ? 'is' : 'are'} not
            linked to a recipe. They show on the menu but contribute nothing to ordering demand or allergen totals.
          </span>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveWeek(Math.max(1, activeWeek - 1))}
            disabled={activeWeek <= 1}
            className="w-7 h-7 rounded-btn border border-border flex items-center justify-center text-forest/60 hover:bg-cream-dark disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-[13px] font-semibold text-forest min-w-[240px] text-center">
            Week {activeWeek} — {fmtDate(weekStart)} – {fmtDate(weekEnd)}
          </p>
          <button
            onClick={() => setActiveWeek(Math.min(weeks, activeWeek + 1))}
            disabled={activeWeek >= weeks}
            className="w-7 h-7 rounded-btn border border-border flex items-center justify-center text-forest/60 hover:bg-cream-dark disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-forest/40 ml-1">of {weeks}</span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={!hasEntries} onClick={handlePrintMenu}>
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'courses' })}>
                <LayoutGrid className="w-3.5 h-3.5" /> Courses
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'dietCounts' })}>
                <Utensils className="w-3.5 h-3.5" /> Dietary
              </Button>
              {templates.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'applyTemplate' })}>
                  Apply template
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={activeWeek <= 1} onClick={() => copyWeek(activeWeek - 1, activeWeek)}>
                Copy week {activeWeek - 1}
              </Button>
              <Button size="sm" variant="ghost" disabled={!hasEntries}
                      onClick={() => { if (confirm(`Clear every meal from week ${activeWeek}?`)) clearWeek(activeWeek); }}>
                Clear week
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Meal-level events for this week */}
      {(weekEvents.length > 0 || canManage) && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {weekEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => canManage && openModal({ kind: 'mealEvent', editId: e.id })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-medium border ${
                e.kind === 'bag_lunch' ? 'bg-cream-dark text-forest/70 border-border' : 'bg-forest/8 text-forest border-forest/15'
              }`}
              style={{ backgroundColor: e.kind === 'bag_lunch' ? undefined : 'rgba(26,46,26,0.06)' }}
            >
              {e.kind === 'bag_lunch' ? <Sandwich className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
              {e.label}
              <span className="text-forest/40">
                {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                {e.mealPeriod ? ` ${MEAL_PERIOD_LABELS[e.mealPeriod].toLowerCase()}` : ''}
                {' · '}{e.countMode === 'delta' && e.count >= 0 ? '+' : ''}{e.count}
              </span>
            </button>
          ))}
          {canManage && (
            <button onClick={() => openModal({ kind: 'mealEvent' })} className="text-[11px] text-forest/40 hover:text-forest/70 px-1">
              + event
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-card border border-border overflow-hidden">
        <div className="grid grid-cols-[92px_repeat(7,minmax(0,1fr))]">
          <div className="border-r border-b border-border bg-cream-dark/50" />
          {DAY_LABELS.map((day, i) => {
            const d = dateForCell(session.startDate, activeWeek, i);
            return (
              <div key={day} className="border-r border-b border-border bg-cream-dark/50 px-2 py-2 text-center last:border-r-0">
                <p className="text-[11px] font-semibold text-forest">{day}</p>
                <p className="text-[10px] text-forest/40">{fmtDate(d)}</p>
              </div>
            );
          })}

          {MEAL_PERIODS.map((meal) => (
            <div key={meal} className="contents">
              <div className="border-r border-b border-border bg-cream-dark/50 px-2 py-2 flex items-start">
                <p className="text-[11px] font-semibold text-forest">{MEAL_PERIOD_LABELS[meal]}</p>
              </div>
              {DAY_LABELS.map((_, dayIndex) => (
                <MenuCell key={`${meal}-${dayIndex}`} week={activeWeek} dayIndex={dayIndex} meal={meal} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-forest/40 mt-3 leading-relaxed">
        Amber chips conflict with a camper's allergy; red chips conflict with an anaphylactic
        camper. A recipe containing an allergen nobody in camp reacts to stays neutral.
        Dashed chips have no recipe and are excluded from ordering and allergen checks.
      </p>
      </div>
    </div>
  );
}
