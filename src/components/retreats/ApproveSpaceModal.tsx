import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Wrench, Users, BedDouble, CalendarClock, Loader2, ClipboardList, ArrowRight,
} from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useIssuesStore } from '@/store/issuesStore';
import {
  fetchSpaceRequestConflicts, dbApproveSpaceRequest, dbDeclineSpaceRequest,
} from '@/lib/retreatsDb';
import { LAYOUT_LABELS, type SpaceRequestConflicts } from '@/lib/types';
import { fmtDateFull, inputClass, labelClass } from './retreatUi';
import { useCampStore } from '@/store/campStore';
import { useLocationStore } from '@/store/locationStore';
import { sendEmail } from '@/lib/email';
import { spaceDecisionHtml } from './spaceDecisionEmail';

/**
 * Saying yes, with everything that makes it a real decision on the same screen.
 *
 * Approval is a judgement call. Some camps genuinely do run two groups through the Lodge on
 * the same afternoon, and some lodges are a dormitory on Friday and a lecture hall on
 * Saturday. So this surfaces the collision and lets a person decide — everything here is a
 * warning except one: a space that is out of service cannot be approved at all, because the
 * database refuses it too and a button that fails on click is worse than one that is disabled.
 *
 * On approval, TWO work orders exist: set-up and strike. Camps forget the strike every time,
 * and a rental turnover is set-up plus tear-down without exception, so the success screen says
 * so out loud and links to both.
 */
