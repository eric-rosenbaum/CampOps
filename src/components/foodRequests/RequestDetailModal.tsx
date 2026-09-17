import { useEffect, useState } from 'react';
import { Copy, Check, Mail, MessageSquareText } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/lib/auth';
import { useCommissaryStore } from '@/store/commissaryStore';
import type { FoodProgram, FoodRequest, FoodRequestLine, FoodRequestMessage } from '@/lib/foodRequestTypes';
import {
  FOOD_STATUS_LABELS, canTransition, formatClock, formatNotice, formatNoticeRule, formatPickup, hoursOverdue, kitchenLineView,
  lineChangeSummary, overdueLabel,
} from '@/lib/foodRequests';
import { loadFoodRequestMessages } from '@/lib/foodRequestsDb';
import { FoodStatusChip, LateChip, ProgramDot, foodStatusUrl } from './foodUi';
import type { useFoodRequestActions } from './useFoodRequestActions';
import { useCampClock } from './useCampClock';

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
export function RequestDetailModal({ request, lines, program, onClose, onDecide, actions }: {
  request: FoodRequest;
  lines: FoodRequestLine[];
  program: FoodProgram | undefined;
  onClose: () => void;
  onDecide: (mode: 'approve' | 'decline') => void;
  /** The Requests tab's actions, so a toast and its Undo outlive this dialog. */
  actions: ReturnType<typeof useFoodRequestActions>;
}) {
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const { timeZone, now } = useCampClock();
  const [messages, setMessages] = useState<FoodRequestMessage[] | null>(null);
  const [copied, setCopied] = useState(false);
  const items = useCommissaryStore((s) => s.items);
  const busy = actions.busyId === request.id;

  // Reloaded whenever the request changes: every transition queues or cancels something.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      loadFoodRequestMessages(request.id).then((m) => { if (live) setMessages(m); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [request.id, request.status, request.updatedAt]);

  const overdue = hoursOverdue(request, now, timeZone);
  const pastDue = overdue != null;

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
    ['Picked up', request.pickedUpAt, [request.pickedUpByName, 'taken off the shelf count'].filter(Boolean).join(' · ')],
    ['Marked missed', request.missedAt, null],
    ['Cancelled', request.cancelledAt, request.cancelledBy === 'kitchen' ? 'by the kitchen' : request.cancelledBy ? `by ${request.requesterName}, who asked` : null],
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
              onClick={() => actions.cancel(request)}>
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
            // Secondary on purpose: it was a red button louder than Picked up, beside it.
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => actions.missed(request)}>Not picked up…</Button>
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
            <FoodStatusChip status={request.status} label={FOOD_STATUS_LABELS[request.status]} />
            {request.isLate && <LateChip hours={request.noticeHours} />}
            {overdue != null && (
              <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-red/30 bg-red-bg px-2 py-0.5 text-[11px] font-bold text-red-text">{overdueLabel(overdue)}</span>
            )}
          </div>
          <p className="mt-1.5 text-[15px] font-semibold text-ink">{formatPickup(request.pickupDate, request.pickupTime)}</p>
          <p className="text-[12.5px] text-ink-soft">
            {formatNotice(request.noticeHours)}&rsquo; notice when sent (you ask for {formatNoticeRule(request.cutoffHours)})
            {request.headcount ? ` · ${request.headcount} people` : ''}{request.purpose ? ` · ${request.purpose}` : ''}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            {request.requesterName}
            {request.requesterEmail ? ` · ${request.requesterEmail}` : ''}
            {request.requesterPhone ? ` · ${request.requesterPhone}` : ''}
          </p>
          <p className="text-[12.5px] text-ink-soft" data-testid="contact-preference">
            {request.notifyBy === 'text'
              ? `Asked to be texted${request.requesterPhone ? ` at ${request.requesterPhone}` : ''}. Texts aren’t switched on yet, so updates go by email; call or text them yourself if it’s urgent.`
              : 'Updates by email.'}
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
              const v = kitchenLineView(l, l.itemId ? items.find((i) => i.id === l.itemId)?.name : undefined);
              return (
                <div key={l.id} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className={`text-[13px] ${l.lineState === 'unavailable' ? 'text-ink-faint' : 'text-forest'}`}>{v.name}</p>
                    <p className="text-[11.5px] text-ink-soft">
                      {!v.linked
                        ? (request.status === 'submitted' ? 'Not on your kitchen list, in their own words' : 'Not on your kitchen list: buy or source it separately')
                        : v.asked ? `asked: ${v.asked}` : 'On the kitchen list'}{l.note ? ` · “${l.note}”` : ''}
                    </p>
                    {l.kitchenReason && <p className="text-[11.5px] text-ink">Kitchen: {l.kitchenReason}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="font-mono text-[12.5px] text-ink">{v.qty}</p>
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
              <li key={label} className="grid grid-cols-[6.5rem_1fr] gap-x-2 text-ink">
                <span className="font-semibold text-forest">{label}</span>
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
