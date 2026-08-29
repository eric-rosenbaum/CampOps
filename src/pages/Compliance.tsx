import { useState } from 'react';
import { ShieldCheck, RefreshCw, Settings2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useComplianceStore } from '@/store/complianceStore';
import { useAuth } from '@/lib/auth';
import { useChecklistStore } from '@/store/checklistStore';
import { SetupInterview } from '@/components/compliance/SetupInterview';
import { RequirementList } from '@/components/compliance/RequirementList';
import { ScopeNote } from '@/components/compliance/ScopeNote';
import { PlanBuilder } from '@/components/compliance/PlanBuilder';
import { FormsPanel } from '@/components/compliance/FormsPanel';
import { DocumentsPanel } from '@/components/compliance/DocumentsPanel';

type Tab = 'overview' | 'plan' | 'documents' | 'forms' | 'setup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'Requirements' },
  { id: 'plan',      label: 'Safety plan' },
  { id: 'documents', label: 'Documents' },
  { id: 'forms',     label: 'Forms & packet' },
  { id: 'setup',     label: 'Setup' },
];

export function Compliance() {
  const st = useComplianceStore();
  const { can } = useAuth();
  const season = useChecklistStore((s) => s.season);
  const [tab, setTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const enabled = st.enabledProfiles();
  const overall = st.overallPercent();
  const items = st.actionItems();

  if (!season) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Topbar title="Compliance" subtitle="Permit, plan and evidence" />
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
        <Topbar title="Compliance" subtitle="Permit, plan and evidence"
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
        title="Compliance"
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
          {TABS.filter((t) => t.id !== 'setup').map((t) => (
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
        {tab === 'overview' && (
          <>
            {/* One number, and immediately what it is out of. A percentage with no denominator
                is the kind of reassurance that gets a camp in trouble. */}
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {enabled.map((p) => {
                  const sum = st.packageSummary(p.id);
                  if (!sum) return null;
                  return (
                    <div key={p.id} className="bg-white rounded-card border border-border px-4 py-3.5">
                      <p className="text-[13px] font-semibold text-forest">{p.name}</p>
                      <p className="text-[11.5px] text-ink-soft mt-0.5">{p.description}</p>
                      <div className="flex items-center gap-2.5 mt-3">
                        <div className="h-1.5 flex-1 rounded-full bg-cream-dark overflow-hidden">
                          <div className="h-full bg-sage rounded-full" style={{ width: `${sum.percent}%` }} />
                        </div>
                        <span className="font-mono text-[12px] text-ink-soft">{sum.percent}%</span>
                      </div>
                      <p className="text-[11px] text-ink-faint mt-1.5">
                        {sum.satisfied} met · {sum.missing} not met · {sum.partial + sum.expiring} in progress
                        {sum.needsAnswer > 0 && ` · ${sum.needsAnswer} need an answer`}
                        {sum.notApplicable > 0 && ` · ${sum.notApplicable} N/A`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {items.length > 0 && (
              <>
                <h3 className="text-[14px] font-semibold text-forest mb-2.5">Needs attention</h3>
                <div className="mb-6">
                  <RequirementList requirements={items.map((i) => i.requirement)} />
                </div>
              </>
            )}

            {enabled.map((p) => (
              <div key={p.id} className="mb-6">
                <h3 className="text-[14px] font-semibold text-forest mb-2.5">{p.name}</h3>
                <RequirementList requirements={st.requirementsForProfile(p.id).filter((r) => {
                  const s = st.statusFor(r.id);
                  return !!s;   // only what actually applies to this camp
                })} />
              </div>
            ))}

            <ScopeNote />
          </>
        )}

        {tab === 'plan' && <PlanBuilder />}
        {tab === 'documents' && <DocumentsPanel />}
        {tab === 'forms' && <FormsPanel />}
      </div>
    </div>
  );
}
