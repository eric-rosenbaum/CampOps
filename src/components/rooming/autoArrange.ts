/**
 * A first draft of a rooming plan, and an honest reading of one.
 *
 * Two functions, shared by the coordinator's portal board and the camp's Housing tab, because
 * both halves must draw the same conclusions from the same list. A group that is told "62 of
 * 80 placed, 2 step-free requests unmet" in the portal and something else on the camp screen
 * has two sources of truth and therefore none.
 *
 * `planArrangement` never writes anything. It returns placements, what it could not do, and a
 * plain-English account of the decisions it made — the caller applies them and can hand the
 * whole thing back. An auto-arrange you cannot undo is one nobody dares press.
 */

export interface PlannerGuest {
  id: string;
  name: string;
  subgroup: string | null;
  /** Free text as the group typed it ("F", "female", "boy"). Normalised, never assumed. */
  gender: string | null;
  needsAccessible: boolean;
  /** Where they already are. Only guests with `roomId === null` are moved. */
  roomId: string | null;
}

export interface PlannerRoom {
  id: string;
  name: string;
  capacity: number;
  accessible: boolean;
  /** People booked here as a bare number, holding beds no name will ever fill. */
  unnamed: number;
  /** Out of service, or held by a date-overlapping group. Never receives anybody. */
  blocked: boolean;
}

export interface ArrangementPlan {
  /** guestId → roomId, for the guests this run placed. */
  placements: { guestId: string; roomId: string }[];
  /** Guests it could not seat, with the reason attached to the plan's notes. */
  unplaced: PlannerGuest[];
  /** What it did, in words. Shown to the person who pressed the button. */
  notes: string[];
}

/** "F" / "female" / "Girl" all mean the same thing; anything unrecognised means "not given". */
function normGender(g: string | null): 'f' | 'm' | null {
  const v = (g ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith('f') || v.startsWith('w') || v.startsWith('g')) return 'f';
  if (v.startsWith('m') || v.startsWith('b')) return 'm';
  return null;
}

interface Party {
  key: string;
  /** The subgroup's own name where it has one, otherwise the person's — used in the notes. */
  label: string;
  guests: PlannerGuest[];
  gender: 'f' | 'm' | null;
  needsAccessible: boolean;
}

interface RoomState {
  room: PlannerRoom;
  free: number;
  /** Genders already in the room, from people who are staying put. */
  genders: Set<'f' | 'm'>;
  /** Whether anybody is in it at all. An empty room is a better home for a family. */
  occupied: number;
}

function compatible(state: RoomState, party: Party): boolean {
  if (party.gender == null) return true;
  // Gender is respected only where the group gave it. A room holding people whose gender was
  // never stated is not evidence of anything, so it stays open.
  for (const g of state.genders) if (g !== party.gender) return false;
  return true;
}

/**
 * Seat everybody who has no room yet.
 *
 * Best fit, not first fit — the smallest room that takes the whole party, preferring an empty
 * one. Packing into the biggest room available is what a naive version does, and it strands a
 * family of five in a twenty-bed dorm while six six-bed rooms sit empty.
 *
 * Order matters: step-free needs are placed first because accessible rooms are the scarce
 * resource, and a plan that fills them with people who did not ask for them has failed the
 * one person who did.
 */
