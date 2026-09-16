import { useEffect, useState } from 'react';
import { Copy, Check, Mail, MessageSquareText } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/lib/auth';
import type { FoodProgram, FoodRequest, FoodRequestLine, FoodRequestMessage } from '@/lib/foodRequestTypes';
import {
  FOOD_STATUS_LABELS, canTransition, formatClock, formatLineQty, formatNotice, formatPickup, isPastDue, lineChangeSummary,
} from '@/lib/foodRequests';
import { loadFoodRequestMessages } from '@/lib/foodRequestsDb';
import { FoodStatusChip, LateChip, ProgramDot, foodStatusUrl } from './foodUi';
import { useFoodRequestActions } from './useFoodRequestActions';

const RULE_LABELS: Record<string, string> = {
  request_received: 'Request received',
  new_request: 'New request alert',
  request_decided: 'Decision',
  pickup_reminder: 'Pickup reminder',
  ready_now: 'Ready to pick up',
  missed_pickup: 'Not picked up',
  request_cancelled: 'Cancelled',
};

/**
 * Everything about one request, and what it has told people.
 *
 * The messages section is the outbox rows for this request: the subject and the text-message
 * copy each person gets, and when. It is there so the camp (and anyone watching a demo) can see
 * exactly what a counselor receives, rather than trusting that "they'll get a reminder".
 */
