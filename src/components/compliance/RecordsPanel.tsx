import { useState } from 'react';
import { ChevronDown, ClipboardCheck, Upload, FileEdit, HelpCircle, Ban } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore, type AuthoritySummary } from '@/store/complianceStore';
import { useUIStore } from '@/store/uiStore';
import { RequirementList } from './RequirementList';
import type { ComplianceRequirement } from '@/lib/types';

/**
 * Everything the camp has to do, grouped by who is going to ask for it.
 *
 * Two levels, both of which matter. Grouping only by party gives one enormous county card and
 * five thin ones. The second level is what makes it workable: a camp reads down "records to
 * keep current" in one frame of mind and "documents to attach" in another, and the work in each
 * is genuinely different.
 *
 * Where the platform already tracks the evidence, the button to add it is right here, opening
 * the same dialog the safety module uses. Nobody should have to know which module owns a drill
 * log in order to record that they ran a drill.
 */

type GroupKey = 'records' | 'documents' | 'plan' | 'unanswered' | 'notApplicable';

const GROUP: Record<GroupKey, { label: string; blurb: string; icon: typeof ClipboardCheck }> = {
  records: {
    label: 'Records to keep current',
    blurb: 'Tracked from what your staff log. Add an entry here and the status updates.',
    icon: ClipboardCheck,
  },
  documents: {
    label: 'Documents to attach',
    blurb: 'Satisfied by putting a file on record. Upload under Documents, or attach one you already have.',
    icon: Upload,
  },
  plan: {
    label: 'Your written plan',
    blurb: 'Sections of the safety plan. Write them under Safety plan and these fill in.',
    icon: FileEdit,
  },
  unanswered: {
    label: 'Still needs an answer',
    blurb: 'We cannot tell whether these apply to you until you answer the setup question.',
    icon: HelpCircle,
  },
  notApplicable: {
    label: 'Ruled out',
    blurb: 'Kept visible with the reason, because an inspector will ask why it is not in your packet.',
    icon: Ban,
  },
};

export function RecordsPanel({ onGoToTab }: { onGoToTab: (tab: 'plan' | 'documents') => void }) {
  const st = useComplianceStore();
  const summaries = st.activeAuthorities();
  const [openAuthority, setOpenAuthority] = useState<string | null>(
    summaries.find((s) => s.outstanding > 0)?.authority.id ?? summaries[0]?.authority.id ?? null,
  );

  if (summaries.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint italic py-6">
        Finish setup and your requirements will appear here, grouped by who reviews them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {summaries.map((summary) => (
        <AuthorityBlock
          key={summary.authority.id}
          summary={summary}
          isOpen={openAuthority === summary.authority.id}
          onToggle={() => setOpenAuthority(
            openAuthority === summary.authority.id ? null : summary.authority.id,
          )}
          onGoToTab={onGoToTab}
        />
      ))}
    </div>
  );
}

