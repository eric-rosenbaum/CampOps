import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore, FREQUENCY_DAYS } from '@/store/safetyStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { SafetyItem, SafetyItemType } from '@/lib/types';
import { addDays } from 'date-fns';

const DEFAULT_LOCATIONS = ['Waterfront', 'Dining Hall', 'Main Lodge', 'Health Center', 'Kitchen', 'Athletic Fields', 'Maintenance', 'Other'];

interface FormValues {
  name: string;
  location: string;
  unitCount: number;
  frequency: SafetyItem['frequency'];
  lastInspected: string;
  vendor: string;
  notes: string;
  // Extinguisher
  extinguisherClass: string;
  expiryYear: string;
  // Refrigeration
  tempMin: string;
  tempMax: string;
  // Waterfront rescue equipment
  condition: string;
}

// ─── Type metadata ─────────────────────────────────────────────────────────────

type CategoryKey = SafetyItem['category'];

const TYPE_CATEGORY: Record<SafetyItemType, CategoryKey> = {
  extinguisher: 'fire',
  smoke_alarm: 'fire',
  co_alarm: 'fire',
  hood_fan: 'kitchen',
  refrigeration: 'kitchen',
  health_inspection: 'kitchen',
  waterfront_check: 'water',
  life_ring: 'water',
  rescue_tube: 'water',
  rescue_board: 'water',
};

const TYPE_LABELS: Record<SafetyItemType, string> = {
  extinguisher: 'Fire extinguisher',
  smoke_alarm: 'Smoke alarm',
  co_alarm: 'Carbon monoxide alarm',
  hood_fan: 'Kitchen hood fan',
  refrigeration: 'Refrigeration unit',
  health_inspection: 'Health dept. inspection',
  waterfront_check: 'Waterfront safety check',
  life_ring: 'Life ring / throw ring',
  rescue_tube: 'Rescue tube',
  rescue_board: 'Rescue board / paddleboard',
};

const DEFAULT_FREQUENCIES: Record<SafetyItemType, SafetyItem['frequency']> = {
  extinguisher: 'monthly',
  smoke_alarm: 'weekly',
  co_alarm: 'weekly',
  hood_fan: 'quarterly',
  refrigeration: 'daily',
  health_inspection: 'annually',
  waterfront_check: 'daily',
  life_ring: 'weekly',
  rescue_tube: 'weekly',
  rescue_board: 'weekly',
};

const NAME_PLACEHOLDERS: Record<SafetyItemType, string> = {
  extinguisher: 'e.g. Dining hall — kitchen (×2)',
  smoke_alarm: 'e.g. Cabin 4 — smoke alarm',
  co_alarm: 'e.g. Main lodge — CO alarm',
  hood_fan: 'e.g. Dining hall — main kitchen hood',
  refrigeration: 'e.g. Walk-in refrigerator',
  health_inspection: 'e.g. Kitchen & dining hall inspection',
  waterfront_check: 'e.g. Daily waterfront safety check',
  life_ring: 'e.g. Main dock — life ring station',
  rescue_tube: 'e.g. Lifeguard rescue tube #1',
  rescue_board: 'e.g. Rescue paddleboard — main beach',
};

const VENDOR_LABELS: Partial<Record<SafetyItemType, string>> = {
  health_inspection: 'Inspecting authority',
  life_ring: 'Manufacturer / brand',
  rescue_tube: 'Manufacturer / brand',
  rescue_board: 'Manufacturer / brand',
};

const VENDOR_PLACEHOLDERS: Partial<Record<SafetyItemType, string>> = {
  health_inspection: 'e.g. County Health Department',
  life_ring: 'e.g. Kemp USA',
  rescue_tube: 'e.g. Kemp USA',
  rescue_board: 'e.g. Ocean Signal',
};

