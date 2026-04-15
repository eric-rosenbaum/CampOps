import { useForm } from 'react-hook-form';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { useSafetyStore, DRILL_TYPE_LABELS } from '@/store/safetyStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { EmergencyDrill } from '@/lib/types';

interface FormValues {
  drillType: EmergencyDrill['drillType'];
  drillName: string;
  scheduledDate: string;
  lead: string;
  participantCount: string;
  responseTime: string;
  allAccounted: string;
  notes: string;
}

const ic = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const lc = 'block text-[12px] font-medium text-forest/70 mb-1';

export function LogDrillModal() {
  const { closeAllModals, drillModalMode, editingDrillId } = useUIStore();
  const { drills, addDrill, updateDrill, deleteDrill } = useSafetyStore();
  const { currentUser } = useAuth();

  const isScheduleMode = drillModalMode === 'schedule';
  const existingDrill = editingDrillId ? drills.find((d) => d.id === editingDrillId) ?? null : null;

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      drillType: existingDrill?.drillType ?? 'fire_evacuation',
      drillName: existingDrill?.drillName ?? '',
      scheduledDate: existingDrill?.scheduledDate
        ? existingDrill.scheduledDate.slice(0, 16)
        : new Date().toISOString().slice(0, 16),
      lead: existingDrill?.lead ?? currentUser.name,
      participantCount: existingDrill?.participantCount?.toString() ?? '',
      responseTime: existingDrill?.responseTime ?? '',
      allAccounted: existingDrill?.allAccounted === false ? 'no' : 'yes',
      notes: existingDrill?.notes ?? '',
    },
  });

  const drillType = watch('drillType');

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();

    if (existingDrill) {
      // Completing an existing scheduled drill
      updateDrill(existingDrill.id, {
        status: 'completed',
        completedDate: data.scheduledDate,
        lead: data.lead,
        participantCount: data.participantCount ? parseInt(data.participantCount) : null,
        responseTime: data.responseTime || null,
        allAccounted: data.allAccounted === 'yes',
        notes: data.notes || null,
      });
    } else if (isScheduleMode) {
      // New scheduled drill
      const drill: EmergencyDrill = {
        id: generateId(),
        drillType: data.drillType,
        drillName: data.drillType === 'other' ? (data.drillName || null) : null,
        status: 'scheduled',
        scheduledDate: data.scheduledDate,
        completedDate: null,
        lead: data.lead,
        participantCount: null,
        responseTime: null,
        allAccounted: null,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      };
      addDrill(drill);
    } else {
      // Logging a completed drill directly
      const drill: EmergencyDrill = {
        id: generateId(),
        drillType: data.drillType,
        drillName: data.drillType === 'other' ? (data.drillName || null) : null,
        status: 'completed',
        scheduledDate: data.scheduledDate,
        completedDate: data.scheduledDate,
        lead: data.lead,
        participantCount: data.participantCount ? parseInt(data.participantCount) : null,
        responseTime: data.responseTime || null,
        allAccounted: data.allAccounted === 'yes',
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      };
      addDrill(drill);
    }

    closeAllModals();
  }

  function handleCancel() {
    if (existingDrill && existingDrill.status === 'scheduled') {
      if (confirm('Cancel this scheduled drill? This cannot be undone.')) {
        updateDrill(existingDrill.id, { status: 'cancelled' });
        closeAllModals();
      }
      return;
    }
    if (existingDrill) {
      deleteDrill(existingDrill.id);
    }
    closeAllModals();
  }

  const title = existingDrill
    ? 'Log drill completion'
    : isScheduleMode
    ? 'Schedule upcoming drill'
    : 'Log completed drill';

  const showCompletionFields = !isScheduleMode;

  return (
    <Modal title={title} onClose={closeAllModals} width="480px">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!existingDrill && (
          <p className="text-[13px] text-forest/50 -mt-1">
            {isScheduleMode
              ? 'Pre-schedule a drill so it appears on your calendar and overview.'
              : 'Record a completed emergency drill with all details for your compliance log.'}
          </p>
        )}
        {existingDrill && (
          <p className="text-[13px] text-forest/50 -mt-1">
            Record the outcome of the <strong>{DRILL_TYPE_LABELS[existingDrill.drillType]}</strong> drill.
          </p>
        )}

        {!existingDrill && (
          <>
            <div>
              <label className={lc}>Drill type *</label>
              <select {...register('drillType', { required: true })} className={ic}>
                {Object.entries(DRILL_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {drillType === 'other' && (
              <div>
                <label className={lc}>Drill name *</label>
                <input {...register('drillName', { required: drillType === 'other' })} className={ic} placeholder="Describe the drill" />
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>{isScheduleMode ? 'Scheduled date & time *' : 'Date & time *'}</label>
            <input {...register('scheduledDate', { required: true })} type="datetime-local" className={ic} />
          </div>
          <div>
            <label className={lc}>Lead by *</label>
            <input {...register('lead', { required: true })} className={ic} placeholder="Name or role" />
          </div>
        </div>

        {showCompletionFields && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lc}>Total participants</label>
                <input {...register('participantCount')} type="number" min={0} className={ic} placeholder="0" />
              </div>
              <div>
                <label className={lc}>Response / evacuation time</label>
                <input {...register('responseTime')} className={ic} placeholder="e.g. 4m 12s" />
              </div>
            </div>

            <div>
              <label className={lc}>All participants accounted for?</label>
              <select {...register('allAccounted')} className={ic}>
                <option value="yes">Yes — all accounted for</option>
                <option value="no">No — issue during drill</option>
              </select>
            </div>
          </>
        )}

        <div>
          <label className={lc}>Notes / follow-up</label>
          <textarea
            {...register('notes')}
            className={`${ic} resize-none`}
            rows={3}
            placeholder={isScheduleMode
              ? 'Any prep notes or instructions…'
              : 'Any problems, slow areas, or actions needed…'}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {existingDrill ? 'Save completion' : isScheduleMode ? 'Schedule drill' : 'Save drill record'}
          </Button>
          {existingDrill?.status === 'scheduled' ? (
            <Button type="button" variant="ghost" className="text-red hover:bg-red-bg hover:text-red" onClick={handleCancel}>
              Cancel drill
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
          )}
          {existingDrill && (
            <Button
              type="button"
              variant="ghost"
              className="text-red hover:bg-red-bg"
              onClick={() => {
                if (window.confirm('Delete this drill record? This cannot be undone.')) {
                  deleteDrill(existingDrill.id);
                  closeAllModals();
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
