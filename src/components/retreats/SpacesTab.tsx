import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Presentation, Plus, Check, X, Pencil, Trash2, ClipboardList, ArrowRight,
  Users, Clock, AlertTriangle, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useRetreatStore } from '@/store/retreatStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import { dbDeleteSpaceRequest, dbMarkSpacesRead, dbPostSpaceMessage } from '@/lib/retreatsDb';
import { MessageThread, type ThreadMessage } from '@/components/shared/MessageThread';
import { LAYOUT_LABELS, type IssueStatus, type RetreatSpaceRequest } from '@/lib/types';
import { Badge, fmtDateFull, type BadgeTone } from './retreatUi';
import { SpaceRequestModal } from './SpaceRequestModal';
import { ApproveSpaceModal } from './ApproveSpaceModal';

/**
 * The seam, from the camp's side.
 *
 * A rental group asks for a room; somebody has to carry the benches. Every other tab in this
 * module is about the booking — this one is where the booking becomes work, and it is the
 * reason property management and rentals belong in one product rather than two.
 *
 * One row per room, because that is now what the group is asked for: which rooms do you need
 * set up when you arrive, and is there anything we should know. Rooms are held for the whole
 * stay, so the day grouping this used to have said nothing a reader did not already know. A
 * request filed under the old per-day form keeps showing its span.
 *
 * The thread at the bottom is where an answer goes. An approval used to be a status the group
 * could only respond to by ringing the camp.
 */

const STATUS_TONE: Record<RetreatSpaceRequest['status'], BadgeTone> = {
  requested: 'blue',
  approved: 'ok',
  declined: 'alert',
  countered: 'warn',
};
const STATUS_LABEL: Record<RetreatSpaceRequest['status'], string> = {
  requested: 'Awaiting your answer',
  approved: 'Approved',
  declined: 'Declined',
  countered: 'Needs re-approval',
};

