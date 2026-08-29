import { useMemo, useState } from 'react';
import { Check, ChevronRight, Ban, Sparkles, ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import { draftFor, type DraftContext } from '@/lib/compliance/planDrafts';
import type { CompliancePlanSection, PlanSectionStatus, CompliancePlanTemplate } from '@/lib/types';

/**
 * The written safety plan.
 *
 * The structure is not ours: it is DOH-2040, New York's own checklist, which is also the form
 * the county marks up. So the camp writes against exactly the list the sanitarian reviews.
 *
 * This used to be seventy-three textareas in an accordion, each asking for both a body AND a
 * page number, which only makes sense if the plan lives somewhere else and we are also writing
 * it. It is one section at a time now, with the outline beside it, because the job is to write
 * a document rather than to fill a grid. The page number is gone: when the camp writes here we
 * generate the plan, so we know what page each section lands on.
 */

const CATEGORY_LABEL: Record<string, string> = {
  TABLE_OF_CONTENTS: 'Table of contents',
  PERSONNEL: 'Personnel',
  FACILITY_OPERATION: 'Facility operation',
  FIRE_SAFETY: 'Fire safety',
  MEDICAL_PLAN: 'Medical plan',
  ACTIVITIES_SUPERVISION: 'Activities and supervision',
  STAFF_TRAINING: 'Staff training',
  CAMPER_ORIENTATION: 'Camper orientation',
};

const DONE: PlanSectionStatus[] = ['complete', 'not_applicable'];

export function PlanBuilder() {
  const { planByCategory, planProgress, savePlanSection, answers } = useComplianceStore();
  const planTemplates = useComplianceStore((s) => s.planTemplates);
  const templateByCode = useMemo(
    () => new Map(planTemplates.map((t) => [t.code, t])), [planTemplates],
  );
  const { currentUser, can } = useAuth();
  const staff = useSafetyStore((s) => s.staff);
  const items = useSafetyStore((s) => s.items);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const season = useChecklistStore((s) => s.season);

  const groups = planByCategory();
  const progress = planProgress();

  // Flat order is the working order: next means the next section a person would write, across
  // category boundaries, not the next one inside this heading.
  const ordered = useMemo(() => groups.flatMap((g) => g.sections), [groups]);
  // Only what the camp has actually clicked is state. The landing section is derived, so it
  // follows the data instead of needing an effect to chase it.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const activeId = pickedId
    ?? (ordered.find((s) => !DONE.includes(s.status)) ?? ordered[0])?.id
    ?? null;
  const setActiveId = setPickedId;

  const active = ordered.find((s) => s.id === activeId) ?? null;
  const activeIndex = active ? ordered.findIndex((s) => s.id === active.id) : -1;
  const next = activeIndex >= 0 ? ordered[activeIndex + 1] ?? null : null;

  const ctx: DraftContext = {
    answers,
    campName: currentCamp?.name ?? 'the camp',
    staff, items,
    openingDate: season?.openingDate, closingDate: season?.closingDate,
  };

  if (groups.length === 0) {
    return <p className="text-[13px] text-ink-faint italic py-6">Run setup to lay down your plan sections.</p>;
  }

  return (
    <div>
      <div className="bg-white rounded-card border border-border px-5 py-4 mb-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[14px] font-semibold text-forest">Written safety plan</p>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed max-w-[74ch]">
              These are the components New York's DOH-2040 checklist requires. Write each one here
              and we produce the plan itself, with a contents page, so the page numbers on the
              checklist are ours to work out rather than yours.
            </p>
          </div>
          <span className="font-mono text-[13px] text-ink-soft whitespace-nowrap">
            {progress.complete}/{progress.total} written
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-3">
          <div className="h-full bg-sage rounded-full transition-all"
               style={{ width: `${progress.total === 0 ? 0 : (progress.complete / progress.total) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
        <Outline groups={groups} activeId={activeId} onPick={setActiveId} />
        {active ? (
          <SectionEditor
            key={active.id}
            section={active}
            guidance={templateByCode.get(active.sectionCode)}
            categoryLabel={CATEGORY_LABEL[active.category] ?? active.category}
            position={`${activeIndex + 1} of ${ordered.length}`}
            draft={draftFor(active.title, ctx)}
            canEdit={can('manageSafetyItems')}
            onSave={async (patch, advance) => {
              await savePlanSection(active.id, patch, currentUser.name || null);
              if (advance && next) setActiveId(next.id);
            }}
            hasNext={!!next}
          />
        ) : null}
      </div>
    </div>
  );
}

function Outline({ groups, activeId, onPick }: {
  groups: { category: string; sections: CompliancePlanSection[] }[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <nav className="bg-white rounded-card border border-border overflow-hidden lg:sticky lg:top-0">
      {groups.map((g) => {
        const done = g.sections.filter((s) => DONE.includes(s.status)).length;
        const hasActive = g.sections.some((s) => s.id === activeId);
        return (
          <div key={g.category} className="border-b border-cream-dark last:border-0">
            <button
              onClick={() => onPick(
                // Opening a category should land on its first unwritten section, not its first
                // section, so a half-finished category resumes where it stopped.
                (g.sections.find((s) => !DONE.includes(s.status)) ?? g.sections[0]).id,
              )}
              aria-expanded={hasActive}
              className="w-full px-3.5 py-2 flex items-center gap-2 bg-cream/50 hover:bg-cream-dark/60 transition-colors text-left"
            >
              <ChevronRight className={`w-3 h-3 text-ink-faint flex-shrink-0 transition-transform ${hasActive ? 'rotate-90' : ''}`} />
              <span className="text-[11.5px] font-semibold text-forest flex-1 min-w-0 truncate">
                {CATEGORY_LABEL[g.category] ?? g.category}
              </span>
              <span className={`font-mono text-[10.5px] ${done === g.sections.length ? 'text-sage' : 'text-ink-faint'}`}>
                {done}/{g.sections.length}
              </span>
            </button>
            {/* Only the open category lists its sections. Seventy-three at once is the wall this
                page used to be. */}
            {hasActive && (
              <div className="py-1">
                {g.sections.map((s) => (
                  <button key={s.id} onClick={() => onPick(s.id)}
                    className={`w-full text-left px-3.5 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                      s.id === activeId ? 'bg-cream-dark text-forest font-semibold' : 'text-ink-soft hover:bg-cream'}`}>
                    {DONE.includes(s.status)
                      ? <Check className="w-3 h-3 text-sage flex-shrink-0" />
                      : <span className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SectionEditor({ section, guidance, categoryLabel, position, draft, canEdit, onSave, hasNext }: {
  section: CompliancePlanSection;
  /** Catalog guidance for this component, joined by section code. */
  guidance: CompliancePlanTemplate | undefined;
  categoryLabel: string;
  position: string;
  draft: { text: string; from: string } | null;
  canEdit: boolean;
  onSave: (patch: { body?: string; status?: PlanSectionStatus; naReason?: string | null }, advance: boolean) => Promise<void>;
  hasNext: boolean;
}) {
  const [body, setBody] = useState(section.body ?? '');
  const [naOpen, setNaOpen] = useState(false);
  const [naReason, setNaReason] = useState(section.naReason ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = body !== (section.body ?? '');

  async function save(status: PlanSectionStatus, advance: boolean) {
    setBusy(true);
    await onSave({ body, status }, advance);
    setBusy(false);
  }

  return (
    <div className="bg-white rounded-card border border-border">
      <div className="px-5 py-4 border-b border-cream-dark">
        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">
          {categoryLabel} · {position}
        </p>
        <h3 className="text-[17px] font-semibold text-forest mt-1">{section.title}</h3>

        {/* What New York expects here. Without this the page is a title and a blank box, which
            is the reason it does not get finished. */}
        {guidance?.prompt && (
          <p className="text-[12.5px] text-ink-soft mt-2.5 leading-relaxed max-w-[72ch]">
            {guidance.prompt}
          </p>
        )}
        {guidance?.checklist && guidance.checklist.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {guidance.checklist.map((c: string, i: number) => (
              <li key={i} className="text-[12px] text-ink-soft flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-border flex-shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-4">
        {section.status === 'not_applicable' ? (
          <div className="rounded-card bg-cream-dark/60 px-4 py-3">
            <p className="text-[12.5px] text-ink-soft">
              Marked not applicable{section.naReason ? `: ${section.naReason}` : ''}.
            </p>
            {canEdit && (
              <Button size="sm" variant="ghost" className="mt-2"
                      onClick={() => save('not_started', false)}>
                This does apply after all
              </Button>
            )}
          </div>
        ) : (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!canEdit}
              rows={12}
              placeholder="Write this section in your own words."
              className="w-full text-[13px] leading-relaxed bg-white border border-border rounded-card px-3.5 py-3 text-ink focus:outline-none focus:border-sage resize-y"
            />

            {draft && !body && canEdit && (
              <button
                onClick={() => setBody(draft.text)}
                className="mt-2 text-[12px] text-sage hover:text-forest inline-flex items-start gap-1.5 text-left"
              >
                <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Start from what you have already told us
                  <span className="text-ink-faint"> · built from {draft.from}, and yours to rewrite</span>
                </span>
              </button>
            )}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 mt-3.5">
                <Button size="sm" disabled={busy || !body.trim()} onClick={() => save('complete', true)}>
                  {hasNext ? <>Save and next <ArrowRight className="w-3.5 h-3.5" /></> : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy || !dirty}
                        onClick={() => save('drafted', false)}>
                  Save as draft
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNaOpen((v) => !v)}>
                  <Ban className="w-3.5 h-3.5" /> Not applicable
                </Button>
              </div>
            )}

            {naOpen && canEdit && (
              <div className="mt-3 rounded-card border border-border bg-cream/50 px-4 py-3">
                <p className="text-[12px] text-ink-soft">
                  Why does this not apply? The reason prints on the checklist, because the
                  reviewer will ask.
                </p>
                <div className="flex gap-2 mt-2">
                  <input
                    value={naReason}
                    onChange={(e) => setNaReason(e.target.value)}
                    placeholder="e.g. No horses on the property"
                    className="flex-1 text-[13px] bg-white border border-border rounded-btn px-3 py-1.5"
                  />
                  <Button size="sm" disabled={!naReason.trim() || busy}
                          onClick={async () => {
                            setBusy(true);
                            await onSave({ status: 'not_applicable', naReason: naReason.trim() }, true);
                            setBusy(false); setNaOpen(false);
                          }}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {section.status === 'complete' && (
        <div className="px-5 py-2.5 border-t border-cream-dark flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-sage" />
          <p className="text-[11.5px] text-ink-soft">
            Written. This section prints in your plan and ticks its row on DOH-2040.
          </p>
        </div>
      )}
    </div>
  );
}