export function ApproveSpaceModal({
  requestId, mode = 'approve', onClose,
}: {
  requestId: string;
  mode?: 'approve' | 'decline';
  onClose: () => void;
}) {
  const spaceRequests = useRetreatStore((s) => s.spaceRequests);
  const setSpaceRequests = useRetreatStore((s) => s.setSpaceRequests);
  const retreatById = useRetreatStore((s) => s.retreatById);
  const selectIssue = useIssuesStore((s) => s.selectIssue);
  const portalUrl = useRetreatStore((s) => s.portalUrl);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const locations = useLocationStore((s) => s.locations);

  const request = useMemo(
    () => spaceRequests.find((r) => r.id === requestId) ?? null,
    [spaceRequests, requestId],
  );
  const retreat = request ? retreatById(request.retreatId) : null;
  const spaceName = locations.find((l) => l.id === request?.locationId)?.name ?? 'the space';

  const [conflicts, setConflicts] = useState<SpaceRequestConflicts | null>(null);
  const [checking, setChecking] = useState(true);
  const [campNotes, setCampNotes] = useState(request?.campNotes ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ setupId: string; strikeId: string | null } | null>(null);
  /**
   * Whether the group hears about this.
   *
   * A decline needs saying: they planned around a room they are not getting. An approval is
   * usually one of a dozen and lands in their portal anyway, so it defaults off rather than
   * filling an inbox with "yes".
   */
  const [tellGroup, setTellGroup] = useState(mode === 'decline');
  const [emailNote, setEmailNote] = useState<string | null>(null);


  // Conflicts are fetched FIRST, before any of the decision UI is usable. The whole point is
  // that the collision is on screen at the moment of deciding, not discoverable afterwards.
  useEffect(() => {
    let live = true;
    (async () => {
      const c = await fetchSpaceRequestConflicts(requestId);
      if (!live) return;
      setConflicts(c);
      setChecking(false);
    })();
    return () => { live = false; };
  }, [requestId]);

  if (!request) {
    return (
      <Modal title="Space request" onClose={onClose} width="560px">
        <p className="text-[13px] text-ink-soft">This request could not be found. It may have been withdrawn.</p>
        <div className="flex justify-end mt-4"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </Modal>
    );
  }

  const blocked = conflicts?.outOfService === true;


  async function notifyGroup(outcome: 'approved' | 'declined') {
    if (!request) return;
    const to = retreat?.coordinatorEmail?.trim();
    if (!to) { setEmailNote('No coordinator email on file, so nothing was sent.'); return; }
    const res = await sendEmail({
      to,
      subject: outcome === 'approved'
        ? `${spaceName} is confirmed for ${retreat?.groupName ?? 'your stay'}`
        : `About your request for ${spaceName}`,
      html: spaceDecisionHtml({
        outcome, spaceName, campName: currentCamp?.name ?? 'the camp',
        groupName: retreat?.groupName ?? 'your group',
        when: request.endDate > request.dayDate
          ? `${fmtDateFull(request.dayDate)} – ${fmtDateFull(request.endDate)}`
          : fmtDateFull(request.dayDate),
        message: message.trim(),
        portalUrl: retreat ? portalUrl(retreat) : '',
      }),
      fromName: currentCamp?.name,
    });
    setEmailNote(res.ok ? `Emailed ${to}.` : `Saved, but the email did not go: ${res.error}`);
  }

  async function approve() {
    if (blocked) return;
    setBusy(true); setError(null);
    const res = await dbApproveSpaceRequest(requestId, campNotes.trim() || null, message.trim() || null);
    setBusy(false);
    if (typeof res === 'string') { setError(res); return; }
    if (tellGroup) await notifyGroup('approved');
    setCreated(res);
    setSpaceRequests(spaceRequests.map((r) => (r.id === requestId ? {
      ...r, status: 'approved' as const, campNotes: campNotes.trim() || r.campNotes,
      responseMessage: message.trim() || r.responseMessage,
      respondedAt: new Date().toISOString(),
      workOrderId: res.setupId, strikeOrderId: res.strikeId ?? r.strikeOrderId,
    } : r)));
  }

  async function decline() {
    setBusy(true); setError(null);
    await dbDeclineSpaceRequest(requestId, message.trim() || null);
    if (tellGroup) await notifyGroup('declined');
    setBusy(false);
    setSpaceRequests(spaceRequests.map((r) => (r.id === requestId ? {
      ...r, status: 'declined' as const, responseMessage: message.trim() || null,
      respondedAt: new Date().toISOString(),
    } : r)));
    onClose();
  }

  // ── Approved. Say what was created, because "Saved" teaches nobody anything.
  if (created) {
    return (
      <Modal title="Approved" onClose={onClose} width="560px">
        <div className="space-y-4">
          <div className="bg-green-muted-bg border border-sage/40 rounded-card px-4 py-3">
            <p className="text-[13px] font-semibold text-green-muted-text">
              {created.strikeId ? 'Two work orders are now in the queue.' : 'The set-up is now in the queue.'}
            </p>
            <p className="text-[12.5px] text-green-muted-text/90 leading-relaxed mt-1">
              {created.strikeId
                ? 'A set-up before, and a strike after.'
                : 'This space already has an open strike for this group, so no second tear-down was created. One reset per space per stay, not one per session.'}
            </p>
          </div>

          <div className="space-y-2">
            <WorkOrderLink id={created.setupId} label="Set-up" onOpen={selectIssue} />
            {created.strikeId && <WorkOrderLink id={created.strikeId} label="Strike / reset" onOpen={selectIssue} />}
          </div>

          <p className="text-[11.5px] text-ink-faint leading-relaxed">
            Both carry the group's set-up notes, word for word.
          </p>

          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  const time = [request.startLabel, request.endLabel].filter(Boolean).join(' – ');

  return (
    <Modal title={mode === 'decline' ? 'Decline space request' : 'Approve space request'} onClose={onClose} width="560px">
      <div className="space-y-4">
        {/* ── The ask ── */}
        <div className="bg-cream border border-border rounded-card px-4 py-3">
          <p className="text-[13.5px] font-semibold text-forest">
            {retreat?.groupName ?? 'Group'} · {request.endDate > request.dayDate
              ? `${fmtDateFull(request.dayDate)} – ${fmtDateFull(request.endDate)}`
              : fmtDateFull(request.dayDate)}
          </p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            {time && `${time} · `}
            {request.layout === 'other' ? (request.layoutOther || 'Custom layout') : LAYOUT_LABELS[request.layout]}
            {request.expectedCount != null && ` · ${request.expectedCount} people`}
          </p>
          {request.purpose && <p className="text-[12.5px] text-ink mt-1.5">{request.purpose}</p>}
          {request.setupNotes && (
            <p className="text-[12.5px] text-ink mt-2 pl-3 border-l-2 border-sage/60 italic leading-relaxed">
              {request.setupNotes}
            </p>
          )}
        </div>

        {/* ── What saying yes runs into ── */}
        {checking ? (
          <p className="text-[12.5px] text-ink-soft inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking this space for those dates…
          </p>
        ) : (
          <ConflictPanel conflicts={conflicts} expectedCount={request.expectedCount} />
        )}

        {/* ── The camp's own notes, beside the group's words ── */}
        <div>
          <label className={labelClass}>Camp notes for the crew</label>
          <textarea
            value={campNotes} onChange={(e) => setCampNotes(e.target.value)} rows={2}
            className={`${inputClass} resize-y`}
            placeholder="Chairs are stacked in the back closet. Leave the piano where it is."
          />
          <p className="text-[11px] text-ink-faint mt-1">
            Added <em>beside</em> the group's words on the work order, never over them.
          </p>
        </div>

        <div>
          <label className={labelClass}>Message to the group</label>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
            className={`${inputClass} resize-y`}
            placeholder={mode === 'decline' ? 'Why this one can\'t happen, and what could instead…' : 'Anything they should know…'}
          />
          <p className="text-[11px] text-ink-faint mt-1">Shown in their portal against this request.</p>

          <label className="flex items-start gap-2 mt-2.5 cursor-pointer">
            <input
              type="checkbox" checked={tellGroup}
              onChange={(e) => setTellGroup(e.target.checked)}
              className="mt-0.5 accent-forest"
            />
            <span className="text-[12.5px] text-ink">
              Email this to {retreat?.coordinatorName || 'the group'}
              <span className="block text-[11px] text-ink-soft mt-0.5">
                {mode === 'decline'
                  ? 'They planned around this room, so they should hear it rather than find it.'
                  : 'It is already in their portal; tick this if it is worth an email too.'}
              </span>
            </span>
          </label>
          {emailNote && <p className="text-[11.5px] text-ink-soft mt-1.5">{emailNote}</p>}
        </div>

        {error && (
          <div className="flex items-start gap-2.5 bg-red-bg border border-red/30 rounded-card px-3.5 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-red">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {mode !== 'decline' && (
            <Button
              onClick={approve}
              disabled={busy || checking || blocked}
              className="flex-1 justify-center"
              title={blocked ? 'This space is out of service' : undefined}
            >
              {busy ? 'Approving…' : 'Approve and create the work'}
            </Button>
          )}
          <Button variant={mode === 'decline' ? 'danger' : 'ghost'} onClick={decline} disabled={busy}>
            Decline
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>

        {blocked && (
          <p className="text-[11.5px] text-red">
            The space is out of service. Everything else above is a warning you can override.
          </p>
        )}
      </div>
    </Modal>
  );
}

function WorkOrderLink({ id, label, onOpen }: { id: string; label: string; onOpen: (id: string) => void }) {
  const issues = useIssuesStore((s) => s.issues);
  const issue = useMemo(() => issues.find((i) => i.id === id) ?? null, [issues, id]);
  return (
    <Link
      to="/campground"
      onClick={() => onOpen(id)}
      className="flex items-center gap-2.5 bg-white border border-border rounded-card px-3.5 py-2.5 hover:border-sage transition-colors"
    >
      <ClipboardList className="w-4 h-4 text-sage flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">{label}</p>
        <p className="text-[13px] text-forest truncate">{issue?.title ?? 'Open in Campground'}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
    </Link>
  );
}

// ─── Conflicts ────────────────────────────────────────────────────────────────
function Row({ tone, icon, children }: {
  tone: 'stop' | 'warn' | 'ok';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = tone === 'stop' ? 'bg-red-bg border-red/30 text-red'
    : tone === 'warn' ? 'bg-amber-bg border-amber/30 text-amber-text'
    : 'bg-green-muted-bg border-sage/40 text-green-muted-text';
  return (
    <div className={`flex items-start gap-2.5 border rounded-card px-3.5 py-2.5 ${cls}`}>
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <p className="text-[12.5px] leading-relaxed">{children}</p>
    </div>
  );
}

function ConflictPanel({ conflicts, expectedCount }: {
  conflicts: SpaceRequestConflicts | null;
  expectedCount: number | null;
}) {
  if (!conflicts) {
    return (
      <Row tone="warn" icon={<AlertTriangle className="w-4 h-4" />}>
        We couldn't check this space for clashes. Approving still works, but look at the day
        yourself first.
      </Row>
    );
  }

  const rows: React.ReactNode[] = [];

  if (conflicts.outOfService) {
    rows.push(
      <Row key="oos" tone="stop" icon={<Wrench className="w-4 h-4" />}>
        <strong>Out of service.</strong>{' '}
        {conflicts.outOfServiceReason ?? 'No reason recorded.'}
        {conflicts.expectedBack && ` Expected back ${fmtDateFull(conflicts.expectedBack)}.`}
        {' '}Put it back in service before you promise it to a group.
      </Row>,
    );
  }

  if (conflicts.doubleBooked.length > 0) {
    rows.push(
      <Row key="dbl" tone="warn" icon={<CalendarClock className="w-4 h-4" />}>
        <strong>Already promised that day.</strong>{' '}
        {conflicts.doubleBooked.map((d, i) => (
          <span key={i}>
            {i > 0 && '; '}
            {d.retreat}
            {d.start ? ` (${d.start})` : ''}
            {d.purpose ? ` — ${d.purpose}` : ''}
          </span>
        ))}
        . Two groups through one room in a day can work if the times don't collide — that call
        is yours.
      </Row>,
    );
  }

  if (conflicts.alsoADorm) {
    rows.push(
      <Row key="dorm" tone="warn" icon={<BedDouble className="w-4 h-4" />}>
        <strong>This room also sleeps people.</strong>{' '}
        {conflicts.housedThatNight.length > 0
          ? `${conflicts.housedThatNight.join(', ')} ${conflicts.housedThatNight.length === 1 ? 'is' : 'are'} housed here that night, so the crew will be setting up around their bags.`
          : 'Nobody is housed here that night, so it is free to use as a program room.'}
      </Row>,
    );
  }

  if (conflicts.buildingHousingOthers.length > 0) {
    rows.push(
      <Row key="bldg" tone="warn" icon={<Users className="w-4 h-4" />}>
        <strong>Another group is sleeping in this building.</strong>{' '}
        {conflicts.buildingHousingOthers.join(', ')}. Noise and people walking through
        somebody else's corridor is the usual complaint.
      </Row>,
    );
  }

  if (conflicts.overCapacity) {
    rows.push(
      <Row key="cap" tone="warn" icon={<Users className="w-4 h-4" />}>
        <strong>Over the seated capacity.</strong>{' '}
        {expectedCount ?? '?'} people asked for, {conflicts.capacitySeated ?? '?'} seats.
        Fine standing, tight sitting — worth a word with the coordinator either way.
      </Row>,
    );
  }

  if (rows.length === 0) {
    return (
      <Row tone="ok" icon={<CalendarClock className="w-4 h-4" />}>
        Nothing else is booked in this space then, and nobody is sleeping in it.
      </Row>
    );
  }

  return <div className="space-y-2">{rows}</div>;
}
