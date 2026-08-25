import { useState } from 'react';
import { ChevronDown, Accessibility, AlertTriangle, X, BedDouble } from 'lucide-react';

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
}

export interface RoomVM {
  id: string;
  name: string;
  capacity: number;
  accessible?: boolean;
  /** Held by a different, date-overlapping retreat. Not pickable. */
  heldByOther?: boolean;
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
  buildings, selectedCount, editable, busy, onPlace, onRemove, emptyMessage,
}: {
  buildings: BuildingVM[];
  /** How many people are staged for placing. 0 hides the place affordance. */
  selectedCount: number;
  editable: boolean;
  busy?: boolean;
  onPlace?: (roomId: string) => void;
  onRemove?: (guestId: string) => void;
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
          <div key={b.id} className="bg-white rounded-card border border-border overflow-hidden">
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
  let beds = 0, taken = 0, over = 0, accessibleRooms = 0;
  for (const r of b.rooms) {
    beds += r.capacity;
    const n = r.occupants.length + r.unnamed;
    taken += n;
    if (r.capacity > 0 && n > r.capacity) over += 1;
    if (r.accessible) accessibleRooms += 1;
  }
  return { rooms: b.rooms.length, beds, taken, over, accessibleRooms };
}

function RoomRow({
  room, selectedCount, editable, busy, onPlace, onRemove,
}: {
  room: RoomVM;
  selectedCount: number;
  editable: boolean;
  busy?: boolean;
  onPlace?: (roomId: string) => void;
  onRemove?: (guestId: string) => void;
}) {
  const taken = room.occupants.length + room.unnamed;
  const over = room.capacity > 0 && taken > room.capacity;
  const canPlace = editable && !room.heldByOther && selectedCount > 0 && !!onPlace;

  // Someone who needs a step-free room sitting in one that isn't: worth saying plainly rather
  // than discovering at check-in.
  const accessMismatch = !room.accessible && room.occupants.some((g) => g.needsAccessible);

  return (
    <div
      onDragOver={(e) => { if (canPlace) e.preventDefault(); }}
      onDrop={(e) => { if (canPlace) { e.preventDefault(); onPlace?.(room.id); } }}
      className={`rounded-xl border px-3.5 py-3 ${
        room.heldByOther ? 'border-border bg-cream-dark/40 opacity-70'
          : over ? 'border-amber/50 bg-amber-pale/40'
          : 'border-border bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-forest flex items-center gap-1.5">
            {room.name}
            {room.accessible && <Accessibility className="w-3.5 h-3.5 text-blue" />}
          </p>
          {room.heldByOther ? (
            <p className="text-[11.5px] text-ink-faint mt-0.5">Held by another group for these dates</p>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <BedPips taken={taken} capacity={room.capacity} />
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
              className="inline-flex items-center gap-1 text-[12px] bg-sage-pale border border-sage/30 text-forest rounded-full pl-2.5 pr-1.5 py-1"
            >
              {g.name}
              {g.needsAccessible && <Accessibility className="w-3 h-3 text-blue" />}
              {editable && !room.heldByOther && onRemove && (
                <button
                  onClick={() => onRemove(g.id)}
                  disabled={busy}
                  aria-label={`Take ${g.name} out of ${room.name}`}
                  className="ml-0.5 text-forest/50 hover:text-red"
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

function BedPips({ taken, capacity }: { taken: number; capacity: number }) {
  if (capacity <= 0) return null;
  // A long dorm gets a bar rather than fifty dots.
  if (capacity > 12) {
    return (
      <span className="inline-block w-16 h-2 rounded-full bg-cream-dark overflow-hidden align-middle">
        <span className="block h-full bg-sage" style={{ width: `${Math.min(100, (taken / capacity) * 100)}%` }} />
      </span>
    );
  }
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {Array.from({ length: capacity }, (_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < taken ? 'bg-sage' : 'bg-cream-dark'}`} />
      ))}
    </span>
  );
}
