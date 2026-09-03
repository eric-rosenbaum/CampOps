import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Presentation, Plus, Check, X, Pencil, Trash2, ClipboardList, ArrowRight,
  Users, Clock, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useRetreatStore } from '@/store/retreatStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useLocationStore } from '@/store/locationStore';
import { useAuth } from '@/lib/auth';
import { dbDeleteSpaceRequest } from '@/lib/retreatsDb';
import { LAYOUT_LABELS, type IssueStatus, type RetreatSpaceRequest } from '@/lib/types';
import { Badge, fmtDateFull, type BadgeTone } from './retreatUi';
import { SpaceRequestModal } from './SpaceRequestModal';
import { ApproveSpaceModal } from './ApproveSpaceModal';
import { TurnoverCard } from './TurnoverCard';

/**
 * The seam, from the camp's side.
 *
 * A rental group asks for a room; somebody has to carry the benches. Every other tab in this
 * module is about the booking — this one is where the booking becomes work, and it is the
 * reason property management and rentals belong in one product rather than two.
 *
 * Grouped by day, because that is how a crew works: Saturday's list, not "the Adams group's
 * list". A request that has been approved shows the work orders it produced, so the link
 * between the ask and the job is visible from both ends.
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
  const selectedRetreat = useRetreatStore((s) => s.selectedRetreat);
  const retreatById = useRetreatStore((s) => s.retreatById);
  const locations = useLocationStore((s) => s.locations);
  const issues = useIssuesStore((s) => s.issues);
  const selectIssue = useIssuesStore((s) => s.selectIssue);
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; mode: 'approve' | 'decline' } | null>(null);

  const retreat = retreatId ? retreatById(retreatId) : selectedRetreat();
  const rid = retreat?.id ?? null;

  const requests = useMemo(
    () => (rid ? spaceRequests.filter((r) => r.retreatId === rid) : []),
    [spaceRequests, rid],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, RetreatSpaceRequest[]>();
    for (const r of requests) (m.get(r.dayDate) ?? m.set(r.dayDate, []).get(r.dayDate)!).push(r);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [requests]);

  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const issueById = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);

  const pending = requests.filter((r) => r.status === 'requested' || r.status === 'countered').length;

  if (!retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Presentation className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreat selected</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Open a retreat to see which rooms the group has asked for, and turn those asks into
            work for the property team.
          </p>
        </div>
      </div>
    );
  }

  async function remove(id: string) {
    setSpaceRequests(spaceRequests.filter((r) => r.id !== id));
    await dbDeleteSpaceRequest(id);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6 space-y-4">
      <div className={`rounded-card border px-5 py-4 ${pending > 0 ? 'bg-amber-bg border-amber/30' : 'bg-sage-pale border-sage/40'}`}>
        <p className={`text-[13px] font-semibold mb-1 ${pending > 0 ? 'text-amber-text' : 'text-forest'}`}>
          {pending > 0
            ? `${pending} space request${pending === 1 ? '' : 's'} waiting on you`
            : requests.length === 0 ? 'No program spaces requested yet' : 'Every request has an answer'}
        </p>
        <p className={`text-[12px] leading-relaxed ${pending > 0 ? 'text-amber-text' : 'text-forest/80'}`}>
          Approving a request writes two work orders into the housekeeping queue — a set-up
          before the session and a strike after it — carrying the group's own set-up notes
          through to the person doing the work.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[14px] font-semibold text-forest">
          Program spaces · {retreat.groupName}
        </h3>
        {canManage && (
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5" /> Log a request
          </Button>
        )}
      </div>

      {byDay.length === 0 ? (
        <div className="bg-white rounded-card border border-border px-5 py-8 text-center">
          <Presentation className="w-7 h-7 text-ink-faint mx-auto mb-2.5" />
          <p className="text-[13px] text-ink-soft max-w-md mx-auto leading-relaxed">
            This group hasn't asked for any rooms yet. They can choose spaces in their portal,
            or you can log what they told you on the phone — either way it becomes the same
            work order.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, rows]) => (
            <div key={day}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint mb-2">
                {fmtDateFull(day)}
              </p>
              <div className="space-y-2">
                {rows.map((r) => {
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
                          <p className="text-[12px] text-ink-soft mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            {time && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{time}</span>}
                            {r.expectedCount != null && (
                              <span className={`inline-flex items-center gap-1 ${over ? 'text-amber-text font-semibold' : ''}`}>
                                <Users className="w-3.5 h-3.5" />{r.expectedCount}{cap != null && `/${cap} seated`}
                              </span>
                            )}
                            <span>{r.layout === 'other' ? (r.layoutOther || 'Custom layout') : LAYOUT_LABELS[r.layout]}</span>
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
                          This changed after it was approved. The work order has a note on it —
                          approve again to update the crew's instructions.
                        </p>
                      )}

                      {r.responseMessage && (
                        <p className="text-[12px] text-ink-soft mt-2">
                          <span className="font-semibold text-forest">You told them: </span>{r.responseMessage}
                        </p>
                      )}

                      {(setup || strike) && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {setup && <WorkOrderChip label="Set-up" id={setup.id} title={setup.title} status={setup.status} onOpen={selectIssue} />}
                          {strike && <WorkOrderChip label="Strike" id={strike.id} title={strike.title} status={strike.status} onOpen={selectIssue} />}
                        </div>
                      )}

                      {canManage && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-cream-dark">
                          {r.status !== 'approved' && (
                            <Button size="sm" onClick={() => setDeciding({ id: r.id, mode: 'approve' })}>
                              <Check className="w-3.5 h-3.5" /> Review and approve
                            </Button>
                          )}
                          {r.status === 'approved' && (
                            <Button size="sm" variant="ghost" onClick={() => setDeciding({ id: r.id, mode: 'approve' })}>
                              <Check className="w-3.5 h-3.5" /> Re-approve
                            </Button>
                          )}
                          {r.status !== 'declined' && (
                            <Button size="sm" variant="ghost" onClick={() => setDeciding({ id: r.id, mode: 'decline' })}>
                              <X className="w-3.5 h-3.5" /> Decline
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ id: r.id })}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TurnoverCard retreatId={retreat.id} />

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
