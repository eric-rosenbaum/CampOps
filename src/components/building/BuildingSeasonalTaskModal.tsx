import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore } from '@/store/buildingStore';
import { generateId } from '@/lib/utils';
import type { BuildingSeasonalTask, SeasonalPhase } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

const PHASE_LABELS: Record<SeasonalPhase, string> = {
  opening: 'Spring opening',
  in_season: 'In-season',
  closing: 'Fall closing / winterization',
};

export function BuildingSeasonalTaskModal({ editId, defaultPhase }: { editId?: string; defaultPhase?: SeasonalPhase }) {
  const { seasonalTasks, buildings, addSeasonalTask, updateSeasonalTask, closeModal } = useBuildingStore();
  const existing = editId ? seasonalTasks.find((t) => t.id === editId) ?? null : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [detail, setDetail] = useState(existing?.detail ?? '');
  const [phase, setPhase] = useState<SeasonalPhase>(existing?.phase ?? defaultPhase ?? 'closing');
  const [buildingId, setBuildingId] = useState<string | null>(existing?.buildingId ?? null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (existing) {
      updateSeasonalTask(existing.id, { title: title.trim(), detail: detail || null, phase, buildingId });
    } else {
      const now = new Date().toISOString();
      const t: BuildingSeasonalTask = {
        id: generateId(), buildingId, title: title.trim(), detail: detail || null, phase,
        isComplete: false, completedBy: null, completedDate: null, assignees: [],
        sortOrder: seasonalTasks.filter((x) => x.phase === phase).length,
        createdAt: now, updatedAt: now,
      };
      addSeasonalTask(t);
    }
    closeModal();
  }

  return (
    <Modal title={existing ? 'Edit task' : 'Add seasonal task'} onClose={closeModal} width="440px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Task *</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Blow out water lines with compressor" />
        </div>
        <div>
          <label className={labelClass}>Detail</label>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phase</label>
            <select value={phase} onChange={(e) => setPhase(e.target.value as SeasonalPhase)} className={inputClass}>
              {(Object.keys(PHASE_LABELS) as SeasonalPhase[]).map((p) => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Building</label>
            <select value={buildingId ?? ''} onChange={(e) => setBuildingId(e.target.value || null)} className={inputClass}>
              <option value="">Camp-wide</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add task'}</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