export function RequestDetailModal({ request, lines, program, onClose, onDecide }: {
  request: FoodRequest;
  lines: FoodRequestLine[];
  program: FoodProgram | undefined;
  onClose: () => void;
  onDecide: (mode: 'approve' | 'decline') => void;
}) {
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const actions = useFoodRequestActions();
  const [messages, setMessages] = useState<FoodRequestMessage[] | null>(null);
  const [copied, setCopied] = useState(false);
  const busy = actions.busyId === request.id;

  // Reloaded whenever the request changes: every transition queues or cancels something.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      loadFoodRequestMessages(request.id).then((m) => { if (live) setMessages(m); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [request.id, request.status, request.updatedAt]);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pastDue = isPastDue(request, new Date(), timeZone);

  async function copyStatusLink() {
    try {
      await navigator.clipboard.writeText(foodStatusUrl(request.statusToken));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  const stamps: [string, string | null, string | null][] = [
    ['Sent', request.createdAt, request.source === 'link' ? 'from the program link' : 'in the app'],
    [request.status === 'declined' ? 'Declined' : 'Approved', request.decidedAt, request.decidedByName],
    ['Ready', request.readyAt, null],
    ['Picked up', request.pickedUpAt, request.pickedUpByName],
    ['Marked missed', request.missedAt, null],
    ['Cancelled', request.cancelledAt, request.cancelledBy === 'kitchen' ? 'by the kitchen' : request.cancelledBy ? 'by the requester' : null],
  ];

  return (
    <Modal
      title={program?.name ?? request.requesterName}
      onClose={onClose}
      width="min(680px, calc(100vw - 24px))"
      footer={canManage ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canTransition(request.status, 'cancelled') && (
            <Button variant="ghost" size="sm" disabled={busy} className="mr-auto text-red-text"
              onClick={async () => { if (confirm('Cancel this request? The requester can see it was cancelled.')) await actions.cancel(request); }}>
              Cancel request
            </Button>
          )}
          {request.status === 'submitted' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onDecide('decline')}>Decline</Button>
              <Button variant="ghost" size="sm" onClick={() => onDecide('approve')}>Edit &amp; approve</Button>
              <Button size="sm" disabled={busy} onClick={() => actions.decide(request, 'approve', [], null)}>Approve</Button>
            </>
          )}
          {canTransition(request.status, 'missed') && pastDue && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => actions.missed(request)}>Missed</Button>
          )}
          {request.status === 'approved' && <Button size="sm" disabled={busy} onClick={() => actions.ready(request)}>Mark ready</Button>}
          {request.status === 'ready' && <Button size="sm" disabled={busy} onClick={() => actions.pickedUp(request)}>Picked up</Button>}
        </div>
      ) : undefined}
    >
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ProgramDot color={program?.color ?? null} />
            <span className="text-[14px] font-semibold text-forest">{FOOD_STATUS_LABELS[request.status]}</span>
            <FoodStatusChip status={request.status} />
            {request.isLate && <LateChip hours={request.noticeHours} />}
          </div>
          <p className="mt-1.5 text-[15px] font-semibold text-ink">{formatPickup(request.pickupDate, request.pickupTime)}</p>
          <p className="text-[12.5px] text-ink-soft">
            {formatNotice(request.noticeHours)} notice when sent (cutoff {Math.round(request.cutoffHours)}h)
            {request.headcount ? ` · ${request.headcount} people` : ''}{request.purpose ? ` · ${request.purpose}` : ''}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            {request.requesterName}
            {request.requesterEmail ? ` · ${request.requesterEmail}` : ''}
            {request.requesterPhone ? ` · ${request.requesterPhone}` : ''}
            {request.notifyBy === 'text' ? ' · prefers text' : ''}
          </p>
          <button type="button" onClick={copyStatusLink} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-forest underline underline-offset-2">
            {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy their status page link</>}
          </button>
        </div>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">Lines</h3>
          <div className="overflow-hidden rounded-card border border-border">
            {lines.map((l) => {
              const change = lineChangeSummary(l);
              return (
                <div key={l.id} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className={`text-[13px] ${l.lineState === 'unavailable' ? 'text-ink-faint' : 'text-forest'}`}>{l.label}</p>
                    <p className="text-[11.5px] text-ink-soft">
                      {l.itemId ? 'On the inventory list' : 'Own words — not linked to an item'}{l.note ? ` · “${l.note}”` : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="font-mono text-[12.5px] text-ink">
                      {l.lineState === 'unavailable' ? 'not available' : formatLineQty(l.qtyApproved ?? l.qtyRequested, l.qtyApproved != null ? l.approvedUnitLabel : l.unitLabel)}
                    </p>
                    {change && l.lineState === 'changed' && <p className="text-[11px] text-amber-text">{change}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          {request.kitchenNote && <p className="mt-2 text-[12.5px] text-ink">Kitchen note: <em>{request.kitchenNote}</em></p>}
        </section>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">History</h3>
          <ul className="space-y-0.5 text-[12.5px]">
            {stamps.filter(([, at]) => at).map(([label, at, by]) => (
              <li key={label} className="flex flex-wrap gap-x-2 text-ink">
                <span className="w-24 flex-shrink-0 font-semibold text-forest">{label}</span>
                <span className="text-ink-soft">{new Date(at!).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{by ? ` · ${by}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>

        <section data-testid="food-messages">
          <h3 className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">What people are told</h3>
          <p className="mb-2 text-[11.5px] text-ink-soft">
            Emails send from the outbox every 15 minutes between 8am and 8pm camp time. The text preview is what a text message would say.
          </p>
          {messages == null ? (
            <p className="text-[12px] text-ink-faint">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-[12px] text-ink-faint">Nothing queued for this request.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => <MessageRow key={m.id} m={m} />)}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function MessageRow({ m }: { m: FoodRequestMessage }) {
  const rule = RULE_LABELS[m.ruleKey.split(':')[0]] ?? m.ruleKey;
  const when = new Date(m.sendAfter);
  const whenLabel = `${when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${formatClock(`${when.getHours()}:${when.getMinutes()}`)}`;
  const stateLabel = m.state === 'cancelled'
    ? (m.suppressedReason === 'demo_address' ? 'Not sent · demo address' : `Cancelled${m.suppressedReason ? ` · ${m.suppressedReason.replace(/_/g, ' ')}` : ''}`)
    : m.state === 'sent' ? 'Sent' : m.state === 'scheduled' ? 'Scheduled' : m.state;
  return (
    <li data-testid="food-message" data-rule={m.ruleKey} className={`rounded-card border border-border px-3 py-2 ${m.state === 'cancelled' ? 'bg-cream-dark/40' : 'bg-white'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
        <span className="font-semibold text-forest">{rule}</span>
        <span className="text-ink-soft">→ {m.recipientKind === 'kitchen' ? 'Kitchen' : 'Requester'} · {m.toEmail}</span>
        <span className="flex-1" />
        <span className={`${m.state === 'cancelled' ? 'text-ink-faint' : 'text-ink-soft'}`}>{stateLabel} · {whenLabel}</span>
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-ink"><Mail className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-faint" />{m.subject}</p>
      {m.bodyText && (
        <p className="mt-1 flex items-start gap-1.5 rounded-[10px] bg-cream px-2.5 py-1.5 text-[12.5px] leading-snug text-ink" data-testid="text-preview">
          <MessageSquareText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sage" />
          <span className="min-w-0 break-words">{m.bodyText}</span>
        </p>
      )}
    </li>
  );
}
