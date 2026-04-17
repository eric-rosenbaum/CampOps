import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useUIStore } from '@/store/uiStore';
import { usePoolStore } from '@/store/poolStore';
import { SEED_USERS } from '@/lib/seedData';
import { generateId } from '@/lib/utils';
import type { SeasonalPhase, SeasonalTask } from '@/lib/types';

interface FormValues {
  title: string;
  detail: string;
  phase: SeasonalPhase;
}

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

// ─── User combobox ────────────────────────────────────────────────────────────

function UserCombobox({
  assignees,
  onAdd,
}: {
  assignees: string[];
  onAdd: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = query.trim()
    ? SEED_USERS.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) &&
          !assignees.includes(u.name)
      )
    : SEED_USERS.filter((u) => !assignees.includes(u.name));

  function select(name: string) {
    onAdd(name);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) select(matches[0].name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={inputClass}
        placeholder="Search by name…"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-btn shadow-lg overflow-hidden"
        >
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(u.name); }}
              className="w-full text-left px-3 py-2 text-body text-forest hover:bg-cream-dark transition-colors flex items-center gap-2"
            >
              <span className="w-6 h-6 rounded-full bg-sage/20 text-sage flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {u.initials}
              </span>
              <span>{u.name}</span>
              <span className="text-meta text-forest/30 ml-auto capitalize">{u.role.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}
      {open && matches.length === 0 && query.trim() && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-btn shadow-lg px-3 py-2"
        >
          <p className="text-meta text-forest/40">No matching users</p>
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function SeasonalTaskModal({ defaultPhase }: { defaultPhase?: SeasonalPhase }) {
  const { closeAllModals, editingSeasonalTaskId } = useUIStore();
  const { seasonalTasks, addSeasonalTask, updateSeasonalTask, activePoolId } = usePoolStore();

  const editing = editingSeasonalTaskId
    ? seasonalTasks.find((t) => t.id === editingSeasonalTaskId) ?? null
    : null;

  const [assignees, setAssignees] = useState<string[]>(editing?.assignees ?? []);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      title: editing?.title ?? '',
      detail: editing?.detail ?? '',
      phase: editing?.phase ?? defaultPhase ?? 'opening',
    },
  });

  useEffect(() => {
    setAssignees(editing?.assignees ?? []);
    reset({
      title: editing?.title ?? '',
      detail: editing?.detail ?? '',
      phase: editing?.phase ?? defaultPhase ?? 'opening',
    });
  }, [editing, defaultPhase, reset]);

  function onSubmit(data: FormValues) {
    const now = new Date().toISOString();

    if (editing) {
      updateSeasonalTask(editing.id, {
        title: data.title,
        detail: data.detail || null,
        phase: data.phase,
        assignees,
      });
    } else {
      if (!activePoolId) return;
      const phaseTasks = seasonalTasks.filter((t) => t.phase === data.phase && t.poolId === activePoolId);
      const maxOrder = phaseTasks.reduce((m, t) => Math.max(m, t.sortOrder), 0);
      const task: SeasonalTask = {
        id: generateId(),
        poolId: activePoolId,
        title: data.title,
        detail: data.detail || null,
        phase: data.phase,
        isComplete: false,
        completedBy: null,
        completedDate: null,
        assignees,
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      addSeasonalTask(task);
    }

    closeAllModals();
  }

  return (
    <Modal title={editing ? 'Edit task' : 'Add task'} onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className={labelClass}>Task title *</label>
          <input
            {...register('title', { required: 'Title is required' })}
            className={inputClass}
            placeholder="What needs to be done?"
            autoFocus
          />
          {errors.title && <p className="text-meta text-red mt-0.5">{errors.title.message}</p>}
        </div>

        <div>
          <label className={labelClass}>Checklist phase *</label>
          <select {...register('phase', { required: true })} className={inputClass}>
            <option value="opening">Pre-season opening</option>
            <option value="in_season">In-season maintenance</option>
            <option value="closing">End-of-season closing</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Notes / detail</label>
          <textarea
            {...register('detail')}
            className={`${inputClass} resize-none`}
            rows={2}
            placeholder="Optional context, frequency, or instructions"
          />
        </div>

        <div>
          <label className={labelClass}>Assignees</label>
          <UserCombobox
            assignees={assignees}
            onAdd={(name) => setAssignees((prev) => [...prev, name])}
          />
          {assignees.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {assignees.map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-1 text-secondary bg-cream-dark text-forest px-2.5 py-1 rounded-pill"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => setAssignees(assignees.filter((x) => x !== a))}
                    className="text-forest/40 hover:text-forest transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {editing ? 'Save changes' : 'Add task'}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
