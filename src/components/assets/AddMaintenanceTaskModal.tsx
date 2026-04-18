import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAssetStore } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { generateId } from '@/lib/utils';
import type { AssetMaintenancePhase } from '@/lib/types';

const PHASES: { value: AssetMaintenancePhase; label: string }[] = [
  { value: 'pre_season', label: 'Pre-Season' },
  { value: 'in_season', label: 'In-Season' },
  { value: 'post_season', label: 'Post-Season' },
];

export function AddMaintenanceTaskModal() {
  const { assets, maintenanceTasks, addMaintenanceTask, updateMaintenanceTask } = useAssetStore();
  const { isAddMaintenanceTaskModalOpen, maintenanceTaskAssetId, editingMaintenanceTaskId, closeAllModals } = useUIStore();

  const asset = maintenanceTaskAssetId ? assets.find((a) => a.id === maintenanceTaskAssetId) : null;
  const editing = editingMaintenanceTaskId ? maintenanceTasks.find((t) => t.id === editingMaintenanceTaskId) : null;

  const [phase, setPhase] = useState<AssetMaintenancePhase>('pre_season');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (editing) {
      setPhase(editing.phase);
      setTitle(editing.title);
      setDetail(editing.detail ?? '');
    } else {
      setPhase('pre_season');
      setTitle('');
      setDetail('');
    }
  }, [editingMaintenanceTaskId, isAddMaintenanceTaskModalOpen]);

  if (!isAddMaintenanceTaskModalOpen || !asset) return null;

  function handleSave() {
    if (!asset || !title.trim()) return;
    const now = new Date().toISOString();
    const existingForPhase = maintenanceTasks.filter((t) => t.assetId === asset.id && t.phase === phase);
    if (editing) {
      updateMaintenanceTask({ ...editing, phase, title: title.trim(), detail: detail.trim() || null, updatedAt: now });
    } else {
      addMaintenanceTask({
        id: generateId(),
        assetId: asset.id,
        phase,
        title: title.trim(),
        detail: detail.trim() || null,
        isComplete: false,
        completedBy: null,
        completedDate: null,
        sortOrder: existingForPhase.length + 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    closeAllModals();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-modal shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-panel-title font-semibold text-forest">{editing ? 'Edit task' : 'Add maintenance task'}</h2>
            <p className="text-meta text-forest/50 mt-0.5">{asset.name}</p>
          </div>
          <button onClick={closeAllModals} className="text-forest/40 hover:text-forest transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-body font-medium text-forest mb-2 block">Phase</label>
            <div className="flex gap-2">
              {PHASES.map(({ value, label }) => (
                <button key={value} onClick={() => setPhase(value)}
                  className={`flex-1 py-2 text-body font-medium rounded-btn border transition-colors ${phase === value ? 'bg-forest border-forest text-cream' : 'border-border text-forest/60 hover:border-forest/40'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-body font-medium text-forest mb-1 block">Title <span className="text-red">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Check tire pressure, winterize engine…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
          </div>
          <div>
            <label className="text-body font-medium text-forest mb-1 block">Detail (optional)</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="Additional notes or instructions…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={closeAllModals}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>{editing ? 'Save changes' : 'Add task'}</Button>
        </div>
      </div>
    </div>
  );
}