function AuthorityBlock({ summary, isOpen, onToggle, onGoToTab }: {
  summary: AuthoritySummary;
  isOpen: boolean;
  onToggle: () => void;
  onGoToTab: (tab: 'plan' | 'documents') => void;
}) {
  const workForAuthority = useComplianceStore((s) => s.workForAuthority);
  const work = workForAuthority(summary.authority.id);
  const a = summary.authority;

  const groups: { key: GroupKey; items: ComplianceRequirement[] }[] = [
    { key: 'records', items: work.records },
    { key: 'documents', items: work.documents },
    { key: 'plan', items: work.plan },
    { key: 'unanswered', items: work.unanswered },
    { key: 'notApplicable', items: work.notApplicable },
  ];

  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-cream transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-forest">{a.name}</p>
          <p className="text-[11.5px] text-ink-faint mt-0.5">
            {summary.met + summary.outstanding === 0
              ? (summary.total === 0
                  ? 'Nothing is filed with them directly'
                  : `Nothing here applies to your camp · ${summary.notApplicable} ruled out`)
              : (
                  <>
                    {summary.outstanding === 0
                      ? `Nothing outstanding · ${summary.met} on record`
                      : `${summary.outstanding} outstanding · ${summary.met} on record`}
                    {summary.notApplicable > 0 && ` · ${summary.notApplicable} ruled out`}
                  </>
                )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {summary.met + summary.outstanding > 0 && (
            <>
              <div className="hidden sm:block w-28 h-1.5 rounded-full bg-cream-dark overflow-hidden">
                <div className="h-full bg-sage rounded-full" style={{ width: `${summary.percent}%` }} />
              </div>
              <span className="font-mono text-[12px] text-ink-soft w-9 text-right">{summary.percent}%</span>
            </>
          )}
          <ChevronDown className={`w-4 h-4 text-ink-faint transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border px-5 py-4 space-y-6 bg-cream/30">
          {groups.filter((g) => g.items.length > 0).map(({ key, items }) => {
            const meta = GROUP[key];
            const Icon = meta.icon;
            return (
              <section key={key}>
                <div className="flex items-start gap-2 mb-1">
                  <Icon className="w-3.5 h-3.5 text-ink-faint mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-[13px] font-semibold text-forest">
                      {meta.label} <span className="font-mono text-[11px] text-ink-faint">{items.length}</span>
                    </h4>
                    <p className="text-[11.5px] text-ink-soft leading-relaxed max-w-[70ch]">{meta.blurb}</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  <RequirementList
                    requirements={items}
                    renderAction={key === 'records'
                      ? (r) => <RecordAction requirement={r} />
                      : key === 'plan'
                        ? () => (
                            <Button size="sm" variant="ghost" onClick={() => onGoToTab('plan')}>
                              <FileEdit className="w-3.5 h-3.5" /> Open the plan
                            </Button>
                          )
                        : key === 'documents'
                          ? () => (
                              <Button size="sm" variant="ghost" onClick={() => onGoToTab('documents')}>
                                <Upload className="w-3.5 h-3.5" /> Upload a file
                              </Button>
                            )
                          : undefined}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The button that records the thing this requirement is asking for.
 *
 * Opens the safety module's own dialog rather than a copy of it, so a drill logged from here is
 * identical in every way to one logged from the safety register, and there is one place the
 * write happens.
 */
function RecordAction({ requirement }: { requirement: ComplianceRequirement }) {
  const {
    openLogDrillModal, openLogTempModal, openSafetyLogInspectionModal, openStaffCertModal,
  } = useUIStore();

  switch (requirement.evidenceType) {
    case 'drill':
      return (
        <Button size="sm" variant="ghost" onClick={() => openLogDrillModal()}>
          <ClipboardCheck className="w-3.5 h-3.5" /> Log a drill
        </Button>
      );
    case 'temp_log':
      return (
        <Button size="sm" variant="ghost" onClick={() => openLogTempModal()}>
          <ClipboardCheck className="w-3.5 h-3.5" /> Log a temperature
        </Button>
      );
    case 'inspection':
      return (
        <Button size="sm" variant="ghost" onClick={() => openSafetyLogInspectionModal()}>
          <ClipboardCheck className="w-3.5 h-3.5" /> Log an inspection
        </Button>
      );
    case 'certification':
      return (
        <Button size="sm" variant="ghost" onClick={() => openStaffCertModal()}>
          <ClipboardCheck className="w-3.5 h-3.5" /> Add a certification
        </Button>
      );
    // Pool chemistry and vehicle paperwork live in modules with their own screens, and the
    // entry there carries context this dialog could not. Link rather than duplicate.
    case 'pool_log':
      return (
        <a href="/pool"><Button size="sm" variant="ghost">Open Pool Manager</Button></a>
      );
    case 'asset_expiry':
      return (
        <a href="/assets"><Button size="sm" variant="ghost">Open Assets</Button></a>
      );
    default:
      return null;
  }
}
