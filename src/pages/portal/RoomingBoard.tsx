import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Users, UserPlus, Trash2, Loader2, Search, Accessibility, Lock,
  UploadCloud, AlertTriangle, Check, Wand2, Undo2, FileSpreadsheet, X,
} from 'lucide-react';
import {
  supabasePublic, cardClass, inputClass, labelClass, btnPrimary, btnGhost,
  parseNames, looksLastFirst, readPortalSession,
  type PortalRetreat, type PortalSpace, type PortalGuest, type PortalHousing, type ParsedGuest,
} from './portalShared';
import { BuildingAccordion, type BuildingVM } from '@/components/rooming/BuildingAccordion';
import {
  planArrangement, summariseArrangement, type PlannerGuest, type PlannerRoom,
} from '@/components/rooming/autoArrange';

/**
 * Roster entry and per-person room assignment.
 *
 * The interaction is select-then-place rather than drag-first. Dragging one of eighty names
 * on a phone is miserable, and a coordinator doing this on the sofa is the common case · so
 * selection is the model that works everywhere, and drag is layered on top for pointer
 * devices where it genuinely feels better.
 *
 * Every placement saves immediately. Someone who seats eighty people and loses it does not
 * come back; the explicit "send to camp" step further down is about meaning, not safety.
 */

/**
 * A room's service status, if the camp's portal payload carries one.
 *
 * Out-of-service rooms never reach here.
 *
 * They used to arrive with their service status, reason and expected-back date, and the board
 * greyed them out and said why -- which told a church group that the septic line is dug up.
 * The portal RPC now leaves them off the list entirely: a room is available, or it is not
 * offered. What arrives instead is a description, so a group choosing between Cabin 1 and
 * Cabin 7 has something to choose on.
 */

