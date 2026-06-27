import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore } from '@/store/buildingStore';
import { generateId } from '@/lib/utils';
import type { BuildingRoom } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function AddEditRoomModal({ buildingId, editId }: { buildingId: string; editId?: string }) {
  const { rooms, roomsForBuilding, addRoom, updateRoom, deleteRoom, closeModal } = useBuildingStore();
  const existing = editId ? rooms.find((r) => r.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [floor, setFloor] = useState(existing?.floor ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const now = new Date().toISOString();
    if (existing) {
      updateRoom({ ...existing, name: name.trim(), floor: floor || null, notes: notes || null });
    } else {
      const r: BuildingRoom = {
        id: generateId(), buildingId, name: name.trim(), floor: floor || null, notes: notes || null,
        sortOrder: roomsForBuilding(buildingId).length, createdAt: now, updatedAt: now,
      };
      addRoom(r);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete room "${existing.name}"? Its components will become unassigned.`)) {
      deleteRoom(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit room' : 'Add room'} onClose={closeModal} width="420px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Room name *</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Shower room A, Kitchen, Main hall" />
        </div>
        <div>
          <label className={labelClass}>Floor / level</label>
          <input value={floor} onChange={(e) => setFloor(e.target.value)} className={inputClass} placeholder="optional" />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add room'}</Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
