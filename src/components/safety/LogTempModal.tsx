import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { SafetyTempLog } from '@/lib/types';

interface FormValues {
  itemId: string;
  logDate: string;
  session: 'am' | 'pm';
  temperature: string;
  loggedBy: string;
  notes: string;
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

export function LogTempModal() {
  const { closeAllModals, logTempForItemId } = useUIStore();
  const { items, addTempLog } = useSafetyStore();
  const { currentUser } = useAuth();

  const refrigerationItems = items.filter((i) => i.type === 'refrigeration');

  const now = new Date();
  const defaultSession: 'am' | 'pm' = now.getHours() < 12 ? 'am' : 'pm';

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      itemId: logTempForItemId ?? (refrigerationItems[0]?.id ?? ''),
      logDate: now.toISOString().slice(0, 10),
      session: defaultSession,
      loggedBy: currentUser.name,
    },
  });

  const selectedItemId = watch('itemId');
  const tempValue = watch('temperature');
  const selectedItem = items.find((i) => i.id === selectedItemId);
  const tempMin = selectedItem?.metadata?.temp_min as number | undefined;
  const tempMax = selectedItem?.metadata?.temp_max as number | undefined;

  const tempNum = tempValue ? parseFloat(tempValue) : null;
  const inRange = tempNum !== null && tempMin !== undefined && tempMax !== undefined
    ? tempNum >= tempMin && tempNum <= tempMax
    : null;

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    const item = items.find((i) => i.id === data.itemId);
    const min = item?.metadata?.temp_min as number | undefined;
    const max = item?.metadata?.temp_max as number | undefined;
    const temp = parseFloat(data.temperature);
    const inRangeCalc = min !== undefined && max !== undefined
      ? temp >= min && temp <= max
      : true;

    const log: SafetyTempLog = {
      id: generateId(),
      itemId: data.itemId,
      logDate: data.logDate,
      session: data.session,
      temperature: temp,
      inRange: inRangeCalc,
      loggedBy: data.loggedBy,
      notes: data.notes || null,
      createdAt: now,
    };

    addTempLog(log);
    closeAllModals();
  }

  return (
    <Modal title="Log temperature reading" onClose={closeAllModals} width="440px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-[13px] text-forest/50 -mt-1">Record an AM or PM refrigeration temperature reading.</p>

        <div>
          <label className={lc}>Refrigeration unit *</label>
          <select {...register('itemId', { required: true })} className={ic}>
            {refrigerationItems.length === 0 && (
              <option value="">No refrigeration units set up yet</option>
            )}
            {refrigerationItems.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          {selectedItem && tempMin !== undefined && tempMax !== undefined && (
            <p className="text-[10px] text-forest/40 mt-0.5">
              Required range: {tempMin}–{tempMax}°F
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Date *</label>
            <input {...register('logDate', { required: true })} type="date" className={ic} />
          </div>
          <div>
            <label className={lc}>Session *</label>
            <select {...register('session', { required: true })} className={ic}>
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </div>
        </div>

        <div>
          <label className={lc}>Temperature (°F) *</label>
          <input
            {...register('temperature', { required: true })}
            type="number"
            step="0.1"
            className={ic}
            placeholder="e.g. 38"
          />
          {inRange !== null && tempValue && (
            <p className={`text-[11px] mt-1 font-medium ${inRange ? 'text-green-muted-text' : 'text-red'}`}>
              {inRange ? '✓ In range' : `⚠ Out of range — required ${tempMin}–${tempMax}°F`}
            </p>
          )}
        </div>

        <div>
          <label className={lc}>Logged by *</label>
          <input {...register('loggedBy', { required: true })} className={ic} />
        </div>

        <div>
          <label className={lc}>Notes</label>
          <textarea {...register('notes')} className={`${ic} resize-none`} rows={2} placeholder="Any issues or corrective action taken…" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting || refrigerationItems.length === 0}>
            Save reading
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
