import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore, CHEMICAL_RANGES, getChemicalStatus } from '@/store/poolStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { ChemicalReading } from '@/lib/types';

interface FormValues {
  freeChlorine: string;
  ph: string;
  alkalinity: string;
  cyanuricAcid: string;
  waterTemp: string;
  calciumHardness: string;
  readingTime: string;
  correctiveAction: string;
  poolStatus: ChemicalReading['poolStatus'];
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';
const rangeClass = 'text-meta text-forest/40 mt-1';

export function LogReadingModal() {
  const { closeAllModals, editingReadingId } = useUIStore();
  const { addChemicalReading, updateChemicalReading, deleteChemicalReading, activePool, activePoolId, chemicalReadings } = usePoolStore();
  const { currentUser } = useAuth();

  const pool = activePool();
  const editing = editingReadingId ? chemicalReadings.find((r) => r.id === editingReadingId) ?? null : null;

  const now = new Date();
  const defaultReadingTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: editing ? {
      freeChlorine: String(editing.freeChlorine),
      ph: String(editing.ph),
      alkalinity: String(editing.alkalinity),
      cyanuricAcid: String(editing.cyanuricAcid),
      waterTemp: String(editing.waterTemp),
      calciumHardness: editing.calciumHardness != null ? String(editing.calciumHardness) : '',
      readingTime: toLocalInput(editing.readingTime),
      correctiveAction: editing.correctiveAction ?? '',
      poolStatus: editing.poolStatus,
    } : {
      readingTime: defaultReadingTime,
      poolStatus: 'open_all_clear',
    },
  });

  const watched = watch(['freeChlorine', 'ph', 'alkalinity', 'cyanuricAcid', 'waterTemp']);

  function getFieldStatus(field: keyof typeof CHEMICAL_RANGES, val: string) {
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    return getChemicalStatus(field, n);
  }

  function onSubmit(data: FormValues) {
    if (!activePoolId) return;
    if (editing) {
      updateChemicalReading(editing.id, {
        freeChlorine: parseFloat(data.freeChlorine),
        ph: parseFloat(data.ph),
        alkalinity: parseFloat(data.alkalinity),
        cyanuricAcid: parseFloat(data.cyanuricAcid),
        waterTemp: parseFloat(data.waterTemp),
        calciumHardness: data.calciumHardness ? parseFloat(data.calciumHardness) : null,
        readingTime: new Date(data.readingTime).toISOString(),
        correctiveAction: data.correctiveAction || null,
        poolStatus: data.poolStatus,
      });
    } else {
      const createdAt = new Date().toISOString();
      const reading: ChemicalReading = {
        id: generateId(),
        poolId: activePoolId,
        freeChlorine: parseFloat(data.freeChlorine),
        ph: parseFloat(data.ph),
        alkalinity: parseFloat(data.alkalinity),
        cyanuricAcid: parseFloat(data.cyanuricAcid),
        waterTemp: parseFloat(data.waterTemp),
        calciumHardness: data.calciumHardness ? parseFloat(data.calciumHardness) : null,
        readingTime: new Date(data.readingTime).toISOString(),
        loggedById: currentUser.id,
        loggedByName: currentUser.name,
        correctiveAction: data.correctiveAction || null,
        poolStatus: data.poolStatus,
        createdAt,
      };
      addChemicalReading(reading);
    }
    closeAllModals();
  }

  function handleDelete() {
    if (!editing) return;
    if (window.confirm('Delete this reading? This cannot be undone.')) {
      deleteChemicalReading(editing.id);
      closeAllModals();
    }
  }

  const fields: { key: keyof typeof CHEMICAL_RANGES; label: string; placeholder: string; range: string; step: string }[] = [
    { key: 'freeChlorine', label: 'Free chlorine', placeholder: 'ppm', range: '1.0 – 3.0 ppm', step: '0.1' },
    { key: 'ph', label: 'pH', placeholder: 'pH', range: '7.2 – 7.8', step: '0.1' },
    { key: 'alkalinity', label: 'Alkalinity', placeholder: 'ppm', range: '80 – 120 ppm', step: '1' },
    { key: 'cyanuricAcid', label: 'Cyanuric acid', placeholder: 'ppm', range: '30 – 50 ppm', step: '1' },
    { key: 'waterTemp', label: 'Water temp', placeholder: '°F', range: '68 – 82°F', step: '1' },
  ];

  const fieldValues = [watched[0], watched[1], watched[2], watched[3], watched[4]];

  return (
    <Modal title={editing ? 'Edit chemical reading' : 'Log chemical reading'} onClose={closeAllModals} width="520px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-secondary text-forest/50 -mt-1">
          {pool?.name ?? 'Pool'} · {now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Reading fields grid */}
        <div className="grid grid-cols-3 gap-3">
          {fields.map((f, i) => {
            const status = getFieldStatus(f.key, fieldValues[i]);
            return (
              <div key={f.key}>
                <label className={labelClass}>{f.label}</label>
                <input
                  {...register(f.key as keyof FormValues, { required: true })}
                  type="number"
                  step={f.step}
                  placeholder={f.placeholder}
                  className={`${inputClass} ${
                    status === 'alert'
                      ? 'border-red focus:border-red'
                      : status === 'warn'
                      ? 'border-amber focus:border-amber'
                      : ''
                  }`}
                />
                <p className={rangeClass}>Range: {f.range}</p>
                {status === 'alert' && (
                  <p className="text-meta text-red mt-0.5 font-medium">Out of range!</p>
                )}
                {status === 'warn' && (
                  <p className="text-meta text-amber mt-0.5 font-medium">Near limit</p>
                )}
              </div>
            );
          })}
          <div>
            <label className={labelClass}>Calcium hardness</label>
            <input
              {...register('calciumHardness')}
              type="number"
              step="1"
              placeholder="ppm"
              className={inputClass}
            />
            <p className={rangeClass}>Range: 200 – 400 ppm</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Reading time *</label>
            <input {...register('readingTime', { required: true })} type="datetime-local" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Logged by</label>
            <input
              value={currentUser.name}
              disabled
              className={`${inputClass} bg-cream-dark text-forest/50`}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Corrective action taken</label>
          <input
            {...register('correctiveAction')}
            className={inputClass}
            placeholder="e.g. Added 2 lbs shock, retest in 2 hrs"
          />
        </div>

        <div>
          <label className={labelClass}>Pool status</label>
          <select {...register('poolStatus')} className={inputClass}>
            <option value="open_all_clear">Open — all readings in range</option>
            <option value="open_monitoring">Open — monitoring</option>
            <option value="closed_corrective">Closed — corrective action in progress</option>
            <option value="closed_retest">Closed — awaiting re-test</option>
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting || !activePoolId}>
            {editing ? 'Save changes' : 'Save reading'}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" className="text-red hover:text-red" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