export function planArrangement(guests: PlannerGuest[], rooms: PlannerRoom[]): ArrangementPlan {
  const notes: string[] = [];
  const placements: { guestId: string; roomId: string }[] = [];

  const states: RoomState[] = rooms
    .filter((r) => !r.blocked && r.capacity > 0)
    .map((r) => {
      const sitting = guests.filter((g) => g.roomId === r.id);
      return {
        room: r,
        free: Math.max(0, r.capacity - sitting.length - r.unnamed),
        genders: new Set(sitting.map((g) => normGender(g.gender)).filter((g): g is 'f' | 'm' => g != null)),
        occupied: sitting.length + r.unnamed,
      };
    });

  const closed = rooms.filter((r) => r.blocked).length;
  if (closed > 0) notes.push(`Skipped ${closed} room${closed === 1 ? '' : 's'} that ${closed === 1 ? 'is' : 'are'} out of service or held by another group.`);

  const toPlace = guests.filter((g) => g.roomId == null);
  if (toPlace.length === 0) return { placements, unplaced: [], notes: ['Everyone already has a bed.'] };

  // ── Parties: a subgroup travels together, and is split by gender only when the group gave
  // one. Someone with no subgroup is a party of one, which is exactly right: they can slot
  // into any room with a free bed without breaking anybody else up.
  const bySubgroup = new Map<string, PlannerGuest[]>();
  for (const g of toPlace) {
    const key = g.subgroup?.trim() ? `sg:${g.subgroup.trim().toLowerCase()}` : `solo:${g.id}`;
    (bySubgroup.get(key) ?? bySubgroup.set(key, []).get(key)!).push(g);
  }

  const parties: Party[] = [];
  let genderSplits = 0;
  for (const [key, members] of bySubgroup) {
    const buckets = new Map<string, PlannerGuest[]>();
    for (const g of members) {
      const gk = normGender(g.gender) ?? 'x';
      (buckets.get(gk) ?? buckets.set(gk, []).get(gk)!).push(g);
    }
    const realGenders = Array.from(buckets.keys()).filter((k) => k !== 'x');
    const wasSplit = realGenders.length > 1;
    if (wasSplit) genderSplits += 1;

    // Unstated gender rides along with the largest stated bucket rather than becoming a third
    // party of its own — a family of four with one blank cell should not end up in two rooms
    // over a missing spreadsheet value.
    if (wasSplit && buckets.has('x')) {
      const biggest = realGenders.sort((a, b) => (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0))[0];
      buckets.get(biggest)!.push(...buckets.get('x')!);
      buckets.delete('x');
    }

    for (const [gk, list] of buckets) {
      parties.push({
        key: `${key}/${gk}`,
        label: members[0].subgroup?.trim() || list[0].name,
        guests: list,
        gender: gk === 'x' ? null : (gk as 'f' | 'm'),
        needsAccessible: list.some((g) => g.needsAccessible),
      });
    }
  }

  // Largest parties first: the hardest thing to house is a group of nine, and if it goes last
  // the only beds left are one here and two there.
  const ordered = parties.sort((a, b) => {
    if (a.needsAccessible !== b.needsAccessible) return a.needsAccessible ? -1 : 1;
    return b.guests.length - a.guests.length;
  });

  const unplaced: PlannerGuest[] = [];
  let kept = 0, split = 0, accessiblePlaced = 0, accessibleMissed = 0;
  const splitNames: string[] = [];

  for (const party of ordered) {
    const wantAccessible = party.needsAccessible;
    let pool = states.filter((s) => s.free > 0 && compatible(s, party) && (!wantAccessible || s.room.accessible));

    // No accessible room has a bed. Seating them anyway beats leaving them on the list — an
    // unmet step-free request is visible in the progress line and fixable; a person nobody
    // placed is just missing.
    let accessibleFallback = false;
    if (pool.length === 0 && wantAccessible) {
      pool = states.filter((s) => s.free > 0 && compatible(s, party));
      accessibleFallback = pool.length > 0;
    }
    if (accessibleFallback) accessibleMissed += party.guests.filter((g) => g.needsAccessible).length;

    // Whole party in one room: prefer an empty room, then the snuggest fit.
    const whole = pool
      .filter((s) => s.free >= party.guests.length)
      .sort((a, b) => {
        if ((a.occupied > 0) !== (b.occupied > 0)) return a.occupied > 0 ? 1 : -1;
        return a.free - b.free;
      })[0];

    if (whole) {
      seat(whole, party.guests);
      kept += 1;
      if (wantAccessible && !accessibleFallback) accessiblePlaced += 1;
      continue;
    }

    // Nothing holds them whole. Spread across the roomiest compatible rooms rather than
    // refusing: a draft with a family in two cabins is still a better starting point than a
    // blank grid, and the note below says exactly what happened so it can be fixed by hand.
    let cursor = 0;
    const spread = pool.slice().sort((a, b) => b.free - a.free);
    for (const s of spread) {
      if (cursor >= party.guests.length) break;
      const take = party.guests.slice(cursor, cursor + s.free);
      cursor += take.length;
      seat(s, take);
    }
    if (cursor === 0) {
      unplaced.push(...party.guests);
      continue;
    }
    if (party.guests.length > 1) { split += 1; splitNames.push(party.label); }
    if (cursor < party.guests.length) unplaced.push(...party.guests.slice(cursor));
  }

  function seat(state: RoomState, people: PlannerGuest[]) {
    for (const g of people) {
      placements.push({ guestId: g.id, roomId: state.room.id });
      const ng = normGender(g.gender);
      if (ng) state.genders.add(ng);
    }
    state.free -= people.length;
    state.occupied += people.length;
  }

  // ── What it did, in words. A number on its own is not an explanation.
  notes.unshift(`Placed ${placements.length} of ${toPlace.length}.`);
  if (kept > 0) notes.push(`Kept ${kept} group${kept === 1 ? '' : 's'} together in one room.`);
  if (split > 0) {
    const named = splitNames.slice(0, 3).join(', ');
    notes.push(`Spread ${split === 1 ? named : `${split} groups (${named}${splitNames.length > 3 ? ', …' : ''})`} over more than one room — no single room was big enough.`);
  }
  if (genderSplits > 0) notes.push(`Separated ${genderSplits} group${genderSplits === 1 ? '' : 's'} by gender, because the list gave one.`);
  if (accessiblePlaced > 0) notes.push(`${accessiblePlaced} step-free request${accessiblePlaced === 1 ? '' : 's'} put in an accessible room.`);
  if (accessibleMissed > 0) notes.push(`${accessibleMissed} step-free request${accessibleMissed === 1 ? '' : 's'} could not be met — no accessible room had a free bed.`);
  if (unplaced.length > 0) notes.push(`${unplaced.length} left over with nowhere to go. Free up beds, or open more rooms, and run it again.`);

  return { placements, unplaced, notes };
}