export function SpacesTab({ retreatId }: { retreatId?: string }) {
  // Raw slices, derived below. A selector that allocates a new array on every render
  // infinite-loops under React 19 + zustand v5, and this file's siblings have been bitten
  // by exactly that before.
  const spaceRequests = useRetreatStore((s) => s.spaceRequests);
  const setSpaceRequests = useRetreatStore((s) => s.setSpaceRequests);
  const spaceMessages = useRetreatStore((s) => s.spaceMessages);
  const selectedRetreat = useRetreatStore((s) => s.selectedRetreat);
  const retreatById = useRetreatStore((s) => s.retreatById);
  const locations = useLocationStore((s) => s.locations);
  const issues = useIssuesStore((s) => s.issues);
  const selectIssue = useIssuesStore((s) => s.selectIssue);
  const deleteIssue = useIssuesStore((s) => s.deleteIssue);

  /** The set-up and strike this ask produced. */
  const jobsFor = (requestId: string) => issues.filter((i) => i.retreatSpaceRequestId === requestId);
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');
  const [sending, setSending] = useState(false);

  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; mode: 'approve' | 'decline' } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<RetreatSpaceRequest | null>(null);
  const [alsoJobs, setAlsoJobs] = useState(true);

  const retreat = retreatId ? retreatById(retreatId) : selectedRetreat();
  const rid = retreat?.id ?? null;

  const requests = useMemo(
    () => (rid ? spaceRequests.filter((r) => r.retreatId === rid) : []),
    [spaceRequests, rid],
  );

  const sorted = useMemo(
    () => [...requests].sort((a, b) => a.dayDate.localeCompare(b.dayDate)),
    [requests],
  );

  const thread = useMemo(
    () => (rid ? spaceMessages.filter((m) => m.retreatId === rid) : []),
    [spaceMessages, rid],
  );
  const readAt = retreat?.spacesCampReadAt ?? null;
  const unread = useMemo(
    () => thread.filter((m) => m.authorKind === 'group'
      && (!readAt || m.createdAt > readAt)).length,
    [thread, readAt],
  );

  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const issueById = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);

  const threadMessages: ThreadMessage[] = useMemo(() => thread.map((m) => ({
    id: m.id,
    authorKind: m.authorKind,
    authorName: m.authorName,
    body: m.body,
    subject: m.kind === 'status' ? null : (m.locationId ? locById.get(m.locationId)?.name ?? null : null),
    createdAt: m.createdAt,
    unread: m.authorKind === 'group' && (!readAt || m.createdAt > readAt),
  })), [thread, locById, readAt]);

  // Read on the way OUT, not on the way in. Clearing the mark while someone is still looking at
  // the tab takes the highlight off the messages they came to read, mid-read.
  const unreadRef = useRef(0);
  useEffect(() => { unreadRef.current = unread; }, [unread]);
  useEffect(() => () => { if (rid && unreadRef.current > 0) void dbMarkSpacesRead(rid); }, [rid]);

  const pending = requests.filter((r) => r.status === 'requested' || r.status === 'countered').length;
  const needsYou = pending + unread;

  if (!retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Presentation className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreat selected</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Open a retreat to see the rooms it has asked for.
          </p>
        </div>
      </div>
    );
  }

  async function post(body: string) {
    if (!rid) return;
    setSending(true);
    await dbPostSpaceMessage(rid, body, null, currentUser.name || null);
    setSending(false);
  }

  async function remove(id: string, alsoJobs: boolean) {
    if (alsoJobs) {
      // issues.retreat_space_request_id is ON DELETE SET NULL, so the set-up and the strike
      // outlive the ask unless they are taken with it — leaving the crew a job for a session
      // that no longer exists.
      jobsFor(id).forEach((i) => deleteIssue(i.id));
    }
    setSpaceRequests(spaceRequests.filter((r) => r.id !== id));
    await dbDeleteSpaceRequest(id);
    setConfirmingDelete(null);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6 space-y-4">
      <div className={`rounded-card border px-5 py-4 ${needsYou > 0 ? 'bg-amber-bg border-amber/30' : 'bg-sage-pale border-sage/40'}`}>
        <p className={`text-[13px] font-semibold mb-1 ${needsYou > 0 ? 'text-amber-text' : 'text-forest'}`}>
          {[
            pending > 0 ? `${pending} space request${pending === 1 ? '' : 's'} waiting on you` : null,
            unread > 0 ? `${unread} new message${unread === 1 ? '' : 's'} from the group` : null,
          ].filter(Boolean).join(' · ')
            || (requests.length === 0 ? 'No spaces requested yet' : 'Every request has an answer')}
        </p>
        <p className={`text-[12px] leading-relaxed ${needsYou > 0 ? 'text-amber-text' : 'text-forest/80'}`}>
          Approving writes a set-up and a strike, carrying the group's note to the crew verbatim.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[14px] font-semibold text-forest">
          Meeting spaces · {retreat.groupName}
        </h3>
        {canManage && (
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5" /> Log a request
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-card border border-border px-5 py-8 text-center">
          <Presentation className="w-7 h-7 text-ink-faint mx-auto mb-2.5" />
          <p className="text-[13px] text-ink-soft max-w-md mx-auto leading-relaxed">
            No rooms picked yet. The group ticks what they need in their portal, or you can log
            it here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
                  const loc = locById.get(r.locationId);
                  const building = loc?.parentId ? locById.get(loc.parentId)?.name ?? null : null;
                  const cap = loc?.capacitySeated ?? null;
                  const over = cap != null && r.expectedCount != null && r.expectedCount > cap;
                  const time = [r.startLabel, r.endLabel].filter(Boolean).join(' – ');
                  const setup = r.workOrderId ? issueById.get(r.workOrderId) ?? null : null;
                  const strike = r.strikeOrderId ? issueById.get(r.strikeOrderId) ?? null : null;

                  return (
                    <div key={r.id} className="bg-white rounded-card border border-border px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-forest">
                            {loc?.name ?? 'Space'}
                            {building && <span className="font-normal text-ink-soft"> · {building}</span>}
                          </p>
                          {/* When they have it. The whole stay for anything picked in the
                              portal now; a per-day ask filed under the old form keeps its span. */}
                          <p className="text-[12px] text-ink-soft mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {r.endDate > r.dayDate
                                ? `${fmtDateFull(r.dayDate)} – ${fmtDateFull(r.endDate)}`
                                : fmtDateFull(r.dayDate)}
                              {time && ` · ${time}`}
                            </span>
                            {r.expectedCount != null && (
                              <span className={`inline-flex items-center gap-1 ${over ? 'text-amber-text font-semibold' : ''}`}>
                                <Users className="w-3.5 h-3.5" />{r.expectedCount}{cap != null && `/${cap} seated`}
                              </span>
                            )}
                            {/* Asked for by a form the portal no longer shows. Null means the
                                group was never asked, so printing a layout would invent one. */}
                            {r.layout && (
                              <span>{r.layout === 'other' ? (r.layoutOther || 'Custom layout') : LAYOUT_LABELS[r.layout]}</span>
                            )}
                          </p>
                          {r.purpose && <p className="text-[12.5px] text-ink mt-1">{r.purpose}</p>}
                        </div>
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </div>

                      {/* The group's sentence, marked as theirs. The camp adds beside it below. */}
                      {r.setupNotes && (
                        <p className="text-[12.5px] text-ink mt-2 pl-3 border-l-2 border-sage/60 italic leading-relaxed">
                          {r.setupNotes}
                        </p>
                      )}
                      {r.campNotes && (
                        <p className="text-[12.5px] text-ink-soft mt-1.5 pl-3 border-l-2 border-border leading-relaxed">
                          <span className="font-semibold text-forest">Camp: </span>{r.campNotes}
                        </p>
                      )}

                      {r.status === 'countered' && (
                        <p className="text-[12px] text-amber-text mt-2 inline-flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          Changed after approval. Approve again to update the crew's instructions.
                        </p>
                      )}

                      {r.responseMessage && (
                        <p className="text-[12px] text-ink-soft mt-2">
                          <span className="font-semibold text-forest">Shown in their portal: </span>{r.responseMessage}
                        </p>
                      )}

                      {(setup || strike) && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {setup && <WorkOrderChip label="Set-up" id={setup.id} title={setup.title} status={setup.status} onOpen={selectIssue} />}
                          {strike && <WorkOrderChip label="Strike" id={strike.id} title={strike.title} status={strike.status} onOpen={selectIssue} />}
                        </div>
                      )}

                      {/* ── Both answers, always ──
                          Declining used to remove the Decline button, so a request the camp had
                          already turned down showed nothing but a green "Review and approve" --
                          it read as still waiting, and there was no way back to the wording the
                          group had been given. Neither answer disappears now; the labels carry
                          the state instead. */}
                      {canManage && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-cream-dark">
                          <Button
                            size="sm"
                            variant={r.status === 'requested' || r.status === 'countered' ? 'primary' : 'ghost'}
                            onClick={() => setDeciding({ id: r.id, mode: 'approve' })}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {r.status === 'approved' ? 'Re-approve'
                              : r.status === 'declined' ? 'Approve instead'
                              : 'Review and approve'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeciding({ id: r.id, mode: 'decline' })}>
                            <X className="w-3.5 h-3.5" />
                            {r.status === 'declined' ? 'Edit the decline' : 'Decline'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ id: r.id })}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirmingDelete(r); setAlsoJobs(true); }}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
            );
          })}
        </div>
      )}

      {/* ── The conversation ──
          An approval was a status the group could only answer by ringing the camp. */}
      <div className="bg-white rounded-card border border-border px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-forest" />
          <p className="text-[14px] font-semibold text-forest">Messages with {retreat.groupName}</p>
          {unread > 0 && (
            <span className="text-[10.5px] font-bold text-white bg-amber rounded-full px-2 py-0.5">
              {unread} new
            </span>
          )}
        </div>
        <p className="text-[12px] text-ink-soft mb-3">
          The group reads this in their portal. Approvals and declines land here too.
        </p>
        <MessageThread
          messages={threadMessages}
          mine="camp"
          onSend={post}
          busy={sending}
          disabled={!canManage}
          otherPartyName={retreat.coordinatorName || retreat.groupName}
          emptyMessage="No messages yet."
        />
      </div>


      {editing && (
        <SpaceRequestModal
          retreatId={retreat.id}
          requestId={editing.id}
          onClose={() => setEditing(null)}
        />
      )}
      {deciding && (
        <ApproveSpaceModal
          requestId={deciding.id}
          mode={deciding.mode}
          onClose={() => setDeciding(null)}
        />
      )}

      {confirmingDelete && (() => {
        const jobs = jobsFor(confirmingDelete.id);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmingDelete(null); }}
          >
            <div className="bg-white rounded-modal shadow-xl w-full max-w-md p-5">
              <h3 className="text-[15px] font-semibold text-forest">
                Delete this request?
              </h3>
              <p className="text-[13px] text-ink-soft mt-1.5">
                {locById.get(confirmingDelete.locationId)?.name ?? 'This space'} on {fmtDateFull(confirmingDelete.dayDate)}.
                The group will see it disappear from their portal.
              </p>

              {jobs.length > 0 && (
                <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoJobs}
                    onChange={(e) => setAlsoJobs(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-[13px] text-ink">
                    Also delete the {jobs.length} work order{jobs.length === 1 ? '' : 's'} it created
                    <span className="block text-[12px] text-ink-soft mt-0.5">
                      The set-up and the strike. Unticked, they stay on the crew's board for a
                      session that is no longer happening.
                    </span>
                  </span>
                </label>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmingDelete(null)}>Cancel</Button>
                <Button variant="danger" onClick={() => remove(confirmingDelete.id, alsoJobs)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function WorkOrderChip({
  label, id, title, status, onOpen,
}: {
  label: string;
  id: string;
  title: string;
  status: IssueStatus;
  onOpen: (id: string) => void;
}) {
  return (
    <Link
      to="/campground"
      onClick={() => onOpen(id)}
      title={title}
      className="inline-flex items-center gap-1.5 text-[11.5px] bg-cream border border-border rounded-pill px-2.5 py-1 text-forest hover:border-sage transition-colors max-w-full"
    >
      <ClipboardList className="w-3.5 h-3.5 flex-shrink-0 text-sage" />
      <span className="font-semibold">{label}</span>
      <StatusBadge status={status} />
      <ArrowRight className="w-3 h-3 flex-shrink-0 text-ink-faint" />
    </Link>
  );
}
