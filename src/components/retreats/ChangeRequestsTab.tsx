import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Send } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { Badge, inputClass, labelClass, fmtStamp, type BadgeTone } from './retreatUi';
import { RequestThread } from './RequestThread';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { RetreatChangeRequest, RetreatRequestKind } from '@/lib/types';

/**
 * Requests on the retreat you are inside, in both directions.
 *
 * Three things have changed here over time. It used to list every request across every group,
 * which meant the tab you reached by entering one retreat answered a question about all of
 * them. It only ever recorded the group asking the camp, so anything the camp needed from the
 * group happened over email and left no trace on the booking.
 *
 * And a request was a form with one reply box: the camp answered once and the exchange was
 * over, with nowhere for the group to say "yes, but Friday". Each one is now a thread either
 * side can add to, and which bucket it sits in is decided by who spoke last rather than by the
 * camp's ruling on the original ask -- so a follow-up to an approved request comes back to the
 * camp's attention instead of disappearing into "settled".
 */

// Every kind the portal can write, so a dietary request does not arrive here with a blank
// subject. Read through `kindLabel` rather than indexed directly -- a kind that reaches this
// screen from somewhere newer than this map should print itself, not nothing.
const KIND_LABELS: Record<string, string> = {
  housing: 'housing',
  menu: 'menu',
  headcount: 'headcount',
  program_space: 'program space',
  dietary: 'dietary & allergies',
  childcare: 'childcare',
  equipment: 'equipment / AV',
  other: 'general',
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, ' ');

const KIND_OPTIONS: { value: RetreatRequestKind; label: string }[] = [
  { value: 'headcount', label: 'Headcount' },
  { value: 'housing', label: 'Housing' },
  { value: 'menu', label: 'Menu' },
  { value: 'program_space', label: 'Program space' },
  { value: 'dietary', label: 'Dietary & allergies' },
  { value: 'equipment', label: 'Equipment / AV' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'other', label: 'Something else' },
];

