import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore } from '@/store/buildingStore';
import { useLocationStore } from '@/store/locationStore';
import type { CampLocation } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-ink mb-1';

// A room is a child `locations` node under its building. New rooms are added in Camp Info →
// Locations; this modal only edits/renames an existing room from Building Systems.
export function AddEditRoomModal({ editId }: { buildingId: string; editId?: string }) {
  const { closeModal } = useBuildingStore();
  const { locations, updateLocation, deleteLocation } = useLocationStore();
  const existing: CampLocation | null = editId ? locations.find((l) => l.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !existing) { closeModal(); return; }
    updateLocation({ ...existing, name: name.trim(), notes: notes || null });
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete room "${existing.name}"? Its components will be removed too.`)) {
      deleteLocation(existing.id);
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