export function RoomingBoard({
  retreat, spaces, guests, housing, token, refetch, locked, deadlinePassed,
}: {
  retreat: PortalRetreat;
  spaces: PortalSpace[];
  guests: PortalGuest[];
  housing: PortalHousing[];
  token: string;
  refetch: () => Promise<void>;
  locked: boolean;
  deadlinePassed: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [plan, setPlan] = useState<{ notes: string[]; before: { guestId: string; roomId: string | null }[] } | null>(null);
  const lastClicked = useRef<string | null>(null);

  const unassigned = useMemo(
    () => guests.filter((g) => !g.location_id),
    [guests],
  );
  const visibleUnassigned = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unassigned;
    return unassigned.filter(
      (g) => g.full_name.toLowerCase().includes(q) || (g.subgroup ?? '').toLowerCase().includes(q),
    );
  }, [unassigned, search]);

  const byRoom = useMemo(() => {
    const m = new Map<string, PortalGuest[]>();
    guests.forEach((g) => {
      if (!g.location_id) return;
      const list = m.get(g.location_id) ?? [];
      list.push(g);
      m.set(g.location_id, list);
    });
    return m;
  }, [guests]);

  // Rooms grouped under their building, in the order the camp lists them.
  const buildings = useMemo(() => {
    const m = new Map<string, { id: string; name: string; rooms: PortalSpace[] }>();
    spaces.forEach((s) => {
      const key = s.building_id ?? s.id;
      const entry = m.get(key) ?? { id: key, name: s.building ?? s.name, rooms: [] };
      entry.rooms.push(s);
      m.set(key, entry);
    });
    return Array.from(m.values());
  }, [spaces]);

  // Rooms booked the old way, a number, no names. Shown so a group part-way through the
  // switch to named guests does not think the camp has lost their booking.
  const unnamedCounts = useMemo(() => {
    const m = new Map<string, number>();
    housing.forEach((h) => {
      if ((h.unnamed_count ?? 0) > 0) m.set(h.space_id, h.unnamed_count as number);
    });
    return m;
  }, [housing]);

  const buildingVMs: BuildingVM[] = useMemo(() => buildings.map((b) => ({
    id: b.id,
    name: b.name,
    rooms: b.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      capacity: room.bed_capacity ?? 0,
      accessible: room.accessible ?? false,
      heldByOther: room.taken_by_other,
      note: room.description ?? null,
      unnamed: unnamedCounts.get(room.id) ?? 0,
      occupants: (byRoom.get(room.id) ?? []).map((g) => ({
        id: g.id, name: g.full_name, needsAccessible: g.needs_accessible, subgroup: g.subgroup,
      })),
    })),
  })), [buildings, byRoom, unnamedCounts]);

  // ── The planner's view of the same board ─────────────────────────────────
  const plannerGuests: PlannerGuest[] = useMemo(() => guests.map((g) => ({
    id: g.id, name: g.full_name, subgroup: g.subgroup, gender: g.gender,
    needsAccessible: g.needs_accessible, roomId: g.location_id,
  })), [guests]);
  const plannerRooms: PlannerRoom[] = useMemo(() => spaces.map((s) => ({
    id: s.id, name: s.name, capacity: s.bed_capacity ?? 0,
    accessible: s.accessible ?? false,
    unnamed: unnamedCounts.get(s.id) ?? 0,
    blocked: !!s.taken_by_other,
  })), [spaces, unnamedCounts]);
  const progress = useMemo(
    () => summariseArrangement(plannerGuests, plannerRooms),
    [plannerGuests, plannerRooms],
  );

  const subgroups = useMemo(() => {
    const set = new Set<string>();
    unassigned.forEach((g) => { if (g.subgroup) set.add(g.subgroup); });
    return Array.from(set).sort();
  }, [unassigned]);

  const editable = !locked;

  function toggle(id: string, shiftKey = false) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClicked.current) {
        // Range-select across what is currently visible, a 60-person youth group should be
        // two clicks, not sixty.
        const ids = visibleUnassigned.map((g) => g.id);
        const a = ids.indexOf(lastClicked.current);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    lastClicked.current = id;
  }

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true); setError(null);
    const { data, error: err } = await supabasePublic.rpc(fn, { ...args, p_access: readPortalSession(token) });
    setBusy(false);
    if (err) { setError('Could not save. Please check your connection and try again.'); return null; }
    const res = data as { ok: boolean; error?: string } | null;
    if (!res?.ok) { setError(res?.error ?? 'Could not save.'); return null; }
    await refetch();
    return res;
  }

  async function place(ids: string[], locationId: string | null) {
    if (ids.length === 0) return;
    const res = await call('portal_assign_guests', {
      p_token: token, p_guest_ids: ids, p_location_id: locationId,
    });
    if (res) setSelected(new Set());
  }

  async function removeGuests(ids: string[]) {
    if (ids.length === 0) return;
    const res = await call('portal_delete_guests', { p_token: token, p_guest_ids: ids });
    if (res) setSelected(new Set());
  }

  /**
   * Seat a whole subgroup together.
   *
   * Best fit, not first fit: the smallest room that takes the entire group. Packing into the
   * biggest room available is what a naive version does, and it strands a family of five in a
   * twenty-bed dorm while six six-bed rooms sit empty. Only when nothing holds the group does
   * this fall back to filling the roomiest spaces first.
   */
  async function autoFill(subgroup: string) {
    const people = unassigned.filter((g) => g.subgroup === subgroup);
    if (people.length === 0) return;

    const open = spaces
      .filter((s) => !s.taken_by_other)
      .map((s) => ({
        s,
        // Beds already spoken for include people booked by count, with no name attached.
        free: (s.bed_capacity ?? 0) - (byRoom.get(s.id)?.length ?? 0) - (unnamedCounts.get(s.id) ?? 0),
      }))
      .filter((r) => r.free > 0);

    // "Seat them together" means a room of their own where one exists, so an empty room wins
    // over an exact fit alongside another group. Among equals, the snuggest room.
    const exact = open
      .filter((r) => r.free >= people.length)
      .sort((a, b) => {
        const aOcc = (byRoom.get(a.s.id)?.length ?? 0) + (unnamedCounts.get(a.s.id) ?? 0);
        const bOcc = (byRoom.get(b.s.id)?.length ?? 0) + (unnamedCounts.get(b.s.id) ?? 0);
        if ((aOcc > 0) !== (bOcc > 0)) return aOcc > 0 ? 1 : -1;
        return a.free - b.free;
      })[0];

    if (exact) {
      await call('portal_assign_guests', {
        p_token: token, p_guest_ids: people.map((g) => g.id), p_location_id: exact.s.id,
      });
      setSelected(new Set());
      return;
    }

    let cursor = 0;
    for (const room of open.sort((a, b) => b.free - a.free)) {
      if (cursor >= people.length) break;
      const take = people.slice(cursor, cursor + room.free).map((g) => g.id);
      cursor += take.length;
      const res = await call('portal_assign_guests', {
        p_token: token, p_guest_ids: take, p_location_id: room.s.id,
      });
      if (!res) return;
    }
    if (cursor < people.length) {
      setError(`Seated ${cursor} of ${people.length}. There are not enough open beds for the rest.`);
    }
    setSelected(new Set());
  }

  /**
   * One click for a first draft of the whole list.
   *
   * A blank grid of forty rooms is the point at which a coordinator closes the tab and emails
   * the camp a spreadsheet instead. A draft that keeps families together and respects the
   * gender and step-free answers they already gave is wrong in a handful of places, and
   * fixing a handful of places is a five-minute job.
   */
  async function autoArrange() {
    const result = planArrangement(plannerGuests, plannerRooms);
    if (result.placements.length === 0) {
      setPlan({ notes: result.notes, before: [] });
      return;
    }
    const before = guests.map((g) => ({ guestId: g.id, roomId: g.location_id }));
    const byTarget = new Map<string, string[]>();
    for (const p of result.placements) {
      (byTarget.get(p.roomId) ?? byTarget.set(p.roomId, []).get(p.roomId)!).push(p.guestId);
    }
    for (const [roomId, ids] of byTarget) {
      const res = await call('portal_assign_guests', { p_token: token, p_guest_ids: ids, p_location_id: roomId });
      if (!res) return;
    }
    setPlan({ notes: result.notes, before });
    setSelected(new Set());
  }

  async function undoArrange() {
    if (!plan) return;
    const byTarget = new Map<string | null, string[]>();
    for (const b of plan.before) {
      (byTarget.get(b.roomId) ?? byTarget.set(b.roomId, []).get(b.roomId)!).push(b.guestId);
    }
    for (const [roomId, ids] of byTarget) {
      const res = await call('portal_assign_guests', { p_token: token, p_guest_ids: ids, p_location_id: roomId });
      if (!res) return;
    }
    setPlan(null);
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-start gap-2.5 bg-cream-dark border border-border rounded-xl px-4 py-3">
          <Lock className="w-4 h-4 text-ink-soft flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink">
            The camp has finalised your rooming list, so it can no longer be changed here.
            Contact your coordinator if something needs to move.
          </p>
        </div>
      )}
      {!locked && deadlinePassed && (
        <div className="flex items-start gap-2.5 bg-amber-bg border border-amber/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-text">
            The housing deadline has passed. You can still make changes, but please tell the
            camp directly so they know to expect them.
          </p>
        </div>
      )}

      {/* Roster summary + add */}
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[15px] font-bold text-forest">
              {guests.length} {guests.length === 1 ? 'name' : 'names'} on your list
            </p>
            {/* Not a percentage: name what is blocking, don't just count it. */}
            <p className="text-[12.5px] text-ink-soft mt-0.5">
              {guests.length === 0 ? 'Nothing on the list yet' : progress.line}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {editable && guests.length > 0 && unassigned.length > 0 && (
              <button onClick={autoArrange} disabled={busy} className={btnGhost}>
                <Wand2 className="w-4 h-4" /> Auto-arrange
              </button>
            )}
            {editable && (
              <button onClick={() => setAdding((v) => !v)} className={btnGhost}>
                <UserPlus className="w-4 h-4" /> Add names
              </button>
            )}
          </div>
        </div>

        {plan && (
          <div className="mt-3 pt-3 border-t border-cream-dark">
            <div className="flex items-start justify-between gap-3">
              <ul className="text-[12.5px] text-ink-soft space-y-0.5">
                {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              {plan.before.length > 0 && editable && (
                <button onClick={undoArrange} disabled={busy} className={`${btnGhost} flex-shrink-0`}>
                  <Undo2 className="w-4 h-4" /> Undo
                </button>
              )}
            </div>
            <p className="text-[11.5px] text-ink-faint mt-2">
              It's a draft — move anyone it got wrong. That's quicker than starting from empty.
            </p>
          </div>
        )}

        {adding && editable && (
          <AddNamesPanel
            token={token}
            retreat={retreat}
            hasGuests={guests.length > 0}
            onDone={async () => { setAdding(false); await refetch(); }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      {guests.length === 0 && !adding && (
        <div className={`${cardClass} p-8 text-center`}>
          <Users className="w-8 h-8 text-ink-faint mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-forest">Nobody's placed yet</p>
          <p className="text-[13px] text-ink-soft mt-1.5 max-w-sm mx-auto leading-relaxed">
            Paste your list or drop a spreadsheet and we'll give you a first draft to fix up.
          </p>
          {editable && (
            <button onClick={() => setAdding(true)} className={`${btnPrimary} mt-4`}>
              <UserPlus className="w-4 h-4" /> Add names
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 bg-red-bg border border-red/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-red">{error}</p>
        </div>
      )}

      {guests.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* ── Unassigned ── */}
          <div className={`${cardClass} p-4 lg:sticky lg:top-20`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-bold uppercase tracking-wide text-ink-faint">
                To place · {unassigned.length}
              </p>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-[12px] font-semibold text-ink-soft hover:text-forest"
                >
                  Clear selection
                </button>
              )}
            </div>

            {unassigned.length > 6 && (
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search names"
                  className={`${inputClass} pl-10 py-2.5 text-[14px]`}
                />
              </div>
            )}

            {subgroups.length > 0 && editable && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {subgroups.map((sg) => (
                  <button
                    key={sg}
                    onClick={() => autoFill(sg)}
                    disabled={busy}
                    title={`Seat everyone in ${sg} together`}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest bg-sage-pale border border-sage/30 rounded-full px-3 py-1.5 hover:bg-sage-pale/70 disabled:opacity-40"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Seat {sg} together
                  </button>
                ))}
              </div>
            )}

            {visibleUnassigned.length === 0 ? (
              <p className="text-[13px] text-ink-faint italic py-3">
                {unassigned.length === 0 ? 'Everyone has been placed.' : 'No names match that search.'}
              </p>
            ) : (
              <>
                {editable && visibleUnassigned.length > 1 && (
                  <button
                    onClick={() => setSelected(new Set(visibleUnassigned.map((g) => g.id)))}
                    className="text-[12px] font-semibold text-forest hover:text-forest-mid mb-2"
                  >
                    Select all {visibleUnassigned.length}
                  </button>
                )}
                <div className="flex flex-wrap gap-1.5 max-h-[45vh] overflow-y-auto">
                  {visibleUnassigned.map((g) => (
                    <GuestChip
                      key={g.id}
                      draggableId={editable ? g.id : undefined}
                      dragGroup={selected.has(g.id) ? selectedIds : undefined}
                      guest={g}
                      selected={selected.has(g.id)}
                      disabled={!editable}
                      onClick={(shift) => editable && toggle(g.id, shift)}
                    />
                  ))}
                </div>
              </>
            )}

            {selectedIds.length > 0 && editable && (
              <div className="mt-3 pt-3 border-t border-cream-dark flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-forest">
                  {selectedIds.length} selected. Pick a room →
                </p>
                <button
                  onClick={() => removeGuests(selectedIds)}
                  disabled={busy}
                  className="text-[12px] font-semibold text-red hover:opacity-70 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            )}
          </div>

          {/* ── Rooms ── */}
          <div>
            <BuildingAccordion
              buildings={buildingVMs}
              selectedCount={selectedIds.length}
              editable={editable}
              busy={busy}
              onPlace={(roomId) => place(selectedIds, roomId)}
              onRemove={(guestId) => place([guestId], null)}
              onDropGuest={(guestId, roomId) => place([guestId], roomId)}
              emptyMessage="The camp has not published any rooms for your dates yet."
            />
          </div>
        </div>
      )}

      {busy && (
        <p className="text-[12px] text-ink-soft inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}

// ─── One name ────────────────────────────────────────────────────────────────
function GuestChip({
  guest, selected, disabled, onClick, draggableId, dragGroup,
}: {
  guest: PortalGuest; selected: boolean; disabled?: boolean;
  onClick: (shift: boolean) => void;
  /** Set to make this one person draggable into a room without selecting first. */
  draggableId?: string;
  /** When this person is part of the current selection, drag the whole selection. */
  dragGroup?: string[];
}) {
  return (
    <button
      onClick={(e) => onClick(e.shiftKey)}
      disabled={disabled}
      draggable={!!draggableId}
      onDragStart={(e) => {
        if (!draggableId) return;
        e.stopPropagation();
        // A person inside the selection drags the selection; a person outside it drags alone.
        const ids = dragGroup && dragGroup.length > 1 ? dragGroup : [draggableId];
        e.dataTransfer.setData('application/x-campops-guests', JSON.stringify(ids));
        e.dataTransfer.setData('application/x-campops-guest', draggableId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`inline-flex items-center gap-1.5 text-[13px] rounded-full pl-2.5 pr-3 py-1.5 border transition-colors ${
        selected
          ? 'bg-forest text-white border-forest'
          : 'bg-cream border-border text-ink hover:border-sage disabled:hover:border-border'
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
        selected ? 'bg-white border-white' : 'border-ink-faint'
      }`}>
        {selected && <Check className="w-2.5 h-2.5 text-forest" strokeWidth={4} />}
      </span>
      {guest.full_name}
      {guest.needs_accessible && <Accessibility className={`w-3.5 h-3.5 ${selected ? 'text-white' : 'text-blue'}`} />}
    </button>
  );
}

// ─── Spreadsheet import ──────────────────────────────────────────────────────
/** The fields a sheet can supply. `first`/`last` exist because half of all lists split them. */
type Field = 'full_name' | 'first' | 'last' | 'subgroup' | 'gender' | 'dietary' | 'notes' | '';

const FIELD_LABELS: Record<Exclude<Field, ''>, string> = {
  full_name: 'Name', first: 'First name', last: 'Last name',
  subgroup: 'Family / group', gender: 'Gender', dietary: 'Dietary', notes: 'Notes',
};

const HEADER_GUESSES: { field: Exclude<Field, ''>; words: string[] }[] = [
  { field: 'full_name', words: ['full name', 'fullname', 'name', 'guest', 'guest name', 'person', 'attendee', 'camper', 'participant'] },
  { field: 'first', words: ['first', 'first name', 'firstname', 'given', 'given name', 'forename'] },
  { field: 'last', words: ['last', 'last name', 'lastname', 'surname', 'family name'] },
  { field: 'subgroup', words: ['subgroup', 'group', 'family', 'team', 'bus', 'unit', 'cohort', 'cabin group'] },
  { field: 'gender', words: ['gender', 'sex', 'm/f'] },
  { field: 'dietary', words: ['dietary', 'diet', 'allergies', 'allergy', 'dietary needs', 'food'] },
  { field: 'notes', words: ['notes', 'note', 'comment', 'comments', 'other'] },
];

/**
 * Guess what each column is, then SHOW the guess.
 *
 * A silent import is the one that puts "Room 4" in the dietary column and is discovered by a
 * cook on the Friday. Guessing is worth doing — most sheets are labelled sensibly — but the
 * guess is a suggestion presented for correction, never a decision taken on the user's behalf.
 */
function guessColumns(headers: string[]): Field[] {
  const used = new Set<Field>();
  return headers.map((h) => {
    const norm = h.trim().toLowerCase();
    for (const { field, words } of HEADER_GUESSES) {
      if (used.has(field)) continue;
      if (words.includes(norm) || words.some((w) => norm === w || norm.startsWith(`${w} `))) {
        used.add(field);
        return field;
      }
    }
    return '' as Field;
  });
}

interface SheetData { headers: string[]; rows: string[][]; fileName: string }

function readSheet(file: File): Promise<SheetData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // header:1 keeps the sheet as a grid, so a file whose first row is NOT a header (just
        // eighty names in column A) is still readable — the user says so with the checkbox.
        const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false });
        const cells = grid.map((r) => (r as unknown[]).map((c) => String(c ?? '').trim()));
        const nonEmpty = cells.filter((r) => r.some((c) => c !== ''));
        if (nonEmpty.length === 0) { reject(new Error('That sheet looks empty.')); return; }
        const width = Math.max(...nonEmpty.map((r) => r.length));
        const padded = nonEmpty.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
        resolve({ headers: padded[0], rows: padded.slice(1), fileName: file.name });
      } catch {
        reject(new Error('Could not read that file. A .xlsx or .csv exported from your spreadsheet works best.'));
      }
    };
    reader.readAsBinaryString(file);
  });
}

function SheetMapper({
  sheet, retreat, onCancel, onImport, busy,
}: {
  sheet: SheetData;
  retreat: PortalRetreat;
  onCancel: () => void;
  onImport: (guests: ParsedGuest[]) => void;
  busy: boolean;
}) {
  const [hasHeader, setHasHeader] = useState(true);
  const [cols, setCols] = useState<Field[]>(() => guessColumns(sheet.headers));

  // Memoised because it feeds the parse below: a fresh array on every render would re-parse the
  // whole sheet on every keystroke elsewhere in the panel.
  const dataRows = useMemo(
    () => (hasHeader ? sheet.rows : [sheet.headers, ...sheet.rows]),
    [hasHeader, sheet],
  );

  const parsed = useMemo(() => {
    const out: ParsedGuest[] = [];
    for (const row of dataRows) {
      const pick = (f: Field) => {
        const i = cols.indexOf(f);
        return i >= 0 ? (row[i] ?? '').trim() : '';
      };
      const full = pick('full_name');
      const first = pick('first');
      const last = pick('last');
      const name = full || [first, last].filter(Boolean).join(' ').trim();
      if (!name) continue;
      out.push({
        full_name: name,
        subgroup: pick('subgroup') || null,
        gender: retreat.collect_gender ? pick('gender') || null : null,
        dietary: retreat.collect_dietary ? pick('dietary') || null : null,
        notes: pick('notes') || null,
      });
    }
    return out;
  }, [dataRows, cols, retreat.collect_gender, retreat.collect_dietary]);

  const haveName = cols.includes('full_name') || cols.includes('first') || cols.includes('last');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-forest inline-flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-sage" /> {sheet.fileName}
        </p>
        <button onClick={onCancel} className="text-ink-faint hover:text-forest" aria-label="Discard this file">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[12.5px] text-ink-soft leading-relaxed">
        Here's what we think each column is. Change anything we got wrong before importing —
        nothing is saved until you press the button.
      </p>

      <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
        <input type="checkbox" checked={hasHeader} onChange={(e) => {
          setHasHeader(e.target.checked);
        }} className="accent-sage" />
        The first row is column headings
      </label>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="min-w-full text-[12.5px]">
          <thead>
            <tr>
              {sheet.headers.map((h, i) => (
                <th key={i} className="text-left pb-2 pr-3 align-bottom">
                  <span className="block text-[11px] text-ink-faint truncate max-w-[9rem]">
                    {hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1}`}
                  </span>
                  <select
                    value={cols[i] ?? ''}
                    onChange={(e) => setCols((prev) => prev.map((c, j) => (j === i ? e.target.value as Field : c)))}
                    className="mt-1 text-[12.5px] bg-white border border-border rounded-lg px-2 py-1.5 max-w-[9rem]"
                  >
                    <option value="">Skip this column</option>
                    {(Object.keys(FIELD_LABELS) as Exclude<Field, ''>[]).map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.slice(0, 4).map((row, r) => (
              <tr key={r} className="border-t border-cream-dark">
                {sheet.headers.map((_, i) => (
                  <td key={i} className="py-1.5 pr-3 text-ink truncate max-w-[9rem]">{row[i]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!haveName && (
        <p className="text-[12.5px] text-amber-text">
          Tell us which column holds the names and we can bring this list in.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onImport(parsed)}
          disabled={busy || parsed.length === 0}
          className={`${btnPrimary} flex-1`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {busy ? 'Importing…' : `Import ${parsed.length} ${parsed.length === 1 ? 'name' : 'names'}`}
        </button>
        <button onClick={onCancel} disabled={busy} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Adding names ────────────────────────────────────────────────────────────
function AddNamesPanel({
  token, retreat, hasGuests, onDone, onCancel,
}: {
  token: string;
  retreat: PortalRetreat;
  hasGuests: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [lastFirst, setLastFirst] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseNames(raw, { lastFirst }), [raw, lastFirst]);
  const dupes = useMemo(() => {
    const seen = new Set<string>();
    const d = new Set<string>();
    parsed.forEach((g) => {
      const k = g.full_name.toLowerCase();
      if (seen.has(k)) d.add(g.full_name); else seen.add(k);
    });
    return Array.from(d);
  }, [parsed]);

  function onPaste(text: string) {
    setRaw(text);
    setLastFirst(looksLastFirst(text));
  }

  async function takeFile(file: File) {
    setError(null);
    // A .txt is a paste in a file, and pasting is the shorter road. Anything a spreadsheet
    // produced goes through the column mapper instead.
    if (/\.(txt)$/i.test(file.name)) { onPaste(await file.text()); return; }
    try {
      setSheet(await readSheet(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  async function send(payload: ParsedGuest[], replaceUnplaced: boolean) {
    if (payload.length === 0) { setError('Nothing to add yet.'); return; }
    setBusy(true); setError(null);
    const { data, error: err } = await supabasePublic.rpc('portal_save_roster', {
      p_token: token, p_guests: payload,
      p_submitted_by: retreat.coordinator_name ?? null, p_replace: replaceUnplaced,
      p_access: readPortalSession(token),
    });
    setBusy(false);
    const res = data as { ok: boolean; error?: string } | null;
    if (err || !res?.ok) { setError(res?.error ?? 'Could not save your list. Please try again.'); return; }
    setRaw('');
    setSheet(null);
    await onDone();
  }

  async function save() {
    const payload: ParsedGuest[] = parsed.map((g) => ({
      full_name: g.full_name,
      subgroup: g.subgroup ?? null,
      gender: retreat.collect_gender ? g.gender ?? null : null,
      dietary: retreat.collect_dietary ? g.dietary ?? null : null,
      notes: g.notes ?? null,
    }));
    await send(payload, replace);
  }

  if (sheet) {
    return (
      <div className="mt-4 pt-4 border-t border-cream-dark">
        <SheetMapper
          sheet={sheet}
          retreat={retreat}
          busy={busy}
          onCancel={() => { setSheet(null); setError(null); }}
          onImport={(guests) => void send(guests, replace)}
        />
        {error && <p className="text-[12.5px] text-red mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div
      className="mt-4 pt-4 border-t border-cream-dark space-y-3"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void takeFile(f);
      }}
    >
      <div>
        <label className={labelClass}>Paste your list</label>
        <textarea
          value={raw}
          onChange={(e) => onPaste(e.target.value)}
          rows={6}
          className={`${inputClass} font-mono text-[13.5px] leading-relaxed`}
          placeholder={'Dana Reyes\nSam Okafor\nPriya Nair'}
          disabled={busy}
        />
        <p className="text-[11.5px] text-ink-soft mt-1.5">
          One name per line. A spreadsheet column pasted straight in works, and so does a
          numbered list. A second column is treated as the family or group name.
        </p>
      </div>

      <div
        className={`rounded-xl border border-dashed px-4 py-4 text-center transition-colors ${
          dragOver ? 'border-sage bg-sage-pale' : 'border-border bg-cream'
        }`}
      >
        <p className="text-[13px] text-ink">
          …or drop a spreadsheet here.{' '}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="font-semibold text-forest underline underline-offset-2"
          >
            Choose a file
          </button>
        </p>
        <p className="text-[11.5px] text-ink-soft mt-1">
          .xlsx or .csv. We'll show you which column we think is which before anything is saved.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFile(f); e.target.value = ''; }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
          <input type="checkbox" checked={lastFirst} onChange={(e) => setLastFirst(e.target.checked)} className="accent-sage" />
          Names are “Last, First”
        </label>
        {hasGuests && (
          <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-sage" />
            Replace my unplaced names
          </label>
        )}
      </div>

      {parsed.length > 0 && (
        <div className="bg-cream border border-border rounded-xl px-3.5 py-3">
          <p className="text-[13px] font-semibold text-forest">
            {parsed.length} {parsed.length === 1 ? 'name' : 'names'} ready to add
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-y-auto">
            {parsed.slice(0, 60).map((g, i) => (
              <span key={i} className="text-[12px] bg-white border border-border rounded-full px-2.5 py-1 text-ink">
                {g.full_name}{g.subgroup ? ` · ${g.subgroup}` : ''}
              </span>
            ))}
            {parsed.length > 60 && (
              <span className="text-[12px] text-ink-soft px-1 py-1">+{parsed.length - 60} more</span>
            )}
          </div>
          {dupes.length > 0 && (
            <p className="text-[12px] text-amber-text mt-2">
              Repeated {dupes.length === 1 ? 'name' : 'names'}: {dupes.slice(0, 5).join(', ')}
              {dupes.length > 5 ? '…' : ''}. They'll all be added. Remove any you didn't mean.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-[12.5px] text-red">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={busy || parsed.length === 0} className={`${btnPrimary} flex-1`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {busy ? 'Saving…' : `Add ${parsed.length || ''} ${parsed.length === 1 ? 'name' : 'names'}`.trim()}
        </button>
        <button onClick={onCancel} disabled={busy} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}
