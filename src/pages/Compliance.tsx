import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw, Settings2, ArrowLeft } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { useChecklistStore } from '@/store/checklistStore';
import { SetupInterview } from '@/components/compliance/SetupInterview';
import { ComplianceOverview } from '@/components/compliance/ComplianceOverview';
import { ReviewersPanel } from '@/components/compliance/ReviewersPanel';
import { RecordsPanel } from '@/components/compliance/RecordsPanel';
import { PlanBuilder } from '@/components/compliance/PlanBuilder';
import { FormsPanel } from '@/components/compliance/FormsPanel';
import { DocumentsPanel } from '@/components/compliance/DocumentsPanel';
import { LogInspectionModal } from '@/components/safety/LogInspectionModal';
import { LogDrillModal } from '@/components/safety/LogDrillModal';
import { LogTempModal } from '@/components/safety/LogTempModal';
import { StaffCertModal } from '@/components/safety/StaffCertModal';
import { AddSafetyItemModal } from '@/components/safety/AddSafetyItemModal';
import { AddStaffModal } from '@/components/safety/AddStaffModal';
import { useUIStore } from '@/store/uiStore';

/**
 * Four tabs, in the order a camp director works:
 *
 *   Overview    where do we stand and what is about to be late
 *   Reviewers   who is going to ask, when, and what official forms they use
 *   Records     everything to do, grouped by who asks for it, with the entry right there
 *   Safety plan the written plan itself, which is most of what a permit packet is
 *   Hand-off    the finished packets, one per party
 *
 * Documents stays off the tab bar, reached from Records and from a form row on Reviewers,
 * because uploading a file is something you arrive at holding a specific document rather than
 * somewhere you browse.
 */
type Tab = 'overview' | 'reviewers' | 'records' | 'export' | 'plan' | 'documents' | 'setup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'reviewers', label: 'Reviewers' },
  { id: 'records',   label: 'Your records' },
  // The written plan is ninety-six sections of writing and the single largest item in the
  // packet. It was reachable only from a card on Overview and a group inside Records, which is
  // not where anyone would look for the biggest job on the page.
  { id: 'plan',      label: 'Safety plan' },
  { id: 'export',    label: 'Hand-off' },
];

