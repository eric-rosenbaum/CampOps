import { useState } from 'react';
import { ChevronDown, ClipboardCheck, Upload, FileEdit, HelpCircle, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useComplianceStore, type AuthoritySummary } from '@/store/complianceStore';
import { useUIStore } from '@/store/uiStore';
import { RequirementList } from './RequirementList';
import { generatedFormFor } from '@/lib/compliance/generatedForms';
import { auditRecordsCoverage } from '@/store/complianceStore.audit';
import { DetailsPanel } from './DetailsPanel';
import { SessionsPanel } from './SessionsPanel';
import { RosterPanel } from './RosterPanel';
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
    blurb: 'Rules this reviewer enforces that you satisfy by keeping something up to date rather than by filing a document: extinguisher checks, drills, staff certifications, kitchen temperatures. The status reads from what your staff have already logged, so adding an entry here updates it.',
    icon: ClipboardCheck,
  },
  documents: {
    label: 'Documents to attach',
    blurb: 'Rules you satisfy by putting a file on record: the reviewer wants a copy, or nothing in the platform can prove it for you.',
    icon: Upload,
  },
  plan: {
    label: 'Your written plan',
    blurb: 'Rules satisfied by what your safety plan says. Write those sections under Safety plan and these turn green on their own.',
    icon: FileEdit,
  },
  unanswered: {
    label: 'Still needs an answer',
    blurb: 'We cannot tell whether these apply to you until you answer the setup question.',
    icon: HelpCircle,
  },
  notApplicable: {
    label: 'Ruled out',
    blurb: 'Kept visible, with the reason you gave.',
    icon: Ban,
  },
};

export function RecordsPanel({ onGoToTab, onOpenSetup, focus, onOpenForm }: {
  onGoToTab: (tab: 'plan' | 'documents') => void;
  onOpenSetup?: () => void;
  focus?: { group?: string; highlight?: string[]; from?: string; formCode?: string } | null;
  onOpenForm?: (formCode: string) => void;
}) {
  const st = useComplianceStore();
  const summaries = st.activeAuthorities();

  /**
   * This page claims to be the complete set of what the camp owes. Check it, rather than
   * trusting the bucketing, because the failure mode is silent: a requirement that falls
   * through every branch simply is not rendered and nobody notices until a reviewer does.
   */
  const enabled = new Set(st.enabledProfileIds);
  // A requirement belonging to a parked authority is parked with it, not missing. Without this
  // the audit would report the fire department's one rule as a gap the moment that party is
  // switched off, which is the opposite of what the check is for.
  const activeAuthorityIds = new Set(st.authorities.map((a) => a.id));
  const expected = st.requirements.filter(
    (r) => enabled.has(r.profileId)
      && r.authorityId && activeAuthorityIds.has(r.authorityId)
      // ...and only what this page is claiming to show. A rule checked at inspection, or one
      // belonging to a parked document, is accounted for in the footer note rather than being
      // a gap. The audit exists to catch rows that fall through the bucketing, not rows the
      // page is deliberately not listing.
      && st.inScope(r.formCodes) === 'on_a_form',
  );
  const rendered = new Map(summaries.map((s) => [s.authority.id, st.workForAuthority(s.authority.id)]));
  const problems = auditRecordsCoverage(expected, rendered);
  // Closed by default. The county has well over a hundred rows, and opening it on arrival buries
  // the five other reviewers below a wall the camp did not ask to see.
  const [openAuthority, setOpenAuthority] = useState<string | null>(null);

  if (summaries.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint italic py-6">
        Finish setup and your requirements will appear here, grouped by who reviews them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Shown rather than logged. If the page is not showing everything, the camp is the one
          who needs to know, not us. */}
      {problems.length > 0 && (
        <div className="rounded-card border border-amber/30 bg-amber-bg px-4 py-3">
          <p className="text-[12.5px] text-amber-text inline-flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              {problems.length} requirement{problems.length === 1 ? ' is' : 's are'} not appearing
              under any reviewer, so this page is not showing everything you owe. Send this list
              to support: {problems.map((p) => p.reqCode).join(', ')}.
            </span>
          </p>
        </div>
      )}

      {/* Ahead of the reviewer list, because these questions block form fields across several
          reviewers at once and there is no useful way to file them under one of them. */}
      <DetailsPanel onOpenSetup={onOpenSetup} focus={focus} onOpenForm={onOpenForm} />

      {/* The camper capacity table. Same reason it sits above the reviewer list: it is one
          block of the county's own form, not evidence filed against a requirement. */}
      <SessionsPanel />

      {/* The people the forms name. Same reason again: a director's name on DOH-367 is not
          evidence filed against a requirement, it is the roster the form reads from, and until
          this was here there was nowhere in the product to see or change it. */}
      <RosterPanel />

      {/* Said once at the top, because a camp arriving at a hundred and thirty-six rows under one
          heading has no way to know what they are looking at. */}
      <div className="bg-white rounded-card border border-border px-5 py-4">
        <h3 className="text-[15px] font-semibold text-forest">What goes into the documents you file</h3>
        <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed max-w-[76ch]">
          This page is where the answers live. Everything here feeds a document you are filing,
          every item says which one, and editing it here is what changes what prints. Your staff
          records, your sessions and your camp details are all kept on this page.
        </p>
        <p className="text-[12px] text-ink-faint mt-2 leading-relaxed max-w-[76ch]">
          Only obligations that appear on a document are shown. Your camp is also under rules
          that are not printed on any form, which a reviewer checks on site. Those are held
          separately, with the regulation each one comes from, and are not part of this page.
        </p>
      </div>

      {summaries.map((summary) => (
        <AuthorityBlock
          key={summary.authority.id}
          summary={summary}
          isOpen={openAuthority === summary.authority.id}
          onToggle={() => setOpenAuthority(
            openAuthority === summary.authority.id ? null : summary.authority.id,
          )}
          onGoToTab={onGoToTab}
          onOpenForm={onOpenForm}
        />
      ))}
    </div>
  );
}

function AuthorityBlock({ summary, isOpen, onToggle, onGoToTab, onOpenForm }: {
  summary: AuthoritySummary;
  isOpen: boolean;
  onToggle: () => void;
  onGoToTab: (tab: 'plan' | 'documents') => void;
  onOpenForm?: (formCode: string) => void;
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
          {work.records.length + work.documents.length + work.plan.length
            + work.unanswered.length + work.notApplicable.length === 0 && (
            <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-[74ch]">
              None of this reviewer's rules are printed on the documents currently in scope. What
              they want from you for those documents is the camp details, sessions and staff
              above.
            </p>
          )}

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
                    onOpenForm={onOpenForm}
                    renderAction={key === 'records'
                      ? (r) => <RecordAction requirement={r} />
                      : key === 'plan'
                        ? () => (
                            <Button size="sm" variant="ghost" onClick={() => onGoToTab('plan')}>
                              <FileEdit className="w-3.5 h-3.5" /> Open the plan
                            </Button>
                          )
                        : key === 'documents'
                          ? (r) => {
                              // On a form we produce, the only file that belongs is the copy
                              // the camp filed. Name the button after that, so it cannot be
                              // read as "upload something and this goes green".
                              const form = generatedFormFor(r.formCodes);
                              return (
                                <Button size="sm" variant="ghost" onClick={() => onGoToTab('documents')}>
                                  <Upload className="w-3.5 h-3.5" />
                                  {form ? `Attach your filed ${form}` : 'Upload a file'}
                                </Button>
                              );
                            }
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
