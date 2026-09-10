import { useMemo, useState } from 'react';
import {
  Home, Lock, Unlock, History, Download, Plus, Settings2, Users, Wand2, Undo2, DoorClosed,
  RotateCcw, Save,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { dbGenerateTurnover } from '@/lib/retreatsDb';
import { useLocationStore } from '@/store/locationStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { qrToSvg } from '@/lib/qr';
// One source of truth for what a CampCommand QR points at: the same URL the printed
// location stickers carry, so a door sign and a sticker on the same cabin resolve identically.
import { stickerUrl } from '@/components/qr/QrPreview';
import type { Retreat, CampLocation, RetreatHousing, RetreatGuest } from '@/lib/types';
import { fmtDate, fmtDateFull, billableHeadcount } from './retreatUi';
import { BuildingAccordion, type BuildingVM } from '@/components/rooming/BuildingAccordion';
import {
  planArrangement, summariseArrangement, type PlannerGuest, type PlannerRoom,
} from '@/components/rooming/autoArrange';

/**
 * 1 nothing yet · 2 the group is still working · 2.5 the group says they are done · 3 the camp
 * has locked it.
 *
 * The middle state is the point of this. "Some rooms have people in them" and "the coordinator
 * considers this finished" look identical from the camp's side otherwise, so the camp either
 * chased them or assumed. The group's sign-off is theirs to give and does not lock anything:
 * approving and locking is still the camp's call.
 */
type Phase = 1 | 2 | 25 | 3;

function derivePhase(rows: RetreatHousing[], submittedAt: string | null | undefined): Phase {
  if (rows.length > 0 && rows.every((h) => h.locked)) return 3;
  if (submittedAt) return 25;
  if (rows.length === 0) return 1;
  return 2;
}

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/**
 * A saved arrangement, written so a person and a parser can both read it.
 *
 * `retreat_housing_versions` stores a text summary and nothing else — no placement payload —
 * so a restorable snapshot has to live inside that text. Rather than hiding a blob in there,
 * the summary IS the arrangement, in the form "Cedar 1: Dana Reyes, Sam Okafor · Cedar 2:
 * Priya Nair". It reads fine in the history modal and parses back by name.
 *
 * Matching by name rather than id is deliberate: a name is what survives in a text column, and
 * a guest who has since been removed from the roster should be reported as missing rather than
 * silently resurrected. Restores are always partial and always say so.
 */
function snapshotSummary(guests: RetreatGuest[], locById: Map<string, CampLocation>): string {
  const byRoom = new Map<string, string[]>();
  for (const g of guests) {
    if (!g.locationId) continue;
    const name = locById.get(g.locationId)?.name ?? g.locationId;
    (byRoom.get(name) ?? byRoom.set(name, []).get(name)!).push(g.fullName);
  }
  return Array.from(byRoom.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([room, names]) => `${room}: ${names.join(', ')}`)
    .join(' · ');
}

interface ParsedSnapshot {
  /** roomId → guest ids to seat there. */
  seats: Map<string, string[]>;
  /** Guests named in the snapshot who are no longer on the roster, or whose room is gone. */
  missing: string[];
  /** Guests on the roster today that the snapshot never mentioned; they end up unplaced. */
  clearing: string[];
}

function parseSnapshot(
  summary: string | null, guests: RetreatGuest[], rooms: CampLocation[],
): ParsedSnapshot | null {
  if (!summary || !summary.includes(':')) return null;
  const roomByName = new Map(rooms.map((r) => [r.name.toLowerCase(), r.id]));
  const guestByName = new Map(guests.map((g) => [g.fullName.toLowerCase(), g.id]));

  const seats = new Map<string, string[]>();
  const missing: string[] = [];
  const named = new Set<string>();
  let parsedAnything = false;

  for (const chunk of summary.split(' · ')) {
    const at = chunk.indexOf(': ');
    if (at < 0) continue;
    const roomName = chunk.slice(0, at).trim();
    const roomId = roomByName.get(roomName.toLowerCase());
    for (const raw of chunk.slice(at + 2).split(',')) {
      const name = raw.trim();
      if (!name) continue;
      parsedAnything = true;
      const gid = guestByName.get(name.toLowerCase());
      if (!gid || !roomId) { missing.push(name); continue; }
      named.add(gid);
      (seats.get(roomId) ?? seats.set(roomId, []).get(roomId)!).push(gid);
    }
  }
  if (!parsedAnything) return null;

  const clearing = guests.filter((g) => g.locationId && !named.has(g.id)).map((g) => g.fullName);
  return { seats, missing, clearing };
}

function exportMap(
  retreat: Retreat,
  rows: RetreatHousing[],
  locById: Map<string, CampLocation>,
  guests: RetreatGuest[],
) {
  const byRoom = new Map<string, RetreatGuest[]>();
  guests.forEach((g) => {
    if (!g.locationId) return;
    const list = byRoom.get(g.locationId) ?? [];
    list.push(g);
    byRoom.set(g.locationId, list);
  });

  const sections = rows.map((h) => {
    const loc = h.locationId ? locById.get(h.locationId) : undefined;
    const cap = loc?.bedCapacity ?? h.peopleCount;
    const building = loc?.parentId ? locById.get(loc.parentId)?.name ?? null : null;
    const occupants = h.locationId ? byRoom.get(h.locationId) ?? [] : [];
    const unnamed = Math.max(0, h.peopleCount - occupants.length);
    const people = occupants.length > 0
      ? `<ol>${occupants.map((g) => `<li>${esc(g.fullName)}${g.needsAccessible ? ' <span class="tag">step-free</span>' : ''}${g.subgroup ? ` <span class="sub">${esc(g.subgroup)}</span>` : ''}</li>`).join('')}</ol>`
        + (unnamed > 0 ? `<p class="sub">+ ${unnamed} not yet named</p>` : '')
      : `<p class="sub">${h.peopleCount} ${h.peopleCount === 1 ? 'person' : 'people'}, no names submitted</p>`;
    return `<section>
      <h3>${esc(loc?.name ?? h.spaceName ?? 'Space')}${building ? ` <span class="sub">${esc(building)}</span>` : ''}
        <span class="count">${h.peopleCount}/${cap}</span></h3>
      ${h.subgroupName ? `<p class="sub">${esc(h.subgroupName)}</p>` : ''}
      ${people}
      ${h.notes ? `<p class="note">${esc(h.notes)}</p>` : ''}
    </section>`;
  }).join('');

  // Named guests plus anyone booked as a bare number. The figure the kitchen and the front
  // desk actually need.
  const totalPeople = rows.reduce((sum, h) => sum + h.peopleCount, 0) || guests.length;
  const unplaced = guests.filter((g) => !g.locationId);
  const unplacedHtml = unplaced.length > 0
    ? `<section class="warn"><h3>Not yet placed <span class="count">${unplaced.length}</span></h3>
       <p>${unplaced.map((g) => esc(g.fullName)).join(', ')}</p></section>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rooming sheet · ${esc(retreat.groupName)}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#1a2e1a;max-width:900px;margin:0 auto}
      h1{font-size:20px;margin:0 0 2px}
      h2{font-size:13px;color:#7a9472;font-weight:400;margin:0 0 20px}
      section{border:1px solid #ded3bb;border-radius:6px;padding:12px 14px;margin-bottom:10px;break-inside:avoid}
      section.warn{border-color:#c4863a;background:#fdf6ec}
      h3{font-size:14px;margin:0 0 6px;display:flex;align-items:baseline;gap:8px}
      .count{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b7c6b}
      .sub{color:#6b7c6b;font-size:12px;font-weight:400;margin:0}
      .tag{font-size:10px;background:#eaf0e4;border-radius:99px;padding:1px 6px;color:#2f4a2f}
      .note{font-size:12px;color:#6b7c6b;font-style:italic;margin:6px 0 0}
      ol{margin:6px 0 0;padding-left:22px;font-size:13px;columns:2;column-gap:28px}
      li{margin:2px 0;break-inside:avoid}
      @media print{body{padding:12px}section{break-inside:avoid}}
    </style></head><body>
    <h1>${esc(retreat.groupName)} · rooming sheet</h1>
    <h2>${fmtDateFull(retreat.arrivalDate)} – ${fmtDateFull(retreat.departureDate)} · ${totalPeople || billableHeadcount(retreat)} people</h2>
    ${unplacedHtml}
    ${sections}
    </body></html>`;

  openPrintWindow(html);
}

/** One printable sign per room: the names, and that room's own QR code, on one page. */
function printDoorSigns(
  retreat: Retreat,
  rooms: { loc: CampLocation; building: string | null; occupants: RetreatGuest[]; unnamed: number }[],
  campName: string,
  logoUrl: string | null,
  opts: { lastNames: boolean; qr: boolean },
) {
  const displayName = (g: RetreatGuest) => {
    if (opts.lastNames) return g.fullName;
    const first = g.fullName.trim().split(/\s+/)[0];
    return first || g.fullName;
  };

  const pages = rooms.map(({ loc, building, occupants, unnamed }) => {
    const qrSvg = opts.qr && loc.qrToken
      ? `<div class="qr">${qrToSvg(stickerUrl(loc.qrToken), { dark: '#1D3A2E' })}
           <p>Something broken or missing?<br/>Scan to tell the camp.</p></div>`
      : '';
    const names = occupants.length > 0
      ? `<ul>${occupants.map((g) => `<li>${esc(displayName(g))}</li>`).join('')}</ul>`
      : '<p class="none">&nbsp;</p>';
    return `<article>
      <header>
        ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt=""/>` : ''}
        <div><p class="camp">${esc(campName)}</p>
        <p class="group">${esc(retreat.groupName)} · ${esc(fmtDateFull(retreat.arrivalDate))} – ${esc(fmtDateFull(retreat.departureDate))}</p></div>
      </header>
      <h1>${esc(loc.name)}</h1>
      ${building ? `<h2>${esc(building)}</h2>` : ''}
      ${names}
      ${unnamed > 0 ? `<p class="none">+ ${unnamed} more</p>` : ''}
      ${qrSvg}
    </article>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Door signs · ${esc(retreat.groupName)}</title>
    <style>
      @page{size:portrait;margin:14mm}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#23201B;margin:0}
      /* No pinned height. 245mm plus padding overflowed US Letter's 251mm printable area by a
         few millimetres, which pushed the QR block onto a page of its own — the sign said one
         room and the code for it came out on the next sheet. Content flows; the page break is
         what makes it one room per page. */
      article{page-break-after:always;break-after:page}
      article:last-child{page-break-after:auto;break-after:auto}
      header{display:flex;align-items:center;gap:10px;border-bottom:2px solid #DED3BB;padding-bottom:8px}
      .logo{height:34px;width:auto}
      .camp{font-size:13px;font-weight:700;color:#1D3A2E;margin:0}
      .group{font-size:12px;color:#6B6357;margin:2px 0 0}
      h1{font-size:64px;line-height:1.02;margin:26px 0 0;color:#1D3A2E;letter-spacing:-0.5px}
      h2{font-size:20px;font-weight:400;color:#6B6357;margin:6px 0 0}
      ul{list-style:none;padding:0;margin:26px 0 0;font-size:26px;line-height:1.55;color:#23201B}
      li{border-bottom:1px dotted #DED3BB;padding:2px 0}
      .none{color:#9AA98F;font-size:16px;margin:14px 0 0}
      .qr{margin-top:30px;display:flex;align-items:center;gap:14px;padding-top:16px;border-top:1px solid #DED3BB}
      .qr svg{width:34mm;height:34mm}
      .qr p{font-size:13px;color:#6B6357;margin:0;line-height:1.45}
    </style></head><body>${pages}</body></html>`;

  openPrintWindow(html);
}

function openPrintWindow(html: string) {
  const w = window.open('', '_blank');
  if (!w) { alert('Enable pop-ups to print.'); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

export function HousingTab() {
  const {
    selectedRetreat,
    housingFor, guestsFor, assignGuests, openModal, setHousingLocked, saveHousingVersion,
  } = useRetreatStore();
  // Subscribe to the stable `locations` array, then derive, returning a fresh array
  // straight from a selector infinite-loops under React 19 + zustand v5.
  const locations = useLocationStore((s) => s.locations);
  const versionsAll = useRetreatStore((s) => s.housingVersions);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const dorms = useMemo(
    () => locations.filter((l) => l.isDorm && l.retreatAvailable && l.isActive && l.parentId == null).sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<{ notes: string[]; before: { guestId: string; roomId: string | null }[] } | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const [signsOpen, setSignsOpen] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockResult, setLockResult] = useState<string | null>(null);
  const [signLastNames, setSignLastNames] = useState(true);
  const [signQr, setSignQr] = useState(true);
  const { can, currentUser } = useAuth();
  const canManage = can('manageRetreats');

  const retreat = selectedRetreat();

  if (!retreat) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-cream-dark rounded-2xl flex items-center justify-center mb-4">
            <Home className="w-7 h-7 text-forest/30" />
          </div>
          <h3 className="text-[15px] font-semibold text-forest mb-1.5">No retreats yet</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Add a retreat, then assign its subgroups to cabins and lock the housing plan here.
          </p>
        </div>
      </div>
    );
  }

  const rows = housingFor(retreat.id);
  const guests = guestsFor(retreat.id);
  const versions = versionsAll.filter((v) => v.retreatId === retreat.id).sort((a, b) => b.version - a.version);
  const guestsByRoom = new Map<string, RetreatGuest[]>();
  guests.forEach((g) => {
    if (!g.locationId) return;
    const list = guestsByRoom.get(g.locationId) ?? [];
    list.push(g);
    guestsByRoom.set(g.locationId, list);
  });
  const unplaced = guests.filter((g) => !g.locationId);
  const locById = new Map(locations.map((l) => [l.id, l]));

  // Rooms grouped under their building, with the housing row's own notes folded in.
  const rowByLocation = new Map(rows.filter((h) => h.locationId).map((h) => [h.locationId as string, h]));
  const roomLocations: CampLocation[] = [];
  const buildingVMs: BuildingVM[] = dorms.map((b) => {
    const rms = locations
      .filter((l) => l.parentId === b.id && l.retreatAvailable && l.isActive)
      .sort((a, c) => a.sortOrder - c.sortOrder || a.name.localeCompare(c.name));
    const asRooms = rms.length > 0 ? rms : [b];
    roomLocations.push(...asRooms);
    return {
      id: b.id,
      name: b.name,
      rooms: asRooms.map((rm) => {
        const h = rowByLocation.get(rm.id);
        return {
          id: rm.id,
          name: rm.name,
          capacity: rm.bedCapacity ?? 0,
          accessible: rm.accessible ?? false,
          // A cabin that has been shut since June must not quietly accept twelve guests.
          outOfService: rm.serviceStatus === 'out_of_service',
          outOfServiceReason: rm.outOfServiceReason,
          expectedBack: rm.expectedBack,
          unnamed: h?.unnamedCount ?? 0,
          note: h?.notes ?? null,
          subgroup: h?.subgroupName ?? null,
          occupants: (guestsByRoom.get(rm.id) ?? []).map((g) => ({
            id: g.id, name: g.fullName, needsAccessible: g.needsAccessible, subgroup: g.subgroup,
          })),
        };
      }),
    };
  }).filter((b) => b.rooms.length > 0);

  // ── The planner's view of the same data ──────────────────────────────────
  const plannerGuests: PlannerGuest[] = guests.map((g) => ({
    id: g.id, name: g.fullName, subgroup: g.subgroup, gender: g.gender,
    needsAccessible: g.needsAccessible, roomId: g.locationId,
  }));
  const plannerRooms: PlannerRoom[] = roomLocations.map((rm) => ({
    id: rm.id, name: rm.name, capacity: rm.bedCapacity ?? 0,
    accessible: rm.accessible ?? false,
    unnamed: rowByLocation.get(rm.id)?.unnamedCount ?? 0,
    blocked: rm.serviceStatus === 'out_of_service',
  }));
  const progress = summariseArrangement(plannerGuests, plannerRooms);

  const phase = derivePhase(rows, retreat?.housingSubmittedAt);
  const allLocked = phase === 3;
  // What locking will actually create, counted the way generate_turnover_work counts it: one per
  // distinct room on the housing plan, NOT per room that has a guest in it. A room held for a
  // group and left empty still gets turned over, and a dialog that promised a different number
  // than the board then shows is worse than no dialog.
  const occupiedRooms = new Set(rows.filter((h) => h.locationId).map((h) => h.locationId as string)).size;
  const assigned = rows.reduce((sum, h) => sum + h.peopleCount, 0);
  const editable = canManage && !allLocked;

  const banner = {
    1: {
      wrap: 'bg-blue-bg border-blue/25',
      title: 'text-blue-text', body: 'text-blue-text',
      titleText: 'Phase 1, Awaiting group housing submission',
      bodyText: retreat?.housingDeadline
        ? `The guest portal housing section is open. The coordinator has been notified to submit preferences. Submission deadline is ${fmtDateFull(retreat.housingDeadline)}. Available cabins are shown below.`
        : 'The guest portal housing section is open. The coordinator has been notified to submit their housing preferences. Available cabins are shown below.',
    },
    2: {
      wrap: 'bg-amber-bg border-amber/30',
      title: 'text-amber-text', body: 'text-amber-text',
      titleText: 'Phase 2, Housing in progress',
      bodyText: 'Assignments are being built. Review each cabin, then lock the plan to finalize it and snapshot a version the group can rely on.',
    },
    25: {
      wrap: 'bg-sage-pale border-sage/50',
      title: 'text-forest', body: 'text-forest/80',
      titleText: 'The group says their rooming is complete',
      bodyText: retreat?.housingSubmittedAt
        ? `${retreat.housingSubmittedBy ?? 'The coordinator'} marked it complete on ${fmtDateFull(retreat.housingSubmittedAt.slice(0, 10))}. Review it and lock the plan when you are happy. They can still reopen it until you do.`
        : 'Review it and lock the plan when you are happy.',
    },
    3: {
      wrap: 'bg-green-muted-bg border-sage/40',
      title: 'text-green-muted-text', body: 'text-green-muted-text',
      titleText: 'Phase 3 · Housing locked',
      bodyText: 'Housing is finalized. Any changes must be requested through the change requests tab and approved by the ops director before the plan is unlocked.',
    },
  }[phase];

  /**
   * Unlocking is immediate. Locking asks first, because it used to raise a work order per room
   * through a database trigger and tell nobody -- a camp finalised a rooming plan and found four
   * turnovers on the board with no idea what had made them.
   */
  function toggleLock() {
    if (!retreat) return;
    if (allLocked) { setHousingLocked(retreat.id, false); return; }
    setConfirmLock(true);
  }

  async function doLock(alsoCreateWork: boolean) {
    if (!retreat) return;
    setLocking(true);
    setHousingLocked(retreat.id, true);
    // The snapshot is the arrangement itself, so a locked plan can be brought back later.
    saveHousingVersion(retreat.id, 'Locked', snapshotSummary(guests, locById) || 'Housing finalized', currentUser.name || null);
    let made = 0;
    if (alsoCreateWork) made = await dbGenerateTurnover(retreat.id, 'room');
    setLocking(false);
    setConfirmLock(false);
    if (alsoCreateWork) {
      setLockResult(made === 0
        ? 'Housing is locked. No new turnover work was needed — it was already on the board.'
        : `Housing is locked, and ${made} turnover work order${made === 1 ? '' : 's'} ${made === 1 ? 'is' : 'are'} on the board.`);
    } else {
      setLockResult('Housing is locked. No work orders were created.');
    }
  }

  function saveSnapshot() {
    if (!retreat) return;
    const summary = snapshotSummary(guests, locById);
    if (!summary) return;
    saveHousingVersion(retreat.id, 'Saved', summary, currentUser.name || null);
    setRestoreResult('Saved. You can bring this arrangement back from the list below.');
  }

  /** A first draft you edit beats an empty grid. Applied immediately, undoable in one click. */
  function autoArrange() {
    const before = guests.map((g) => ({ guestId: g.id, roomId: g.locationId }));
    const result = planArrangement(plannerGuests, plannerRooms);
    if (result.placements.length === 0) {
      setPlan({ notes: result.notes, before: [] });
      return;
    }
    const byRoom = new Map<string, string[]>();
    for (const p of result.placements) {
      (byRoom.get(p.roomId) ?? byRoom.set(p.roomId, []).get(p.roomId)!).push(p.guestId);
    }
    byRoom.forEach((ids, roomId) => assignGuests(ids, roomId));
    setPlan({ notes: result.notes, before });
    setSelected(new Set());
  }

  function undoArrange() {
    if (!plan) return;
    const byRoom = new Map<string | null, string[]>();
    for (const b of plan.before) {
      (byRoom.get(b.roomId) ?? byRoom.set(b.roomId, []).get(b.roomId)!).push(b.guestId);
    }
    byRoom.forEach((ids, roomId) => assignGuests(ids, roomId));
    setPlan(null);
  }

  function restore(summary: string | null) {
    const parsed = parseSnapshot(summary, guests, roomLocations);
    if (!parsed) {
      setRestoreResult('That version was saved before arrangements were snapshotted, so there is nothing to restore from it.');
      return;
    }
    parsed.seats.forEach((ids, roomId) => assignGuests(ids, roomId));
    const clearIds = guests
      .filter((g) => g.locationId && !Array.from(parsed.seats.values()).some((ids) => ids.includes(g.id)))
      .map((g) => g.id);
    if (clearIds.length > 0) assignGuests(clearIds, null);

    const bits = [`Restored ${Array.from(parsed.seats.values()).reduce((n, ids) => n + ids.length, 0)} placements.`];
    if (parsed.missing.length > 0) bits.push(`${parsed.missing.length} name${parsed.missing.length === 1 ? '' : 's'} in that version ${parsed.missing.length === 1 ? 'is' : 'are'} no longer on the roster (${parsed.missing.slice(0, 4).join(', ')}${parsed.missing.length > 4 ? '…' : ''}).`);
    if (parsed.clearing.length > 0) bits.push(`${parsed.clearing.length} newer ${parsed.clearing.length === 1 ? 'name was' : 'names were'} put back on the list to place.`);
    setRestoreResult(bits.join(' '));
    setPlan(null);
  }

  function doorSigns() {
    if (!retreat) return;
    const sheets = roomLocations
      .map((loc) => ({
        loc,
        building: loc.parentId ? locById.get(loc.parentId)?.name ?? null : null,
        occupants: guestsByRoom.get(loc.id) ?? [],
        unnamed: rowByLocation.get(loc.id)?.unnamedCount ?? 0,
      }))
      // Only rooms this group is actually in. A sign for an empty cabin is paper nobody wants.
      .filter((r) => r.occupants.length > 0 || r.unnamed > 0);
    if (sheets.length === 0) { alert('Nobody is in a room yet, so there are no signs to print.'); return; }
    printDoorSigns(retreat, sheets, currentCamp?.name ?? 'Camp', currentCamp?.logoUrl ?? null,
      { lastNames: signLastNames, qr: signQr });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className={`rounded-card border px-5 py-4 mb-5 ${banner.wrap}`}>
        <p className={`text-[13px] font-semibold mb-1 ${banner.title}`}>{banner.titleText}</p>
        <p className={`text-[12px] leading-relaxed ${banner.body}`}>{banner.bodyText}</p>
      </div>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-[14px] font-semibold text-forest">
          Housing assignments · {retreat.groupName} · {assigned || billableHeadcount(retreat)} people ·{' '}
          <span className="font-mono text-ink-soft">{fmtDate(retreat.arrivalDate)}–{fmtDate(retreat.departureDate)}</span>
        </h3>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'housingHistory', retreatId: retreat.id })}>
            <History className="w-3.5 h-3.5" /> View version history
          </Button>
          <Button size="sm" variant="ghost" onClick={() => exportMap(retreat, rows, locById, guests)}>
            <Download className="w-3.5 h-3.5" /> Rooming sheet
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSignsOpen((v) => !v)}>
            <DoorClosed className="w-3.5 h-3.5" /> Door signs
          </Button>
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => openModal({ kind: 'spaces' })}>
              <Settings2 className="w-3.5 h-3.5" /> Manage spaces
            </Button>
          )}
          {canManage && rows.length > 0 && (
            <Button size="sm" variant={allLocked ? 'ghost' : 'primary'} onClick={toggleLock}>
              {allLocked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock housing</>}
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => openModal({ kind: 'housingAssign', retreatId: retreat.id })}>
              <Plus className="w-3.5 h-3.5" /> Assign
            </Button>
          )}
        </div>
      </div>

      {/* ── Locking asks, because it creates work ── */}
      {confirmLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/25 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-card border border-border bg-white shadow-lg p-5">
            <h3 className="font-display text-[16px] font-bold text-forest">Lock this housing plan?</h3>
            <p className="text-[13px] text-ink-soft leading-relaxed mt-2">
              Guests stop moving between rooms and the arrangement is saved so you can bring it
              back later.
            </p>

            <div className="mt-3.5 rounded-card border border-border bg-cream px-3.5 py-3">
              <p className="text-[12.5px] font-semibold text-forest">
                Turnover work: {occupiedRooms} room{occupiedRooms === 1 ? '' : 's'} to clean after they leave
              </p>
              <p className="text-[12px] text-ink-soft leading-relaxed mt-1">
                {occupiedRooms === 0
                  ? 'No rooms are on the housing plan yet, so there is nothing to turn over.'
                  : `One work order per room, for housekeeping, carrying the bed count. You can create them later instead — locking now and generating them nearer the date makes the same work.`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={() => doLock(true)} disabled={locking || occupiedRooms === 0} className="flex-1 justify-center">
                {locking ? 'Locking…' : 'Lock and create the turnover work'}
              </Button>
              <Button variant="ghost" onClick={() => doLock(false)} disabled={locking}>
                Lock only
              </Button>
              <Button variant="ghost" onClick={() => setConfirmLock(false)} disabled={locking}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {lockResult && (
        <div className="mx-4 sm:mx-7 mb-3 flex items-start justify-between gap-3 rounded-card border border-sage/40 bg-green-muted-bg px-3.5 py-2.5">
          <p className="text-[12.5px] text-green-muted-text">{lockResult}</p>
          <button onClick={() => setLockResult(null)} className="text-[12px] text-green-muted-text/70 hover:text-green-muted-text flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Door signs ── */}
      {signsOpen && (
        <div className="rounded-card border border-border bg-white px-5 py-4 mb-4">
          <p className="text-[13px] font-semibold text-forest">One printable sign per room</p>
          <p className="text-[12px] text-ink-soft mt-0.5 leading-relaxed max-w-2xl">
            Room name, who's in it, and your camp's name. Each sheet carries that room's QR code.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
            <label className="inline-flex items-center gap-2 text-[12.5px] text-ink cursor-pointer">
              <input type="checkbox" checked={signLastNames} onChange={(e) => setSignLastNames(e.target.checked)} className="accent-sage" />
              Print last names
            </label>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-ink cursor-pointer">
              <input type="checkbox" checked={signQr} onChange={(e) => setSignQr(e.target.checked)} className="accent-sage" />
              Include this room's QR code
            </label>
            <Button size="sm" onClick={doorSigns}>Print signs</Button>
          </div>
          {!signLastNames && (
            <p className="text-[11.5px] text-ink-faint mt-2">
              First names only.
            </p>
          )}
        </div>
      )}

      {/* ── Where this plan actually stands ── */}
      {guests.length > 0 && (
        <div className="rounded-card border border-border bg-white px-5 py-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[13px] font-semibold text-forest inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-sage" />
              {/* Not a percentage. A percentage tells nobody which thing to fix. */}
              {progress.line}
            </p>
            <div className="flex gap-2 flex-wrap">
              {editable && unplaced.length > 0 && (
                <Button size="sm" variant="ghost" onClick={autoArrange}>
                  <Wand2 className="w-3.5 h-3.5" /> Auto-arrange
                </Button>
              )}
              {editable && guests.some((g) => g.locationId) && (
                <Button size="sm" variant="ghost" onClick={saveSnapshot}>
                  <Save className="w-3.5 h-3.5" /> Save this arrangement
                </Button>
              )}
              {versions.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setRestoreOpen((v) => !v)}>
                  <RotateCcw className="w-3.5 h-3.5" /> Earlier arrangements
                </Button>
              )}
            </div>
          </div>

          {plan && (
            <div className="mt-3 pt-3 border-t border-cream-dark">
              <div className="flex items-start justify-between gap-3">
                <ul className="text-[12.5px] text-ink-soft space-y-0.5">
                  {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
                {plan.before.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={undoArrange}>
                    <Undo2 className="w-3.5 h-3.5" /> Undo
                  </Button>
                )}
              </div>
              <p className="text-[11.5px] text-ink-faint mt-2">
                It's a draft. Move anybody it got wrong.
              </p>
            </div>
          )}

          {restoreOpen && (
            <div className="mt-3 pt-3 border-t border-cream-dark space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
                Saved arrangements
              </p>
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-btn border border-border bg-cream px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-forest font-medium">
                      v{v.version}{v.label ? ` · ${v.label}` : ''}
                      <span className="text-ink-faint font-normal"> · {fmtDateFull(v.createdAt.slice(0, 10))}{v.createdBy ? ` · ${v.createdBy}` : ''}</span>
                    </p>
                    <p className="text-[11.5px] text-ink-soft truncate">{v.summary}</p>
                  </div>
                  {editable && (
                    <button
                      onClick={() => restore(v.summary)}
                      className="flex-shrink-0 text-[12px] font-semibold text-forest hover:opacity-70"
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {restoreResult && <p className="text-[12.5px] text-green-muted-text mt-2">{restoreResult}</p>}

          {/* Staging tray. Pick people here, then open a building and drop them in a room.
              The same select-then-place model the group uses in their portal, so a room
              swap the camp makes and one the coordinator makes work identically. */}
          {editable && (unplaced.length > 0 || selected.size > 0) && (
            <>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {unplaced.map((g) => {
                  const on = selected.has(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                        return next;
                      })}
                      className={`text-[11.5px] rounded-full px-2.5 py-1 border transition-colors ${
                        on ? 'bg-forest text-white border-forest' : 'bg-cream-dark text-ink border-transparent hover:border-sage'
                      }`}
                    >
                      {g.fullName}
                    </button>
                  );
                })}
              </div>
              {unplaced.length > 1 && (
                <button
                  onClick={() => setSelected(new Set(unplaced.map((g) => g.id)))}
                  className="text-[12px] font-semibold text-forest hover:text-forest-mid mt-2"
                >
                  Select all {unplaced.length}
                </button>
              )}
            </>
          )}

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-cream-dark">
              <p className="text-[12.5px] font-semibold text-forest">
                {selected.size} selected. Open a building below and pick a room.
              </p>
              <button onClick={() => setSelected(new Set())} className="text-[12px] text-ink-soft hover:text-forest">
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {guests.length === 0 && (
        <div className="rounded-card border border-border bg-white px-5 py-8 text-center mb-4">
          <Users className="w-7 h-7 text-ink-faint mx-auto mb-2.5" />
          <p className="text-[14px] font-semibold text-forest">Nobody's placed yet</p>
          <p className="text-[13px] text-ink-soft mt-1.5 max-w-md mx-auto leading-relaxed">
            The group hasn't sent their guest list. They can paste it or drop a spreadsheet into
            their portal, and then either of you can sort people into rooms.
          </p>
        </div>
      )}

      <BuildingAccordion
        buildings={buildingVMs}
        selectedCount={selected.size}
        editable={editable}
        onPlace={(roomId) => {
          assignGuests(Array.from(selected), roomId);
          setSelected(new Set());
        }}
        onRemove={(guestId) => assignGuests([guestId], null)}
        onDropGuest={(guestId, roomId) => assignGuests([guestId], roomId)}
        emptyMessage="No cabins defined yet. Add your camp's spaces first, then assign this group."
      />
    </div>
  );
}
