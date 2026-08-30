import { CalendarClock, ArrowRight, AlertTriangle, FileEdit, ClipboardList } from 'lucide-react';
import { useComplianceStore } from '@/store/complianceStore';
import { useChecklistStore } from '@/store/checklistStore';
import { RequirementList } from './RequirementList';
import { ScopeNote } from './ScopeNote';
import { detailsProgress } from '@/lib/compliance/detailsProgress';
import { todayStr } from '@/lib/utils';

/**
 * Where the camp stands, and what is coming.
 *
 * This page answers two questions and then gets out of the way: is anything about to be late,
 * and who am I behind with. Everything else is one click away, because the overview earning its
 * place depends on it being short enough to read every morning.
 */

type Tab = 'reviewers' | 'records' | 'plan' | 'documents' | 'export';

export function ComplianceOverview({ onGoToTab }: { onGoToTab: (tab: Tab) => void }) {
  const st = useComplianceStore();
  const season = useChecklistStore((s) => s.season);
  const overall = st.overallPercent();
  const items = st.actionItems();
  const summaries = st.activeAuthorities();
  const plan = st.planProgress();
  // Same rule as the tab: no checklist in scope, no reason to ask for the plan.
  const activeForms = st.activeFormCodes();
  const planHasADocument = activeForms.has('DOH-2040') || activeForms.has('DOH-2286');
  const details = detailsProgress(st.formQuestions, st.answers, st.formAnswers, activeForms);
  const today = todayStr();

  // Anything with a real deadline, soonest first. A requirement already met is not "upcoming"
  // however close its date is.
  const upcoming = items
    .filter((i) => i.status.dueOn)
    .sort((a, b) => (a.status.dueOn ?? '').localeCompare(b.status.dueOn ?? ''))
    .slice(0, 6);

  const overdue = upcoming.filter((i) => (i.status.dueOn ?? '') < today);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 mb-5">
        <div className="bg-white rounded-card border border-border px-5 py-4">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft">Overall</p>
          <p className="text-[34px] font-semibold text-forest leading-none mt-2 font-mono">{overall}%</p>
          <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-3">
            <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${overall}%` }} />
          </div>
          <p className="text-[11.5px] text-ink-soft mt-2">
            {items.length === 0 ? 'Everything that applies to you is met.'
              : `${items.length} item${items.length === 1 ? '' : 's'} still to deal with`}
          </p>
          {season && (
            <p className="text-[11px] text-ink-faint mt-2.5 pt-2.5 border-t border-cream-dark">
              {season.name}
              {season.openingDate && ` · opens ${season.openingDate}`}
            </p>
          )}
        </div>

        {/* Who you are behind with. The card is the entry point to that party's full list. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {summaries.map((s) => (
            <button
              key={s.authority.id}
              onClick={() => onGoToTab('records')}
              className="bg-white rounded-card border border-border px-4 py-3.5 text-left hover:border-sage transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-forest">
                  {s.authority.shortName ?? s.authority.name}
                </p>
                {s.authority.visitsSite && (
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-soft bg-cream-dark rounded-btn px-1.5 py-0.5 flex-shrink-0">
                    Visits
                  </span>
                )}
              </div>
              {/* A meter is only meaningful when this party actually wants something of us.
                  Showing 0% for a party with nothing to track reads as failure, not as
                  "nothing to do", so those say what is true instead. */}
              {s.met + s.outstanding === 0 ? (
                <p className="text-[11.5px] text-ink-soft mt-2.5 leading-relaxed">
                  {s.total === 0
                    ? 'Sets the rules your county enforces. Nothing is filed with them directly.'
                    : 'Nothing here applies to your camp.'}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 mt-3">
                    <div className="h-1.5 flex-1 rounded-full bg-cream-dark overflow-hidden">
                      <div className="h-full bg-sage rounded-full" style={{ width: `${s.percent}%` }} />
                    </div>
                    <span className="font-mono text-[12px] text-ink-soft">{s.percent}%</span>
                  </div>
                  <p className="text-[11px] text-ink-faint mt-1.5">
                    {s.outstanding === 0
                      ? `Nothing outstanding of ${s.met}`
                      : `${s.outstanding} outstanding of ${s.met + s.outstanding}`}
                  </p>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Deadlines. Only shown when we actually have dates, rather than an empty promise. */}
      {upcoming.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2.5">
            <CalendarClock className="w-4 h-4 text-ink-faint" />
            <h3 className="text-[14px] font-semibold text-forest">Coming up</h3>
            {overdue.length > 0 && (
              <span className="text-[11px] text-red-text inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {overdue.length} past due
              </span>
            )}
          </div>
          <div className="bg-white rounded-card border border-border divide-y divide-border">
            {upcoming.map(({ requirement, status }) => {
              const late = (status.dueOn ?? '') < today;
              return (
                <button
                  key={requirement.id}
                  onClick={() => onGoToTab('records')}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-cream transition-colors"
                >
                  <span className={`font-mono text-[12px] flex-shrink-0 w-24 ${late ? 'text-red-text' : 'text-ink-soft'}`}>
                    {status.dueOn}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-ink truncate">{requirement.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* The written plan is the single biggest item in the packet and used to be reachable
          only from inside a group on another tab. It gets its own way in. */}
      {plan.total > 0 && planHasADocument && (
        <button
          onClick={() => onGoToTab('plan')}
          className="w-full bg-white rounded-card border border-border px-5 py-4 mb-6 text-left hover:border-sage transition-colors flex items-center gap-4"
        >
          <FileEdit className="w-5 h-5 text-ink-faint flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-forest">Your written safety plan</p>
            <p className="text-[12px] text-ink-soft mt-0.5">
              {plan.complete === 0
                ? `${plan.total} sections to write. We turn them into the plan document and fill the county's checklist from it.`
                : `${plan.complete} of ${plan.total} sections written. Keep going and the checklist fills itself.`}
            </p>
            <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-2.5 max-w-md">
              <div className="h-full bg-sage rounded-full"
                   style={{ width: `${Math.round((plan.complete / plan.total) * 100)}%` }} />
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
        </button>
      )}

      {details.total > 0 && details.done < details.total && (
        <button
          onClick={() => onGoToTab('records')}
          className="w-full bg-white rounded-card border border-border px-5 py-4 mb-6 text-left hover:border-sage transition-colors flex items-center gap-4"
        >
          <ClipboardList className="w-5 h-5 text-ink-faint flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-forest">Details your forms ask for</p>
            <p className="text-[12px] text-ink-soft mt-0.5">
              {details.total - details.done} question{details.total - details.done === 1 ? '' : 's'} still
              to answer. These are the ones nothing else in the platform can work out for you, and
              they are what stands between a part-filled packet and one you can file.
            </p>
            <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-2.5 max-w-md">
              <div className="h-full bg-sage rounded-full"
                   style={{ width: `${Math.round((details.done / details.total) * 100)}%` }} />
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
        </button>
      )}

      {items.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[14px] font-semibold text-forest">Needs attention</h3>
            <button onClick={() => onGoToTab('records')}
                    className="text-[12px] text-sage hover:text-forest inline-flex items-center gap-1">
              See everything by reviewer <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <RequirementList requirements={items.slice(0, 8).map((i) => i.requirement)} />
        </section>
      )}

      <ScopeNote />
    </>
  );
}