const NOTES_PLACEHOLDERS: Partial<Record<SafetyItemType, string>> = {
  life_ring: 'Serial number, storage location, any known issues…',
  rescue_tube: 'Serial number, storage location, any known issues…',
  rescue_board: 'Serial number, storage location, any known issues…',
  refrigeration: 'Unit make/model, location details…',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const icErr = 'w-full text-body bg-white border border-red rounded-btn px-3 py-2 focus:outline-none focus:border-red';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

function isWaterfrontEquip(type: SafetyItemType) {
  return ['life_ring', 'rescue_tube', 'rescue_board'].includes(type);
}
function showUnitCount(type: SafetyItemType) {
  return type !== 'waterfront_check' && type !== 'health_inspection';
}
function showVendor(type: SafetyItemType) {
  return type !== 'waterfront_check';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddSafetyItemModal() {
  const { closeAllModals, addItemModalDefaultType, editingSafetyItemId } = useUIStore();
  const { items, addItem, updateItem, deleteItem } = useSafetyStore();
  const campLocations = useCampStore((s) => s.currentCamp?.locations ?? DEFAULT_LOCATIONS);
  const { currentUser } = useAuth();

  const editing = editingSafetyItemId ? items.find((i) => i.id === editingSafetyItemId) ?? null : null;
  const itemType = (editing?.type ?? addItemModalDefaultType ?? 'extinguisher') as SafetyItemType;
  const meta = (editing?.metadata ?? {}) as Record<string, unknown>;

  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm<FormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      location: editing?.location ?? '',
      unitCount: editing?.unitCount ?? 1,
      frequency: editing?.frequency ?? DEFAULT_FREQUENCIES[itemType],
      lastInspected: editing?.lastInspected ?? '',
      vendor: editing?.vendor ?? '',
      notes: editing?.notes ?? '',
      extinguisherClass: (meta.extinguisher_class as string) ?? '',
      expiryYear: (meta.expiry_year as string) ?? '',
      tempMin: meta.temp_min != null ? String(meta.temp_min) : '',
      tempMax: meta.temp_max != null ? String(meta.temp_max) : '',
      condition: (meta.condition as string) ?? '',
    },
  });

  const lastInspected = watch('lastInspected');
  const frequency = watch('frequency');

  const suggestedNextDue = lastInspected && frequency
    ? addDays(new Date(lastInspected + 'T00:00:00'), FREQUENCY_DAYS[frequency]).toISOString().slice(0, 10)
    : '';

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    const freqDays = FREQUENCY_DAYS[data.frequency];
    const nextDue = data.lastInspected
      ? addDays(new Date(data.lastInspected + 'T00:00:00'), freqDays).toISOString().slice(0, 10)
      : null;

    const metadata: Record<string, unknown> = {};
    if (itemType === 'extinguisher') {
      if (data.extinguisherClass) metadata.extinguisher_class = data.extinguisherClass;
      if (data.expiryYear) metadata.expiry_year = data.expiryYear;
    }
    if (itemType === 'refrigeration') {
      if (data.tempMin) metadata.temp_min = parseFloat(data.tempMin);
      if (data.tempMax) metadata.temp_max = parseFloat(data.tempMax);
      metadata.temp_unit = '°F';
    }
    if (isWaterfrontEquip(itemType)) {
      if (data.condition) metadata.condition = data.condition;
    }
    if (editing) {
      updateItem(editing.id, {
        name: data.name,
        location: data.location,
        unitCount: showUnitCount(itemType) ? (Number(data.unitCount) || 1) : 1,
        frequency: data.frequency,
        frequencyDays: freqDays,
        lastInspected: data.lastInspected || null,
        nextDue: nextDue ?? editing.nextDue,
        vendor: data.vendor || null,
        notes: data.notes || null,
        metadata,
      });
    } else {
      const item: SafetyItem = {
        id: generateId(),
        name: data.name,
        category: TYPE_CATEGORY[itemType],
        type: itemType,
        location: data.location,
        unitCount: showUnitCount(itemType) ? (Number(data.unitCount) || 1) : 1,
        frequency: data.frequency,
        frequencyDays: freqDays,
        lastInspected: data.lastInspected || null,
        nextDue,
        vendor: data.vendor || null,
        notes: data.notes || null,
        metadata,
        createdAt: now,
        updatedAt: now,
      };
      addItem(item);
      console.log('[Safety] Item added by', currentUser.name);
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.name}"? This will also remove all inspection logs for this item.`)) return;
    deleteItem(editing.id);
    closeAllModals();
  }

  const modalTitle = editing
    ? `Edit ${TYPE_LABELS[itemType].toLowerCase()}`
    : `Add ${TYPE_LABELS[itemType].toLowerCase()}`;

  const lastInspectedLabel =
    itemType === 'waterfront_check' ? 'Last checked' :
    itemType === 'health_inspection' ? 'Last inspected' :
    itemType === 'hood_fan' ? 'Last cleaned' :
    'Last inspected';

  const frequencyLabel =
    itemType === 'waterfront_check' ? 'Check frequency' :
    itemType === 'hood_fan' ? 'Cleaning frequency' :
    'Inspection frequency';

  return (
    <Modal title={modalTitle} onClose={closeAllModals} width="460px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        <div>
          <label className={lc}>Name / description *</label>
          <input
            {...register('name', { required: true })}
            className={errors.name ? icErr : ic}
            placeholder={NAME_PLACEHOLDERS[itemType]}
          />
          {errors.name && <p className="text-[11px] text-red mt-1">Name is required.</p>}
        </div>

        <div className={showUnitCount(itemType) ? 'grid grid-cols-2 gap-3' : ''}>
          <div>
            <label className={lc}>Location *</label>
            <select
              {...register('location', { required: true })}
              className={errors.location ? icErr : ic}
            >
              <option value="">— Select location —</option>
              {campLocations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {errors.location && <p className="text-[11px] text-red mt-1">Location is required.</p>}
          </div>
          {showUnitCount(itemType) && (
            <div>
              <label className={lc}>
                {isWaterfrontEquip(itemType) ? 'Quantity' : itemType === 'refrigeration' ? 'Units' : 'Unit count'}
              </label>
              <input {...register('unitCount')} type="number" min={1} className={ic} />
            </div>
          )}
        </div>

        {/* Extinguisher-specific */}
        {itemType === 'extinguisher' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>Extinguisher class</label>
              <select {...register('extinguisherClass')} className={ic}>
                <option value="">— Select —</option>
                <option value="ABC">ABC dry chemical</option>
                <option value="Class K">Class K (kitchen)</option>
                <option value="Class B">Class B (flammable liquid)</option>
                <option value="CO2">CO₂</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className={lc}>Cylinder expiry year</label>
              <input {...register('expiryYear')} className={ic} placeholder="e.g. 2027" maxLength={4} />
            </div>
          </div>
        )}

        {/* Refrigeration-specific */}
        {itemType === 'refrigeration' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>Min safe temp (°F)</label>
              <input {...register('tempMin')} type="number" step="0.1" className={ic} placeholder="e.g. 35" />
            </div>
            <div>
              <label className={lc}>Max safe temp (°F)</label>
              <input {...register('tempMax')} type="number" step="0.1" className={ic} placeholder="e.g. 41" />
            </div>
          </div>
        )}

        {/* Waterfront rescue equipment-specific */}
        {isWaterfrontEquip(itemType) && (
          <div>
            <label className={lc}>Current condition</label>
            <select {...register('condition')} className={ic}>
              <option value="">— Not assessed —</option>
              <option value="excellent">Excellent — no issues</option>
              <option value="good">Good — minor wear</option>
              <option value="fair">Fair — needs attention</option>
              <option value="poor">Poor — replace soon</option>
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>{frequencyLabel} *</label>
            <select {...register('frequency', { required: true })} className={ic}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly (90 days)</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <div>
            <label className={lc}>{lastInspectedLabel}</label>
            <input {...register('lastInspected')} type="date" className={ic} />
          </div>
        </div>

        {suggestedNextDue && (
          <p className="text-[11px] text-forest/50 -mt-2">
            Next due: <span className="font-medium">{new Date(suggestedNextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </p>
        )}

        {showVendor(itemType) && (
          <div>
            <label className={lc}>{VENDOR_LABELS[itemType] ?? 'Vendor / inspector'}</label>
            <input
              {...register('vendor')}
              className={ic}
              placeholder={VENDOR_PLACEHOLDERS[itemType] ?? 'Company or person name'}
            />
          </div>
        )}

        <div>
          <label className={lc}>Notes</label>
          <textarea
            {...register('notes')}
            className={`${ic} resize-none`}
            rows={2}
            placeholder={NOTES_PLACEHOLDERS[itemType] ?? 'Any additional details…'}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : `Add ${TYPE_LABELS[itemType].toLowerCase()}`}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={handleDelete} className="text-red hover:bg-red-bg">
              Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
