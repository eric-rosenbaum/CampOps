import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Send } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatCard } from '@/components/shared/StatCard';
import { Badge, inputClass, labelClass, type BadgeTone } from './retreatUi';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { RetreatRequestKind } from '@/lib/types';

/**
 * Requests on the retreat you are inside, in both directions.
 *
 * Two things changed here. It used to list every request across every group, which meant the
 * tab you reached by entering one retreat answered a question about all of them. And it only
 * ever recorded the group asking the camp: anything the camp needed from the group happened
 * over email and left no trace on the booking, which is the whole thing this module exists to
 * stop. The camp can now open a thread too, and the group answers it in the portal.
 */

const KIND_LABELS: Record<RetreatRequestKind, string> = {
  housing: 'housing',
  menu: 'menu',
  headcount: 'headcount',
  other: 'general',
};

const KIND_OPTIONS: { value: RetreatRequestKind; label: string }[] = [
  { value: 'headcount', label: 'Headcount' },
  { value: 'housing', label: 'Housing' },
  { value: 'menu', label: 'Menu' },
  { value: 'other', label: 'Something else' },
];

/** ISO timestamp → "Jul 6" */
function fmtWhen(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChangeRequestsTab() {
  const { selectedRetreat, requestsFor, addChangeRequest, openModal } = useRetreatStore();
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<RetreatRequestKind>('other');
  const [body, setBody] = useState('');

  const r = selectedRetreat();
  if (!r) return null;

  const requests = requestsFor(r.id);
  const fromGroup = requests.filter((q) => q.origin !== 'camp');
  const fromCamp = requests.filter((q) => q.origin === 'camp');

  const awaitingUs = fromGroup.filter((q) => q.status === 'pending');
  const awaitingThem = fromCamp.filter((q) => q.status === 'pending');
  const resolved = requests.filter((q) => q.status !== 'pending');

  function ask() {
    if (!canManage || !body.trim() || !r) return;
    const stamp = new Date().toISOString();
    addChangeRequest({
      id: generateId(), campId: '', retreatId: r.id,
      origin: 'camp', kind,
      submittedBy: currentUser.name || null, submittedAt: stamp,
      body: body.trim(), status: 'pending',
      responseMessage: null, internalNote: null, respondedBy: null, respondedAt: null,
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
            Everything asked either way on this booking. Other groups live on their own tabs.
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
          hint="The group asked, you have not answered"
          variant={awaitingUs.length > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="Waiting on the group"
          value={awaitingThem.length}
          hint="You asked, they have not replied"
          variant={awaitingThem.length > 0 ? 'amber' : 'default'}
        />
        <StatCard label="Settled" value={resolved.length} hint="Answered either way" />
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
        title="From the group, waiting on you"
      />
      {awaitingUs.length === 0 ? (
        <Empty>Nothing from {r.groupName} needs an answer.</Empty>
      ) : (
        <div className="flex flex-col gap-2.5 mb-8">
          {awaitingUs.map((q) => (
            <div key={q.id} className="bg-white rounded-card border border-border border-l-[3px] border-l-amber px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-forest">{KIND_LABELS[q.kind]} request</p>
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    From {q.submittedBy ?? 'the group'} · {fmtWhen(q.submittedAt)}
                  </p>
                </div>
                <Badge tone="warn">Pending</Badge>
              </div>
              <p className="text-[13px] text-ink mt-2.5 leading-relaxed">{q.body}</p>
              {canManage && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => openModal({ kind: 'respondRequest', requestId: q.id })}>
                    Approve &amp; respond
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'respondRequest', requestId: q.id })}>
                    Counter-propose
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red hover:bg-red-bg" onClick={() => openModal({ kind: 'respondRequest', requestId: q.id })}>
                    Decline
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Waiting on the group */}
      <SectionHeading
        icon={<ArrowUpRight className="w-3.5 h-3.5" />}
        title="From you, waiting on the group"
      />
      {awaitingThem.length === 0 ? (
        <Empty>You have not asked {r.groupName} for anything that is still open.</Empty>
      ) : (
        <div className="flex flex-col gap-2.5 mb-8">
          {awaitingThem.map((q) => (
            <div key={q.id} className="bg-white rounded-card border border-border border-l-[3px] border-l-blue px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-forest">{KIND_LABELS[q.kind]} request</p>
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    Sent by {q.submittedBy ?? 'the camp'} · {fmtWhen(q.submittedAt)}
                  </p>
                </div>
                <Badge tone="blue">Awaiting reply</Badge>
              </div>
              <p className="text-[13px] text-ink mt-2.5 leading-relaxed">{q.body}</p>
            </div>
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
            const fromTheCamp = q.origin === 'camp';
            const border = fromTheCamp ? 'border-l-blue'
              : q.status === 'declined' ? 'border-l-red'
                : q.status === 'countered' ? 'border-l-amber'
                  : 'border-l-sage';
            const tone: BadgeTone = fromTheCamp ? 'blue'
              : q.status === 'declined' ? 'alert'
                : q.status === 'countered' ? 'warn' : 'ok';
            // A camp-raised thread is answered, not "approved": the group is replying to a
            // question, not ruling on a request.
            const statusLabel = fromTheCamp ? 'Answered'
              : q.status === 'countered' ? 'Countered'
                : q.status === 'declined' ? 'Declined' : 'Approved';
            return (
              <div key={q.id} className={`bg-white rounded-card border border-border border-l-[3px] ${border} px-5 py-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-forest">
                      {fromTheCamp ? 'You asked' : 'The group asked'} · {KIND_LABELS[q.kind]}
                    </p>
                    <p className="text-[11px] text-ink-faint mt-0.5">
                      Sent {fmtWhen(q.submittedAt)} · {statusLabel} {fmtWhen(q.respondedAt)}
                    </p>
                  </div>
                  <Badge tone={tone}>{statusLabel}</Badge>
                </div>
                <p className="text-[13px] text-ink mt-2.5 leading-relaxed">{q.body}</p>
                {q.responseMessage && (
                  <p className="text-[12px] text-ink-soft mt-2.5 pt-2.5 border-t border-cream-dark italic leading-relaxed">
                    {fromTheCamp ? 'Their reply' : 'Ops response'}: {q.responseMessage}
                    {(q.respondedBy || q.respondedAt) && (
                      <span className="not-italic"> · {q.respondedBy ?? (fromTheCamp ? 'the group' : 'Ops')} · {fmtWhen(q.respondedAt)}</span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
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
