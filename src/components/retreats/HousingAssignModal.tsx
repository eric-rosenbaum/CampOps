import { useState, useMemo } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useLocationStore } from '@/store/locationStore';
import { generateId } from '@/lib/utils';
import type { RetreatHousing } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

export function HousingAssignModal({ retreatId, housingId }: { retreatId: string; housingId?: string }) {
  const { housingFor, addHousing, updateHousing, deleteHousing, closeModal } = useRetreatStore();
  const locations = useLocationStore((s) => s.locations);
  // Buildings are TOP-LEVEL dorms marked available to retreats.
  const dorms = useMemo(
    () => locations.filter((l) => l.isDorm && l.retreatAvailable && l.isActive && l.parentId == null).sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );
  const existing = housingId ? housingFor(retreatId).find((h) => h.id === housingId) ?? null : null;

  // A stored assignment points at either a dorm building or one of its rooms (a child location).
  // Split it back into building + room so editing shows both selectors correctly.
  const existingLoc = existing ? locations.find((l) => l.id === existing.locationId) ?? null : null;
  const [buildingId, setBuildingId] = useState(existingLoc ? (existingLoc.parentId ?? existingLoc.id) : '');
  const [roomId, setRoomId] = useState(existingLoc?.parentId ? existingLoc.id : '');
  const [subgroupName, setSubgroupName] = useState(existing?.subgroupName ?? '');
  const [peopleCount, setPeopleCount] = useState(existing ? String(existing.peopleCount) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const selectedDorm = dorms.find((d) => d.id === buildingId) ?? null;
  // Rooms = direct children of the building that are available to retreats (blocked rooms drop out).
  const rooms = useMemo(
    () => locations.filter((l) => l.parentId === buildingId && l.isActive && l.retreatAvailable).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations, buildingId],
  );
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null;
  const capacity = (selectedRoom ?? selectedDorm)?.bedCapacity ?? 0;
  const people = Math.max(0, Math.round(Number(peopleCount) || 0));
  const overCapacity = capacity > 0 && people > capacity;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buildingId) return;
    const now = new Date().toISOString();
    const targetId = roomId || buildingId;
    // Snapshot a friendly label: "Cabin 7 · Room B" for a room, else just the building.
    const spaceName = selectedRoom
      ? `${selectedDorm?.name ?? ''} · ${selectedRoom.name}`.replace(/^ · /, '')
      : selectedDorm?.name ?? existing?.spaceName ?? null;

    if (existing) {
      updateHousing({ ...existing, locationId: targetId, spaceName, subgroupName: subgroupName.trim() || null, peopleCount: people, notes: notes.trim() || null, updatedAt: now });
    } else {
      const row: RetreatHousing = {
        id: generateId(), campId: '', retreatId,
        locationId: targetId, spaceId: null, spaceName,
        subgroupName: subgroupName.trim() || null,
        peopleCount: people,
        notes: notes.trim() || null,
        locked: false,
        sortOrder: housingFor(retreatId).length,
        createdAt: now, updatedAt: now,
      };
      addHousing(row);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Remove ${existing.spaceName ?? 'this'} assignment?`)) {
      deleteHousing(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit assignment' : 'Assign housing'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Building *</label>
            <select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setRoomId(''); }} className={inputClass}>
              <option value="">Select a building…</option>
              {dorms.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.bedCapacity ? ` — ${d.bedCapacity} beds` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Room</label>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inputClass} disabled={!buildingId || rooms.length === 0}>
              <option value="">{rooms.length === 0 ? 'Whole building' : 'Whole building (no specific room)'}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.bedCapacity ? ` — ${r.bedCapacity} beds` : ''}{r.accessible ? ' · accessible' : ''}</option>
              ))}
            </select>
          </div>
        </div>
        {dorms.length === 0 && (
          <p className="text-[11px] text-amber-text">No retreat-available buildings yet — toggle them on from "Manage spaces" first.</p>
        )}
        {buildingId && rooms.length === 0 && (
          <p className="text-[11px] text-forest/45">This building has no rooms. Add rooms as sub-locations in Camp Info → Locations to assign by room.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Subgroup</label>
            <input value={subgroupName} onChange={(e) => setSubgroupName(e.target.value)} className={inputClass} placeholder="e.g. Leadership team" />
          </div>
          <div>
            <label className={labelClass}>People</label>
            <input type="number" min="0" step="1" value={peopleCount} onChange={(e) => setPeopleCount(e.target.value)} className={inputClass} placeholder="0" />
          </div>
        </div>

        {overCapacity && (
          <p className="text-[11px] text-red">
            {people} people exceeds {(selectedRoom ?? selectedDorm)!.name}'s {capacity}-bed capacity.
          </p>
        )}

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={3}
                    placeholder="e.g. Group requested proximity to main lodge; 1 wheelchair user." />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={!buildingId} className="flex-1 justify-center">
            {existing ? 'Save assignment' : 'Assign'}
          </Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
