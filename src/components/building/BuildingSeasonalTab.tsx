import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useBuildingStore } from '@/store/buildingStore';
import { useAuth } from '@/lib/auth';
import type { SeasonalPhase, BuildingSeasonalTask } from '@/lib/types';

const PHASES: { phase: SeasonalPhase; label: string; subtitle: string }[] = [
  { phase: 'opening', label: 'Spring opening', subtitle: 'turn on water, energize panels, test GFCIs' },
  { phase: 'in_season', label: 'In-season checks', subtitle: 'recurring' },
  { phase: 'closing', label: 'Fall closing / winterization', subtitle: 'drain & blow out lines, shut down water heaters' },
];

function TaskRow({ task, canManage, onToggle, onEdit, onDelete }: {
  task: BuildingSeasonalTask; canManage: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { buildings } = useBuildingStore();
  const [hovered, setHovered] = useState(false);
  const building = task.buildingId ? buildings.find((b) => b.id === task.buildingId) : null;

  return (
    <div
      className={`flex items-start gap-3 px-3.5 py-2.5 rounded-btn transition-colors group ${task.isComplete ? 'opacity-60' : ''} ${hovered ? 'bg-cream-dark' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-[18px] h-[18px] rounded-tag border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
          task.isComplete ? 'bg-sage border-sage' : 'bg-white border-border hover:border-sage'
        }`}
      >
        {task.isComplete && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-body ${task.isComplete ? 'line-through text-forest/40' : 'text-forest'}`}>{task.title}</p>
        {task.detail && <p className="text-meta text-forest/40 mt-0.5">{task.detail}</p>}
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <span className="text-label font-semibold px-1.5 py-0.5 rounded-tag bg-forest/8 text-forest/50 uppercase tracking-wide">
            {building ? building.name : 'Camp-wide'}
          </span>
          {task.isComplete && task.completedDate && (
            <span className="text-label font-semibold px-1.5 py-0.5 rounded-tag bg-green-muted-bg text-green-muted-text uppercase tracking-wide">
              Done {new Date(task.completedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      {canManage && (
        <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={onEdit} className="p-1.5 rounded text-forest/40 hover:text-forest hover:bg-cream transition-colors" title="Edit task">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded text-forest/40 hover:text-red hover:bg-red-bg transition-colors" title="Delete task">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function BuildingSeasonalTab() {
  const { seasonalTasks, toggleSeasonalTask, deleteSeasonalTask, openModal } = useBuildingStore();
  const { currentUser, can } = useAuth();
  const canManage = can('manageBuildingSystems');

  const done = seasonalTasks.filter((t) => t.isComplete).length;
  const total = seasonalTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const byPhase = (phase: SeasonalPhase) =>
    seasonalTasks.filter((t) => t.phase === phase).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      {/* Progress card */}
      <div className="bg-white border border-border rounded-card px-5 py-4 mb-6 flex items-center gap-6">
        <div className="flex-1">
          <p className="text-body font-semibold text-forest mb-2">Seasonal checklist</p>
          <div className="h-2 bg-cream-dark rounded-full">
            <div className="h-2 bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-meta text-forest/40 mt-1.5">{done} of {total} tasks complete</p>
        </div>
        <div className="flex gap-5 flex-shrink-0">
          <div className="text-center">
            <p className="font-mono text-[22px] font-semibold text-green-muted-text">{done}</p>
            <p className="text-label uppercase tracking-wide text-forest/40 mt-0.5">Done</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[22px] font-semibold text-amber">{total - done}</p>
            <p className="text-label uppercase tracking-wide text-forest/40 mt-0.5">Open</p>
          </div>
        </div>
      </div>

      {PHASES.map(({ phase, label, subtitle }) => {
        const tasks = byPhase(phase);
        const pDone = tasks.filter((t) => t.isComplete).length;
        return (
          <div key={phase} className="mb-8">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-body font-semibold text-forest">{label}</span>
              <span className="text-meta text-forest/40 ml-auto">
                {tasks.length > 0 ? `${pDone}/${tasks.length} · ` : ''}{subtitle}
              </span>
              {canManage && (
                <button
                  onClick={() => openModal({ kind: 'seasonal', defaultPhase: phase })}
                  className="text-meta text-forest/50 hover:text-forest font-medium ml-2 transition-colors"
                >
                  + Add task
                </button>
              )}
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
                    onToggle={() => toggleSeasonalTask(task.id, currentUser.name)}
                    onEdit={() => openModal({ kind: 'seasonal', editId: task.id })}
                    onDelete={() => deleteSeasonalTask(task.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
