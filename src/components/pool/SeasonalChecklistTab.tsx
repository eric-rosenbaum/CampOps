import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { usePoolStore } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { SeasonalTaskModal } from './SeasonalTaskModal';
import type { SeasonalPhase, SeasonalTask } from '@/lib/types';

// ─── Task row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: SeasonalTask;
  canManage: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function TaskRow({ task, canManage, onToggle, onEdit, onDelete }: TaskRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`flex items-start gap-3 px-3.5 py-2.5 rounded-btn transition-colors group ${
        task.isComplete ? 'opacity-60' : ''
      } ${hovered ? 'bg-cream-dark' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        className={`w-[18px] h-[18px] rounded-tag border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
          task.isComplete ? 'bg-sage border-sage' : 'bg-white border-border hover:border-sage'
        }`}
      >
        {task.isComplete && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-body ${task.isComplete ? 'line-through text-forest/40' : 'text-forest'}`}>
          {task.title}
        </p>
        {task.detail && (
          <p className="text-meta text-forest/40 mt-0.5">{task.detail}</p>
        )}
        {(task.assignees.length > 0 || (task.isComplete && task.completedDate)) && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {task.assignees.map((a) => (
              <span
                key={a}
                className="text-label font-semibold px-1.5 py-0.5 rounded-tag bg-blue-50 text-blue-700 uppercase tracking-wide"
              >
                {a}
              </span>
            ))}
            {task.isComplete && task.completedDate && (
              <span className="text-label font-semibold px-1.5 py-0.5 rounded-tag bg-green-muted-bg text-green-muted-text uppercase tracking-wide">
                Done{' '}
                {new Date(task.completedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Edit / delete — only for managers, only visible on hover */}
      {canManage && (
        <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
          <button
            type="button"
            onClick={() => onEdit(task.id)}
            className="p-1.5 rounded text-forest/40 hover:text-forest hover:bg-cream transition-colors"
            title="Edit task"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            className="p-1.5 rounded text-forest/40 hover:text-red hover:bg-red-bg transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Phase section ────────────────────────────────────────────────────────────

interface SectionProps {
  phase: SeasonalPhase;
  label: string;
  subtitle?: string;
  tasks: SeasonalTask[];
  canManage: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (phase: SeasonalPhase) => void;
}

function phaseBadge(done: number, total: number): { label: string; cls: string } {
  if (total === 0) return { label: 'Empty', cls: 'bg-cream-dark text-forest/40' };
  if (done === total) return { label: `${total} of ${total} done`, cls: 'bg-green-muted-bg text-green-muted-text' };
  if (done === 0) return { label: 'Not started', cls: 'bg-red-bg text-red' };
  return { label: `${done} of ${total} done`, cls: 'bg-amber-bg text-amber-text' };
}

function PhaseSection({ phase, label, subtitle, tasks, canManage, onToggle, onEdit, onDelete, onAdd }: SectionProps) {
  const done = tasks.filter((t) => t.isComplete).length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const badge = phaseBadge(done, total);

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="text-body font-semibold text-forest">{label}</span>
        <span className={`text-label font-semibold px-2 py-0.5 rounded-tag uppercase tracking-wide ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-meta text-forest/40 ml-auto">
          {total} task{total !== 1 ? 's' : ''}{subtitle ? ` · ${subtitle}` : ''}
        </span>
        {canManage && (
          <button
            type="button"
            onClick={() => onAdd(phase)}
            className="text-meta text-forest/50 hover:text-forest font-medium ml-2 transition-colors"
          >
            + Add task
          </button>
        )}
      </div>

      <div className="h-[3px] bg-cream-dark rounded-full mb-3">
        <div className="h-[3px] bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      {tasks.length === 0 ? (
        <p className="text-meta text-forest/30 px-3.5 py-2">
          {canManage ? 'No tasks yet — click "+ Add task" to get started.' : 'No tasks added yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              canManage={canManage}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SeasonalChecklistTab() {
  const { activeSeasonalTasks, toggleSeasonalTask, deleteSeasonalTask, seasonalProgress } = usePoolStore();
  const { isSeasonalTaskModalOpen, editingSeasonalTaskId, openSeasonalTaskModal, closeAllModals } = useUIStore();
  const { currentUser, can } = useAuth();

  const canManage = can('managePoolChecklist');
  const progress = seasonalProgress();
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const [addingPhase, setAddingPhase] = useState<SeasonalPhase | undefined>();
  const tasks = activeSeasonalTasks();

  const byPhase = (phase: SeasonalPhase) =>
    [...tasks.filter((t) => t.phase === phase)].sort((a, b) => a.sortOrder - b.sortOrder);

  function handleAdd(phase: SeasonalPhase) {
    setAddingPhase(phase);
    openSeasonalTaskModal();
  }

  function handleEdit(id: string) {
    setAddingPhase(undefined);
    openSeasonalTaskModal(id);
  }

  function handleClose() {
    setAddingPhase(undefined);
    closeAllModals();
  }

  const PHASES: { phase: SeasonalPhase; label: string; subtitle?: string }[] = [
    { phase: 'opening', label: 'Pre-season opening' },
    { phase: 'in_season', label: 'In-season maintenance', subtitle: 'recurring' },
    { phase: 'closing', label: 'End-of-season closing' },
  ];

  return (
    <div>
      {/* Overall progress card */}
      <div className="bg-white border border-border rounded-card px-5 py-4 mb-6 flex items-center gap-6">
        <div className="flex-1">
          <p className="text-body font-semibold text-forest mb-2">Season checklist</p>
          <div className="h-2 bg-cream-dark rounded-full">
            <div className="h-2 bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-meta text-forest/40 mt-1.5">
            {progress.done} of {progress.total} tasks complete
          </p>
        </div>
        <div className="flex gap-5 flex-shrink-0">
          <div className="text-center">
            <p className="font-mono text-[22px] font-semibold text-green-muted-text">{progress.done}</p>
            <p className="text-label uppercase tracking-wide text-forest/40 mt-0.5">Done</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[22px] font-semibold text-amber">{progress.total - progress.done}</p>
            <p className="text-label uppercase tracking-wide text-forest/40 mt-0.5">Open</p>
          </div>
        </div>
      </div>

      {PHASES.map(({ phase, label, subtitle }) => (
        <PhaseSection
          key={phase}
          phase={phase}
          label={label}
          subtitle={subtitle}
          tasks={byPhase(phase)}
          canManage={canManage}
          onToggle={(id) => toggleSeasonalTask(id, currentUser.name)}
          onEdit={handleEdit}
          onDelete={deleteSeasonalTask}
          onAdd={handleAdd}
        />
      ))}

      {isSeasonalTaskModalOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
          <SeasonalTaskModal
            key={editingSeasonalTaskId ?? 'new'}
            defaultPhase={editingSeasonalTaskId ? undefined : addingPhase}
          />
        </div>
      )}
    </div>
  );
}
