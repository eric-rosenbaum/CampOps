import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Presentation, Loader2, AlertTriangle, Check, Accessibility, Users, Lock, MessageSquare } from 'lucide-react';
import {
  supabasePublic, cardClass, type PortalRetreat,
} from '@/pages/portal/portalShared';
import { MessageThread, type ThreadMessage } from '@/components/shared/MessageThread';

/**
 * "Which spaces do you need set up when you arrive?"
 *
 * It used to ask six questions per room PER DAY: start time, end time, what's happening, how
 * many people, which layout, and any notes. Almost all of that was the camp's guess at what a
 * crew needs, and the cost of asking it was a coordinator on a sofa giving up halfway -- which
 * leaves the crew with nothing at all, not with less.
 *
 * So: tick the rooms, add a note if you have one. The note is the feature, not an afterthought
 * at the bottom of a form -- it travels verbatim onto the set-up work order and onto the reset,
 * so a coordinator who wrote "three benches along the back wall" has it reach the person
 * carrying benches without two people paraphrasing it.
 *
 * The rooms are needed for the whole stay, because that is the only span "set up when you
 * arrive" can mean. One set-up before, one reset after.
 *
 * Below the rooms is a thread. An approval or a decline used to be a badge the group could only
 * answer by ringing the camp; now the answer arrives where a reply can go.
 */

interface ProgramSpace {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  accessible: boolean | null;
  notes: string | null;
}

interface SpaceRequestRow {
  id: string;
  location_id: string;
  location_name: string;
  setup_notes: string | null;
  status: 'requested' | 'approved' | 'declined' | 'countered';
}

interface MessageRow {
  id: string;
  author_kind: 'camp' | 'group' | 'system';
  author_name: string | null;
  kind: 'message' | 'status';
  body: string;
  space_name: string | null;
  created_at: string;
}

const STATUS_COPY: Record<SpaceRequestRow['status'], { label: string; cls: string }> = {
  requested: { label: 'Waiting on the camp', cls: 'bg-blue-bg text-blue-text' },
  approved: { label: 'Approved', cls: 'bg-green-muted-bg text-green-muted-text' },
  declined: { label: 'Declined', cls: 'bg-red-bg text-red' },
  countered: { label: 'Needs another look', cls: 'bg-amber-bg text-amber-text' },
};

const LOAD_ERROR = "We could not load the camp's spaces. Please refresh and try again.";

async function fetchAll(token: string): Promise<{
  spaces: ProgramSpace[]; requests: SpaceRequestRow[];
  messages: MessageRow[]; unread: number; campName: string | null;
} | null> {
  const [sp, rq, th] = await Promise.all([
    supabasePublic.rpc('portal_program_spaces', { p_token: token }),
    supabasePublic.rpc('portal_space_requests', { p_token: token }),
    supabasePublic.rpc('portal_space_messages', { p_token: token }),
  ]);
  if (sp.error || rq.error) return null;
  const thread = (th.data ?? {}) as { messages?: MessageRow[]; unread?: number; camp_name?: string };
  return {
    spaces: (sp.data as ProgramSpace[]) ?? [],
    requests: (rq.data as SpaceRequestRow[]) ?? [],
    messages: thread.messages ?? [],
    unread: thread.unread ?? 0,
    campName: thread.camp_name ?? null,
  };
}

