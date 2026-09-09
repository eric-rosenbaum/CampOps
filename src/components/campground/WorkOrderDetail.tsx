import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Clock, Phone, Repeat, Undo2, Wrench } from 'lucide-react';
import type { Issue, IssueStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useCampStore } from '@/store/campStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useUIStore } from '@/store/uiStore';
import { useAssetStore } from '@/store/assetStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useCampgroundStore, checklistFor } from '@/store/campgroundStore';
import {
  OPEN_STATUSES, SOURCE_LABELS, STATUS_LABELS, TRADE_PILL, describeCadence, describeMissed,
  isOverdue, tradeLabel,
} from '@/lib/workOrder';
import { Button } from '@/components/shared/Button';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { StatusChip } from './WorkOrderCard';
import { ChecklistPanel } from './ChecklistPanel';
import { CommentComposer } from './CommentComposer';
import { WorkTimeline } from './WorkTimeline';
import { dbUploadPhoto } from '@/lib/db';
import { formatDate, formatDateTime, generateId, relativeDueDate, todayStr } from '@/lib/utils';

/** How long the undo bar stands before the work order is really, quietly, closed. */
const UNDO_MS = 5000;

interface Props {
  issue: Issue;
}

export function WorkOrderDetail({ issue }: Props) {
  const navigate = useNavigate();
  const { currentUser, can } = useAuth();
  const members = useCampStore((s) => s.members);
  const { updateIssue, resolveIssue, reopenIssue, addActivityEntry, deleteIssue } = useIssuesStore();
  const openEditIssueModal = useUIStore((s) => s.openEditIssueModal);
  const assets = useAssetStore((s) => s.assets);
  const setActiveAsset = useAssetStore((s) => s.setActiveAsset);
  const retreats = useRetreatStore((s) => s.retreats);

  // Raw slices; everything derived below with plain functions.
  const vendors = useCampgroundStore((s) => s.vendors);
  const schedules = useCampgroundStore((s) => s.schedules);
  const checklistItems = useCampgroundStore((s) => s.checklistItems);
  const markRead = useCampgroundStore((s) => s.markRead);
  const postComment = useCampgroundStore((s) => s.postComment);
  /** Still on the wire: the row exists locally but the server has not accepted it yet. */
  const isPending = useIssuesStore((s) => !!s.pendingIssues[issue.id]);

  // Every one of these belongs to the work order on screen and to no other, which is why the
  // board mounts this with `key={issue.id}`: switching records throws the component away rather
  // than running a reset pass that would have to remember each new piece of state.
  const [undo, setUndo] = useState<{ prevStatus: IssueStatus } | null>(null);
  const [fixPrompt, setFixPrompt] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [uploadingFix, setUploadingFix] = useState(false);
  const [stepsHighlight, setStepsHighlight] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [minutesInput, setMinutesInput] = useState(
    () => (issue.minutesSpent != null ? String(issue.minutesSpent) : ''),
  );
  const [costInput, setCostInput] = useState(
    () => (issue.actualCost != null ? String(issue.actualCost) : ''),
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const undoTimer = useRef<number | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const fixFileRef = useRef<HTMLInputElement>(null);

  const editable = can('updateIssue');
  const checklist = checklistFor(checklistItems, issue.id);
  const remainingSteps = checklist.filter((i) => !i.isDone).length;
  const author = { id: currentUser.id, name: currentUser.name };

  /**
   * Mark the thread read on open.
   *
   * The dot on the card is only worth anything if it clears when somebody has actually looked,
   * so this runs on opening the record rather than on posting a reply — plenty of messages
   * need reading and no answer.
   */
  useEffect(() => {
    // Not while the work order itself is still queued. A read receipt carries a foreign key to
    // issues, so writing one for a row the server has not accepted yet is a guaranteed 409 —
    // and logging work opens the record immediately, which made that the common path rather
    // than the rare one. There is nothing to mark read on a record created seconds ago; the
    // receipt gets written the next time it is opened.
    if (isPending) return;
    markRead(issue.id, currentUser.id);
  }, [issue.id, currentUser.id, markRead, isPending]);

  // A pending undo belongs to the record that was on screen. Unmounting cancels it rather than
  // letting a timer fire against a work order nobody is looking at any more.
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  function log(action: string) {
    addActivityEntry(issue.id, {
      id: generateId(),
      userId: currentUser.id,
      userName: currentUser.name,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * One tap closes it.
   *
   * Nothing is required to close a work order — no cost, no time, no note. Every field between
   * a person and "done" is a reason the queue stops matching the property. The safety net is
   * the undo bar, not a form.
   */
  function handleDone() {
    if (checklist.length > 0 && remainingSteps > 0) {
      // The steps ARE the close for this one. Ticking the last of them fires a database
      // trigger that resolves the row; closing here as well would race it.
      setStepsHighlight(true);
      stepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const prevStatus = issue.status;
    resolveIssue(issue.id);
    log(`${currentUser.name} marked this done`);
    setFixPrompt(false);
    setUndo({ prevStatus });
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      undoTimer.current = null;
      setUndo(null);
      setFixPrompt(true);
    }, UNDO_MS);
  }

  function handleUndo() {
    if (!undo) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    updateIssue(issue.id, { status: undo.prevStatus });
    log(`${currentUser.name} undid closing this`);
    setUndo(null);
  }

  async function attachFixPhoto(file: File) {
    setUploadingFix(true);
    setFixError(null);
    const url = await dbUploadPhoto(file, `${issue.id}-fix-${generateId().slice(0, 8)}`);
    setUploadingFix(false);
    if (!url) {
      setFixError('That photo did not upload. The work order is still closed either way.');
      return;
    }
    postComment(issue.id, 'Photo', author, [url], false);
    setFixPrompt(false);
  }

  function handleStatusChange(next: IssueStatus) {
    if (next === issue.status) return;
    if (next === 'resolved') { handleDone(); return; }
    updateIssue(issue.id, { status: next });
    log(`${currentUser.name} set this to ${STATUS_LABELS[next].toLowerCase()}`);
  }

  function handleAssigneeChange(assigneeId: string) {
    const name = assigneeId
      ? (members.find((m) => m.userId === assigneeId)?.fullName ?? 'someone')
      : null;
    updateIssue(issue.id, {
      assigneeId: assigneeId || null,
      status: issue.status === 'unassigned' || issue.status === 'assigned'
        ? (assigneeId ? 'assigned' : 'unassigned')
        : issue.status,
    });
    log(name ? `Assigned to ${name} by ${currentUser.name}` : `Unassigned by ${currentUser.name}`);
  }

  function handleVendorChange(vendorId: string) {
    const name = vendorId ? (vendors.find((v) => v.id === vendorId)?.name ?? 'a vendor') : null;
    updateIssue(issue.id, { vendorId: vendorId || null });
    // The timeline says what happened, and what happened depends on the state. "Waiting on
    // Ridgeline" is right when the job is parked on them and plainly wrong when they are on site
    // today or finished last week.
    if (!name) {
      log(`${currentUser.name} removed the vendor`);
    } else if (issue.status === 'waiting_on_vendor') {
      log(`Waiting on ${name}`);
    } else if (issue.status === 'resolved') {
      log(`${currentUser.name} recorded that ${name} did this`);
    } else {
      log(`${currentUser.name} sent this to ${name}`);
    }
  }

  function saveCost() {
    const raw = costInput.replace(/[$,\s]/g, '');
    const value = raw ? Number.parseFloat(raw) : null;
    if (raw && Number.isNaN(value)) return;
    updateIssue(issue.id, { actualCost: value });
    log(value != null
      ? `${currentUser.name} recorded $${value.toLocaleString()} spent`
      : `${currentUser.name} cleared the cost`);
  }

  function saveMinutes() {
    const raw = minutesInput.trim();
    const value = raw ? Number.parseInt(raw, 10) : null;
    if (raw && Number.isNaN(value)) return;
    updateIssue(issue.id, { minutesSpent: value });
    setShowTime(false);
  }

  const assignee = issue.assigneeId
    ? (members.find((m) => m.userId === issue.assigneeId)?.fullName ?? null)
    : null;
  const reporter = issue.isPublicReport
    ? (issue.reporterName ?? 'Anonymous')
    : (issue.reportedById ? (members.find((m) => m.userId === issue.reportedById)?.fullName ?? null) : null);
  const asset = issue.assetId ? assets.find((a) => a.id === issue.assetId) : undefined;
  const vendor = issue.vendorId ? vendors.find((v) => v.id === issue.vendorId) : undefined;
  const schedule = issue.scheduleId ? schedules.find((s) => s.id === issue.scheduleId) : undefined;
  const behind = schedule ? describeMissed(schedule.missedCount) : null;
  const retreat = issue.retreatId ? retreats.find((r) => r.id === issue.retreatId) : undefined;
  const due = issue.dueDate ? relativeDueDate(issue.dueDate) : null;
  const late = isOverdue(issue, todayStr());
  const resolved = issue.status === 'resolved';

  const selectClass =
    'w-full rounded-btn border border-border bg-white px-2 py-1.5 text-[13px] focus:border-sage focus:outline-none';
  const railLabel = 'text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink-soft';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-white px-4 pb-4 pt-5 sm:px-6">
        <div className="mb-1.5 flex items-start gap-2">
          <h2 className="flex-1 font-display text-[19px] sm:text-[21px] font-bold leading-[1.2] text-forest">
            {issue.title}
          </h2>
          <PriorityBadge priority={issue.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-tag px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.09em] ${TRADE_PILL[issue.trade]}`}>
            {tradeLabel(issue.trade)}
          </span>
          <StatusChip status={issue.status} />
          {issue.isPublicReport && (
            <span className="rounded-tag border border-red px-[5px] py-px text-[9.5px] font-bold uppercase tracking-[0.1em] text-red">
              Public
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">
          {issue.locations.length > 0 ? `${issue.locations.join(' · ')} · ` : ''}
          Logged {reporter ? `by ${reporter} ` : ''}{formatDate(issue.createdAt)}
          {issue.source ? ` · ${SOURCE_LABELS[issue.source]}` : ''}
        </p>
        {due && (
          <p className={`mt-0.5 text-[12px] tabular-nums ${late ? 'font-bold text-red' : 'text-ink-soft'}`}>
            {due.label}
          </p>
        )}
      </div>

      <div className="flex-1 space-y-4 px-4 py-4 sm:px-6 sm:py-5">
        {/* ── Close it ──────────────────────────────────────────────────────── */}
        {editable && (
          <div className="space-y-2">
            {resolved ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center"
                onClick={() => { reopenIssue(issue.id); log(`Reopened by ${currentUser.name}`); }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Reopen
              </Button>
            ) : (
              <Button size="sm" className="w-full justify-center" onClick={handleDone}>
                <Check className="h-3.5 w-3.5" />
                {checklist.length > 0 && remainingSteps > 0
                  ? `Done · ${remainingSteps} step${remainingSteps === 1 ? '' : 's'} left`
                  : 'Done'}
              </Button>
            )}

            {undo && (
              <div className="flex items-center gap-2 rounded-card border border-forest bg-paper px-3 py-2">
                <p className="flex-1 text-[12.5px] font-semibold text-forest">Closed.</p>
                <button
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1 text-[12.5px] font-bold text-red underline"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo
                </button>
              </div>
            )}

            {/* Asked AFTER it is closed, and never required. A camp that had to photograph
                every fix would photograph none of them. */}
            {fixPrompt && (
              <div className="rounded-card border border-border bg-paper px-3 py-2">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[12.5px] text-ink">Add a photo?</p>
                  <button
                    onClick={() => fixFileRef.current?.click()}
                    disabled={uploadingFix}
                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-forest underline disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {uploadingFix ? 'Uploading…' : 'Take one'}
                  </button>
                  <button
                    onClick={() => setFixPrompt(false)}
                    className="text-[12.5px] text-ink-soft hover:text-ink"
                  >
                    Not now
                  </button>
                </div>
                {fixError && <p className="mt-1 text-[11.5px] text-red">{fixError}</p>}
                <input
                  ref={fixFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void attachFixPhoto(file);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Status, owner, vendor ─────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex flex-col gap-1">
            <span className={railLabel}>Status</span>
            {editable ? (
              <select
                value={issue.status}
                onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
                className={selectClass}
              >
                {OPEN_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
                <option value="resolved">{STATUS_LABELS.resolved}</option>
              </select>
            ) : (
              <span className="text-[13px] font-medium text-forest">{STATUS_LABELS[issue.status]}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={railLabel}>Assigned to</span>
            {can('assign') ? (
              <select
                value={issue.assigneeId ?? ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.fullName}</option>
                ))}
              </select>
            ) : assignee ? (
              <span className="text-[13px] font-medium text-forest">{assignee}</span>
            ) : (
              <span className="text-[13px] font-medium text-red">Unassigned</span>
            )}
          </div>

          {/*
            Two separate questions, so two separate fields: "Assigned to" is who INSIDE the camp
            owns this, "Outside vendor" is who is actually doing it. A job can have either, both
            or neither — the plumber is coming Thursday and Dave is meeting him on site.

            This used to appear only while the status was "waiting on vendor", which meant the
            only way to record a contractor was to first park the job as blocked. You could not
            say "dispatched, work in progress", and you could not record who did it after the
            fact — so the field was almost never set, and everything downstream of it (the
            Vendors tab, the season review) had nothing to show.
          */}
          <div className="flex flex-col gap-1">
            <span className={railLabel}>Outside vendor</span>
            {editable && vendors.length > 0 ? (
              <select
                value={issue.vendorId ?? ''}
                onChange={(e) => handleVendorChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Nobody outside</option>
                {vendors.filter((v) => v.isActive || v.id === issue.vendorId).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.trade ? ` · ${v.trade}` : ''}
                  </option>
                ))}
              </select>
            ) : vendor ? (
              <span className="text-[13px] font-medium text-forest">{vendor.name}</span>
            ) : editable ? (
              <p className="text-[12px] text-ink-soft">
                No vendors saved yet. Add them on the Vendors tab.
              </p>
            ) : (
              <span className="text-[13px] text-ink-soft">Nobody outside</span>
            )}
          </div>
        </div>

        {/* ── What this is work against ─────────────────────────────────────── */}
        {(asset || vendor || schedule || retreat) && (
          <div className="space-y-1.5 rounded-card border border-border bg-paper px-3 py-2.5">
            {asset && (
              <button
                onClick={() => { setActiveAsset(asset.id); navigate('/assets'); }}
                className="flex w-full items-center gap-2 text-left text-[12.5px] font-semibold text-forest hover:underline"
              >
                <Wrench className="h-3.5 w-3.5 flex-none text-sage" />
                <span className="truncate">{asset.name}</span>
              </button>
            )}
            {vendor && (
              <div className="flex items-center gap-2 text-[12.5px] text-ink">
                <Phone className="h-3.5 w-3.5 flex-none text-sage" />
                <span className="truncate font-semibold">{vendor.name}</span>
                {vendor.phone && (
                  <a href={`tel:${vendor.phone}`} className="ml-auto flex-none tabular-nums text-forest hover:underline">
                    {vendor.phone}
                  </a>
                )}
              </div>
            )}
            {schedule && (
              <div className="flex items-center gap-2 text-[12.5px] text-ink">
                <Repeat className="h-3.5 w-3.5 flex-none text-sage" />
                <span className="truncate">{schedule.title} · {describeCadence(schedule)}</span>
                {behind && <span className="ml-auto flex-none font-bold text-red">{behind}</span>}
              </div>
            )}
            {retreat && (
              <p className="text-[12.5px] text-ink">For {retreat.groupName}</p>
            )}
          </div>
        )}

        {/* ── Description ───────────────────────────────────────────────────── */}
        <div>
          <p className={`${railLabel} mb-1`}>Description</p>
          {issue.description ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{issue.description}</p>
          ) : (
            <p className="text-[13px] italic text-ink-faint">Nothing written down.</p>
          )}
        </div>

        {issue.isPublicReport && (issue.reporterName || issue.reporterContact) && (
          <div>
            <p className={`${railLabel} mb-1`}>Reported by</p>
            {issue.reporterName && <p className="text-[13px] text-ink">{issue.reporterName}</p>}
            {issue.reporterContact && <p className="text-[13px] text-ink-soft">{issue.reporterContact}</p>}
          </div>
        )}

        {issue.photoUrl && (
          <div>
            <p className={`${railLabel} mb-1`}>Photo</p>
            <a href={issue.photoUrl} target="_blank" rel="noreferrer">
              <img
                src={issue.photoUrl}
                alt="What was reported"
                className="max-h-40 w-full rounded-card border border-border object-cover"
              />
            </a>
          </div>
        )}

        {/* ── Steps ─────────────────────────────────────────────────────────── */}
        {editable && (
          <div ref={stepsRef}>
            <ChecklistPanel issueId={issue.id} highlight={stepsHighlight} />
          </div>
        )}

        {/* ── The two optional numbers ──────────────────────────────────────── */}
        {/* Actual cost is the only real money figure in the module, and it is admin-only. There
            is deliberately no estimate field anywhere: a number typed under time pressure by
            somebody standing in a wet basement is fiction that later gets quoted as fact. */}
        {can('enterActualCost') && (
          <div>
            <p className={`${railLabel} mb-1`}>What it cost</p>
            <div className="flex items-center gap-1.5">
              <input
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                onBlur={saveCost}
                inputMode="decimal"
                placeholder="e.g. 280"
                className="min-w-0 flex-1 rounded-btn border border-border bg-white px-2 py-1.5 text-[13px]
                           placeholder:text-ink-faint focus:border-sage focus:outline-none"
              />
              <span className="flex-none text-[11.5px] text-ink-faint">optional</span>
            </div>
          </div>
        )}

        {/* Off by default and small, because a salaried summer crew does not clock in and being
            asked to would teach them that this app wastes their time. */}
        {editable && (
          showTime ? (
            <div className="flex items-center gap-1.5">
              <input
                value={minutesInput}
                onChange={(e) => setMinutesInput(e.target.value)}
                inputMode="numeric"
                placeholder="Minutes"
                className="min-w-0 flex-1 rounded-btn border border-border bg-white px-2 py-1.5 text-[13px]
                           placeholder:text-ink-faint focus:border-sage focus:outline-none"
              />
              <Button size="sm" onClick={saveMinutes}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowTime(false)}>Cancel</Button>
            </div>
          ) : (
            <button
              onClick={() => setShowTime(true)}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft hover:text-forest"
            >
              <Clock className="h-3 w-3" />
              {issue.minutesSpent != null ? `${issue.minutesSpent} min logged · change` : 'Log time'}
            </button>
          )
        )}

        {/* ── One timeline ──────────────────────────────────────────────────── */}
        <div>
          <p className={`${railLabel} mb-2`}>Everything that happened</p>
          <WorkTimeline issue={issue} />
          {editable && (
            <div className="mt-3">
              <CommentComposer issue={issue} />
            </div>
          )}
        </div>

        <p className="text-[11px] text-ink-faint">Logged {formatDateTime(issue.createdAt)}</p>
      </div>

      {/* Footer */}
      {can('createIssue') && (
        <div className="space-y-2 border-t border-border px-4 py-4 sm:px-6 sm:py-5">
          {showDeleteConfirm ? (
            <>
              <p className="text-center text-[12px] text-ink-soft">
                Delete this work order? The record goes with it.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  className="flex-1 justify-center"
                  onClick={() => deleteIssue(issue.id)}
                >
                  Confirm delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center"
                onClick={() => openEditIssueModal(issue.id)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-red/70 hover:text-red"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