export interface ArrangementSummary {
  placed: number;
  total: number;
  roomsOver: number;
  accessibleUnmet: number;
  /** The single honest line: what is done, and what is wrong with it. */
  line: string;
}

/**
 * The progress line.
 *
 * Deliberately not a percentage. "78% complete" tells a coordinator nothing they can act on,
 * whereas "3 rooms over capacity · 2 step-free requests unmet" names the two things standing
 * between them and a finished plan.
 */
export function summariseArrangement(guests: PlannerGuest[], rooms: PlannerRoom[]): ArrangementSummary {
  const total = guests.length;
  const placed = guests.filter((g) => g.roomId != null).length;
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  let roomsOver = 0;
  for (const r of rooms) {
    if (r.blocked || r.capacity <= 0) continue;
    const n = guests.filter((g) => g.roomId === r.id).length + r.unnamed;
    if (n > r.capacity) roomsOver += 1;
  }

  // Unmet means both kinds: asked for step-free and sitting in a room that isn't, and asked
  // for step-free and still sitting on the list.
  const accessibleUnmet = guests.filter((g) => {
    if (!g.needsAccessible) return false;
    if (g.roomId == null) return true;
    return !roomById.get(g.roomId)?.accessible;
  }).length;

  const parts = [`${placed} of ${total} placed`];
  if (roomsOver > 0) parts.push(`${roomsOver} room${roomsOver === 1 ? '' : 's'} over capacity`);
  if (accessibleUnmet > 0) parts.push(`${accessibleUnmet} step-free request${accessibleUnmet === 1 ? '' : 's'} unmet`);
  if (parts.length === 1 && placed === total && total > 0) parts.push('nothing outstanding');

  return { placed, total, roomsOver, accessibleUnmet, line: parts.join(' · ') };
}