export function Compliance() {
  const st = useComplianceStore();
  const { can } = useAuth();
  const season = useChecklistStore((s) => s.season);
  const [tab, setTabRaw] = useState<Tab>('overview');
  const setTab = (next: Tab) => {
    if (next !== 'documents') setUploadTitle(null);
    setTabRaw(next);
  };
  const [refreshing, setRefreshing] = useState(false);
  /** Set when the camp clicked upload against a named form, so Documents opens pre-titled. */
  const [uploadTitle, setUploadTitle] = useState<string | null>(null);

  const enabled = st.enabledProfiles();
  const items = st.actionItems();

  /**
   * The written plan only earns a tab when the checklist it fills is in scope.
   *
   * The plan is not printed on DOH-367; it travels alongside it, and DOH-2040 is the checklist
   * that indexes it. With DOH-2040 switched off, ninety-six sections of writing have no
   * document to land on, and showing them would be asking a camp for work with no destination.
   */
  const activeForms = st.activeFormCodes();
  const planHasADocument = activeForms.has('DOH-2040') || activeForms.has('DOH-2286');
  const planTabVisible = (t: { id: Tab }) => t.id !== 'plan' || planHasADocument;
  const {
    isSafetyLogInspectionModalOpen, isSafetyAddItemModalOpen, isLogDrillModalOpen,
    isLogTempModalOpen, isSafetyAddStaffModalOpen, isStaffCertModalOpen,
  } = useUIStore();

  /**
   * Recompute when a safety dialog closes.
   *
   * Those dialogs write to the safety store, but compliance status is computed in Postgres from
   * that data, so without this a camp logs a drill from this page, watches the requirement stay
   * red, and concludes the feature is broken. Fires on the open-to-closed edge rather than on
   * save, because the dialogs do not report back and a cancel costs one cheap recompute.
   */
  const anySafetyModalOpen =
    isSafetyLogInspectionModalOpen || isSafetyAddItemModalOpen || isLogDrillModalOpen ||
    isLogTempModalOpen || isSafetyAddStaffModalOpen || isStaffCertModalOpen;
  const wasSafetyModalOpen = useRef(false);
  const recompute = useComplianceStore((s) => s.recompute);
  useEffect(() => {
    if (wasSafetyModalOpen.current && !anySafetyModalOpen) void recompute();
    wasSafetyModalOpen.current = anySafetyModalOpen;
  }, [anySafetyModalOpen, recompute]);

  if (!season) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Topbar title="Safety & Compliance" subtitle="Permit, plan and evidence" />
        <div className="flex-1 grid place-items-center px-6">
          <div className="text-center max-w-sm">
            <ShieldCheck className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-forest">Set your season first</p>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">
              Every compliance deadline is measured against your opening date. Add a season under
              Pre/Post Camp and this page will fill itself in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!st.isSetUp() || tab === 'setup') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Topbar title="Safety & Compliance" subtitle="Permit, plan and evidence"
          actions={st.isSetUp() ? <Button size="sm" variant="ghost" onClick={() => setTab('overview')}>Back</Button> : undefined} />
        <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-5">
          <SetupInterview onDone={() => setTab('overview')} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Safety & Compliance"
        subtitle={`${enabled.map((p) => p.name).join(' · ')} · ${season.name}`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={refreshing}
              onClick={async () => { setRefreshing(true); await st.recompute(); setRefreshing(false); }}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Recheck
            </Button>
            {can('manageSafetyItems') && (
              <Button size="sm" variant="ghost" onClick={() => setTab('setup')}>
                <Settings2 className="w-3.5 h-3.5" /> Setup
              </Button>
            )}
          </div>
        }
      />

      <div className="bg-paper-raised border-b border-border px-4 sm:px-7 flex-shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex">
          {TABS.filter((t) => t.id !== 'setup').filter(planTabVisible).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-4 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${
                tab === t.id ? 'border-red text-forest' : 'border-transparent text-ink-soft hover:text-forest'}`}>
              {t.label}
              {t.id === 'overview' && items.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber text-white text-[10px] font-bold">
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-5">
        {tab === 'overview'  && <ComplianceOverview onGoToTab={setTab} />}
        {tab === 'reviewers' && (
          <ReviewersPanel onUpload={(t) => { setUploadTitle(t); setTab('documents'); }} />
        )}
        {tab === 'records'   && <RecordsPanel onGoToTab={setTab} />}
        {tab === 'export'    && <FormsPanel onGoToTab={setTab} />}

        {/* Reached from Records, not the tab bar. Each is one job, not a place to browse. */}
        {tab === 'plan' && planHasADocument && <PlanBuilder />}
        {tab === 'documents' && (
          <>
            <BackToRecords onBack={() => setTab(uploadTitle ? 'reviewers' : 'records')}
                           label={uploadTitle ? 'Back to reviewers' : 'Back to your records'} />
            <DocumentsPanel prefillTitle={uploadTitle ?? undefined} />
          </>
        )}
      </div>

      {/* The safety module's own dialogs. Recording a drill from Records must write exactly what
          recording it from the safety register writes, so this reuses them rather than
          reimplementing the forms. */}
      {isSafetyLogInspectionModalOpen && <LogInspectionModal />}
      {isSafetyAddItemModalOpen && <AddSafetyItemModal />}
      {isLogDrillModalOpen && <LogDrillModal />}
      {isLogTempModalOpen && <LogTempModal />}
      {isSafetyAddStaffModalOpen && <AddStaffModal />}
      {isStaffCertModalOpen && <StaffCertModal />}
    </div>
  );
}

function BackToRecords({ onBack, label = 'Back to your records' }: {
  onBack: () => void; label?: string;
}) {
  return (
    <button onClick={onBack}
      className="text-[12.5px] text-sage hover:text-forest inline-flex items-center gap-1.5 mb-4">
      <ArrowLeft className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