export function ProgramSpacesSection({
  token, retreat, onChanged,
}: {
  token: string;
  retreat: PortalRetreat;
  /** Called after any successful change, so the portal can refresh its checklist. */
  onChanged?: () => void | Promise<void>;
}) {
  const [spaces, setSpaces] = useState<ProgramSpace[]>([]);
  const [requests, setRequests] = useState<SpaceRequestRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [campName, setCampName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Per-space note text while it is being typed, before the debounce commits it. */
  const [notes, setNotes] = useState<Record<string, string>>({});

  const today = new Date().toISOString().slice(0, 10);
  const departed = retreat.departure_date < today;
  const editable = !departed;

  const load = useCallback(async () => {
    const res = await fetchAll(token);
    if (!res) { setError(LOAD_ERROR); setLoading(false); return; }
    setSpaces(res.spaces);
    setRequests(res.requests);
    setMessages(res.messages);
    setUnread(res.unread);
    setCampName(res.campName);
    setNotes(Object.fromEntries(res.requests.map((r) => [r.location_id, r.setup_notes ?? ''])));
    setError(null);
    setLoading(false);
  }, [token]);

  // The fetch lives outside the component and the effect runs it in an async IIFE — the shape
  // the rest of the portal uses, and the one that keeps state updates out of the effect body.
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetchAll(token);
      if (!active) return;
      if (!res) { setError(LOAD_ERROR); setLoading(false); return; }
      setSpaces(res.spaces);
      setRequests(res.requests);
      setMessages(res.messages);
      setUnread(res.unread);
      setCampName(res.campName);
      setNotes(Object.fromEntries(res.requests.map((r) => [r.location_id, r.setup_notes ?? ''])));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [token]);

  // Read on the way OUT, not on the way in. Marking it read while the reader is still on the
  // section takes the highlight off the very messages that summoned them.
  const unreadRef = useRef(0);
  useEffect(() => { unreadRef.current = unread; }, [unread]);
  useEffect(() => () => {
    if (unreadRef.current > 0) void supabasePublic.rpc('portal_mark_spaces_read', { p_token: token });
  }, [token]);

  const requestByLocation = useMemo(
    () => new Map(requests.map((r) => [r.location_id, r])), [requests],
  );

  const threadMessages: ThreadMessage[] = useMemo(() => {
    // The unread ones are the last N the camp sent: the count comes from the server and nothing
    // marks the thread read while it is on screen, so this stays put while it is being read.
    const theirs = messages.filter((m) => m.author_kind !== 'group');
    const from = unread > 0 && theirs.length >= unread
      ? theirs[theirs.length - unread].created_at : null;
    return messages.map((m) => ({
      id: m.id,
      authorKind: m.author_kind,
      authorName: m.author_kind === 'camp' || m.author_kind === 'system'
        ? (m.author_name ?? campName) : m.author_name,
      body: m.body,
      subject: m.kind === 'status' ? null : m.space_name,
      createdAt: m.created_at,
      unread: m.author_kind !== 'group' && from != null && m.created_at >= from,
    }));
  }, [messages, campName, unread]);

  async function toggle(space: ProgramSpace) {
    const existing = requestByLocation.get(space.id);
    setBusy(space.id); setError(null);
    if (existing) {
      const { error: err } = await supabasePublic.rpc('portal_delete_space_request',
        { p_token: token, p_id: existing.id });
      if (err) { setBusy(null); setError(err.message || 'Could not remove that space.'); return; }
    } else {
      const { error: err } = await supabasePublic.rpc('portal_save_space_request',
        { p_token: token, p_location_id: space.id, p_note: null });
      if (err) { setBusy(null); setError(err.message || 'Could not add that space.'); return; }
    }
    setBusy(null);
    await load();
    await onChanged?.();
  }

  // Notes commit on a debounce rather than on blur: React ignores a synthetic blur, and a
  // coordinator who types a sentence and closes the tab should still have written it down.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function noteChanged(locationId: string, value: string) {
    setNotes((n) => ({ ...n, [locationId]: value }));
    clearTimeout(timers.current[locationId]);
    timers.current[locationId] = setTimeout(() => {
      void (async () => {
        const { error: err } = await supabasePublic.rpc('portal_save_space_request',
          { p_token: token, p_location_id: locationId, p_note: value.trim() || null });
        if (err) { setError(err.message || 'Could not save that note.'); return; }
        await load();
        await onChanged?.();
      })();
    }, 700);
  }
  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  async function post(body: string) {
    setSending(true); setError(null);
    const { error: err } = await supabasePublic.rpc('portal_post_space_message',
      { p_token: token, p_body: body, p_location_id: null });
    setSending(false);
    if (err) { setError(err.message || 'Could not send that message.'); return; }
    await load();
    await onChanged?.();
  }

  if (loading) {
    return (
      <div className={`${cardClass} p-6 flex items-center gap-2.5 text-[13px] text-ink-soft`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the camp's spaces…
      </div>
    );
  }

  if (spaces.length === 0 && requests.length === 0) {
    return (
      <div className={`${cardClass} p-8 text-center`}>
        <Presentation className="w-8 h-8 text-ink-faint mx-auto mb-3" />
        <p className="text-[15px] font-semibold text-forest">No bookable spaces yet</p>
        <p className="text-[13px] text-ink-soft mt-1.5 max-w-sm mx-auto leading-relaxed">
          The camp hasn't opened any meeting or activity spaces for booking. Ask your
          coordinator if you need a room for a session.
        </p>
      </div>
    );
  }

  const picked = requests.length;

  return (
    <div className="space-y-4">
      {departed && (
        <div className="flex items-start gap-2.5 bg-cream-dark border border-border rounded-xl px-4 py-3">
          <Lock className="w-4 h-4 text-ink-soft flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink">
            Your stay has finished. These are a record of what you asked for.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 bg-red-bg border border-red/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-red">{error}</p>
        </div>
      )}

      <div className={`${cardClass} p-4 sm:p-5`}>
        <p className="text-[15px] font-bold text-forest">
          Which spaces do you need set up when you arrive?
        </p>
        <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
          Pick everything you need. The camp has these ready for your whole stay and puts them
          back afterwards — you don't need to tell us times.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
          {spaces.map((s) => {
            const req = requestByLocation.get(s.id);
            const on = !!req;
            const working = busy === s.id;
            return (
              <div
                key={s.id}
                className={`rounded-xl border transition-colors ${
                  on ? 'border-sage bg-sage-pale/40' : 'border-border bg-white'
                }`}
              >
                <button
                  type="button"
                  disabled={!editable || working}
                  onClick={() => void toggle(s)}
                  className="w-full text-left px-3.5 py-3 flex items-start gap-2.5 disabled:cursor-not-allowed"
                >
                  <span className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 ${
                    on ? 'bg-forest border-forest' : 'bg-white border-border'
                  }`}>
                    {working
                      ? <Loader2 className="w-3 h-3 animate-spin text-ink-faint" />
                      : on && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-forest">
                      {s.name}
                      {s.building && <span className="font-normal text-ink-soft"> · {s.building}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-ink-soft">
                      {s.capacity_seated != null && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" />seats {s.capacity_seated}
                        </span>
                      )}
                      {s.accessible && (
                        <span className="inline-flex items-center gap-1">
                          <Accessibility className="w-3 h-3" />step-free
                        </span>
                      )}
                    </span>
                    {s.notes && (
                      <span className="block text-[12px] text-ink-soft mt-1 leading-relaxed">{s.notes}</span>
                    )}
                  </span>
                  {req && (
                    <span className={`flex-shrink-0 text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${STATUS_COPY[req.status].cls}`}>
                      {STATUS_COPY[req.status].label}
                    </span>
                  )}
                </button>

                {/* The one thing we do ask for, and the one thing the crew actually reads. */}
                {on && (
                  <div className="px-3.5 pb-3">
                    <textarea
                      value={notes[s.id] ?? ''}
                      onChange={(e) => noteChanged(s.id, e.target.value)}
                      disabled={!editable}
                      rows={2}
                      placeholder="Anything we should know? e.g. benches along the back wall"
                      className="w-full text-[12.5px] bg-white border border-border rounded-lg px-2.5 py-2 focus:outline-none focus:border-sage resize-y disabled:opacity-60"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {editable && picked === 0 && (
          <p className="text-[12.5px] text-ink-faint italic mt-3">
            Nothing picked yet. If you don't need a meeting space, you can leave this.
          </p>
        )}
      </div>

      {/* ── The conversation ── */}
      <div className={`${cardClass} p-4 sm:p-5`}>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-forest" />
          <p className="text-[15px] font-bold text-forest">Messages about your spaces</p>
          {unread > 0 && (
            <span className="text-[10.5px] font-bold text-white bg-amber rounded-full px-2 py-0.5">
              {unread} new
            </span>
          )}
        </div>
        <p className="text-[12.5px] text-ink-soft mb-3 leading-relaxed">
          {campName ? `${campName} answers here` : 'The camp answers here'} — approvals, declines
          and anything you want to ask.
        </p>
        <MessageThread
          messages={threadMessages}
          mine="group"
          onSend={post}
          busy={sending}
          disabled={departed}
          otherPartyName={campName}
          emptyMessage="No messages yet. Ask us anything about the spaces you need."
        />
      </div>
    </div>
  );
}
