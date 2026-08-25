import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore, BUILDING_TYPE_LABELS } from '@/store/buildingStore';
import { useLocationStore } from '@/store/locationStore';
import type { BuildingType, CampLocation } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-ink mb-1';

// A building is a top-level `locations` node that also carries a building_details
// row. Create = addLocation (parent null) + upsertBuildingDetail; edit updates both.
export function AddEditBuildingModal({ editId }: { editId?: string }) {
  const { closeModal, setActiveBuilding } = useBuildingStore();
  const { locations, buildingDetails, buildingDetailFor, updateLocation, deleteLocation, upsertBuildingDetail } = useLocationStore();

  const existing: CampLocation | null = editId ? locations.find((l) => l.id === editId) ?? null : null;
  const existingDetail = editId ? buildingDetailFor(editId) : undefined;

  // Existing top-level locations that aren't already buildings. You can attach infra to one
  // of these ("promote" it) instead of creating a duplicate location.
  const buildingIds = new Set(buildingDetails.map((b) => b.locationId));
  const candidates = locations
    .filter((l) => l.parentId == null && l.isActive && !buildingIds.has(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Locations are only created in Camp Info → Locations; here you attach building systems to an
  // existing one. Default to the first available location.
  const [locationChoice, setLocationChoice] = useState<string>(candidates[0]?.id ?? '');

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<BuildingType>((existingDetail?.buildingType as BuildingType) ?? 'cabin');
  const [water, setWater] = useState(existingDetail?.mainWaterShutoff ?? '');
  const [panel, setPanel] = useState(existingDetail?.mainElectricalPanel ?? '');
  const [gas, setGas] = useState(existingDetail?.mainGasShutoff ?? '');
  const [yearBuilt, setYearBuilt] = useState(existingDetail?.yearBuilt ? String(existingDetail.yearBuilt) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!existing && !locationChoice) return;
    setSaving(true);
    let locationId: string;
    if (existing) {
      updateLocation({ ...existing, name: name.trim(), notes: notes || null });
      locationId = existing.id;
    } else {
      // Attach building systems to an existing location (locations are created in Camp Info).
      locationId = locationChoice;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!existing && (
            <div className="col-span-2">
              <label className={labelClass}>Location *</label>
              {candidates.length > 0 ? (
                <>
                  <select value={locationChoice} onChange={(e) => setLocationChoice(e.target.value)} className={inputClass}>
                    {candidates.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <p className="text-[11px] text-ink-faint mt-1">Pick a location to track its electrical/plumbing here. Add new locations in <span className="font-medium">Camp Info → Locations</span>.</p>
                </>
              ) : (
                <p className="text-[12px] text-ink-soft bg-cream rounded-btn px-3 py-2.5">No available locations yet. Add one in <span className="font-medium">Camp Info → Locations</span> first, then come back to attach its building systems.</p>
              )}
            </div>
          )}
          {existing && (
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
          <p className="text-label font-semibold uppercase tracking-widest text-ink-faint mb-2">Emergency reference</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <Button type="submit" className="flex-1 justify-center" disabled={saving || (existing ? !name.trim() : !locationChoice)}>
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
