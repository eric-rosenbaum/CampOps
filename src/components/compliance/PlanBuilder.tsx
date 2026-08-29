import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import type { CompliancePlanSection, PlanSectionStatus } from '@/lib/types';

/**
 * The written safety plan, section by section.
 *
 * The structure is not ours: it is transcribed from DOH-2040, New York's own Written Plan
 * Checklist, which is also the form the county marks up. That means the camp writes against
 * exactly the list the sanitarian reviews, and the page reference they enter here is the one
 * printed on the checklist we hand back.
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

const STATUS_LABEL: Record<PlanSectionStatus, string> = {
  not_started: 'Not started', drafted: 'Draft', complete: 'Complete', not_applicable: 'N/A',
};

export function PlanBuilder() {
  const { planByCategory, planProgress } = useComplianceStore();
  const groups = planByCategory();
  const progress = planProgress();
  const [open, setOpen] = useState<string | null>(groups[0]?.category ?? null);

  if (groups.length === 0) {
    return <p className="text-[13px] text-ink-faint italic py-6">Run setup to lay down your plan sections.</p>;
  }

  return (
    <div>
      <div className="bg-white rounded-card border border-border px-5 py-4 mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] font-semibold text-forest">Written safety plan</p>
          <span className="font-mono text-[13px] text-ink-soft">
            {progress.complete}/{progress.total} sections
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden mt-3">
          <div className="h-full bg-sage rounded-full transition-all"
               style={{ width: `${progress.total ? (progress.complete / progress.total) * 100 : 0}%` }} />
        </div>
        <p className="text-[12px] text-ink-soft mt-2.5 leading-relaxed">
          These are the components New York's own DOH-2040 checklist requires. The page number you
          record against each one is what we print on the checklist for your county reviewer.
        </p>
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const done = g.sections.filter((s) => s.status === 'complete' || s.status === 'not_applicable').length;
          const isOpen = open === g.category;
          return (
            <div key={g.category} className="bg-white rounded-card border border-border overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : g.category)} aria-expanded={isOpen}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-cream transition-colors">
                <ChevronDown className={`w-4 h-4 text-ink-faint transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                <span className="flex-1 text-[13.5px] font-semibold text-forest">
                  {CATEGORY_LABEL[g.category] ?? g.category}
                </span>
                <span className={`font-mono text-[12px] ${done === g.sections.length ? 'text-sage' : 'text-ink-soft'}`}>
                  {done}/{g.sections.length}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-cream-dark divide-y divide-cream-dark">
                  {g.sections.map((s) => <SectionRow key={s.id} section={s} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionRow({ section }: { section: CompliancePlanSection }) {
  const { savePlanSection } = useComplianceStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageSafetyItems');
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState(section.body ?? '');
  const [pageRef, setPageRef] = useState(section.pageRef ?? '');
  const [saved, setSaved] = useState(false);

  const done = section.status === 'complete' || section.status === 'not_applicable';

  async function save(status?: PlanSectionStatus) {
    await savePlanSection(section.id,
      { body: body || null, pageRef: pageRef || null, ...(status ? { status } : {}) },
      currentUser.name || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${done ? 'bg-sage' : 'bg-border'}`} />
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 text-left min-w-0">
          <span className="block text-[13px] text-ink truncate">{section.title}</span>
        </button>
        {section.pageRef && <span className="font-mono text-[11.5px] text-ink-faint flex-shrink-0">p.{section.pageRef}</span>}
        <span className={`text-[10.5px] font-semibold uppercase tracking-wide flex-shrink-0 ${done ? 'text-sage' : 'text-ink-faint'}`}>
          {STATUS_LABEL[section.status]}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 pl-4.5 space-y-2.5">
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} rows={4}
            disabled={!canManage}
            placeholder="What your plan says about this. Paste from last year's plan if you have one."
            className="w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 resize-y
                       focus:outline-none focus:border-sage disabled:bg-cream"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] text-ink-soft">Page in your plan</label>
            <input
              value={pageRef} onChange={(e) => setPageRef(e.target.value)} disabled={!canManage}
              className="w-20 text-[13px] bg-white border border-border rounded-btn px-2.5 py-1.5 disabled:bg-cream"
              placeholder="12"
            />
            {canManage && (
              <>
                <button onClick={() => save('drafted')}
                        className="text-[12.5px] font-semibold text-ink-soft hover:text-forest px-2.5 py-1.5">
                  Save draft
                </button>
                <button onClick={() => save('complete')}
                        className="text-[12.5px] font-semibold text-white bg-forest rounded-btn px-3 py-1.5 hover:bg-forest-mid">
                  Mark complete
                </button>
                <button onClick={() => save('not_applicable')}
                        className="text-[12.5px] font-semibold text-ink-soft hover:text-forest px-2.5 py-1.5">
                  Not applicable
                </button>
              </>
            )}
            {saved && <span className="text-[12px] text-sage inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
