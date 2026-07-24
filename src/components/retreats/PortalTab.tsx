import { useState } from 'react';
import { Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { FilterPill } from '@/components/shared/FilterPill';
import { Badge } from './retreatUi';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { Retreat } from '@/lib/types';
import { fmtDateFull } from './retreatUi';

const today = () => new Date().toISOString().slice(0, 10);

export function PortalTab() {
  const {
    retreats, selectedRetreat, setActiveRetreat, docsFor, housingFor, mealsFor,
    requestsFor, updateRetreat, portalUrl, regeneratePortalToken,
  } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const retreat = selectedRetreat();

  if (retreats.length === 0 || !retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="max-w-md mx-auto text-center mt-24">
          <p className="text-[15px] font-semibold text-forest">No retreats yet</p>
          <p className="text-[13px] text-forest/55 mt-2 leading-relaxed">
            Each retreat gets a private guest portal link once it's created.
          </p>
        </div>
      </div>
    );
  }

  const url = portalUrl(retreat);
  const docs = docsFor(retreat.id);
  const housing = housingFor(retreat.id);
  const meals = mealsFor(retreat.id);
  const requests = requestsFor(retreat.id);

  const contractOk = docs.some((d) => d.docType === 'agreement' && ['signed', 'approved'].includes(d.status));
  const coiOk = docs.some((d) => d.docType === 'coi' && ['received', 'signed', 'approved'].includes(d.status));
  const housingLocked = housing.length > 0 && housing.every((h) => h.locked);
  const feedbackOpen = retreat.feedbackOpens != null && retreat.feedbackOpens <= today();

  function copyLink() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  async function regenerateLink() {
    if (!canManage || regenerating || !retreat) return;
    const ok = window.confirm(
      'Generate a new portal link? The current link will stop working immediately — anyone who already has it will lose access, and you’ll need to share the new link with the group.',
    );
    if (!ok) return;
    setRegenerating(true);
    await regeneratePortalToken(retreat.id);
    setRegenerating(false);
  }

  const steps: { num: number; name: string; status: string; unlocked: boolean }[] = [
    { num: 1, name: 'Retreat info', status: 'Visible to group', unlocked: true },
    {
      num: 2, name: 'Documents',
      status: contractOk && coiOk ? '✓ Contract signed · COI approved' : contractOk ? 'Contract signed · COI pending' : 'Awaiting documents',
      unlocked: contractOk,
    },
    {
      num: 3, name: 'Housing',
      status: housingLocked ? '✓ Finalized' : housing.length > 0 ? 'Submitted · not yet locked' : 'Not submitted',
      unlocked: housing.length > 0,
    },
    {
      num: 4, name: 'Menu & dining',
      status: retreat.menuPublished ? `✓ Published${requests.length ? ` · ${requests.length} request${requests.length === 1 ? '' : 's'}` : ''}` : 'Not published',
      unlocked: retreat.menuPublished && meals.length > 0,
    },
    {
      num: 5, name: 'Feedback',
      status: feedbackOpen ? '✓ Survey open' : retreat.feedbackOpens ? `Opens ${fmtDateFull(retreat.feedbackOpens)}` : 'Opens at checkout',
      unlocked: feedbackOpen,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {/* Pill bar */}
      <div className="flex gap-2 flex-wrap mb-4">
        {retreats.map((r) => (
          <FilterPill key={r.id} label={pillLabel(r)} active={r.id === retreat.id} onClick={() => setActiveRetreat(r.id)} />
        ))}
      </div>

      {/* Portal preview (dark) */}
      <div className="bg-forest rounded-card px-6 py-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-white">Guest portal — {retreat.groupName}</p>
            <p className="text-[11px] font-mono text-sage-light mt-1 break-all">{url}</p>
            <p className="text-[11px] text-white/50 mt-2 leading-relaxed max-w-md">
              Anyone with this link can open the portal — there's no password. Share it only with the group's coordinator.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-[12px] font-medium bg-sage text-white hover:bg-sage-light transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={() => window.open(url, '_blank')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-[12px] font-medium bg-transparent text-white border border-white/30 hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Preview portal
            </button>
            {canManage && (
              <button
                onClick={regenerateLink}
                disabled={regenerating}
                title="Issue a new link and disable the current one"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-[12px] font-medium bg-transparent text-white/80 border border-white/30 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} /> {regenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {steps.map((s) => (
            <div
              key={s.num}
              className={`rounded-btn px-3.5 py-3 border ${s.unlocked ? 'bg-sage/20 border-sage/40' : 'bg-white/[0.04] border-white/10 opacity-60'}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-sage-light mb-1">Step {s.num}</p>
              <p className="text-[12px] font-semibold text-white">{s.name}</p>
              <p className={`text-[10px] mt-1 ${s.unlocked ? 'text-sage-light' : 'text-white/40'}`}>{s.status}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Portal settings */}
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">Portal settings</h2>
      </div>
      <div className="bg-white rounded-card border border-border overflow-hidden mb-6">
        <SettingRow
          title="Housing submission deadline"
          desc="After this date the group cannot submit housing — ops must contact them directly"
          right={<span className="font-mono text-[13px] font-semibold text-forest/70">{deadlineLabel(retreat.housingDeadline)}</span>}
        />
        <SettingRow
          title="Headcount change cutoff"
          desc="After this date headcount is locked — no further changes"
          right={<span className="font-mono text-[13px] font-semibold text-forest/70">{deadlineLabel(retreat.headcountCutoff)}</span>}
        />
        <SettingRow
          title="Menu visible to group"
          desc="Group can see and request changes to the published menu"
          right={
            <ToggleBadge
              on={retreat.menuPublished}
              onLabel="Published"
              offLabel="Hidden"
              disabled={!canManage}
              onToggle={() => updateRetreat({ ...retreat, menuPublished: !retreat.menuPublished, updatedAt: new Date().toISOString() })}
            />
          }
        />
        <SettingRow
          title="Change requests enabled"
          desc="Group can submit housing and menu change requests (camp approves all changes)"
          right={
            <ToggleBadge
              on={retreat.changeRequestsEnabled}
              onLabel="Enabled"
              offLabel="Disabled"
              disabled={!canManage}
              onToggle={() => updateRetreat({ ...retreat, changeRequestsEnabled: !retreat.changeRequestsEnabled, updatedAt: new Date().toISOString() })}
            />
          }
        />
        <SettingRow
          last
          title="Feedback survey"
          desc="Automatically sent to the group coordinator at checkout"
          right={
            <Badge tone={feedbackOpen ? 'ok' : 'neutral'}>
              {feedbackOpen ? 'Open' : retreat.feedbackOpens ? `Opens ${fmtDateFull(retreat.feedbackOpens)}` : 'At checkout'}
            </Badge>
          }
        />
      </div>

      {/* What the group can / cannot see */}
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">What the group currently sees in their portal</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-6">
        <div className="bg-green-muted-bg border border-sage/40 rounded-card px-4 py-4">
          <p className="text-[12px] font-semibold text-green-muted-text uppercase tracking-wide mb-2.5">Group can see and interact with</p>
          <ul className="text-[13px] text-green-muted-text leading-[1.9]">
            {[
              'Retreat information and schedule',
              'Signed contract (read only)',
              coiOk ? 'COI status (approved)' : 'COI status',
              housingLocked ? 'Finalized housing assignments (read only)' : 'Housing preferences submission',
              retreat.menuPublished ? 'Published menu (read only)' : 'Menu (when published)',
              retreat.changeRequestsEnabled ? 'Submit change requests' : 'View submitted requests',
              'View status of submitted requests',
              'Payment status and balance due',
            ].map((t) => <li key={t}>✓ {t}</li>)}
          </ul>
        </div>
        <div className="bg-red-bg border border-red/25 rounded-card px-4 py-4">
          <p className="text-[12px] font-semibold text-red uppercase tracking-wide mb-2.5">Group cannot access or edit</p>
          <ul className="text-[13px] text-red-text leading-[1.9]">
            {[
              'Edit housing directly (locked — request only)',
              'Edit menu directly (request only)',
              'Change headcount (once cutoff passes)',
              "View other groups' information",
              'Access ops system or internal notes',
              'See cost breakdown or margin data',
              'Modify contract or COI once approved',
            ].map((t) => <li key={t}>✗ {t}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ title, desc, right, last }: { title: string; desc: string; right: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3.5 ${last ? '' : 'border-b border-cream-dark'}`}>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-forest">{title}</p>
        <p className="text-[11px] text-forest/50 mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  );
}

function ToggleBadge({ on, onLabel, offLabel, disabled, onToggle }: {
  on: boolean; onLabel: string; offLabel: string; disabled: boolean; onToggle: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex items-center px-2.5 py-1 rounded-tag text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        on ? 'bg-green-muted-bg text-green-muted-text' : 'bg-cream-dark text-forest/60'
      } ${disabled ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

function pillLabel(r: Retreat): string {
  const first = r.groupName.split(' ').slice(0, 2).join(' ');
  return r.status === 'active' ? `${first} (active)` : first;
}

function deadlineLabel(d: string | null): string {
  if (!d) return 'Not set';
  const passed = d < today();
  return `${fmtDateFull(d)}${passed ? ' (passed)' : ''}`;
}
