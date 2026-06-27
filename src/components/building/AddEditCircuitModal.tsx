import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore } from '@/store/buildingStore';
import { generateId } from '@/lib/utils';
import type { BuildingCircuit } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function AddEditCircuitModal({ panelId, editId }: { panelId: string; editId?: string }) {
  const { circuits, circuitsForPanel, addCircuit, updateCircuit, closeModal } = useBuildingStore();
  const existing = editId ? circuits.find((c) => c.id === editId) ?? null : null;

  const [breakerNumber, setBreakerNumber] = useState(existing?.breakerNumber ?? '');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [controls, setControls] = useState(existing?.controls ?? '');
  const [amperage, setAmperage] = useState(existing?.amperage ? String(existing.amperage) : '');
  const [isOn, setIsOn] = useState(existing?.isOn ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    if (existing) {
      updateCircuit({
        ...existing, breakerNumber: breakerNumber || null, label: label || null,
        controls: controls || null, amperage: amperage ? Number(amperage) : null, isOn,
      });
    } else {
      const c: BuildingCircuit = {
        id: generateId(), panelId, breakerNumber: breakerNumber || null, label: label || null,
        controls: controls || null, amperage: amperage ? Number(amperage) : null, isOn,
        sortOrder: circuitsForPanel(panelId).length, createdAt: now, updatedAt: now,
      };
      addCircuit(c);
    }
    closeModal();
  }

  return (
    <Modal title={existing ? 'Edit breaker' : 'Add breaker'} onClose={closeModal} width="420px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Breaker #</label>
            <input autoFocus value={breakerNumber} onChange={(e) => setBreakerNumber(e.target.value)} className={inputClass} placeholder="7" />
          </div>
          <div>
            <label className={labelClass}>Amperage</label>
            <input value={amperage} onChange={(e) => setAmperage(e.target.value)} className={inputClass} inputMode="numeric" placeholder="20" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isOn} onChange={(e) => setIsOn(e.target.checked)} className="w-4 h-4 accent-forest rounded" />
              <span className="text-body text-forest/80">On</span>
            </label>
          </div>
        </div>
        <div>
          <label className={labelClass}>Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="e.g. Cabin 7 outlets" />
        </div>
        <div>
          <label className={labelClass}>What it controls</label>
          <input value={controls} onChange={(e) => setControls(e.target.value)} className={inputClass} placeholder="e.g. all outlets + lights in bunk room" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save changes' : 'Add breaker'}</Button>
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
