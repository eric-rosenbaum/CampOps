import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { RetreatChecklistItem, RetreatChecklistPhase } from '@/lib/types';
import { inputClass } from './retreatUi';

const PHASES: { value: RetreatChecklistPhase; label: string }[] = [
  { value: 'setup', label: 'Setup' },
  { value: 'checkout', label: 'Checkout' },
];

export function ChecklistModal({ retreatId, phase }: { retreatId: string; phase?: RetreatChecklistPhase }) {
  const { checklistFor, addChecklistItem, toggleChecklistItem, deleteChecklistItem, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const [curPhase, setCurPhase] = useState<RetreatChecklistPhase>(phase ?? 'setup');
  const [draft, setDraft] = useState('');

  const items = checklistFor(retreatId, curPhase);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !canManage) return;
    const now = new Date().toISOString();
    const item: RetreatChecklistItem = {
      id: generateId(),
      campId: '',
      retreatId,
      phase: curPhase,
      title: draft.trim(),
      isDone: false,
      sortOrder: items.length,
      createdAt: now,
      updatedAt: now,
    };
    addChecklistItem(item);
    setDraft('');
  }

  return (
    <Modal title="Manage checklist" onClose={closeModal} width="480px">
      <div className="space-y-4">
        {/* Phase toggle */}
        <div className="flex gap-2">
          {PHASES.map((p) => (
            <button
              key={p.value}
              onClick={() => setCurPhase(p.value)}
              className={`px-3.5 py-1.5 rounded-pill text-[12px] font-medium border transition-colors ${
                curPhase === p.value
                  ? 'bg-forest text-cream border-forest'
                  : 'bg-white text-forest/60 border-border hover:bg-cream-dark'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Items */}
        <div className="bg-white rounded-card border border-border overflow-hidden">
          {items.length === 0 && (
            <p className="text-[12px] text-forest/40 italic px-4 py-3">No {curPhase} tasks yet.</p>
          )}
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-cream-dark last:border-b-0">
              <button
                onClick={canManage ? () => toggleChecklistItem(c.id) : undefined}
                disabled={!canManage}
                className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 text-[11px] font-bold disabled:cursor-default ${
                  c.isDone ? 'bg-sage border-sage text-white' : 'bg-white border-border'
                }`}
              >
                {c.isDone ? '✓' : ''}
              </button>
              <span className={`flex-1 text-[13px] ${c.isDone ? 'text-forest/40 line-through' : 'text-forest'}`}>{c.title}</span>
              {canManage && (
                <button
                  onClick={() => deleteChecklistItem(c.id)}
                  className="text-forest/30 hover:text-red transition-colors flex-shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add */}
        {canManage && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={inputClass}
              placeholder={`Add a ${curPhase} task…`}
            />
            <Button type="submit" disabled={!draft.trim()}>Add</Button>
          </form>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={closeModal}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