/** ISO timestamp → "Jul 6" */
function fmtWhen(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Who owes the next word.
 *
 * Falls back to the request's origin for rows written before the thread existed and never
 * touched since — those have no `lastMessageFrom`, and reading them as "nobody is waiting"
 * would silently empty the camp's queue.
 */
function waitingOn(q: RetreatChangeRequest): 'camp' | 'group' {
  return q.lastMessageFrom ?? (q.origin === 'camp' ? 'camp' : 'group');
}

export function ChangeRequestsTab() {
  const { selectedRetreat, requestsFor, messagesFor, addChangeRequest, openModal, setRequestClosed } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<RetreatRequestKind>('other');
  const [body, setBody] = useState('');

  const r = selectedRetreat();
  if (!r) return null;

  const requests = requestsFor(r.id);

  // Open threads are bucketed by who spoke last; closed ones are settled regardless. A thread
  // the group has added to since the camp closed it is reopened by the database (see the
  // touch_request_thread trigger), so it arrives back here without anyone doing anything.
  const open = requests.filter((q) => !q.closedAt);
  const awaitingUs = open.filter((q) => waitingOn(q) === 'group');
  const awaitingThem = open.filter((q) => waitingOn(q) === 'camp');
  const resolved = requests.filter((q) => q.closedAt);

  function ask() {
    if (!canManage || !body.trim() || !r) return;
    const stamp = new Date().toISOString();
    addChangeRequest({
      id: generateId(), campId: '', retreatId: r.id,
      origin: 'camp', kind,
      submittedBy: currentUser.name || null, submittedAt: stamp,
      body: body.trim(), status: 'pending',
      responseMessage: null, internalNote: null, respondedBy: null, respondedAt: null,
      lastMessageAt: stamp, lastMessageFrom: 'camp', closedAt: null,
      createdAt: stamp, updatedAt: stamp,
    });
    setBody(''); setKind('other'); setAsking(false);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="text-[15px] font-semibold text-forest">{r.groupName} · requests</h2>
          <p className="text-[12px] text-ink-soft mt-0.5">
            Everything asked on this booking. Each one is a conversation — the group can reply to
            your answer in their portal.
          </p>
        </div>
        {canManage && !asking && (
          <Button size="sm" onClick={() => setAsking(true)}>
            <Send className="w-3.5 h-3.5" /> Ask the group
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
        <StatCard
          label="Waiting on you"
          value={awaitingUs.length}
          hint="The group spoke last"
          variant={awaitingUs.length > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="Waiting on the group"
          value={awaitingThem.length}
          hint="You spoke last, they have not answered"
          variant={awaitingThem.length > 0 ? 'amber' : 'default'}
        />
        <StatCard label="Settled" value={resolved.length} hint="Closed by you" />
      </div>

      {/* Ask the group something */}
      {asking && (
        <div className="bg-white rounded-card border border-border border-l-[3px] border-l-blue px-5 py-4 mb-6">
          <p className="text-[13px] font-semibold text-forest mb-3">Ask {r.groupName}</p>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
            <div>
              <label className={labelClass}>About</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as RetreatRequestKind)} className={inputClass}>
                {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>What do you need from them?</label>
              <textarea
                autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                className={`${inputClass} resize-y`}
                placeholder="e.g. Can you confirm whether the Friday late bus is still coming, and how many people are on it?"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={ask} disabled={!body.trim()}>
              <Send className="w-3.5 h-3.5" /> Send to the portal
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAsking(false); setBody(''); }}>Cancel</Button>
          </div>
          <p className="text-[11px] text-ink-faint mt-2.5">
            It appears in their guest portal with everything else on this booking. They reply there.
          </p>
        </div>
      )}

      {/* Waiting on the camp */}
      <SectionHeading
        icon={<ArrowDownLeft className="w-3.5 h-3.5" />}
        title="Waiting on you"
      />
      {awaitingUs.length === 0 ? (
        <Empty>Nothing from {r.groupName} needs an answer.</Empty>
      ) : (
        <div className="flex flex-col gap-2.5 mb-8">
          {awaitingUs.map((q) => (
            <ThreadCard key={q.id} q={q} accent="border-l-amber" tone="warn" label="Needs your reply">
              <RequestThread request={q} messages={messagesFor(q.id)} />
              {canManage && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-cream-dark">
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'respondRequest', requestId: q.id })}>
                    Record a decision
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRequestClosed(q.id, true)}>
                    <Check className="w-3.5 h-3.5" /> Mark settled
                  </Button>
                </div>
              )}
            </ThreadCard>
          ))}
        </div>
      )}

      {/* Waiting on the group */}
      <SectionHeading
        icon={<ArrowUpRight className="w-3.5 h-3.5" />}
        title="Waiting on the group"
      />
      {awaitingThem.length === 0 ? (
        <Empty>Nothing is sitting with {r.groupName}.</Empty>
      ) : (
        <div className="flex flex-col gap-2.5 mb-8">
          {awaitingThem.map((q) => (
            <ThreadCard key={q.id} q={q} accent="border-l-blue" tone="blue" label="Awaiting their reply">
              <RequestThread request={q} messages={messagesFor(q.id)} />
              {canManage && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-cream-dark">
                  <Button size="sm" variant="ghost" onClick={() => setRequestClosed(q.id, true)}>
                    <Check className="w-3.5 h-3.5" /> Mark settled
                  </Button>
                </div>
              )}
            </ThreadCard>
          ))}
        </div>
      )}

      {/* Settled, both directions */}
      <SectionHeading title="Settled" />
      {resolved.length === 0 ? (
        <Empty>Nothing settled yet.</Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {resolved.map((q) => {
            const border = q.status === 'declined' ? 'border-l-red'
              : q.status === 'countered' ? 'border-l-amber' : 'border-l-sage';
            const tone: BadgeTone = q.status === 'declined' ? 'alert'
              : q.status === 'countered' ? 'warn' : 'ok';
            // A camp-raised thread is answered, not "approved": the group was replying to a
            // question, not ruling on a request.
            const label = q.origin === 'camp' ? 'Answered'
              : q.status === 'countered' ? 'Countered'
                : q.status === 'declined' ? 'Declined'
                  : q.status === 'approved' ? 'Approved' : 'Settled';
            return (
              <ThreadCard key={q.id} q={q} accent={border} tone={tone} label={label}>
                <RequestThread request={q} messages={messagesFor(q.id)} />
                {canManage && (
                  <div className="mt-3 pt-3 border-t border-cream-dark">
                    <Button size="sm" variant="ghost" onClick={() => setRequestClosed(q.id, false)}>
                      Reopen
                    </Button>
                  </div>
                )}
              </ThreadCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ q, accent, tone, label, children }: {
  q: RetreatChangeRequest; accent: string; tone: BadgeTone; label: string; children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-card border border-border border-l-[3px] ${accent} px-5 py-4`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[13px] font-semibold text-forest">
            {q.origin === 'camp' ? 'You asked' : 'The group asked'} · {kindLabel(q.kind)}
          </p>
          <p className="text-[11px] text-ink-faint mt-0.5">
            Opened {fmtWhen(q.submittedAt)}
            {q.lastMessageAt && q.lastMessageAt !== q.submittedAt && <> · last message {fmtStamp(q.lastMessageAt)}</>}
          </p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ icon, title }: { icon?: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-forest mb-3">
      {icon && <span className="text-ink-faint">{icon}</span>}
      {title}
    </h3>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-card border border-border px-5 py-4 sm:py-6 text-center text-[13px] text-ink-faint italic mb-8">
      {children}
    </div>
  );
}
