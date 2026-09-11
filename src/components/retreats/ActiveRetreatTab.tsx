import { Bell } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { Retreat, RetreatIssue } from '@/lib/types';
import {
  money, fmtDate, fmtRange, nights, Badge, GROUP_TYPE_LABELS, rateSummary, pricingRate, PhaseTracker, type BadgeTone, billableHeadcount
} from './retreatUi';
import { todayStr, fmtClock } from '@/lib/utils';

function dayOf(r: Retreat): { day: number; total: number } {
  const total = Math.max(1, nights(r.arrivalDate, r.departureDate));
  const today = todayStr();
  const elapsed = nights(r.arrivalDate, today);
  return { day: Math.min(Math.max(1, elapsed + 1), total), total };
}

const ISSUE_STATUS: Record<RetreatIssue['status'], { tone: BadgeTone; label: string; dot: string }> = {
  open: { tone: 'alert', label: 'Open', dot: 'bg-red' },
  in_progress: { tone: 'warn', label: 'In progress', dot: 'bg-amber' },
  resolved: { tone: 'ok', label: 'Resolved', dot: 'bg-sage' },
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 py-1.5 border-b border-cream-dark last:border-b-0 text-[13px]">
      <span className="text-ink-soft flex-shrink-0">{k}</span>
      <span className="font-medium text-forest text-right">{v}</span>
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft mb-3">{children}</p>;
}

