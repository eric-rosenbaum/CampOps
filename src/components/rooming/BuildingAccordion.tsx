import { useState } from 'react';
import { ChevronDown, Accessibility, AlertTriangle, X, BedDouble, Wrench } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { parseDateStr } from '@/lib/utils';

/**
 * Buildings as collapsible cards, rooms inside them.
 *
 * A camp with twelve lodges of ten rooms is 120 room cards in a flat grid, which is unusable
 * for the thing people actually do: find one building, then place people in it. Collapsing to
 * one card per building turns that into a short list you can scan, and expanding keeps the
 * rest of the site visible rather than pushing you into a separate screen and back.
 *
 * Presentational on purpose. The guest portal and the ops Housing tab hold different data in
 * different shapes and write through different clients, so both map into these view models
 * and pass their own handlers.
 */

export interface RoomOccupant {
  id: string;
  name: string;
  needsAccessible?: boolean;
  /** Family, bus, cohort — whatever the group calls its own subdivisions. Drawn as a dot. */
  subgroup?: string | null;
}

export interface RoomVM {
  id: string;
  name: string;
  capacity: number;
  accessible?: boolean;
  /** Held by a different, date-overlapping retreat. Not pickable. */
  heldByOther?: boolean;
  /**
   * The room is out of service. Not pickable, and the reason is shown rather than hidden.
   *
   * Assets have carried a service status for a long time; rooms did not, which meant nothing
   * stopped a coordinator putting twelve guests in a cabin that had been shut since June. This
   * is the maintenance half of the product reaching the rentals half.
   */
  outOfService?: boolean;
  outOfServiceReason?: string | null;
  expectedBack?: string | null;
  occupants: RoomOccupant[];
  /** Booked here as a bare headcount, with no names attached. */
  unnamed: number;
  /** Free-text the camp added against this room. */
  note?: string | null;
  subgroup?: string | null;
}

export interface BuildingVM {
  id: string;
  name: string;
  rooms: RoomVM[];
}

