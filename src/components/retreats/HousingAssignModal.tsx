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
  const dorms = useMemo(
    () => locations.filter((l) => l.isDorm && l.retreatAvailable && l.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );
  const existing = housingId ? housingFor(retreatId).find((h) => h.id === housingId) ?? null : null;

  const [locationId, setLocationId] = useState(existing?.locationId ?? '');
  const [subgroupName, setSubgroupName] = useState(existing?.subgroupName ?? '');
  const [peopleCount, setPeopleCount] = useState(existing ? String(existing.peopleCount) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const selectedDorm = dorms.find((d) => d.id === locationId) ?? null;
  const capacity = selectedDorm?.bedCapacity ?? 0;
  const people = Math.max(0, Math.round(Number(peopleCount) || 0));
  const overCapacity = selectedDorm != null && capacity > 0 && people > capacity;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) return;
    const now = new Date().toISOString();
    const spaceName = dorms.find((d) => d.id === locationId)?.name ?? existing?.spaceName ?? null;

    if (existing) {
      updateHousing({
        ...existing,
        locationId,
        spaceName,
        subgroupName: subgroupName.trim() || null,
        peopleCount: people,
        notes: notes.trim() || null,
        updatedAt: now,
      });
    } else {
      const row: RetreatHousing = {
        id: generateId(), campId: '', retreatId,
        locationId, spaceId: null, spaceName,
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
    <Modal title={existing ? 'Edit cabin assignment' : 'Assign cabin'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Dorm *</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
            <option value="">Select a dorm / cabin…</option>
            {dorms.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.bedCapacity ?? 0} beds{d.accessible ? ' · accessible' : ''}
              </option>
            ))}
          </select>
          {dorms.length === 0 && (
            <p className="text-[11px] text-amber-text mt-1">
              No retreat-available dorms yet — toggle dorms on from "Manage spaces" first.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Subgroup</label>
            <input value={subgroupName} onChange={(e) => setSubgroupName(e.target.value)} className={inputClass}
                   placeholder="e.g. Leadership team" />
          </div>
          <div>
            <label className={labelClass}>People</label>
            <input type="number" min="0" step="1" value={peopleCount} onChange={(e) => setPeopleCount(e.target.value)}
                   className={inputClass} placeholder="0" />
          </div>
        </div>

        {overCapacity && (
          <p className="text-[11px] text-red">
            {people} people exceeds {selectedDorm!.name}'s {capacity}-bed capacity.
          </p>
        )}

        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={3}
                    placeholder="e.g. Group requested proximity to main lodge; 1 wheelchair user." />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={!locationId} className="flex-1 justify-center">
            {existing ? 'Save assignment' : 'Assign cabin'}
          </Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
