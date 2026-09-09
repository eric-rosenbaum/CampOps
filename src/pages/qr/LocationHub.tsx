/**
 * Standing in front of the thing, signed in.
 *
 * The scan already told us where you are, which removes the single most expensive step in every
 * maintenance app: finding the right row. So this page is not a search result — it is the answer,
 * and everything on it is scoped to one door or one machine.
 *
 * Designed for a phone held one-handed in daylight: one column, large targets, high contrast,
 * almost no chrome. The screen has to survive being read at arm's length by somebody whose other
 * hand is holding a wrench.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowUpRight, Camera, Check, ChevronRight, Flame, Gauge, Loader2,
  Plus, Repeat, Undo2, X, Zap, Droplet, Wrench, Ban,
} from 'lucide-react';
import type { CampAsset, CampLocation, Issue, Priority, QrTarget, Trade } from '@/lib/types';
import { TRADES, TRADE_LABELS } from '@/lib/types';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useLocationStore } from '@/store/locationStore';
import { useAssetStore } from '@/store/assetStore';
import { useBuildingStore } from '@/store/buildingStore';
import { useCampStore } from '@/store/campStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { resolveQrToken, dbSetLocationService, dbRecordMeter } from '@/lib/campgroundDb';
import { dbUploadPhoto } from '@/lib/db';
import {
  compareWorkOrders, describeCadence, describeMissed, isOpen, newWorkOrder, STATUS_LABELS,
} from '@/lib/workOrder';
import { formatDate, relativeTime, todayStr } from '@/lib/utils';
import { LogIssueModal } from '@/components/shared/LogIssueModal';
import { CampCommandMark } from '@/components/shared/CampCommandMark';

const UNDO_MS = 5000;

export function LocationHub({ target: targetProp }: { target?: QrTarget } = {}) {
  const { token: routeToken } = useParams<{ token: string }>();
  const token = routeToken ?? '';

  // Raw slices, derived with useMemo. A selector that returned a filtered array would allocate a
  // new one on every store change and spin React 19 + zustand v5 into an infinite loop.
  const locations = useLocationStore((s) => s.locations);
  const assets = useAssetStore((s) => s.assets);

  const location = useMemo(
    () => locations.find((l) => l.qrToken === token) ?? null,
    [locations, token],
  );
  const asset = useMemo(
    () => assets.find((a) => a.qrToken === token) ?? null,
    [assets, token],
  );

  // Only if the token is in neither list do we ask the server what it is — so the common case
  // costs nothing, and the uncommon one still gets a truthful answer instead of a shrug.
  const [resolved, setResolved] = useState<{ forToken: string; value: QrTarget | null } | null>(null);
  useEffect(() => {
    if (!token || location || asset || targetProp) return;
    let live = true;
    void resolveQrToken(token).then((t) => { if (live) setResolved({ forToken: token, value: t }); });
    return () => { live = false; };
  }, [token, location, asset, targetProp]);

  const remote: QrTarget | null | undefined = targetProp
    ?? (resolved && resolved.forToken === token ? resolved.value : undefined);

  if (!location && !asset) {
    if (remote === undefined) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-sage" />
        </div>
      );
    }
    return <NotHere token={token} target={remote} />;
  }

  return <Hub location={location} asset={asset} />;
}

// ─── The page ─────────────────────────────────────────────────────────────────

function Hub({
  location, asset,
}: {
  location: CampLocation | null;
  asset: CampAsset | null;
}) {
  const { currentUser, can, canAccessModule } = useAuth();
  const currentCamp = useCampStore((s) => s.currentCamp);
  const members = useCampStore((s) => s.members);
  const locations = useLocationStore((s) => s.locations);

  const issues = useIssuesStore((s) => s.issues);
  const resolveIssue = useIssuesStore((s) => s.resolveIssue);
  const updateIssue = useIssuesStore((s) => s.updateIssue);
  const addIssue = useIssuesStore((s) => s.addIssue);
  const schedules = useCampgroundStore((s) => s.schedules);
  const postComment = useCampgroundStore((s) => s.postComment);
  const openEditIssueModal = useUIStore((s) => s.openEditIssueModal);

  const canWork = can('markResolved');

  // ── Open work here ──────────────────────────────────────────────────────────

  const openWork = useMemo(() => {
    const today = todayStr();
    const match = asset
      ? (i: Issue) => i.assetId === asset.id
      : (i: Issue) => (location ? i.locationIds.includes(location.id) : false);
    return issues.filter((i) => isOpen(i) && match(i)).sort((a, b) => compareWorkOrders(a, b, today));
  }, [issues, asset, location]);

  const memberName = useCallback(
    (userId: string | null) => (userId ? members.find((m) => m.userId === userId)?.fullName ?? null : null),
    [members],
  );

  /**
   * One tap to done, then five seconds to take it back.
   *
   * The honest floor for closing work in the field is a tap plus an undo. Requiring a note or a
   * photo is how people stop closing things where they are standing and start closing them from
   * a laptop three days later — which turns every response-time number the season review reports
   * into fiction. So the photo is offered AFTER, and never blocks.
   */
  const [undo, setUndo] = useState<{ id: string; title: string; previous: Issue['status'] } | null>(null);
  const [photoFor, setPhotoFor] = useState<{ id: string; title: string } | null>(null);
  const undoTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  function markDone(issue: Issue) {
    window.clearTimeout(undoTimer.current);
    resolveIssue(issue.id);
    setUndo({ id: issue.id, title: issue.title, previous: issue.status });
    undoTimer.current = window.setTimeout(() => {
      setUndo(null);
      setPhotoFor({ id: issue.id, title: issue.title });
    }, UNDO_MS);
  }

  function takeItBack() {
    window.clearTimeout(undoTimer.current);
    // Restore the status it actually had, not a generic "in progress" — a work order that was
    // waiting on a part still is.
    if (undo) updateIssue(undo.id, { status: undo.previous });
    setUndo(null);
  }

  // ── Log something here ──────────────────────────────────────────────────────

  const [logOpen, setLogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('normal');
  const [newTrade, setNewTrade] = useState<Trade>('maintenance');
  const [newAssignee, setNewAssignee] = useState('');
  const [justLogged, setJustLogged] = useState<string | null>(null);

  function logIt() {
    const title = newTitle.trim();
    if (!title) return;
    const issue = newWorkOrder({
      title,
      priority: newPriority,
      trade: newTrade,
      // The whole point of the sticker: the location is right by construction, not by the person
      // guessing which of three names for this cabin is the one in our tree.
      locationIds: location ? [location.id] : [],
      locations: location ? [location.name] : (asset?.storageLocation ? [asset.storageLocation] : []),
      assetId: asset?.id ?? null,
      assigneeId: newAssignee || null,
      reportedById: currentUser.id,
      // The season review counts by source. This is what proves the sticker programme worked.
      source: 'qr',
    });
    addIssue(issue);
    setNewTitle('');
    setNewPriority('normal');
    setNewAssignee('');
    setLogOpen(false);
    setJustLogged(issue.id);
  }

  // ── Routines ────────────────────────────────────────────────────────────────

  const routines = useMemo(() => schedules.filter((s) => {
    if (!s.isActive) return false;
    if (asset) return s.assetId === asset.id;
    return location ? s.locationIds.includes(location.id) : false;
  }), [schedules, asset, location]);

  // ── Chrome ──────────────────────────────────────────────────────────────────

  const name = asset?.name ?? location?.name ?? '';
  const path = asset ? (asset.storageLocation || null) : locationPath(location, locations);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-32 pt-4 sm:px-6 sm:pt-6">

      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        {currentCamp?.logoUrl ? (
          <img src={currentCamp.logoUrl} alt="" className="h-10 w-10 flex-none rounded-card object-cover" />
        ) : (
          <CampCommandMark size={40} decorative className="flex-none" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">
            {asset ? 'Equipment' : 'Location'}
          </p>
          <h1 className="font-display text-[24px] font-bold leading-tight text-ink">{name}</h1>
          {path && <p className="mt-0.5 text-[12.5px] text-ink-faint">{path}</p>}
        </div>
        <Link
          to={asset ? '/assets' : '/campground'}
          className="mt-1 flex-none text-ink-faint hover:text-forest"
          title={asset ? 'Open in Assets' : 'Open in Campground'}
        >
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </div>

      {location && location.serviceStatus !== 'in_service' && (
        <div className="mb-4 rounded-card border border-red/40 bg-red-bg px-4 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-red-text">
            <Ban className="h-4 w-4 flex-none" />
            {location.serviceStatus === 'limited' ? 'Limited use' : 'Out of service'}
          </p>
          {location.outOfServiceReason && (
            <p className="mt-1 text-[13px] text-red-text/90">{location.outOfServiceReason}</p>
          )}
          <p className="mt-1 text-[12px] text-red-text/75">
            {location.outOfServiceSince && <>Since {formatDate(location.outOfServiceSince)}. </>}
            {location.expectedBack
              ? <>Expected back {formatDate(location.expectedBack)}.</>
              : 'No return date set.'}
          </p>
        </div>
      )}

      {/* ── Open work ─────────────────────────────────────────────────────── */}
      <Section
        title={openWork.length === 1 ? '1 thing open here' : `${openWork.length} things open here`}
      >
        {openWork.length === 0 ? (
          <p className="px-4 py-5 text-[13.5px] text-ink-faint">Nothing open here. Good.</p>
        ) : (
          <ul>
            {openWork.map((issue) => (
              <li key={issue.id} className="border-b border-border/60 last:border-0">
                <div className="flex items-stretch">
                  <button
                    onClick={() => openEditIssueModal(issue.id)}
                    className="min-w-0 flex-1 px-4 py-3.5 text-left hover:bg-paper"
                  >
                    <p className="text-[15px] font-bold leading-snug text-ink">{issue.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-faint">
                      {STATUS_LABELS[issue.status]}
                      {issue.priority !== 'normal' && <> · <span className="font-bold text-red">{issue.priority}</span></>}
                      {memberName(issue.assigneeId) && <> · {memberName(issue.assigneeId)}</>}
                      {' · '}{relativeTime(issue.createdAt)}
                    </p>
                  </button>
                  {canWork && (
                    <button
                      onClick={() => markDone(issue)}
                      // 56px of thumb. Anything smaller is a mis-tap in sunlight with gloves on.
                      className="flex w-[84px] flex-none flex-col items-center justify-center gap-0.5
                                 border-l border-border/60 bg-white text-forest
                                 hover:bg-green-muted-bg active:bg-sage-pale"
                      aria-label={`Mark "${issue.title}" done`}
                    >
                      <Check className="h-5 w-5" />
                      <span className="text-[11px] font-bold uppercase tracking-wide">Done</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Log something new ─────────────────────────────────────────────── */}
      {can('createIssue') && (
        <Section title="Log something here">
          {logOpen ? (
            <div className="space-y-3 px-4 py-4">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') logIt(); }}
                placeholder="What's wrong?"
                className="w-full rounded-btn border border-border bg-white px-3.5 py-3 text-[16px] focus:border-sage focus:outline-none"
              />
              <div className="flex gap-1.5">
                {(['normal', 'high', 'urgent'] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`flex-1 rounded-btn border py-2.5 text-[13px] font-bold capitalize transition-colors ${
                      newPriority === p ? 'border-forest bg-forest text-paper' : 'border-border bg-white text-ink-soft'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  value={newTrade}
                  onChange={(e) => setNewTrade(e.target.value as Trade)}
                  className="min-w-0 flex-1 rounded-btn border border-border bg-white px-3 py-2.5 text-[13px]"
                >
                  {TRADES.map((t) => <option key={t} value={t}>{TRADE_LABELS[t]}</option>)}
                </select>
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="min-w-0 flex-1 rounded-btn border border-border bg-white px-3 py-2.5 text-[13px]"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
                </select>
              </div>
              <p className="text-[12px] text-ink-faint">
                Filed against <span className="font-semibold text-ink-soft">{name}</span> — you scanned it, so
                nobody has to name it.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setLogOpen(false); setNewTitle(''); }}
                  className="rounded-btn border border-border bg-white px-4 py-3 text-[14px] font-bold text-ink-soft"
                >
                  Cancel
                </button>
                <button
                  onClick={logIt}
                  disabled={!newTitle.trim()}
                  className="flex-1 rounded-btn bg-forest py-3 text-[14px] font-bold text-paper disabled:opacity-40"
                >
                  Log it
                </button>
              </div>
            </div>
          ) : justLogged ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <Check className="h-5 w-5 flex-none text-forest" />
              <p className="min-w-0 flex-1 text-[14px] text-ink">Logged.</p>
              <button
                // Opening the EDIT form on the row we just created is how the full modal gets a
                // pre-filled location: the location is already on the work order.
                onClick={() => { openEditIssueModal(justLogged); setJustLogged(null); }}
                className="flex-none text-[13px] font-bold text-forest underline"
              >
                Add detail
              </button>
              <button onClick={() => setJustLogged(null)} className="flex-none text-ink-faint">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLogOpen(true)}
              className="flex w-full items-center gap-2.5 px-4 py-4 text-left text-[15px] font-bold text-forest hover:bg-paper"
            >
              <Plus className="h-5 w-5 flex-none" />
              Something's wrong here
            </button>
          )}
        </Section>
      )}

      {/* ── Asset-only ────────────────────────────────────────────────────── */}
      {asset && <AssetPanels asset={asset} />}

      {/* ── Routines ──────────────────────────────────────────────────────── */}
      {routines.length > 0 && (
        <Section title="Routines here">
          <ul>
            {routines.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 border-b border-border/60 px-4 py-3 last:border-0">
                <Repeat className="mt-0.5 h-4 w-4 flex-none text-sage" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug text-ink">{r.title}</p>
                  <p className="text-[12px] text-ink-faint">
                    {describeCadence(r)}
                    {describeMissed(r.missedCount) && (
                      <> · <span className="font-bold text-amber-text">{describeMissed(r.missedCount)}</span></>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Out of service ────────────────────────────────────────────────── */}
      {location && can('updateIssue') && <ServicePanel location={location} />}

      {/* ── Shutoffs & panel ──────────────────────────────────────────────── */}
      {location && canAccessModule() && <BuildingPanel location={location} />}

      {/* ── Undo snackbar ─────────────────────────────────────────────────── */}
      {undo && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-card bg-forest px-4 py-3 shadow-lg">
            <Check className="h-4 w-4 flex-none text-sage-light" />
            <p className="min-w-0 flex-1 truncate text-[13.5px] text-cream">
              Done · <span className="opacity-80">{undo.title}</span>
            </p>
            <button
              onClick={takeItBack}
              className="flex flex-none items-center gap-1 rounded-btn bg-forest-mid px-3 py-2 text-[13px] font-bold text-cream"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          </div>
        </div>
      )}

      {/* ── Optional photo of the fix ─────────────────────────────────────── */}
      {photoFor && (
        <FixPhotoSheet
          issueId={photoFor.id}
          title={photoFor.title}
          onClose={() => setPhotoFor(null)}
          onDone={(url, note) => {
            // Lands as a reply the reporter can see, not as a replacement for the "what's broken"
            // photo — which is evidence, and which overwriting would destroy.
            postComment(photoFor.id, note || 'Fixed.', { id: currentUser.id, name: currentUser.name }, url ? [url] : [], true);
            setPhotoFor(null);
          }}
        />
      )}

      {/* Rendered here because this route is not the Campground page, which is where the modal
          normally lives. It reads its target from the UI store either way. */}
      <LogIssueModal />
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-ink-faint">{title}</h2>
      <div className="overflow-hidden rounded-card border border-border bg-white">{children}</div>
    </section>
  );
}

/** The parent chain, root first, excluding the node itself. */
function locationPath(l: CampLocation | null, all: CampLocation[]): string | null {
  if (!l) return null;
  const parts: string[] = [];
  let cur = l.parentId ? all.find((x) => x.id === l.parentId) : undefined;
  let guard = 0;
  while (cur && guard++ < 20) {
    parts.unshift(cur.name);
    cur = cur.parentId ? all.find((x) => x.id === cur!.parentId) : undefined;
  }
  return parts.length ? parts.join(' › ') : null;
}

// ─── Out of service ───────────────────────────────────────────────────────────

/**
 * Taking a room down.
 *
 * This is not a label. Rental availability and the rooming board read it, which is exactly the
 * point and exactly what the UI has to say out loud: a coordinator could otherwise put twelve
 * guests in a cabin that has been out of service since June, because the board had no way to
 * know.
 */
function ServicePanel({ location }: { location: CampLocation }) {
  const locations = useLocationStore((s) => s.locations);
  const setLocations = useLocationStore((s) => s.setLocations);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(location.outOfServiceReason ?? '');
  const [expected, setExpected] = useState(location.expectedBack ?? '');
  const [status, setStatus] = useState<CampLocation['serviceStatus']>(
    location.serviceStatus === 'in_service' ? 'out_of_service' : location.serviceStatus,
  );

  function apply(next: CampLocation['serviceStatus']) {
    const clearing = next === 'in_service';
    dbSetLocationService(location.id, next, clearing ? null : reason.trim() || null, clearing ? null : expected || null);
    // Optimistic, using the camp's calendar day rather than a UTC slice — after 8pm Eastern the
    // two disagree, and "out of service since tomorrow" is not a thing.
    setLocations(locations.map((l) => (l.id === location.id ? {
      ...l,
      serviceStatus: next,
      outOfServiceReason: clearing ? null : reason.trim() || null,
      outOfServiceSince: clearing ? null : (l.outOfServiceSince ?? todayStr()),
      expectedBack: clearing ? null : (expected || null),
    } : l)));
    setEditing(false);
  }

  const isDown = location.serviceStatus !== 'in_service';

  return (
    <Section title="Service status">
      {editing ? (
        <div className="space-y-3 px-4 py-4">
          <div className="flex gap-1.5">
            {(['out_of_service', 'limited'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`flex-1 rounded-btn border py-2.5 text-[13px] font-bold transition-colors ${
                  status === s ? 'border-forest bg-forest text-paper' : 'border-border bg-white text-ink-soft'
                }`}
              >
                {s === 'limited' ? 'Limited use' : 'Out of service'}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? e.g. ceiling leak, floor drying"
            className="w-full rounded-btn border border-border bg-white px-3.5 py-3 text-[15px] focus:border-sage focus:outline-none"
          />
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Expected back</span>
            <input
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="w-full rounded-btn border border-border bg-white px-3.5 py-3 text-[15px]"
            />
          </label>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            This does more than label it: rental groups cannot be booked into a space that is out
            of service, and the rooming board will not place anyone here.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-btn border border-border bg-white px-4 py-3 text-[14px] font-bold text-ink-soft"
            >
              Cancel
            </button>
            <button
              onClick={() => apply(status)}
              className="flex-1 rounded-btn bg-red py-3 text-[14px] font-bold text-paper"
            >
              Take it out of service
            </button>
          </div>
        </div>
      ) : isDown ? (
        <button
          onClick={() => apply('in_service')}
          className="flex w-full items-center gap-2.5 px-4 py-4 text-left text-[15px] font-bold text-forest hover:bg-paper"
        >
          <Check className="h-5 w-5 flex-none" />
          Put back in service
        </button>
      ) : (
        <button
          onClick={() => { setStatus('out_of_service'); setEditing(true); }}
          className="flex w-full items-center gap-2.5 px-4 py-4 text-left text-[15px] font-bold text-ink hover:bg-paper"
        >
          <Ban className="h-5 w-5 flex-none text-ink-faint" />
          Take out of service
        </button>
      )}
    </Section>
  );
}

// ─── Shutoffs & panel ─────────────────────────────────────────────────────────

/**
 * What somebody needs at 2am with water coming through a ceiling.
 *
 * A room sticker inherits its building's shutoffs, because nobody puts a separate main valve in
 * every bunk — so the lookup walks up the location tree rather than demanding an exact match.
 */
function BuildingPanel({ location }: { location: CampLocation }) {
  const locations = useLocationStore((s) => s.locations);
  const buildingDetails = useLocationStore((s) => s.buildingDetails);
  const components = useBuildingStore((s) => s.components);
  const circuits = useBuildingStore((s) => s.circuits);

  const chain = useMemo(() => {
    const ids: string[] = [];
    let cur: CampLocation | undefined = location;
    let guard = 0;
    while (cur && guard++ < 20) {
      ids.push(cur.id);
      cur = cur.parentId ? locations.find((l) => l.id === cur!.parentId) : undefined;
    }
    return ids;
  }, [location, locations]);

  const detail = useMemo(
    () => buildingDetails.find((b) => chain.includes(b.locationId)) ?? null,
    [buildingDetails, chain],
  );

  const panels = useMemo(
    () => components
      .filter((c) => chain.includes(c.locationId) && (c.type === 'breaker_panel' || c.type === 'sub_panel'))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [components, chain],
  );

  const valves = useMemo(
    () => components
      .filter((c) => chain.includes(c.locationId) && c.type === 'shutoff_valve')
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [components, chain],
  );

  if (!detail && panels.length === 0 && valves.length === 0) return null;

  return (
    <Section title="Shutoffs & panel">
      {detail && (
        <dl className="divide-y divide-border/60">
          <Shutoff icon={<Droplet className="h-4 w-4" />} label="Main water" value={detail.mainWaterShutoff} />
          <Shutoff icon={<Flame className="h-4 w-4" />} label="Main gas" value={detail.mainGasShutoff} />
          <Shutoff icon={<Zap className="h-4 w-4" />} label="Main electrical" value={detail.mainElectricalPanel} />
        </dl>
      )}

      {valves.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-ink-faint">Valves</p>
          <ul className="space-y-1">
            {valves.map((v) => (
              <li key={v.id} className="text-[13.5px] text-ink">
                {v.label}
                {v.locationDetail && <span className="text-ink-faint"> · {v.locationDetail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panels.map((p) => {
        const rows = circuits.filter((c) => c.panelId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div key={p.id} className="border-t border-border/60 px-4 py-3">
            <p className="text-[13.5px] font-bold text-ink">{p.label}</p>
            {p.locationDetail && <p className="text-[12px] text-ink-faint">{p.locationDetail}</p>}
            {rows.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-ink-faint">No breakers recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border/50">
                {rows.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-2 py-1.5 text-[13px]">
                    <span className="w-8 flex-none font-mono text-ink-faint">{c.breakerNumber ?? '—'}</span>
                    <span className="min-w-0 flex-1 text-ink">{c.label ?? c.controls ?? 'Unlabelled'}</span>
                    {c.amperage != null && <span className="flex-none font-mono text-[12px] text-ink-faint">{c.amperage}A</span>}
                    {!c.isOn && <span className="flex-none text-[11px] font-bold uppercase text-red">off</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </Section>
  );
}

function Shutoff({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex-none text-sage">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{label}</dt>
        <dd className="text-[14.5px] leading-snug text-ink">{value}</dd>
      </div>
    </div>
  );
}

// ─── Asset ────────────────────────────────────────────────────────────────────

function AssetPanels({ asset }: { asset: CampAsset }) {
  const assets = useAssetStore((s) => s.assets);
  const setAssets = useAssetStore((s) => s.setAssets);
  const serviceRecords = useAssetStore((s) => s.serviceRecords);

  const history = useMemo(
    () => serviceRecords
      .filter((r) => r.assetId === asset.id)
      .sort((a, b) => b.datePerformed.localeCompare(a.datePerformed))
      .slice(0, 5),
    [serviceRecords, asset.id],
  );

  const kinds = useMemo(() => {
    const out: ('hours' | 'odometer')[] = [];
    if (asset.tracksHours) out.push('hours');
    if (asset.tracksOdometer) out.push('odometer');
    return out;
  }, [asset.tracksHours, asset.tracksOdometer]);

  const [kind, setKind] = useState<'hours' | 'odometer'>(kinds[0] ?? 'hours');
  const [reading, setReading] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raised, setRaised] = useState<number | null>(null);

  async function record() {
    const value = Number(reading);
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    setError(null);
    setRaised(null);
    const result = await dbRecordMeter(asset.id, Math.round(value), kind);
    setSaving(false);
    if (typeof result === 'string') {
      // The database refuses a reading below the last one rather than absorbing it — absorbing it
      // would make every meter-driven routine come due at once. Show what it said.
      setError(result);
      return;
    }
    setReading('');
    setRaised(result);
    setAssets(assets.map((a) => (a.id === asset.id
      ? { ...a, currentHours: kind === 'hours' ? Math.round(value) : a.currentHours,
          currentOdometer: kind === 'odometer' ? Math.round(value) : a.currentOdometer }
      : a)));
  }

  return (
    <>
      {kinds.length > 0 && (
        <Section title="Meter">
          <div className="px-4 py-4">
            <div className="mb-3 flex gap-4">
              {asset.tracksHours && (
                <Reading label="Hours" value={asset.currentHours} />
              )}
              {asset.tracksOdometer && (
                <Reading label="Miles" value={asset.currentOdometer} />
              )}
            </div>
            <div className="flex gap-2">
              {kinds.length > 1 && (
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'hours' | 'odometer')}
                  className="rounded-btn border border-border bg-white px-3 py-3 text-[14px]"
                >
                  <option value="hours">Hours</option>
                  <option value="odometer">Miles</option>
                </select>
              )}
              <input
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                inputMode="numeric"
                placeholder="Reading now"
                className="min-w-0 flex-1 rounded-btn border border-border bg-white px-3.5 py-3 text-[16px] focus:border-sage focus:outline-none"
              />
              <button
                onClick={() => void record()}
                disabled={!reading.trim() || saving}
                className="flex-none rounded-btn bg-forest px-4 py-3 text-[14px] font-bold text-paper disabled:opacity-40"
              >
                <Gauge className="mr-1 inline h-4 w-4" />
                {saving ? '…' : 'Record'}
              </button>
            </div>
            {error && <p className="mt-2 text-[13px] text-red">{error}</p>}
            {raised != null && (
              <p className="mt-2 text-[13px] text-forest">
                Recorded{raised > 0 && <> · raised {raised} routine{raised === 1 ? '' : 's'}</>}.
              </p>
            )}
          </div>
        </Section>
      )}

      <Section title="Service history">
        {history.length === 0 ? (
          <p className="px-4 py-5 text-[13.5px] text-ink-faint">Nothing logged against this yet.</p>
        ) : (
          <ul>
            {history.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 border-b border-border/60 px-4 py-3 last:border-0">
                <Wrench className="mt-0.5 h-4 w-4 flex-none text-sage" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug text-ink">
                    {r.description || r.serviceType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[12px] text-ink-faint">
                    {formatDate(r.datePerformed)}
                    {r.performedBy && <> · {r.performedBy}</>}
                    {r.vendor && <> · {r.vendor}</>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Reading({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{label}</p>
      <p className="font-mono text-[22px] leading-tight text-ink">{value != null ? value.toLocaleString() : '—'}</p>
    </div>
  );
}

// ─── Photo of the fix ─────────────────────────────────────────────────────────

/** Offered, never required. Skipping it is a first-class outcome, so "Skip" is the wide button. */
function FixPhotoSheet({
  issueId, title, onClose, onDone,
}: {
  issueId: string;
  title: string;
  onClose: () => void;
  onDone: (url: string | null, note: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function send() {
    setBusy(true);
    const url = file ? await dbUploadPhoto(file, issueId) : null;
    setBusy(false);
    onDone(url, note.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-modal bg-white p-4 sm:rounded-modal">
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">Add a photo?</p>
            <p className="truncate text-[12.5px] text-ink-faint">{title}</p>
          </div>
          <button onClick={onClose} className="flex-none text-ink-faint"><X className="h-4 w-4" /></button>
        </div>

        {preview ? (
          <img src={preview} alt="" className="mb-3 max-h-52 w-full rounded-card border border-border object-cover" />
        ) : (
          <label className="mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border py-7">
            <Camera className="h-6 w-6 text-ink-faint" />
            <span className="text-[13px] text-ink-faint">Take a photo</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
          </label>
        )}

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you do? (optional)"
          className="mb-3 w-full rounded-btn border border-border bg-white px-3.5 py-3 text-[15px] focus:border-sage focus:outline-none"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-btn border border-border bg-white py-3 text-[14px] font-bold text-ink-soft"
          >
            Skip
          </button>
          <button
            onClick={() => void send()}
            disabled={busy || (!file && !note.trim())}
            className="flex-1 rounded-btn bg-forest py-3 text-[14px] font-bold text-paper disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-ink-faint">
          Whoever reported it will see this on their receipt.
        </p>
      </div>
    </div>
  );
}

// ─── Not this camp ────────────────────────────────────────────────────────────

function NotHere({ token, target }: { token: string; target: QrTarget | null }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-card bg-cream-dark">
        <AlertCircle className="h-7 w-7 text-ink-faint" />
      </div>
      {target ? (
        <>
          <h1 className="mb-2 text-[19px] font-bold text-ink">That sticker belongs to {target.campName}</h1>
          <p className="mb-6 text-[14px] leading-relaxed text-ink-soft">
            You are signed in somewhere else, so there is nothing here to work on.
          </p>
          <Link
            to={`/l/${token}`}
            className="inline-flex items-center gap-1.5 rounded-btn bg-forest px-4 py-3 text-[14px] font-bold text-paper"
          >
            Open the sticker <ChevronRight className="h-4 w-4" />
          </Link>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-[19px] font-bold text-ink">This code is not recognised</h1>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            It may have been reissued, or the place it pointed at may have been removed. Reprint it
            from Camp Info → Locations.
          </p>
        </>
      )}
    </div>
  );
}
