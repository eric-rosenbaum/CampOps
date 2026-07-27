import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore, BUILDING_TYPE_LABELS } from '@/store/buildingStore';
import { useLocationStore } from '@/store/locationStore';
import type { BuildingType, CampLocation } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

// A building is a top-level `locations` node that also carries a building_details
// row. Create = addLocation (parent null) + upsertBuildingDetail; edit updates both.
export function AddEditBuildingModal({ editId }: { editId?: string }) {
  const { closeModal, setActiveBuilding } = useBuildingStore();
  const { locations, categories, buildingDetails, buildingDetailFor, addLocation, updateLocation, deleteLocation, upsertBuildingDetail } = useLocationStore();

  const existing: CampLocation | null = editId ? locations.find((l) => l.id === editId) ?? null : null;
  const existingDetail = editId ? buildingDetailFor(editId) : undefined;

  // Existing top-level locations that aren't already buildings — you can attach infra to one
  // of these ("promote" it) instead of creating a duplicate location.
  const buildingIds = new Set(buildingDetails.map((b) => b.locationId));
  const candidates = locations
    .filter((l) => l.parentId == null && l.isActive && !buildingIds.has(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [locationChoice, setLocationChoice] = useState<string>('__new__'); // '__new__' or an existing location id

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<BuildingType>((existingDetail?.buildingType as BuildingType) ?? 'cabin');
  const [water, setWater] = useState(existingDetail?.mainWaterShutoff ?? '');
  const [panel, setPanel] = useState(existingDetail?.mainElectricalPanel ?? '');
  const [gas, setGas] = useState(existingDetail?.mainGasShutoff ?? '');
  const [yearBuilt, setYearBuilt] = useState(existingDetail?.yearBuilt ? String(existingDetail.yearBuilt) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Best-effort default category from the building type label (e.g. type "cabin"
  // matches a "Cabins" category). Never auto-creates a category.
  function defaultCategoryId(t: BuildingType): string | null {
    const label = BUILDING_TYPE_LABELS[t].toLowerCase();
    return categories.find((c) => {
      const n = c.name.toLowerCase();
      return n === label || n.includes(label) || label.includes(n);
    })?.id ?? null;
  }

  const creatingNew = !existing && locationChoice === '__new__';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (creatingNew && !name.trim()) return;
    setSaving(true);
    let locationId: string;
    if (existing) {
      updateLocation({ ...existing, name: name.trim(), notes: notes || null });
      locationId = existing.id;
    } else if (locationChoice !== '__new__') {
      // Attach infra to an existing location (no duplicate created).
      locationId = locationChoice;
    } else {
      const loc = addLocation({ name: name.trim(), parentId: null, categoryId: defaultCategoryId(type), notes: notes || null });
      locationId = loc.id;
    }
    upsertBuildingDetail({
      locationId,
      campId: existing?.campId ?? '',
      buildingType: type,
      mainWaterShutoff: water || null,
      mainElectricalPanel: panel || null,
      mainGasShutoff: gas || null,
      yearBuilt: yearBuilt ? Number(yearBuilt) : null,
    });
    if (!existing) setActiveBuilding(locationId);
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete "${existing.name}" and all its rooms and components? This can't be undone.`)) {
      deleteLocation(existing.id);
      setActiveBuilding(null);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit building' : 'Add building'} onClose={closeModal} width="480px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {!existing && (
            <div className="col-span-2">
              <label className={labelClass}>Location</label>
              <select value={locationChoice} onChange={(e) => setLocationChoice(e.target.value)} className={inputClass}>
                <option value="__new__">+ Create a new location…</option>
                {candidates.length > 0 && (
                  <optgroup label="Or add infrastructure to an existing location">
                    {candidates.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </optgroup>
                )}
              </select>
              <p className="text-[11px] text-forest/40 mt-1">Pick a location you already have (e.g. a cabin) to track its electrical/plumbing here — no duplicate is created.</p>
            </div>
          )}
          {(existing || creatingNew) && (
            <div className="col-span-2">
              <label className={labelClass}>Name *</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Cabin 7, Main Bathhouse" />
            </div>
          )}
          <div>
            <label className={labelClass}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as BuildingType)} className={inputClass}>
              {(Object.keys(BUILDING_TYPE_LABELS) as BuildingType[]).map((t) => (
                <option key={t} value={t}>{BUILDING_TYPE_LABELS[t]}</option>
              ))}
            </select>
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
          <Button type="submit" className="flex-1 justify-center" disabled={saving || (creatingNew && !name.trim())}>
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
