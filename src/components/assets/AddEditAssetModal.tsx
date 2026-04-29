import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAssetStore, SUBTYPES_BY_CATEGORY } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { useCampStore } from '@/store/campStore';
import { generateId } from '@/lib/utils';
import type { CampAsset, AssetCategory, AssetStatus } from '@/lib/types';

const DEFAULT_LOCATIONS = ['Maintenance Shed', 'Barn', 'Garage', 'Waterfront', 'Athletic Fields', 'Other'];

const CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'golf_cart', label: 'Golf Cart / Utility Cart' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'watercraft', label: 'Watercraft' },
  { value: 'large_equipment', label: 'Large Equipment' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'technology', label: 'Technology' },
  { value: 'other', label: 'Other' },
];

const STATUSES: { value: AssetStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'in_service', label: 'In Service' },
  { value: 'retired', label: 'Retired' },
];

export function AddEditAssetModal() {
  const { assets, addAsset, updateAsset } = useAssetStore();
  const { isAddEditAssetModalOpen, editingAssetId, closeAllModals } = useUIStore();
  const campLocations = useCampStore((s) => s.currentCamp?.locations ?? DEFAULT_LOCATIONS);

  const editing = editingAssetId ? assets.find((a) => a.id === editingAssetId) : null;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('golf_cart');
  const [subtype, setSubtype] = useState('golf_cart');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [status, setStatus] = useState<AssetStatus>('available');
  const [tracksOdometer, setTracksOdometer] = useState(false);
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [tracksHours, setTracksHours] = useState(false);
  const [currentHours, setCurrentHours] = useState('');
  const [notes, setNotes] = useState('');
  // Watercraft
  const [hullId, setHullId] = useState('');
  const [uscgRegistration, setUscgRegistration] = useState('');
  const [uscgRegistrationExpiry, setUscgRegistrationExpiry] = useState('');
  const [capacity, setCapacity] = useState('');
  const [motorType, setMotorType] = useState('');
  const [hasLifejackets, setHasLifejackets] = useState(false);
  const [lifejacketCount, setLifejacketCount] = useState('');

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setCategory(editing.category);
      setSubtype(editing.subtype);
      setMake(editing.make ?? '');
      setModel(editing.model ?? '');
      setYear(editing.year?.toString() ?? '');
      setSerialNumber(editing.serialNumber ?? '');
      setLicensePlate(editing.licensePlate ?? '');
      setRegistrationExpiry(editing.registrationExpiry ?? '');
      setStorageLocation(editing.storageLocation);
      setStatus(editing.status === 'checked_out' ? 'available' : editing.status);
      setTracksOdometer(editing.tracksOdometer);
      setCurrentOdometer(editing.currentOdometer?.toString() ?? '');
      setTracksHours(editing.tracksHours);
      setCurrentHours(editing.currentHours?.toString() ?? '');
      setNotes(editing.notes ?? '');
      setHullId(editing.hullId ?? '');
      setUscgRegistration(editing.uscgRegistration ?? '');
      setUscgRegistrationExpiry(editing.uscgRegistrationExpiry ?? '');
      setCapacity(editing.capacity?.toString() ?? '');
      setMotorType(editing.motorType ?? '');
      setHasLifejackets(editing.hasLifejackets ?? false);
      setLifejacketCount(editing.lifejacketCount?.toString() ?? '');
    } else {
      const defaults = SUBTYPES_BY_CATEGORY['golf_cart'];
      setSubtype(defaults[0]?.value ?? 'golf_cart');
    }
  }, [editingAssetId]);

  useEffect(() => {
    if (!editing) {
      const subs = SUBTYPES_BY_CATEGORY[category];
      setSubtype(subs[0]?.value ?? 'other');
    }
  }, [category]);

  if (!isAddEditAssetModalOpen) return null;

  function handleSave() {
    if (!name.trim() || !storageLocation.trim()) return;
    const now = new Date().toISOString();
    const asset: CampAsset = {
      id: editing?.id ?? generateId(),
      name: name.trim(),
      category,
      subtype,
      make: make.trim() || null,
      model: model.trim() || null,
      year: year ? parseInt(year) : null,
      serialNumber: serialNumber.trim() || null,
      licensePlate: licensePlate.trim() || null,
      registrationExpiry: registrationExpiry || null,
      storageLocation: storageLocation.trim(),
      status: editing?.status === 'checked_out' ? 'checked_out' : status,
      tracksOdometer,
      currentOdometer: tracksOdometer && currentOdometer ? parseFloat(currentOdometer) : null,
      tracksHours,
      currentHours: tracksHours && currentHours ? parseFloat(currentHours) : null,
      notes: notes.trim() || null,
      isActive: true,
      hullId: category === 'watercraft' ? (hullId.trim() || null) : null,
      uscgRegistration: category === 'watercraft' ? (uscgRegistration.trim() || null) : null,
      uscgRegistrationExpiry: category === 'watercraft' ? (uscgRegistrationExpiry || null) : null,
      capacity: category === 'watercraft' && capacity ? parseInt(capacity) : null,
      motorType: category === 'watercraft' ? (motorType.trim() || null) : null,
      hasLifejackets: category === 'watercraft' ? hasLifejackets : null,
      lifejacketCount: category === 'watercraft' && hasLifejackets && lifejacketCount ? parseInt(lifejacketCount) : null,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    };
    if (editing) updateAsset(asset);
    else addAsset(asset);
    closeAllModals();
  }

  const subtypeOptions = SUBTYPES_BY_CATEGORY[category] ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-modal shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white z-10">
          <h2 className="text-panel-title font-semibold text-forest">{editing ? 'Edit asset' : 'Add asset'}</h2>
          <button onClick={closeAllModals} className="text-forest/40 hover:text-forest transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Identity */}
          <section>
            <p className="text-meta font-semibold uppercase tracking-wide text-forest/40 mb-3">Identity</p>
            <div className="space-y-3">
              <div>
                <label className="text-body font-medium text-forest mb-1 block">Name <span className="text-red">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Golf Cart 1, Camp Bus, John Deere…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage bg-white">
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Type</label>
                  <select value={subtype} onChange={(e) => setSubtype(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage bg-white">
                    {subtypeOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Details */}
          <section>
            <p className="text-meta font-semibold uppercase tracking-wide text-forest/40 mb-3">Details</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Make</label>
                  <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Ford, John Deere…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Model</label>
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="F-250, X590…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Year</label>
                  <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2022" type="number" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Serial / VIN / Hull ID</label>
                  <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">License plate</label>
                  <input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Registration expiry</label>
                  <input type="date" value={registrationExpiry} onChange={(e) => setRegistrationExpiry(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Storage location <span className="text-red">*</span></label>
                  <select value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage bg-white">
                    <option value="">Select location…</option>
                    {campLocations.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Tracking */}
          <section>
            <p className="text-meta font-semibold uppercase tracking-wide text-forest/40 mb-3">Tracking</p>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tracksOdometer} onChange={(e) => setTracksOdometer(e.target.checked)} className="rounded" />
                  <span className="text-body text-forest">Track odometer (miles)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tracksHours} onChange={(e) => setTracksHours(e.target.checked)} className="rounded" />
                  <span className="text-body text-forest">Track engine hours</span>
                </label>
              </div>
              {(tracksOdometer || tracksHours) && (
                <div className="grid grid-cols-2 gap-3">
                  {tracksOdometer && (
                    <div>
                      <label className="text-body font-medium text-forest mb-1 block">Current odometer</label>
                      <input type="number" value={currentOdometer} onChange={(e) => setCurrentOdometer(e.target.value)} placeholder="miles" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                    </div>
                  )}
                  {tracksHours && (
                    <div>
                      <label className="text-body font-medium text-forest mb-1 block">Current engine hours</label>
                      <input type="number" value={currentHours} onChange={(e) => setCurrentHours(e.target.value)} placeholder="hours" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Watercraft */}
          {category === 'watercraft' && (
            <section>
              <p className="text-meta font-semibold uppercase tracking-wide text-forest/40 mb-3">Watercraft</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-body font-medium text-forest mb-1 block">Hull ID</label>
                    <input value={hullId} onChange={(e) => setHullId(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                  </div>
                  <div>
                    <label className="text-body font-medium text-forest mb-1 block">USCG registration #</label>
                    <input value={uscgRegistration} onChange={(e) => setUscgRegistration(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-body font-medium text-forest mb-1 block">USCG expiry</label>
                    <input type="date" value={uscgRegistrationExpiry} onChange={(e) => setUscgRegistrationExpiry(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                  </div>
                  <div>
                    <label className="text-body font-medium text-forest mb-1 block">Max capacity</label>
                    <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="persons" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                  </div>
                  <div>
                    <label className="text-body font-medium text-forest mb-1 block">Motor type</label>
                    <input value={motorType} onChange={(e) => setMotorType(e.target.value)} placeholder="40hp Mercury…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasLifejackets} onChange={(e) => setHasLifejackets(e.target.checked)} className="rounded" />
                    <span className="text-body text-forest">Has lifejackets aboard</span>
                  </label>
                  {hasLifejackets && (
                    <div className="flex items-center gap-2">
                      <label className="text-body text-forest">Count:</label>
                      <input type="number" value={lifejacketCount} onChange={(e) => setLifejacketCount(e.target.value)} className="w-20 border border-border rounded-btn px-3 py-1.5 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Other */}
          <section>
            <p className="text-meta font-semibold uppercase tracking-wide text-forest/40 mb-3">Other</p>
            <div className="space-y-3">
              {editing && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage bg-white">
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-body font-medium text-forest mb-1 block">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage resize-none" />
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={closeAllModals}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !storageLocation.trim()}>{editing ? 'Save changes' : 'Add asset'}</Button>
        </div>
      </div>
    </div>
  );
}
