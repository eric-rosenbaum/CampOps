import { useMemo, useState } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useCampStore } from '@/store/campStore';
import type { CampRole, StaffGroup } from '@/store/campStore';
import { sendEmail, buildInviteEmail } from '@/lib/email';

const ROLE_LABELS: Record<CampRole, string> = {
  admin: 'Admin', staff: 'Staff', viewer: 'Viewer',
};

type Status = 'queued' | 'sending' | 'sent' | 'failed';

interface Row {
  email: string;
  status: Status;
  detail?: string;
  /** Kept so an admin can still hand the link over if the email itself failed to send. */
  link?: string;
}

/**
 * Invite a whole staff roster in one action.
 *
 * A personalised invitation is the flow that sidesteps the two-code confusion entirely: the
 * link arrives in that person's own inbox, so the inbox proves who they are and they never
 * touch a join code. Slack works the same way, asking for no code on an emailed invitation
 * while its shared invite link does require one. Making bulk invites the easy path is
 * therefore the fix for that confusion rather than a convenience feature, because it keeps
 * most staff off the join-code route altogether.
 */
export function BulkInviteForm({
  campId, campName, staffGroups, pendingEmails, onSent, onCancel,
}: {
  campId: string;
  campName: string;
  staffGroups: StaffGroup[];
  /** Addresses that already have an unaccepted invitation, so those rows can say "resent". */
  pendingEmails: string[];
  onSent: () => void;
  onCancel: () => void;
}) {
  const inviteMember = useCampStore((s) => s.inviteMember);

  const [raw, setRaw] = useState('');
  const [role, setRole] = useState<CampRole>('staff');
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);

  const parsed = useMemo(() => parseEmails(raw), [raw]);
  const pending = useMemo(
    () => new Set(pendingEmails.map((e) => e.toLowerCase())),
    [pendingEmails],
  );

  const needsGroup = role === 'staff';
  const canSend = parsed.valid.length > 0 && !running && (!needsGroup || groupId !== '');

  async function send() {
    setRunning(true);
    const queue = parsed.valid;
    setRows(queue.map((email) => ({ email, status: 'queued' as Status })));

    // Sequential rather than parallel: each address is a database write plus an email send,
    // and firing a forty-person roster at once is a good way to trip provider rate limits.
    for (const email of queue) {
      setRows((prev) => patch(prev, email, { status: 'sending' }));
      try {
        const token = await inviteMember(campId, email, role, role === 'staff' ? groupId || null : null);
        const link = `${window.location.origin}/invite/${token}`;
        const { subject, html } = buildInviteEmail(campName, link);
        const res = await sendEmail({
          to: email, subject, html,
          fromName: campName, fromEmail: 'invites@campcommand.app',
        });
        setRows((prev) => patch(prev, email, res.ok
          ? { status: 'sent', detail: pending.has(email) ? 'Resent, earlier link no longer works' : undefined }
          // The invitation row exists whether or not the email went out, so the link still
          // works. Surface it so the admin can pass it along by hand instead of losing the
          // invitation entirely.
          : { status: 'failed', detail: res.error ?? 'Email failed to send', link }));
      } catch (err) {
        setRows((prev) => patch(prev, email, {
          status: 'failed',
          detail: err instanceof Error ? err.message : 'Could not create invitation',
        }));
      }
    }
    setRunning(false);
    onSent();
  }

  if (rows) {
    const done = rows.filter((r) => r.status === 'sent' || r.status === 'failed').length;
    const sent = rows.filter((r) => r.status === 'sent').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    return (
      <div className="space-y-3">
        <p className="text-[12px] font-medium text-forest">
          {running
            ? `Sending ${Math.min(done + 1, rows.length)} of ${rows.length}…`
            : `${sent} invitation${sent === 1 ? '' : 's'} sent${failed > 0 ? `, ${failed} failed` : ''}`}
        </p>

        <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100">
          {rows.map((r) => (
            <div key={r.email} className="flex items-start gap-2.5 px-3 py-2">
              <StatusIcon status={r.status} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-forest truncate">{r.email}</p>
                {r.detail && <p className="text-[11px] text-forest/45">{r.detail}</p>}
                {r.status === 'failed' && r.link && (
                  <button
                    onClick={() => navigator.clipboard.writeText(r.link!)}
                    className="text-[11px] font-medium text-forest/60 hover:text-forest underline"
                  >
                    Copy the invite link instead
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {!running && (
          <button
            onClick={onCancel}
            className="w-full bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[11px] font-medium text-forest/60 mb-1">Email addresses</label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          autoFocus
          placeholder={'Paste your staff roster here.\nOne per line, or separated by commas.'}
          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[12px] text-forest placeholder:text-forest/30 focus:outline-none focus:ring-2 focus:ring-forest/20"
        />
        <p className="text-[11px] text-forest/45 mt-1">
          {parsed.valid.length > 0
            ? `${parsed.valid.length} address${parsed.valid.length === 1 ? '' : 'es'} ready`
            : 'Everyone receives their own invitation link.'}
          {parsed.invalid.length > 0 && (
            <span className="text-red-600">
              {' '}· {parsed.invalid.length} not a valid email: {parsed.invalid.slice(0, 3).join(', ')}
              {parsed.invalid.length > 3 && '…'}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-forest/60 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CampRole)}
            className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
          >
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {role === 'staff' && (
          <div>
            <label className="block text-[11px] font-medium text-forest/60 mb-1">Staff group</label>
            {staffGroups.length === 0 ? (
              <p className="text-[11px] text-red-500 pt-1.5">Create a staff group first</p>
            ) : (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-[12px] text-forest bg-white focus:outline-none focus:ring-2 focus:ring-forest/20"
              >
                <option value="">Select group…</option>
                {staffGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-forest/45 leading-relaxed">
        Everyone in this batch gets the same role and group. Because the link arrives in their
        own inbox, they set up an account without needing a join code.
      </p>

      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-forest/40 hover:text-forest px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={send}
          disabled={!canSend}
          className="flex-1 bg-forest text-cream text-[12px] font-medium py-1.5 rounded-lg hover:bg-forest/90 transition-colors disabled:opacity-50"
        >
          {parsed.valid.length > 0
            ? `Send ${parsed.valid.length} invitation${parsed.valid.length === 1 ? '' : 's'}`
            : 'Send invitations'}
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'sent') return <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />;
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />;
  if (status === 'sending') return <Loader2 className="w-3.5 h-3.5 text-forest/50 mt-0.5 flex-shrink-0 animate-spin" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-stone-200 mt-0.5 flex-shrink-0" />;
}

function patch(rows: Row[] | null, email: string, next: Partial<Row>): Row[] {
  return (rows ?? []).map((r) => (r.email === email ? { ...r, ...next } : r));
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Pull the usable addresses out of a pasted roster.
 *
 * Admins paste out of a spreadsheet, a mail client, or a text message, so the separator is
 * unpredictable and the addresses often arrive wrapped in names, as in
 * `Sam Reyes <sam@camp.org>`. Rather than guessing at a delimiter, this scans for anything
 * shaped like an address and then treats leftover text as a problem only when it contains an
 * "@" — a bare name is clearly not meant to be an address, whereas `sam@camp` is a typo worth
 * reporting. Silently discarding a typo would mean someone never gets invited and nobody
 * finds out until they say so.
 */
function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.match(EMAIL_RE) ?? []) {
    const email = match.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }

  const leftovers = raw.replace(EMAIL_RE, ' ');
  const invalid = leftovers
    .split(/[\s,;<>()"']+/)
    .map((t) => t.trim())
    .filter((t) => t.includes('@'));

  return { valid, invalid };
}
