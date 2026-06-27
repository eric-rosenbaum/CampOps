import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore, BUILDING_TYPE_LABELS } from '@/store/buildingStore';
import { useCampStore } from '@/store/campStore';
import { generateId } from '@/lib/utils';
import type { Building, BuildingType } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function AddEditBuildingModal({ editId }: { editId?: string }) {
  const { buildings, addBuilding, updateBuilding, deleteBuilding, closeModal } = useBuildingStore();
  const { currentCamp } = useCampStore();
  const existing = editId ? buildings.find((b) => b.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<BuildingType>(existing?.type ?? 'cabin');
  const [locationLabel, setLocationLabel] = useState(existing?.locationLabel ?? '');
  const [water, setWater] = useState(existing?.mainWaterShutoff ?? '');
  const [panel, setPanel] = useState(existing?.mainElectricalPanel ?? '');
  const [gas, setGas] = useState(existing?.mainGasShutoff ?? '');
  const [yearBuilt, setYearBuilt] = useState(existing?.yearBuilt ? String(existing.yearBuilt) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const locations = currentCamp?.locations ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    if (existing) {
      updateBuilding({
        ...existing, name: name.trim(), type, locationLabel: locationLabel || null,
        mainWaterShutoff: water || null, mainElectricalPanel: panel || null, mainGasShutoff: gas || null,
        yearBuilt: yearBuilt ? Number(yearBuilt) : null, notes: notes || null,
      });
    } else {
      const b: Building = {
        id: generateId(), name: name.trim(), type, locationLabel: locationLabel || null,
        mainWaterShutoff: water || null, mainElectricalPanel: panel || null, mainGasShutoff: gas || null,
        yearBuilt: yearBuilt ? Number(yearBuilt) : null, notes: notes || null,
        sortOrder: buildings.length, createdAt: now, updatedAt: now,
      };
      addBuilding(b);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.name}" and all its rooms and components? This can't be undone.`)) {
      deleteBuilding(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit building' : 'Add building'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Cabin 7, Main Bathhouse" />
          </div>
          <div>
            <label className={labelClass}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as BuildingType)} className={inputClass}>
              {(Object.keys(BUILDING_TYPE_LABELS) as BuildingType[]).map((t) => (
                <option key={t} value={t}>{BUILDING_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Location / area</label>
            <input
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              className={inputClass}
              list="building-locations"
              placeholder="optional"
            />
            <datalist id="building-locations">
              {locations.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-label font-semibold uppercase tracking-widest text-forest/40 mb-2">Emergency reference</p>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Main water shutoff</label>
              <input value={water} onChange={(e) => setWater(e.target.value)} className={inputClass} placeholder="e.g. under kitchen sink, NW corner" />
            </div>
            <div>
              <label className={labelClass}>Main electrical panel</label>
              <input value={panel} onChange={(e) => setPanel(e.target.value)} className={inputClass} placeholder="e.g. utility closet by back door" />
            </div>
            <div>
              <label className={labelClass}>Gas shutoff</label>
              <input value={gas} onChange={(e) => setGas(e.target.value)} className={inputClass} placeholder="optional" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Year built</label>
            <input value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} className={inputClass} inputMode="numeric" placeholder="optional" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={saving}>
            {existing ? 'Save changes' : 'Add building'}
          </Button>
          {existing && (
            <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>
          )}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
