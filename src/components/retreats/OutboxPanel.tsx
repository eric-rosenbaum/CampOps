// Everything the system is about to send, before it sends it.
//
// The queue is visible and cancellable because the worst email this product could send is
// "please submit your rooming" the morning after they submitted it.
//
// That is why the planner queues instead of sending: it re-runs nightly and CANCELS anything
// whose condition stopped being true, and the cancelled rows stay on this screen with the reason
// attached so a camp can see the system stood down rather than wondering whether it ever ran.
import { useMemo, useState } from 'react';
import { Loader2, Mail, RefreshCw, Ban, Pencil, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { MessageState, ScheduledMessage } from '@/lib/types';
import { dbCancelMessage, dbEditQueuedMessage, dbReplanMessages } from '@/lib/retreatsDb';
import { inputClass, labelClass, Badge, type BadgeTone } from './retreatUi';

/**
 * A rule key in plain words.
 *
 * `housing_7d` is a perfectly good primary key and a terrible thing to show a camp director.
 * The countdown suffix is parsed rather than enumerated so a new `housing_21d` reads correctly
 * the day it is added, instead of falling through to the raw key.
 */
const RULE_PREFIX: Record<string, string> = {
  agreement: 'Agreement still unsigned',
  deposit: 'Deposit due',
  housing: 'Rooming due',
  headcount: 'Final headcount due',
  coi: 'Certificate of insurance still missing',
  spaces: 'Programme spaces not chosen',
};
const RULE_EXACT: Record<string, string> = {
  balance_due: 'Balance still outstanding after the stay',
  proposal_unopened: 'Proposal sent but never opened',
  arrival_brief: 'Arrival brief — three days out',
  setup_incomplete: 'Set-up work still open the night before',
  feedback: 'How was your stay?',
};

function ruleLabel(key: string): string {
  const exact = RULE_EXACT[key];
  if (exact) return exact;
  const m = /^(.+)_(\d+)d$/.exec(key);
  if (m && RULE_PREFIX[m[1]]) return `${RULE_PREFIX[m[1]]} in ${m[2]} ${m[2] === '1' ? 'day' : 'days'}`;
  return key.replace(/_/g, ' ');
}

const STATE_TONE: Record<MessageState, BadgeTone> = {
  scheduled: 'blue', sending: 'purple', sent: 'ok', cancelled: 'neutral', failed: 'alert',
};
const STATE_LABEL: Record<MessageState, string> = {
  scheduled: 'Queued', sending: 'Sending', sent: 'Sent', cancelled: 'Stood down', failed: 'Failed',
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function relative(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  if (days === -1) return 'yesterday';
  return `${Math.abs(days)} days ago`;
}

/** The body is stored as email HTML. For a preview, tags are stripped rather than injected. */
function plainPreview(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type Filter = 'queued' | 'history';

export function OutboxPanel() {
  const { outbox, setOutbox, retreats } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [filter, setFilter] = useState<Filter>('queued');
  const [replanning, setReplanning] = useState(false);
  const [replanned, setReplanned] = useState<number | null>(null);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);

  // Derived from the raw slice, never in a selector.
  const groupNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of retreats) m.set(r.id, r.groupName);
    return m;
  }, [retreats]);

  const queued = useMemo(
    () => outbox.filter((m) => m.state === 'scheduled' || m.state === 'sending')
      .sort((a, b) => a.sendAfter.localeCompare(b.sendAfter)),
    [outbox],
  );
  const history = useMemo(
    () => outbox.filter((m) => m.state !== 'scheduled' && m.state !== 'sending')
      .sort((a, b) => (b.sentAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.updatedAt))
      .slice(0, 100),
    [outbox],
  );

  const list = filter === 'queued' ? queued : history;

  async function replan() {
    setReplanning(true);
    setReplanned(null);
    const n = await dbReplanMessages();
    setReplanning(false);
    setReplanned(n);
  }

  function cancel(m: ScheduledMessage) {
    if (!window.confirm(`Cancel “${m.subject}”? It will not go out.`)) return;
    setOutbox(outbox.map((x) => (x.id === m.id
      ? { ...x, state: 'cancelled', suppressedReason: 'cancelled by the camp', updatedAt: new Date().toISOString() }
      : x)));
    void dbCancelMessage(m.id);
  }

  function saveEdit(m: ScheduledMessage, subject: string, bodyHtml: string) {
    setOutbox(outbox.map((x) => (x.id === m.id
      ? { ...x, subject, bodyHtml, updatedAt: new Date().toISOString() } : x)));
    void dbEditQueuedMessage(m.id, subject, bodyHtml);
    setEditing(null);
  }

  return (
    <div className="bg-white border border-border rounded-card">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-forest">Outbox</h3>
            <p className="text-[11.5px] text-ink-soft">
              Nothing sends silently. The queue is visible and cancellable because the worst email
              this product could send is “please submit your rooming” the morning after they submitted it.
            </p>
          </div>
          {canManage && (
            <Button size="sm" variant="ghost" onClick={replan} disabled={replanning}>
              {replanning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Re-planning…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Re-plan now</>}
            </Button>
          )}
        </div>
        {replanned != null && (
          <p className="text-[12px] text-green-muted-text mt-2">
            Re-planned. {replanned} {replanned === 1 ? 'message' : 'messages'} queued or refreshed;
            anything whose reason had gone away has been stood down.
          </p>
        )}
        <div className="flex gap-1.5 mt-3">
          {(['queued', 'history'] as Filter[]).map((f) => (
            <button
              key={f} type="button" onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-pill text-[12px] font-semibold border transition-colors ${
                filter === f ? 'bg-forest text-white border-forest' : 'bg-white border-border text-ink hover:border-sage'
              }`}
            >
              {f === 'queued' ? `Queued (${queued.length})` : `Sent & stood down (${history.length})`}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] text-ink-faint text-center">
          {filter === 'queued'
            ? 'Nothing queued. Deadlines on a booking are what create reminders — set a housing deadline or a headcount cutoff and they appear here.'
            : 'Nothing has gone out yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((m) => (
            <li key={m.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 text-ink-faint">
                  {m.state === 'sent' ? <CheckCircle2 className="w-4 h-4 text-green-muted-text" />
                    : m.state === 'failed' ? <AlertTriangle className="w-4 h-4 text-red" />
                    : m.state === 'cancelled' ? <Ban className="w-4 h-4" />
                    : <Clock className="w-4 h-4 text-blue" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-forest">{m.subject}</span>
                    <Badge tone={STATE_TONE[m.state]}>{STATE_LABEL[m.state]}</Badge>
                  </p>

                  {/* Why this message exists, in words. */}
                  <p className="text-[11.5px] text-ink-soft mt-0.5">
                    {ruleLabel(m.ruleKey)}
                    {groupNames.get(m.subjectId) && ` · ${groupNames.get(m.subjectId)}`}
                  </p>

                  <p className="text-[11.5px] text-ink-soft mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="break-all">{m.toName ? `${m.toName} · ` : ''}{m.toEmail}</span>
                    <span className="text-ink-faint">
                      ({m.recipientKind === 'camp' ? 'to the camp' : 'to the group'})
                    </span>
                  </p>

                  <p className="text-[11.5px] text-ink-faint mt-0.5">
                    {m.state === 'sent' && m.sentAt
                      ? `Sent ${fmtWhen(m.sentAt)}`
                      : `${m.state === 'scheduled' ? 'Goes out' : 'Was due'} ${fmtWhen(m.sendAfter)} (${relative(m.sendAfter)})`}
                  </p>

                  {m.state === 'cancelled' && (
                    <p className="text-[12px] text-ink-soft mt-1.5 bg-cream-dark/60 border border-border rounded-btn px-2.5 py-1.5">
                      Stood down{m.suppressedReason ? ` — ${m.suppressedReason}` : ''}. The reason for
                      sending it went away before it went out.
                    </p>
                  )}
                  {m.state === 'failed' && m.error && (
                    <p className="text-[12px] text-red mt-1.5">{m.error}</p>
                  )}
                </div>

                {canManage && m.state === 'scheduled' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button" title="Edit before it goes" onClick={() => setEditing(m)}
                      className="p-1.5 text-ink-faint hover:text-forest transition-colors"
                    ><Pencil className="w-3.5 h-3.5" /></button>
                    <button
                      type="button" title="Cancel this message" onClick={() => cancel(m)}
                      className="p-1.5 text-ink-faint hover:text-red transition-colors"
                    ><Ban className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditMessageModal
          message={editing}
          onClose={() => setEditing(null)}
          onSave={(subject, body) => saveEdit(editing, subject, body)}
        />
      )}
    </div>
  );
}

function EditMessageModal({ message, onClose, onSave }: {
  message: ScheduledMessage;
  onClose: () => void;
  onSave: (subject: string, bodyHtml: string) => void;
}) {
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.bodyHtml);
  const [preview, setPreview] = useState(true);

  return (
    <Modal title="Edit before it goes out" onClose={onClose} width="min(620px, 94vw)">
      <p className="text-[12.5px] text-ink-soft mb-4">
        Going to <strong className="text-ink">{message.toEmail}</strong> on {fmtWhen(message.sendAfter)}.
        Editing changes this one message; the rule keeps working as before for everyone else.
      </p>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelClass}>Body</label>
            <button
              type="button" onClick={() => setPreview((v) => !v)}
              className="text-[12px] font-semibold text-forest hover:underline"
            >{preview ? 'Edit the HTML' : 'Back to preview'}</button>
          </div>
          {preview ? (
            <div className="border border-border rounded-btn px-3 py-2.5 bg-cream-dark/40 text-[12.5px] text-ink whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
              {plainPreview(body)}
            </div>
          ) : (
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)} rows={12}
              className={`${inputClass} font-mono text-[11.5px] resize-y`}
            />
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(subject.trim(), body)} disabled={!subject.trim()}>Save</Button>
      </div>
    </Modal>
  );
}
