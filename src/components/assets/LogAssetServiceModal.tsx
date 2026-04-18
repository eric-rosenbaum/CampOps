import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAssetStore, SERVICE_TYPE_LABELS, isInspectionType } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { generateId } from '@/lib/utils';
import type { AssetServiceType, AssetCategory } from '@/lib/types';

const SERVICE_TYPES_BY_CATEGORY: Record<AssetCategory | 'other', AssetServiceType[]> = {
  vehicle: [
    'oil_change', 'tire_rotation', 'tire_replacement', 'brake_service', 'battery',
    'belt_replacement', 'fluid_top_off', 'filter_replacement',
    'state_inspection', 'dot_inspection', 'annual_inspection',
    'cleaning', 'repair', 'other',
  ],
  golf_cart: [
    'battery', 'tire_rotation', 'tire_replacement', 'brake_service',
    'belt_replacement', 'filter_replacement', 'annual_inspection',
    'cleaning', 'repair', 'other',
  ],
  watercraft: [
    'hull_inspection', 'engine_service', 'cleaning', 'repair', 'other',
  ],
  large_equipment: [
    'oil_change', 'filter_replacement', 'blade_sharpening', 'engine_service',
    'belt_replacement', 'fluid_top_off', 'annual_inspection',
    'cleaning', 'repair', 'other',
  ],
  trailer: [
    'tire_rotation', 'tire_replacement', 'brake_service',
    'annual_inspection', 'cleaning', 'repair', 'other',
  ],
  other: [
    'oil_change', 'tire_rotation', 'tire_replacement', 'brake_service', 'battery',
    'belt_replacement', 'fluid_top_off', 'filter_replacement',
    'state_inspection', 'dot_inspection', 'annual_inspection',
    'hull_inspection', 'engine_service', 'blade_sharpening',
    'cleaning', 'repair', 'other',
  ],
};

export function LogAssetServiceModal() {
  const { assets, serviceRecords, addServiceRecord, updateServiceRecord } = useAssetStore();
  const { isLogAssetServiceModalOpen, logServiceForAssetId, editingServiceRecordId, closeAllModals } = useUIStore();

  const asset = logServiceForAssetId ? assets.find((a) => a.id === logServiceForAssetId) : null;
  const editing = editingServiceRecordId ? serviceRecords.find((r) => r.id === editingServiceRecordId) : null;
  const serviceTypes = SERVICE_TYPES_BY_CATEGORY[asset?.category ?? 'other'];

  const [serviceType, setServiceType] = useState<AssetServiceType>(serviceTypes[0]);
  const [datePerformed, setDatePerformed] = useState(new Date().toISOString().split('T')[0]);
  const [performedBy, setPerformedBy] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [odometer, setOdometer] = useState('');
  const [hours, setHours] = useState('');
  const [cost, setCost] = useState('');
  const [nextServiceDate, setNextServiceDate] = useState('');
  const [nextOdometer, setNextOdometer] = useState('');
  const [nextHours, setNextHours] = useState('');

  useEffect(() => {
    const types = SERVICE_TYPES_BY_CATEGORY[asset?.category ?? 'other'];
    if (editing) {
      setServiceType(editing.serviceType as AssetServiceType);
      setDatePerformed(editing.datePerformed);
      setPerformedBy(editing.performedBy);
      setVendor(editing.vendor ?? '');
      setDescription(editing.description ?? '');
      setOdometer(editing.odometerAtService?.toString() ?? '');
      setHours(editing.hoursAtService?.toString() ?? '');
      setCost(editing.cost?.toString() ?? '');
      setNextServiceDate(editing.nextServiceDate ?? '');
      setNextOdometer(editing.nextServiceOdometer?.toString() ?? '');
      setNextHours(editing.nextServiceHours?.toString() ?? '');
    } else {
      if (asset) {
        setOdometer(asset.currentOdometer?.toString() ?? '');
        setHours(asset.currentHours?.toString() ?? '');
      }
      setServiceType(types[0]);
      setDatePerformed(new Date().toISOString().split('T')[0]);
      setPerformedBy('');
      setVendor('');
      setDescription('');
      setCost('');
      setNextServiceDate('');
      setNextOdometer('');
      setNextHours('');
    }
  }, [logServiceForAssetId, editingServiceRecordId]);

  if (!isLogAssetServiceModalOpen || !asset) return null;

  function handleSave() {
    if (!asset || !performedBy.trim()) return;
    const record = {
      id: editing?.id ?? generateId(),
      assetId: asset.id,
      serviceType,
      datePerformed,
      performedBy: performedBy.trim(),
      vendor: vendor.trim() || null,
      description: description.trim() || null,
      odometerAtService: asset.tracksOdometer && odometer ? parseFloat(odometer) : null,
      hoursAtService: asset.tracksHours && hours ? parseFloat(hours) : null,
      cost: cost ? parseFloat(cost) : null,
      nextServiceDate: nextServiceDate || null,
      nextServiceOdometer: nextOdometer ? parseFloat(nextOdometer) : null,
      nextServiceHours: nextHours ? parseFloat(nextHours) : null,
      isInspection: isInspectionType(serviceType),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    if (editing) {
      updateServiceRecord(record);
    } else {
      addServiceRecord(record);
    }
    closeAllModals();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-modal shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-panel-title font-semibold text-forest">{editing ? 'Edit service record' : 'Log service'}</h2>
            <p className="text-meta text-forest/50 mt-0.5">{asset.name}</p>
          </div>
          <button onClick={closeAllModals} className="text-forest/40 hover:text-forest transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-body font-medium text-forest mb-1 block">Service type</label>
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value as AssetServiceType)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage bg-white">
                {serviceTypes.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-body font-medium text-forest mb-1 block">Date performed</label>
              <input type="date" value={datePerformed} onChange={(e) => setDatePerformed(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-body font-medium text-forest mb-1 block">Performed by <span className="text-red">*</span></label>
              <input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Tom H., AquaPro…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
            </div>
            <div>
              <label className="text-body font-medium text-forest mb-1 block">Vendor (optional)</label>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
            </div>
          </div>

          {(asset.tracksOdometer || asset.tracksHours) && (
            <div className="grid grid-cols-2 gap-3">
              {asset.tracksOdometer && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Odometer at service</label>
                  <input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
              {asset.tracksHours && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Hours at service</label>
                  <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-body font-medium text-forest mb-1 block">Cost (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-forest/40 text-body">$</span>
                <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className="w-full border border-border rounded-btn pl-6 pr-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-body font-medium text-forest mb-1 block">Description / notes (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage resize-none" />
          </div>

          <div>
            <p className="text-body font-medium text-forest mb-2">Next service due (optional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-meta text-forest/50 mb-1 block">Date</label>
                <input type="date" value={nextServiceDate} onChange={(e) => setNextServiceDate(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
              </div>
              {asset.tracksOdometer && (
                <div>
                  <label className="text-meta text-forest/50 mb-1 block">Odometer</label>
                  <input type="number" value={nextOdometer} onChange={(e) => setNextOdometer(e.target.value)} placeholder="miles" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
              {asset.tracksHours && (
                <div>
                  <label className="text-meta text-forest/50 mb-1 block">Hours</label>
                  <input type="number" value={nextHours} onChange={(e) => setNextHours(e.target.value)} placeholder="hrs" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={closeAllModals}>Cancel</Button>
          <Button onClick={handleSave} disabled={!performedBy.trim()}>{editing ? 'Save changes' : 'Save record'}</Button>
        </div>
      </div>
    </div>
  );
}
