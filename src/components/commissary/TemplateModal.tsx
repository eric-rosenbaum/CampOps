import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { inputClass, labelClass } from './commissaryUi';

export function TemplateModal({ editId }: { editId?: string }) {
  const { templates, createTemplate, updateTemplate, deleteTemplate, setActiveTemplate, closeModal } = useCommissaryStore();
  const existing = editId ? templates.find((t) => t.id === editId) ?? null : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [lengthWeeks, setLengthWeeks] = useState(String(existing?.lengthWeeks ?? 2));
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const weeks = Math.min(6, Math.max(1, Number(lengthWeeks) || 1));
    if (existing) {
      updateTemplate({ ...existing, name: name.trim(), lengthWeeks: weeks, notes: notes.trim() || null, updatedAt: new Date().toISOString() });
    } else {
      const id = createTemplate(name.trim(), weeks, notes.trim() || null);
      setActiveTemplate(id);
    }
    closeModal();
  }

  function handleDelete() {
    if (existing && confirm(`Delete template "${existing.name}"? Sessions already built from it keep their menus.`)) {
      deleteTemplate(existing.id);
      closeModal();
    }
  }

  return (
    <Modal title={existing ? 'Edit template' : 'New menu template'} onClose={closeModal} width="440px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          A reusable cycle menu, build it once, then apply it to any session, repeating the
          rotation across the session's weeks.
        </p>
        <div>
          <label className={labelClass}>Template name *</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Standard 2-week cycle" />
        </div>
        <div>
          <label className={labelClass}>Cycle length (weeks)</label>
          <input type="number" min="1" max="6" value={lengthWeeks} onChange={(e) => setLengthWeeks(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="optional" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{existing ? 'Save' : 'Create template'}</Button>
          {existing && <Button type="button" variant="ghost" className="text-red hover:bg-red-bg" onClick={handleDelete}>Delete</Button>}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