export function ActiveRetreatTab() {
  const {
    activeRetreat, selectedRetreat, scheduleFor, housingFor, financialsFor,
    issuesFor, checklistFor, toggleChecklistItem, openModal, phaseProgress, setActiveTab,
  } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const r = activeRetreat() ?? selectedRetreat();

  if (!r) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="max-w-md mx-auto text-center mt-24">
          <p className="text-[15px] font-semibold text-forest">No active retreat</p>
          <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
            Select a retreat from the overview to preview it.
          </p>
        </div>
      </div>
    );
  }

  const { day, total } = dayOf(r);
  const today = todayStr();
  const schedule = scheduleFor(r.id).filter((s) => !s.dayDate || s.dayDate === today);
  const allSchedule = scheduleFor(r.id);
  const housing = housingFor(r.id);
  const issues = issuesFor(r.id);
  const checkout = checklistFor(r.id, 'checkout');

  const subgroups = housing.filter((h) => h.subgroupName).map((h) => `${h.subgroupName} (${h.peopleCount})`).join(' + ');
  const spaces = housing.filter((h) => h.spaceName).map((h) => h.spaceName).join(', ');

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      {/* Dark header */}
      <div className="bg-forest text-white rounded-card px-6 py-5 mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[20px] font-semibold">{r.groupName}</p>
          <p className="text-[12px] text-sage-light mt-1">
            {fmtRange(r.arrivalDate, r.departureDate)} · {r.finalHeadcount ?? r.headcount} people · {GROUP_TYPE_LABELS[r.groupType] ?? r.groupType}
            {spaces ? ` · ${spaces}` : ''}
          </p>
          {/* The hours, when the camp has them. These are what the kitchen and the crew plan
              around, and they used to live only in somebody's head. */}
          {(r.arrivalTime || r.departureTime) && (
            <p className="text-[12px] text-sage-light/90 mt-0.5">
              {r.arrivalTime && `In ${fmtClock(r.arrivalTime)}`}
              {r.arrivalTime && r.departureTime && ' · '}
              {r.departureTime && `Out ${fmtClock(r.departureTime)}`}
            </p>
          )}
          {canManage && (
            <button
              onClick={() => openModal({ kind: 'editRetreat', retreatId: r.id })}
              className="mt-2 text-[11px] font-medium text-sage-light hover:text-white underline underline-offset-2"
            >
              Edit retreat details
            </button>
          )}

        </div>
        <div className="text-right flex-shrink-0">
          {canManage && (
            <button
              onClick={() => openModal({ kind: 'sendReminder', retreatId: r.id })}
              className="mb-2.5 inline-flex items-center gap-1.5 rounded-btn border border-sage-light/40
                         px-3 py-1.5 text-[12px] font-semibold text-sage-light transition-colors
                         hover:border-sage-light hover:bg-white/10 hover:text-white"
            >
              <Bell className="h-3.5 w-3.5" />
              Send reminder
            </button>
          )}
          <p className="text-[28px] font-semibold font-mono text-sage-light leading-none">Day {day}</p>
          <p className="text-[11px] text-white/50 mt-1">
            of {total} · Checkout {fmtDate(r.departureDate)}
            {r.departureTime ? ` by ${fmtClock(r.departureTime)}` : ''}
          </p>
        </div>
      </div>

      {/* Same booking progress the overview shows, repeated here so the state of the group on
          property is readable without going back to the list. */}
      <div className="bg-white rounded-card border border-border px-5 py-4 mb-5">
        <CardLabel>Booking progress</CardLabel>
        <PhaseTracker progress={phaseProgress(r.id)} onOpen={setActiveTab} />
      </div>

      {/* 2×2 active cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Group details */}
        <div className="bg-white rounded-card border border-border px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <CardLabel>Group details</CardLabel>
            {canManage && (
              <button
                onClick={() => openModal({ kind: 'editRetreat', retreatId: r.id })}
                className="text-[12px] font-medium text-ink-soft hover:text-forest -mt-2"
              >
                Edit
              </button>
            )}
          </div>
          <Row k="Coordinator" v={r.coordinatorName ? `${r.coordinatorName}${r.coordinatorPhone ? ` · ${r.coordinatorPhone}` : ''}` : '-'} />
          {/* The estimate booked the retreat; the confirmed number is what the group submits in
              the portal. This row read `headcount` and labelled it "confirmed", so a headcount
              the coordinator had already confirmed never appeared here. */}
          <Row
            k="Total headcount"
            v={r.finalHeadcount != null ? (
              <span>
                <span className="font-semibold text-forest">{r.finalHeadcount} confirmed</span>
                {r.finalHeadcount !== r.headcount && (
                  <span className="text-ink-faint"> · {r.headcount} estimated</span>
                )}
              </span>
            ) : (
              <span>
                {r.headcount} estimated
                <span className="text-ink-faint"> · not yet confirmed by the group</span>
              </span>
            )}
          />
          {r.finalHeadcount != null && (r.finalHeadcountBy || r.finalHeadcountAt) && (
            <Row
              k="Confirmed by"
              v={`${r.finalHeadcountBy ?? 'the group'}${r.finalHeadcountAt ? ` · ${fmtDate(r.finalHeadcountAt.slice(0, 10))}` : ''}`}
            />
          )}
          <Row k="Subgroups" v={subgroups || '-'} />
          {r.coordinatorEmail && <Row k="Email" v={r.coordinatorEmail} />}
        </div>

        {/* Today's schedule */}
        <div className="bg-white rounded-card border border-border px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <CardLabel>Today's schedule</CardLabel>
            {canManage && (
              <button
                onClick={() => openModal({ kind: 'scheduleItem', retreatId: r.id })}
                className="text-[12px] font-medium text-ink-soft hover:text-forest -mt-2"
              >
                + add
              </button>
            )}
          </div>
          {schedule.length === 0 && allSchedule.length === 0 && (
            <p className="text-[12px] text-ink-faint italic py-1">No schedule items yet.</p>
          )}
          {schedule.length === 0 && allSchedule.length > 0 && (
            <p className="text-[12px] text-ink-faint italic py-1">Nothing scheduled for today.</p>
          )}
          {schedule.map((s) => (
            <button
              key={s.id}
              onClick={canManage ? () => openModal({ kind: 'scheduleItem', retreatId: r.id, itemId: s.id }) : undefined}
              className={`w-full flex justify-between items-center gap-3 py-1.5 border-b border-cream-dark last:border-b-0 text-[13px] text-left ${canManage ? 'hover:bg-cream/40 cursor-pointer' : ''}`}
            >
              <span className="text-ink-soft flex-shrink-0">{s.timeLabel || '-'}</span>
              <span className="font-medium text-forest text-right">
                {s.title}{s.location ? ` · ${s.location}` : ''}
              </span>
            </button>
          ))}
        </div>

        {/* Housing summary */}
        <div className="bg-white rounded-card border border-border px-5 py-4">
          <CardLabel>Housing summary</CardLabel>
          {housing.length === 0 && <p className="text-[12px] text-ink-faint italic py-1">No housing assigned yet.</p>}
          {housing.map((h) => (
            <Row
              key={h.id}
              k={h.spaceName || 'Space'}
              v={`${h.subgroupName ? `${h.subgroupName} · ` : ''}${h.peopleCount} people`}
            />
          ))}
        </div>

        {/* Financial, one shared calculation (financialsFor) drives every money figure module-wide. */}
        {(() => {
          const nightCount = nights(r.arrivalDate, r.departureDate);
          const fin = financialsFor(r.id);
          const rate = pricingRate(r);
          const perPerson = r.pricingModel === 'per_person_night';
          return (
            <div className="bg-white rounded-card border border-border px-5 py-4">
              <CardLabel>Financial</CardLabel>
              <Row k="Rate charged" v={rateSummary(r)} />
              {/* The arithmetic only belongs here when it is the arithmetic actually being used.
                  Beside an agreed price it reads as a contradiction. */}
              {perPerson && rate != null && fin.source === 'estimate' && (
                <Row k="Billed" v={<span className="font-mono text-ink-soft">{money(rate)} × {billableHeadcount(r)} × {nightCount} night{nightCount === 1 ? '' : 's'}</span>} />
              )}
              <Row
                k={fin.source === 'estimate' ? 'Estimated total'
                  : fin.source === 'proposal' ? 'Agreed total'
                  : 'Total billed'}
                v={<span className="font-mono text-green-muted-text">{money(fin.expected)}</span>}
              />
              <Row
                k="Deposit received"
                v={(
                  <span className="font-mono text-green-muted-text">
                    {money(fin.depositReceived)}
                    {fin.depositRequired > 0 && (
                      <span className="text-ink-soft"> of {money(fin.depositRequired)}</span>
                    )}
                  </span>
                )}
              />
              <Row k="Balance due" v={<span className="font-mono">{money(fin.outstanding)} at checkout</span>} />
            </div>
          );
        })()}
      </div>

      {/* Open issues */}
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">Open issues during this retreat</h2>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'logIssue', retreatId: r.id })}>+ Log issue</Button>
        )}
      </div>
      <div className="bg-white rounded-card border border-border overflow-hidden mb-6">
        {issues.length === 0 && (
          <p className="text-[12px] text-ink-faint italic px-5 py-4">No issues logged. Nice and quiet.</p>
        )}
        {issues.map((i) => {
          const meta = ISSUE_STATUS[i.status];
          return (
            <div key={i.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-cream-dark last:border-b-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-forest">{i.title}</p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  {i.reportedBy ? `Reported by ${i.reportedBy}` : 'Reported'}
                  {i.assignedTo ? ` · ${i.assignedTo}` : ''}
                  {i.status === 'resolved' && i.resolvedAt ? ` · Resolved` : ''}
                  {i.notes ? ` · ${i.notes}` : ''}
                </p>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'logIssue', retreatId: r.id, issueId: i.id })}>Update</Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Checkout checklist */}
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[14px] font-semibold text-forest">Checkout checklist · {fmtDate(r.departureDate)} by 11am</h2>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'checklist', retreatId: r.id, phase: 'checkout' })}>Manage</Button>
        )}
      </div>
      <div className="bg-white rounded-card border border-border overflow-hidden">
        {checkout.length === 0 && (
          <p className="text-[12px] text-ink-faint italic px-5 py-4">
            No checkout tasks yet.{canManage ? ' Use “Manage” to add them.' : ''}
          </p>
        )}
        {checkout.map((c) => (
          <button
            key={c.id}
            onClick={canManage ? () => toggleChecklistItem(c.id) : undefined}
            disabled={!canManage}
            className="w-full flex items-center gap-3 px-5 py-2.5 border-b border-cream-dark last:border-b-0 text-left disabled:cursor-default"
          >
            <span className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${c.isDone ? 'bg-sage border-sage text-white' : 'bg-white border-border'}`}>
              {c.isDone ? '✓' : ''}
            </span>
            <span className={`text-[13px] ${c.isDone ? 'text-ink-faint line-through' : 'text-forest'}`}>{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
