import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { Retreat } from '@/lib/types';
import {
  money, fmtRange, fmtDate, nights, daysUntil,
  StatusBadge, Badge, PhaseTracker, statusAccent,
  GROUP_TYPE_LABELS, type BadgeTone, billableHeadcount
} from './retreatUi';
import { todayStr } from '@/lib/utils';

const ACTIVEISH: Retreat['status'][] = ['confirmed', 'ready', 'active'];
const PIPELINE: { key: Retreat['status']; label: string }[] = [
  { key: 'inquiry', label: 'Inquiry' },
  { key: 'confirmed', label: 'Confirmed · setup' },
  { key: 'ready', label: 'Ready to go' },
  { key: 'active', label: 'Active now' },
];

interface DerivedState {
  contractOk: boolean;
  coiOk: boolean;
  housingLocked: boolean;
  note: string;
  noteTone: 'green' | 'amber' | 'red' | 'muted';
}

export function OverviewTab() {
  const {
    retreats, retreatsByStatus, docsFor, housingFor, financialsFor,
    phaseProgress, enterRetreat, openModal,
  } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const byStatus = retreatsByStatus();

  function derive(r: Retreat): DerivedState {
    const docs = docsFor(r.id);
    const contractOk = docs.some((d) => d.docType === 'agreement' && ['signed', 'approved'].includes(d.status));
    const coiOk = docs.some((d) => d.docType === 'coi' && ['received', 'signed', 'approved'].includes(d.status));
    const housing = housingFor(r.id);
    const housingLocked = housing.length > 0 && housing.every((h) => h.locked);

    let note = 'All docs complete';
    let noteTone: DerivedState['noteTone'] = 'green';
    if (r.status === 'active') {
      const total = nights(r.arrivalDate, r.departureDate);
      const day = dayOf(r);
      note = `On property · Day ${day} of ${total}`;
      noteTone = 'green';
    } else if (!contractOk) {
      note = 'Awaiting contract';
      noteTone = 'muted';
    } else if (!coiOk) {
      note = 'COI missing';
      noteTone = 'red';
    } else if (!housingLocked) {
      note = 'Housing pending';
      noteTone = 'amber';
    }
    return { contractOk, coiOk, housingLocked, note, noteTone };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  const activeNow = byStatus.active.length;
  const upcoming = byStatus.confirmed.length + byStatus.ready.length;

  const docsPending = retreats.filter((r) => {
    if (!ACTIVEISH.includes(r.status)) return false;
    const d = derive(r);
    return !d.contractOk || !d.coiOk;
  }).length;

  // Expected total revenue = actual charges where billed, else an estimate. We break it into
  // money actually received (deposits + payments) and the estimated remainder still to come,
  // since the final take from a retreat often isn't known until after the stay.
  const nonCancelled = retreats.filter((r) => r.status !== 'cancelled');
  const revenueReceived = nonCancelled.reduce((sum, r) => sum + financialsFor(r.id).collected, 0);
  const expectedRevenue = nonCancelled.reduce((sum, r) => sum + financialsFor(r.id).expected, 0);
  const revenueEstimated = Math.max(0, expectedRevenue - revenueReceived);
  const seasonRevenue = revenueReceived + revenueEstimated;

  // ─── Banners ──────────────────────────────────────────────────────────────
  const coiOverdue = retreats.filter((r) => ACTIVEISH.includes(r.status) && !derive(r).coiOk);
  const housingOpen = retreats.filter(
    (r) => (r.status === 'confirmed' || r.status === 'ready') && derive(r).coiOk && !derive(r).housingLocked,
  );

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (retreats.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="max-w-md mx-auto text-center mt-24">
          <p className="text-[15px] font-semibold text-forest">No retreats yet</p>
          <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
            Track external group rentals from first inquiry through checkout · contracts, COIs,
            housing, menus, and billing all in one place.
          </p>
          {canManage && (
            <div className="mt-5">
              <Button onClick={() => openModal({ kind: 'newRetreat' })}>+ New retreat</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const seasonList = [...retreats]
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));

  // Whoever is on property comes first, then whoever arrives soonest. Groups that have
  // already left stay reachable but sink to the end.
  const today = todayStr();
  const pickList = [...seasonList].sort((a, b) => {
    const rank = (r: Retreat) =>
      r.status === 'active' ? 0 : r.departureDate >= today ? 1 : 2;
    return rank(a) - rank(b) || a.arrivalDate.localeCompare(b.arrivalDate);
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Way in. Everything below this is the season at a glance; the rest of the module
          only opens once a group has been chosen, so that choice leads the page. */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <h2 className="text-[14px] font-semibold text-forest">Open a retreat</h2>
          <p className="text-[11.5px] text-ink-soft">
            Housing, documents, menus and the guest portal all live inside a retreat
          </p>
        </div>
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {pickList.map((r) => {
            const away = daysUntil(r.arrivalDate);
            const gone = r.departureDate < today;
            return (
              <button
                key={r.id}
                onClick={() => enterRetreat(r.id)}
                className={`group flex-shrink-0 w-[230px] text-left rounded-card border px-4 py-3 transition-all hover:shadow-sm ${
                  r.status === 'active'
                    ? 'border-sage bg-sage-pale hover:border-sage'
                    : 'border-border bg-white hover:border-sage'
                } ${gone ? 'opacity-75' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-forest truncate">{r.groupName}</p>
                  <ChevronRight className="w-4 h-4 flex-shrink-0 text-ink-faint group-hover:text-forest transition-colors" />
                </div>
                <p className="text-[11px] text-ink-soft font-mono mt-1">{fmtRange(r.arrivalDate, r.departureDate)}</p>
                <p className="text-[11px] mt-1.5">
                  {r.status === 'active'
                    ? <span className="text-green-muted-text font-semibold">On property now</span>
                    : gone
                      ? <span className="text-ink-faint">Departed</span>
                      : away != null && away >= 0
                        ? <span className="text-ink-soft">{away === 0 ? 'Arrives today' : `${away} day${away === 1 ? '' : 's'} away`}</span>
                        : <span className="text-ink-soft">{billableHeadcount(r)} guests</span>}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <StatCard label="Active now" value={activeNow} hint={activeNow ? 'On property' : 'None on property'} />
        <StatCard label="Upcoming" value={upcoming} hint="Confirmed this season" />
        <StatCard label="Docs pending" value={docsPending} variant={docsPending ? 'amber' : 'default'} hint="COI / contract outstanding" />
        <StatCard label="Season revenue" value={money(seasonRevenue)} variant={seasonRevenue > 0 ? 'green' : 'default'} hint={`${money(revenueReceived)} received + ${money(revenueEstimated)} estimated`} />
      </div>

      {/* Banners */}
      {coiOverdue.map((r) => (
        <AlertBanner
          key={`coi-${r.id}`}
          variant="alert"
          message={`${r.groupName} (${fmtRange(r.arrivalDate, r.departureDate)}) has not uploaded a certificate of insurance. COI is required before arrival${r.coordinatorName ? `, contact ${r.coordinatorName}` : ''}.`}
          action={canManage ? { label: 'Send reminder', onClick: () => openModal({ kind: 'sendReminder', retreatId: r.id, reminderType: 'coi' }) } : undefined}
        />
      ))}
      {housingOpen.map((r) => (
        <AlertBanner
          key={`housing-${r.id}`}
          variant="warn"
          message={`${r.groupName} (${fmtRange(r.arrivalDate, r.departureDate)}) housing submission is open. The group has not finalized their housing preferences${r.housingDeadline ? `. Closes ${fmtDate(r.housingDeadline)}` : ''}.`}
          action={canManage ? { label: 'Send reminder', onClick: () => openModal({ kind: 'sendReminder', retreatId: r.id, reminderType: 'housing' }) } : undefined}
        />
      ))}

      {/* Pipeline */}
      <div className="flex items-center justify-between mt-1 mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">Retreat pipeline</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-7">
        {PIPELINE.map((col) => {
          const items = byStatus[col.key];
          return (
            <div key={col.key} className="bg-cream-dark rounded-card p-3.5">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-2.5">{col.label}</p>
              {items.length === 0 && <p className="text-[12px] text-ink-faint italic">None</p>}
              {items.map((r) => {
                const d = derive(r);
                return (
                  <button
                    key={r.id}
                    onClick={() => enterRetreat(r.id)}
                    className={`group w-full text-left bg-white border rounded-btn px-3.5 py-3 mb-2 last:mb-0 hover:border-sage hover:shadow-sm transition-all ${r.status === 'active' ? 'border-sage bg-sage-pale' : 'border-border'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-forest">{r.groupName}</p>
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-ink-faint group-hover:text-forest transition-colors" />
                    </div>
                    <p className="text-[11px] text-ink-soft font-mono mt-0.5">{fmtRange(r.arrivalDate, r.departureDate)} · {billableHeadcount(r)} people</p>
                    <p className={`text-[11px] mt-1 ${NOTE_TEXT[d.noteTone]}`}>{d.note}</p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* All retreats this season */}
      <div className="flex items-center justify-between mt-1 mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">All retreats this season</h2>
      </div>
      <div className="flex flex-col gap-3">
        {seasonList.map((r) => {
          const d = derive(r);
          const away = daysUntil(r.arrivalDate);
          const secondary = deriveBadge(r, d);
          return (
            <div
              key={r.id}
              className={`bg-white rounded-card border border-border border-l-[3px] ${statusAccent(r.status)} px-5 py-4`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-forest">{r.groupName}</p>
                  <p className="text-[11px] text-ink-soft mt-0.5">
                    {GROUP_TYPE_LABELS[r.groupType] ?? r.groupType} · {fmtRange(r.arrivalDate, r.departureDate)} · {billableHeadcount(r)} people · {nights(r.arrivalDate, r.departureDate)} nights
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[12px] font-mono text-ink-soft">{fmtRange(r.arrivalDate, r.departureDate)}</p>
                  <div className="flex gap-1.5 flex-wrap justify-end mt-1.5">
                    <StatusBadge status={r.status} />
                    {r.status !== 'active' && r.status !== 'complete' && away != null && away >= 0 && (
                      <Badge tone="blue">{away} day{away === 1 ? '' : 's'} away</Badge>
                    )}
                    {secondary && <Badge tone={secondary.tone}>{secondary.label}</Badge>}
                  </div>
                </div>
              </div>

              <PhaseTracker
                progress={phaseProgress(r.id)}
                className="pt-3 mt-3 border-t border-cream-dark"
                onOpen={(tab) => enterRetreat(r.id, tab)}
              />

              <div className="flex gap-2 mt-3.5 flex-wrap">
                {/* One way in. The deep links below still enter the retreat first, so the tab
                    bar and the group name always agree about where you are. */}
                <Button size="sm" onClick={() => enterRetreat(r.id)}>Open retreat</Button>
                <Button size="sm" variant="ghost" onClick={() => enterRetreat(r.id, 'housing')}>Housing</Button>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'editRetreat', retreatId: r.id })}>Edit details</Button>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'sendReminder', retreatId: r.id })}>Send reminder</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Availability */}
      <div className="flex items-center justify-between mt-7 mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">Availability</h2>
      </div>
      <AvailabilityCalendar retreats={seasonList} />
    </div>
  );
}

const NOTE_TEXT: Record<DerivedState['noteTone'], string> = {
  green: 'text-green-muted-text',
  amber: 'text-amber-text',
  red: 'text-red',
  muted: 'text-ink-soft',
};

function deriveBadge(r: Retreat, d: DerivedState): { tone: BadgeTone; label: string } | null {
  if (r.status === 'active') return { tone: 'ok', label: 'On property' };
  if (r.status === 'complete') return { tone: 'neutral', label: 'Complete' };
  if (!d.contractOk) return { tone: 'neutral', label: 'Contract pending' };
  if (!d.coiOk) return { tone: 'alert', label: 'COI missing' };
  if (!d.housingLocked) return { tone: 'warn', label: 'Housing pending' };
  return { tone: 'ok', label: 'Ready to go' };
}

function dayOf(r: Retreat): number {
  const total = nights(r.arrivalDate, r.departureDate);
  const today = todayStr();
  const elapsed = nights(r.arrivalDate, today);
  return Math.min(Math.max(1, elapsed + 1), Math.max(1, total));
}