export function BuildingAccordion({
  buildings, selectedCount, editable, busy, onPlace, onRemove, onDropGuest, emptyMessage,
}: {
  buildings: BuildingVM[];
  /** How many people are staged for placing. 0 hides the place affordance. */
  selectedCount: number;
  editable: boolean;
  busy?: boolean;
  onPlace?: (roomId: string) => void;
  onRemove?: (guestId: string) => void;
  /** Move one person into a room by dragging them there. */
  onDropGuest?: (guestId: string, roomId: string) => void;
  emptyMessage?: string;
}) {
  // Open the first building when there is only one, otherwise start collapsed: the point of
  // the card is that a long site is scannable before anything is expanded.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(buildings.length === 1 ? [buildings[0].id] : []),
  );

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (buildings.length === 0) {
    return (
      <div className="bg-white rounded-card border border-border px-5 py-8 text-center">
        <BedDouble className="w-7 h-7 text-ink-faint mx-auto mb-2.5" />
        <p className="text-[13px] text-ink-soft">{emptyMessage ?? 'No rooms published yet.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {buildings.map((b) => {
        const isOpen = open.has(b.id);
        const stats = summarise(b);
        return (
          <div key={b.id} className="bg-paper-raised rounded-card border border-border overflow-hidden">
            <button
              onClick={() => toggle(b.id)}
              aria-expanded={isOpen}
              className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-cream transition-colors"
            >
              <ChevronDown
                className={`w-4 h-4 flex-shrink-0 text-ink-faint transition-transform ${isOpen ? '' : '-rotate-90'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-forest truncate">{b.name}</p>
                <p className="text-[11.5px] text-ink-soft mt-0.5">
                  {stats.rooms} room{stats.rooms === 1 ? '' : 's'} · {stats.beds} bed{stats.beds === 1 ? '' : 's'}
                  {stats.accessibleRooms > 0 && ` · ${stats.accessibleRooms} step-free`}
                  {stats.closed > 0 && ` · ${stats.closed} out of service`}
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-shrink-0">
                {stats.over > 0 && (
                  <span title={`${stats.over} room${stats.over === 1 ? '' : 's'} over capacity`}>
                    <AlertTriangle className="w-4 h-4 text-amber" />
                  </span>
                )}
                <div className="hidden sm:block w-20">
                  <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stats.taken > stats.beds ? 'bg-amber' : 'bg-sage'}`}
                      style={{ width: `${stats.beds > 0 ? Math.min(100, (stats.taken / stats.beds) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <span className={`font-mono text-[12px] ${stats.taken > stats.beds ? 'text-amber-text font-semibold' : 'text-ink-soft'}`}>
                  {stats.taken}/{stats.beds}
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-cream-dark p-3 space-y-2 bg-cream/40">
                {b.rooms.map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    selectedCount={selectedCount}
                    editable={editable}
                    busy={busy}
                    onPlace={onPlace}
                    onRemove={onRemove}
                    onDropGuest={onDropGuest}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function summarise(b: BuildingVM) {
  let beds = 0, taken = 0, over = 0, accessibleRooms = 0, closed = 0;
  for (const r of b.rooms) {
    if (r.outOfService) { closed += 1; continue; }
    beds += r.capacity;
    const n = r.occupants.length + r.unnamed;
    taken += n;
    if (r.capacity > 0 && n > r.capacity) over += 1;
    if (r.accessible) accessibleRooms += 1;
  }
  return { rooms: b.rooms.length, beds, taken, over, accessibleRooms, closed };
}

/**
 * A stable colour per subgroup name.
 *
 * The dot is the point: "Reyes family" repeated on six chips is six things to read, one
 * repeated colour is one thing to see. Hashed rather than assigned by index so a room card
 * shows the same colour for the Reyes family wherever it is rendered, including in a room
 * where nobody else from that family is sitting.
 */
const SUBGROUP_COLORS = ['#5E7A61', '#185fa5', '#D08C1B', '#6b3fa0', '#B4552F', '#2C5342', '#7a6f2f'];
function subgroupColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SUBGROUP_COLORS[h % SUBGROUP_COLORS.length];
}

/**
 * One bed, drawn.
 *
 * "4/6" is arithmetic you have to do; four filled beds beside two empty ones is a fact you
 * can see. Inline SVG rather than an icon font so the filled and empty states are the same
 * shape in the same place, which is what makes the row readable at a glance.
 */
function BedGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 18 12" width="15" height="10" aria-hidden="true"
      className={`flex-shrink-0 ${filled ? 'text-sage' : 'text-ink-faint/45'}`}
    >
      {/* headboard + foot rail, always drawn: an empty bed is still a bed */}
      <path d="M1 2.5V11M17 7.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* mattress */}
      <rect
        x="1" y="6.4" width="16" height="3.4" rx="1.2"
        fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2"
      />
      {/* pillow, only on a made-up (occupied) bed */}
      {filled && <rect x="2.8" y="3.6" width="5" height="2.8" rx="1.1" fill="currentColor" opacity="0.55" />}
    </svg>
  );
}

function BedRow({ taken, capacity }: { taken: number; capacity: number }) {
  if (capacity <= 0) return null;
  // A forty-bed dorm gets a bar. Forty glyphs is not more legible than one, it is wallpaper.
  if (capacity > 12) {
    return (
      <span className="inline-block w-16 h-2 rounded-full bg-cream-dark overflow-hidden align-middle">
        <span className="block h-full bg-sage" style={{ width: `${Math.min(100, (taken / capacity) * 100)}%` }} />
      </span>
    );
  }
  return (
    <span className="inline-flex gap-[3px] items-center" aria-hidden="true">
      {Array.from({ length: capacity }, (_, i) => <BedGlyph key={i} filled={i < taken} />)}
    </span>
  );
}

function fmtDay(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return parseDateStr(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return null; }
}

/** The drag payload for one person. A private type so a stray text drop cannot place anybody. */
const GUEST_MIME = 'application/x-campops-guest';
const GUESTS_MIME = 'application/x-campops-guests';

function RoomRow({
  room, selectedCount, editable, busy, onPlace, onRemove, onDropGuest,
}: {
  room: RoomVM;
  selectedCount: number;
  editable: boolean;
  busy?: boolean;
  onPlace?: (roomId: string) => void;
  onRemove?: (guestId: string) => void;
  onDropGuest?: (guestId: string, roomId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const taken = room.occupants.length + room.unnamed;
  const over = room.capacity > 0 && taken > room.capacity;
  const blocked = room.heldByOther || room.outOfService;
  const canPlace = editable && !blocked && selectedCount > 0 && !!onPlace;
  /** A single dragged person can land here even when nothing is selected. */
  const canDrop = editable && !blocked && (canPlace || !!onDropGuest);

  // Someone who needs a step-free room sitting in one that isn't: worth saying plainly rather
  // than discovering at check-in.
  const accessMismatch = !room.accessible && room.occupants.some((g) => g.needsAccessible);
  const back = fmtDay(room.expectedBack);

  return (
    <div
      onDragOver={(e) => { if (canDrop) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        setDragOver(false);
        // A dragged selection, one dragged person, or the "Place N" path.
        const many = e.dataTransfer.getData(GUESTS_MIME);
        const one = e.dataTransfer.getData(GUEST_MIME);
        if (many && onDropGuest) {
          try {
            (JSON.parse(many) as string[]).forEach((id) => onDropGuest(id, room.id));
            return;
          } catch { /* fall through to the single-person path */ }
        }
        if (one && onDropGuest) onDropGuest(one, room.id);
        else if (canPlace) onPlace?.(room.id);
      }}
      className={`rounded-xl border px-3.5 py-3 transition-colors ${
        dragOver ? 'border-sage bg-sage-pale ring-2 ring-sage/40'
          : room.outOfService ? 'border-border bg-cream-dark/60 opacity-75'
          : room.heldByOther ? 'border-border bg-cream-dark/40 opacity-70'
          : over ? 'border-amber/50 bg-amber-bg/50'
          : 'border-border bg-paper-card'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[13.5px] font-semibold flex items-center gap-1.5 ${room.outOfService ? 'text-ink-soft' : 'text-forest'}`}>
            {room.name}
            {room.accessible && <Accessibility className="w-3.5 h-3.5 text-blue" />}
            {room.outOfService && <Wrench className="w-3.5 h-3.5 text-amber-text" />}
          </p>
          {room.outOfService ? (
            <p className="text-[11.5px] text-amber-text mt-0.5">
              Out of service{room.outOfServiceReason ? ` · ${room.outOfServiceReason}` : ''}
              {back ? ` · expected back ${back}` : ''}
            </p>
          ) : room.heldByOther ? (
            <p className="text-[11.5px] text-ink-faint mt-0.5">Held by another group for these dates</p>
          ) : (
            <div className="flex items-center gap-2 mt-1.5">
              <BedRow taken={taken} capacity={room.capacity} />
              <span className={`text-[11.5px] font-mono ${over ? 'text-amber-text font-semibold' : 'text-ink-soft'}`}>
                {taken}{room.capacity > 0 ? `/${room.capacity}` : ''}
              </span>
            </div>
          )}
          {room.subgroup && <p className="text-[11.5px] text-ink-soft mt-1">{room.subgroup}</p>}
        </div>

        {canPlace && (
          <button
            onClick={() => onPlace?.(room.id)}
            disabled={busy}
            className="flex-shrink-0 text-[12px] font-semibold text-forest bg-white border border-border rounded-btn px-3 py-1.5 hover:border-sage disabled:opacity-40 transition-colors"
          >
            Place {selectedCount}
          </button>
        )}
      </div>

      {room.unnamed > 0 && (
        <p className="text-[11.5px] text-ink-soft mt-2">
          {room.unnamed} more booked here, names not submitted
        </p>
      )}

      {room.occupants.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {room.occupants.map((g) => (
            <span
              key={g.id}
              draggable={editable && !!onDropGuest}
              onDragStart={(e) => {
                e.dataTransfer.setData(GUEST_MIME, g.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={`inline-flex items-center gap-1.5 text-[12px] bg-sage-pale border
                          border-sage/30 text-forest rounded-full pl-1 pr-2 py-0.5
                          ${editable && onDropGuest ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              <Avatar name={g.name} size={18} />
              {g.subgroup && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: subgroupColor(g.subgroup) }}
                  title={g.subgroup}
                />
              )}
              {g.name}
              {g.needsAccessible && <Accessibility className="w-3 h-3 text-blue" />}
              {editable && !blocked && onRemove && (
                <button
                  onClick={() => onRemove(g.id)}
                  disabled={busy}
                  aria-label={`Take ${g.name} out of ${room.name}`}
                  className="text-forest/50 hover:text-red"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {over && (
        <p className="text-[11.5px] text-amber-text mt-2">
          {taken - room.capacity} more {taken - room.capacity === 1 ? 'person' : 'people'} than beds.
        </p>
      )}
      {accessMismatch && (
        <p className="text-[11.5px] text-blue mt-1.5">
          Someone here needs a step-free room and this one isn't marked accessible.
        </p>
      )}
      {room.note && <p className="text-[11.5px] text-ink-soft italic mt-1.5">{room.note}</p>}
    </div>
  );
}
