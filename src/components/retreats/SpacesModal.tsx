import { useMemo, useState } from 'react';
import { Check, Ban } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useLocationStore } from '@/store/locationStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { CampLocation, CabinType } from '@/lib/types';
import { CabinTypesBlock } from './CabinTypesBlock';
import { useCabinTypes } from './useCabinTypes';
import { useCampgroundStore } from '@/store/campgroundStore';

/** One room under a dorm building. Beds live here (never on the building). Available toggle =
 *  retreat_available; blocked rooms drop out of assignment + the guest portal. */
function RoomRow({ room, canManage, types, templates }: {
  room: CampLocation; canManage: boolean; types: CabinType[];
  templates: { id: string; name: string }[];
}) {
  const { updateLocation } = useLocationStore();
  const [beds, setBeds] = useState(String(room.bedCapacity ?? 0));
  const commit = (patch: Partial<CampLocation>) => { if (canManage) updateLocation({ ...room, ...patch }); };

  return (
    <div className={`rounded-btn border px-3 py-2 ${room.retreatAvailable ? 'border-border bg-white' : 'border-border bg-cream-dark/40 opacity-70'}`}>
    <div className="flex items-center gap-2">
      <p className="flex-1 text-[13px] text-forest truncate">{room.name}</p>
      <input
        type="number" min="0" step="1" value={beds}
        onChange={(e) => setBeds(e.target.value)}
        onBlur={() => commit({ bedCapacity: Math.max(0, Math.round(Number(beds) || 0)) })}
        disabled={!canManage}
        className="w-16 text-[13px] text-center bg-white border border-border rounded-btn px-1.5 py-1 focus:outline-none focus:border-sage disabled:opacity-50"
      />
      <span className="text-[11px] text-ink-faint w-8">beds</span>
      <button type="button" disabled={!canManage}
        onClick={() => commit({ accessible: !room.accessible })}
        className={`text-[11px] font-medium px-2 py-1 rounded-pill border transition-colors ${room.accessible ? 'bg-blue-bg text-blue-text border-blue/30' : 'bg-white text-ink-faint border-border hover:border-forest/30'}`}>
        ADA
      </button>
      <button type="button" disabled={!canManage}
        onClick={() => commit({ retreatAvailable: !room.retreatAvailable })}
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-pill border transition-colors ${room.retreatAvailable ? 'bg-sage text-white border-sage' : 'bg-white text-ink-faint border-border hover:border-forest/30'}`}>
        {room.retreatAvailable ? <><Check className="w-3 h-3" /> Available</> : <><Ban className="w-3 h-3" /> Blocked</>}
      </button>
    </div>

    {/* What the group is told about this one. The type carries the description; the note is for
        whatever is true of this cabin alone. Both are guest-facing. */}
    {room.retreatAvailable && (
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center mt-2">
        <select
          value={room.cabinTypeId ?? ''} disabled={!canManage}
          onChange={(e) => commit({ cabinTypeId: e.target.value || null })}
          className="text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage disabled:opacity-50 sm:w-44"
        >
          <option value="">No cabin type</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          defaultValue={room.notes ?? ''} disabled={!canManage}
          placeholder="Anything true of this cabin only — shown to the group"
          onBlur={(e) => { if ((e.target.value || null) !== room.notes) commit({ notes: e.target.value.trim() || null }); }}
          className="flex-1 text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage disabled:opacity-50"
        />
        {/* What this room contributes to a job covering the whole building. A bathhouse with its
            own checklist puts its steps inside "Turn over Boys Village" rather than being a
            single line somebody has to remember the shape of. */}
        <select
          value={room.checklistTemplateId ?? ''} disabled={!canManage}
          onChange={(e) => commit({ checklistTemplateId: e.target.value || null })}
          title="Steps this room adds to a whole-building work order"
          className="text-[12px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage disabled:opacity-50 sm:w-40"
        >
          <option value="">One step for the room</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
    )}
    </div>
  );
}

/** One dorm building: toggle retreat availability; beds are configured on its rooms below. */
function BuildingBlock({ building, rooms, canManage, types, templates }: { building: CampLocation; rooms: CampLocation[]; canManage: boolean; types: CabinType[]; templates: { id: string; name: string }[] }) {
  const { updateLocation } = useLocationStore();
  const commit = (patch: Partial<CampLocation>) => { if (canManage) updateLocation({ ...building, ...patch }); };
  const totalBeds = rooms.filter((r) => r.retreatAvailable).reduce((s, r) => s + (r.bedCapacity ?? 0), 0);

  return (
    <div className={`rounded-card border px-3.5 py-3 ${building.retreatAvailable ? 'border-sage/40 bg-sage-pale/30' : 'border-border bg-white'}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-forest truncate">{building.name}</p>
          <p className="text-[11px] text-ink-faint">{rooms.length} room{rooms.length === 1 ? '' : 's'} · {totalBeds} beds total</p>
        </div>
        <button type="button" disabled={!canManage}
          onClick={() => commit({ retreatAvailable: !building.retreatAvailable })}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-pill border transition-colors ${building.retreatAvailable ? 'bg-sage text-white border-sage' : 'bg-white text-ink-soft border-border hover:border-forest/30'}`}>
          {building.retreatAvailable && <Check className="w-3 h-3" />} Available to retreats
        </button>
      </div>
      {building.retreatAvailable && (
        <div className="mt-2.5 space-y-1.5">
          {rooms.length === 0 ? (
            <p className="text-[11px] text-ink-faint italic">No rooms yet. Add rooms as sub-locations in Camp Info → Locations to set beds.</p>
          ) : rooms.map((r) => <RoomRow key={r.id} room={r} canManage={canManage} types={types} templates={templates} />)}
        </div>
      )}
    </div>
  );
}

export function SpacesModal() {
  const { closeModal } = useRetreatStore();
  const locations = useLocationStore((s) => s.locations);
  const { can } = useAuth();
  const canManage = can('manageRetreats');
  const [types] = useCabinTypes();
  const templates = useCampgroundStore((s) => s.templates).filter((t) => t.isActive);

  // A building is a TOP-LEVEL dorm; its rooms are direct children.
  const dorms = useMemo(
    () => locations.filter((l) => l.isDorm && l.parentId == null).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );
  const roomsByBuilding = useMemo(() => {
    const m = new Map<string, CampLocation[]>();
    for (const l of locations) {
      if (!l.parentId) continue;
      const arr = m.get(l.parentId) ?? [];
      arr.push(l);
      m.set(l.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return m;
  }, [locations]);

  return (
    <Modal title="Retreat spaces" onClose={closeModal} width="600px">
      <p className="text-[12px] text-ink-soft -mt-2 mb-4">
        Dorms come from Camp Info → Locations. Toggle which buildings are available to retreat groups, then set beds per room. Block a room to take it out of rotation.
      </p>

      <div className="flex flex-col gap-2 mb-5">
        {dorms.length === 0 && (
          <p className="bg-cream rounded-card border border-border px-4 py-4 sm:py-6 text-center text-[13px] text-ink-faint">
            No dorms yet. Mark locations as dorms in Camp Info → Locations, then toggle their retreat availability here.
          </p>
        )}
        {dorms.map((d) => <BuildingBlock key={d.id} building={d} rooms={roomsByBuilding.get(d.id) ?? []} canManage={canManage} types={types} templates={templates} />)}
      </div>

      <div className="border-t border-border pt-5 mb-5">
        <CabinTypesBlock canManage={canManage} />
      </div>

      <div className="border-t border-border pt-5 mb-2">
        <ProgramSpacesBlock canManage={canManage} />
      </div>

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={closeModal}>Done</Button>
      </div>
    </Modal>
  );
}

/**
 * Meeting spaces, and what a group is told about them.
 *
 * These had no editor at all: program_space and capacity_seated were set by the seed and there
 * was no way to add one, describe it, change its seating or take it out of the list. A group
 * choosing where to run a session was picking from a fixed list of names with a number beside
 * them, and the camp could not say what any of them actually was.
 */
function ProgramSpacesBlock({ canManage }: { canManage: boolean }) {
  const locations = useLocationStore((s) => s.locations);
  const updateLocation = useLocationStore((s) => s.updateLocation);

  const candidates = useMemo(
    () => locations.filter((l) => l.isActive && !l.isDorm)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );
  const chosen = candidates.filter((l) => l.programSpace);
  const rest = candidates.filter((l) => !l.programSpace);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-display text-[14px] font-bold text-forest">Meeting spaces</h3>
        {canManage && rest.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-[12px] font-semibold text-forest underline"
          >
            {adding ? 'Done adding' : 'Add a space'}
          </button>
        )}
      </div>
      <p className="text-[12px] text-ink-soft mb-3">
        What a group can ask for, and what they are told it is.
      </p>

      {adding && (
        <div className="mb-3 rounded-card border border-border bg-cream p-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint mb-2">
            Offer one of your locations
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rest.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => updateLocation({ ...l, programSpace: true })}
                className="rounded-full border border-border bg-white px-2.5 py-1 text-[12.5px] text-ink hover:border-sage"
              >
                + {l.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {chosen.length === 0 ? (
        <p className="rounded-card border border-border bg-cream px-4 py-5 text-center text-[13px] text-ink-faint">
          No meeting spaces offered yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {chosen.map((l) => (
            <div key={l.id} className="rounded-card border border-border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-forest">{l.name}</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => updateLocation({ ...l, programSpace: false })}
                    className="text-[12px] text-ink-soft hover:text-red"
                  >
                    Stop offering
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Seats</span>
                  <input
                    inputMode="numeric"
                    value={l.capacitySeated ?? ''}
                    disabled={!canManage}
                    onChange={(e) => updateLocation({
                      ...l,
                      capacitySeated: e.target.value.trim() === '' ? null : Number(e.target.value),
                    })}
                    className="w-full rounded-btn border border-border bg-white px-2.5 py-1.5 text-[13px] focus:border-sage focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                    What it is
                  </span>
                  <input
                    value={l.notes ?? ''}
                    disabled={!canManage}
                    placeholder="e.g. Fireplace, projector, opens onto the deck"
                    onChange={(e) => updateLocation({ ...l, notes: e.target.value || null })}
                    className="w-full rounded-btn border border-border bg-white px-2.5 py-1.5 text-[13px] focus:border-sage focus:outline-none"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
