import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Presentation, Loader2, AlertTriangle, Check, Accessibility, Users, Lock, MessageSquare, Send } from 'lucide-react';
import {
  supabasePublic, cardClass, btnPrimary, type PortalRetreat,
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
 * Picking is a DRAFT until it is submitted. Every tick used to be its own request the instant it
 * was made, and every note saved itself on a timer -- so a coordinator working through the list
 * sent the camp a room they were still thinking about, then an empty note, then a half-typed
 * one, and the crew watched requests appear and vanish. Now nothing leaves this page until they
 * say they are done.
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

/** A note is the same note whether it is null, empty, or three spaces. */
const cleanNote = (v: string | null | undefined) => (v ?? '').trim();

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
  token, retreat, onChanged, liveTick = 0,
}: {
  token: string;
  retreat: PortalRetreat;
  /** Called after any successful change, so the portal can refresh its checklist. */
  onChanged?: () => void | Promise<void>;
  /** Bumped when the camp touches this booking. See `usePortalLiveUpdates`. */
  liveTick?: number;
}) {
  const [spaces, setSpaces] = useState<ProgramSpace[]>([]);
  const [requests, setRequests] = useState<SpaceRequestRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [campName, setCampName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cleared by the next edit: a receipt that stays up forever stops meaning anything. */
  const [sent, setSent] = useState(false);
  /** Submitting is one-way, so it asks once rather than acting on the first click. */
  const [confirming, setConfirming] = useState(false);

  // ── The draft ──────────────────────────────────────────────────────────────
  // What the group has ticked and typed but not yet sent. Seeded from the server on every load,
  // which is also how Submit resets it.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});

  const today = new Date().toISOString().slice(0, 10);
  const departed = retreat.departure_date < today;
  const editable = !departed;

  const seedDraft = useCallback((rows: SpaceRequestRow[]) => {
    setPicked(new Set(rows.map((r) => r.location_id)));
    setNotes(Object.fromEntries(rows.map((r) => [r.location_id, r.setup_notes ?? ''])));
  }, []);

  const load = useCallback(async () => {
    const res = await fetchAll(token);
    if (!res) { setError(LOAD_ERROR); setLoading(false); return; }
    setSpaces(res.spaces);
    setRequests(res.requests);
    setMessages(res.messages);
    setUnread(res.unread);
    setCampName(res.campName);
    seedDraft(res.requests);
    setError(null);
    setLoading(false);
  }, [token, seedDraft]);

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
      setPicked(new Set(res.requests.map((r) => r.location_id)));
      setNotes(Object.fromEntries(res.requests.map((r) => [r.location_id, r.setup_notes ?? ''])));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [token]);

  // The camp replied, approved or declined. Reload this section's own slice -- the page-level
  // payload only carries the unread COUNT, not the messages themselves.
  useEffect(() => {
    if (liveTick === 0) return;
    void load();
  }, [liveTick, load]);

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

  /**
   * What Submit would send: rooms picked that the camp does not already have.
   *
   * Only additions, ever. A sent request is final here — the camp approves it, writes a set-up
   * work order off the note and gives it to a crew, and a group quietly editing that note
   * afterwards means the room gets laid out to instructions nobody read. Changing or cancelling
   * one is a conversation, and the thread for it is on this page.
   */
  const pending = useMemo(
    () => [...picked].filter((id) => !requestByLocation.has(id)),
    [picked, requestByLocation],
  );

  const dirty = pending.length > 0;

  // The old version wrote every keystroke on a 700ms timer, so closing the tab mid-sentence still
  // saved it. An explicit Submit gives that up, so the browser has to do the asking instead.
  useEffect(() => {
    if (!dirty || !editable) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, editable]);

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

  function toggle(space: ProgramSpace) {
    if (requestByLocation.has(space.id)) return;   // already with the camp, not ours to undo
    setConfirming(false);
    setSent(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(space.id)) next.delete(space.id);
      else next.add(space.id);
      return next;
    });
  }

  function noteChanged(locationId: string, value: string) {
    if (requestByLocation.has(locationId)) return;
    setConfirming(false);
    setSent(false);
    setNotes((n) => ({ ...n, [locationId]: value }));
  }

  /**
   * Send the picked rooms. Stops at the first failure with the server's own sentence, and leaves
   * the draft alone so nothing typed is lost.
   */
  async function submit() {
    setSubmitting(true); setError(null);
    try {
      for (const id of pending) {
        const { error: err } = await supabasePublic.rpc('portal_save_space_request',
          { p_token: token, p_location_id: id, p_note: cleanNote(notes[id]) || null });
        if (err) { setError(err.message || 'Could not send that space.'); return; }
      }
      await load();
      await onChanged?.();
      setConfirming(false);
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

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

  const sentCount = requests.length;

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
          Pick everything you need and add a note if there is anything we should know, then send
          it to us — sending is final, so take your time. The camp has these ready for your whole
          stay and puts them back afterwards; you don't need to tell us times.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
          {spaces.map((s) => {
            const req = requestByLocation.get(s.id);
            const on = picked.has(s.id);
            // Three states: with the camp and settled, ticked but not sent, and untouched.
            const locked = !!req;
            const unsent = on && !locked;
            return (
              <div
                key={s.id}
                className={`rounded-xl border transition-colors ${
                  locked ? 'border-sage/60 bg-sage-pale/25'
                    : on ? 'border-sage bg-sage-pale/40' : 'border-border bg-white'
                }`}
              >
                <button
                  type="button"
                  disabled={!editable || submitting || locked}
                  onClick={() => toggle(s)}
                  title={locked ? 'Already sent to the camp. Message them below to change it.' : undefined}
                  className="w-full text-left px-3.5 py-3 flex items-start gap-2.5 disabled:cursor-default"
                >
                  <span className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 ${
                    on || locked ? 'bg-forest border-forest' : 'bg-white border-border'
                  }`}>
                    {(on || locked) && <Check className="w-3 h-3 text-white" />}
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
                  {unsent ? (
                    <span className="flex-shrink-0 text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-cream-dark text-ink-soft">
                      Not sent yet
                    </span>
                  ) : req ? (
                    <span className={`flex-shrink-0 text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${STATUS_COPY[req.status].cls}`}>
                      {STATUS_COPY[req.status].label}
                    </span>
                  ) : null}
                </button>

                {/* The one thing we do ask for, and the one thing the crew actually reads.
                    Once it is sent it stops being an input: the crew is working off these words,
                    and a box you can still type in says they can be changed. */}
                {locked && cleanNote(req.setup_notes) !== '' && (
                  <div className="px-3.5 pb-3">
                    <p className="border-l-2 border-sage/50 pl-2.5 text-[12.5px] leading-relaxed text-ink-soft whitespace-pre-wrap">
                      {req.setup_notes}
                    </p>
                  </div>
                )}
                {!locked && on && (
                  <div className="px-3.5 pb-3">
                    <textarea
                      value={notes[s.id] ?? ''}
                      onChange={(e) => noteChanged(s.id, e.target.value)}
                      disabled={!editable || submitting}
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

        {/* ── Send it ──
            Ticking a box used to BE the request, and the note saved itself on a timer. The camp
            watched rooms appear and disappear as a coordinator made up their mind, and the crew
            got half-typed instructions.

            Sending is one way. The camp approves a room and raises a set-up work order off the
            note; a group editing that note a week later means a room laid out to instructions
            nobody read. So it says so before, and locks after. */}
        {editable && (
          <div className="mt-4 border-t border-border pt-3.5">
            {dirty && !confirming && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-bg/60 border border-amber/30 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-text">
                <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Once you send these they are locked in. If you need to swap a room, change a
                  note or cancel one, message the camp below and they will sort it out.
                </span>
              </p>
            )}

            {confirming ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12.5px] text-ink">
                  Send {pending.length} space{pending.length === 1 ? '' : 's'} to the camp?
                  <span className="text-ink-soft"> You won't be able to change {pending.length === 1 ? 'it' : 'them'} here afterwards.</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={submitting}
                    className="text-[13px] font-semibold text-ink-soft hover:text-forest px-3 py-2.5"
                  >
                    Not yet
                  </button>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting}
                    className={`${btnPrimary} text-[13px] px-4 py-2.5`}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? 'Sending…' : pending.length === 1 ? 'Yes, send it' : 'Yes, send them'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12.5px] text-ink-soft">
                  {sent
                    ? <span className="font-semibold text-green-muted-text">Sent to the camp. They'll reply below.</span>
                    : sentCount === 0
                      ? "Nothing sent yet. If you don't need a meeting space, you can leave this."
                      : `${sentCount} space${sentCount === 1 ? '' : 's'} with the camp. Message them below to change one.`}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!dirty}
                  className={`${btnPrimary} text-[13px] px-4 py-2.5`}
                >
                  <Send className="w-4 h-4" />
                  {dirty
                    ? `Submit ${pending.length} space${pending.length === 1 ? '' : 's'}`
                    : 'Submit spaces'}
                </button>
              </div>
            )}
          </div>
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
