import { useMemo, useState } from 'react';
import { Check, Ban } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useLocationStore } from '@/store/locationStore';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import type { CampLocation } from '@/lib/types';

/** One room under a dorm building. Beds live here (never on the building). Available toggle =
 *  retreat_available; blocked rooms drop out of assignment + the guest portal. */
function RoomRow({ room, canManage }: { room: CampLocation; canManage: boolean }) {
  const { updateLocation } = useLocationStore();
  const [beds, setBeds] = useState(String(room.bedCapacity ?? 0));
  const commit = (patch: Partial<CampLocation>) => { if (canManage) updateLocation({ ...room, ...patch }); };

  return (
    <div className={`flex items-center gap-2 rounded-btn border px-3 py-2 ${room.retreatAvailable ? 'border-border bg-white' : 'border-border bg-cream-dark/40 opacity-70'}`}>
      <p className="flex-1 text-[13px] text-forest truncate">{room.name}</p>
      <input
        type="number" min="0" step="1" value={beds}
        onChange={(e) => setBeds(e.target.value)}
        onBlur={() => commit({ bedCapacity: Math.max(0, Math.round(Number(beds) || 0)) })}
        disabled={!canManage}
        className="w-16 text-[13px] text-center bg-white border border-border rounded-btn px-1.5 py-1 focus:outline-none focus:border-sage disabled:opacity-50"
      />
      <span className="text-[11px] text-forest/45 w-8">beds</span>
      <button type="button" disabled={!canManage}
        onClick={() => commit({ accessible: !room.accessible })}
        className={`text-[11px] font-medium px-2 py-1 rounded-pill border transition-colors ${room.accessible ? 'bg-blue-bg text-blue-text border-blue/30' : 'bg-white text-forest/45 border-border hover:border-forest/30'}`}>
        ADA
      </button>
      <button type="button" disabled={!canManage}
        onClick={() => commit({ retreatAvailable: !room.retreatAvailable })}
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-pill border transition-colors ${room.retreatAvailable ? 'bg-sage text-white border-sage' : 'bg-white text-forest/45 border-border hover:border-forest/30'}`}>
        {room.retreatAvailable ? <><Check className="w-3 h-3" /> Available</> : <><Ban className="w-3 h-3" /> Blocked</>}
      </button>
    </div>
  );
}

/** One dorm building: toggle retreat availability; beds are configured on its rooms below. */
function BuildingBlock({ building, rooms, canManage }: { building: CampLocation; rooms: CampLocation[]; canManage: boolean }) {
  const { updateLocation } = useLocationStore();
  const commit = (patch: Partial<CampLocation>) => { if (canManage) updateLocation({ ...building, ...patch }); };
  const totalBeds = rooms.filter((r) => r.retreatAvailable).reduce((s, r) => s + (r.bedCapacity ?? 0), 0);

  return (
    <div className={`rounded-card border px-3.5 py-3 ${building.retreatAvailable ? 'border-sage/40 bg-sage-pale/30' : 'border-border bg-white'}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-forest truncate">{building.name}</p>
          <p className="text-[11px] text-forest/45">{rooms.length} room{rooms.length === 1 ? '' : 's'} · {totalBeds} beds total</p>
        </div>
        <button type="button" disabled={!canManage}
          onClick={() => commit({ retreatAvailable: !building.retreatAvailable })}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-pill border transition-colors ${building.retreatAvailable ? 'bg-sage text-white border-sage' : 'bg-white text-forest/50 border-border hover:border-forest/30'}`}>
          {building.retreatAvailable && <Check className="w-3 h-3" />} Available to retreats
        </button>
      </div>
      {building.retreatAvailable && (
        <div className="mt-2.5 space-y-1.5">
          {rooms.length === 0 ? (
            <p className="text-[11px] text-forest/45 italic">No rooms yet — add rooms as sub-locations in Camp Info → Locations to set beds.</p>
          ) : rooms.map((r) => <RoomRow key={r.id} room={r} canManage={canManage} />)}
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
    <Modal title="Retreat dorms & rooms" onClose={closeModal} width="600px">
      <p className="text-[12px] text-forest/50 -mt-2 mb-4">
        Dorms come from Camp Info → Locations. Toggle which buildings are available to retreat groups, then set beds per room. Block a room to take it out of rotation.
      </p>

      <div className="flex flex-col gap-2 mb-5">
        {dorms.length === 0 && (
          <p className="bg-cream rounded-card border border-border px-4 py-4 sm:py-6 text-center text-[13px] text-forest/45">
            No dorms yet. Mark locations as dorms in Camp Info → Locations, then toggle their retreat availability here.
          </p>
        )}
        {dorms.map((d) => <BuildingBlock key={d.id} building={d} rooms={roomsByBuilding.get(d.id) ?? []} canManage={canManage} />)}
      </div>

      <div className="flex justify-end pt-4">
        <Button variant="ghost" onClick={closeModal}>Done</Button>
      </div>
    </Modal>
  );
}
