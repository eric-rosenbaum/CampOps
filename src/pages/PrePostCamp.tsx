import { useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { FilterPill } from '@/components/shared/FilterPill';
import { SearchInput } from '@/components/shared/SearchInput';
import { TaskCard } from '@/components/shared/TaskCard';
import { TaskDetail } from '@/components/shared/TaskDetail';
import { LogTaskModal } from '@/components/shared/LogTaskModal';
import { SeasonModal } from '@/components/shared/SeasonModal';
import { Button } from '@/components/shared/Button';
import { useChecklistStore } from '@/store/checklistStore';
import { useUIStore } from '@/store/uiStore';
import { format } from 'date-fns';
import { Plus, Calendar } from 'lucide-react';

type FilterType = 'all' | 'pending' | 'in_progress' | 'complete';

const filterLabels: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'complete', label: 'Complete' },
];

export function PrePostCamp() {
  const {
    activePhase, setPhase, filter, setFilter, searchQuery, setSearch,
    selectedTaskId, selectTask, filteredTasks, tasks,
    season, completionPercent, completionByLocation,
  } = useChecklistStore();
  const { openLogTaskModal, openSeasonModal, isLogTaskModalOpen, isSeasonModalOpen, currentUserId: _cu } = useUIStore();

  const filtered = filteredTasks();
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    if (!selectedTaskId || !filtered.find((t) => t.id === selectedTaskId)) {
      if (filtered.length > 0) selectTask(filtered[0].id);
    }
  }, [activePhase, filter, searchQuery]);

  const phaseTasksAll = tasks.filter((t) => t.phase === activePhase);
  const completePct = completionPercent(activePhase);
  const completeCount = phaseTasksAll.filter((t) => t.status === 'complete').length;
  const locationBreakdown = completionByLocation(activePhase);

  const subtitle = season
    ? `${season.name} · Opening ${format(new Date(season.openingDate), 'MMM d, yyyy')}`
    : 'No season set';

  return (
    <div className="flex flex-col h-full min-h-0">
      <Topbar
        title="Pre/Post camp checklist"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={openSeasonModal}>
              <Calendar className="w-3.5 h-3.5" />
              New season
            </Button>
            <Button size="sm" onClick={openLogTaskModal}>
              <Plus className="w-3.5 h-3.5" />
              Add task
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-7 py-6">
            {/* Phase toggle */}
            <div className="flex rounded-btn border border-border overflow-hidden mb-6 w-fit">
              {(['pre', 'post'] as const).map((phase) => (
                <button
                  key={phase}
                  onClick={() => setPhase(phase)}
                  className={`px-5 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                    activePhase === phase
                      ? 'bg-forest text-cream'
                      : 'bg-white text-forest/60 hover:text-forest hover:bg-cream'
                  }`}
                >
                  {phase === 'pre' ? 'Pre-camp' : 'Post-camp'}
                </button>
              ))}
            </div>

            {/* Progress section */}
            <div className="bg-white rounded-card border border-border p-5 mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-semibold text-forest">
                  {activePhase === 'pre' ? 'Camp opening readiness' : 'Post-camp completion'}
                </p>
                <span className="text-[13px] font-semibold text-forest">{completePct}% complete</span>
              </div>
              <div className="w-full h-2 bg-cream-dark rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-sage rounded-full transition-all"
                  style={{ width: `${completePct}%` }}
                />
              </div>
              <p className="text-[11px] text-forest/50">
                {completeCount} of {phaseTasksAll.length} tasks complete
              </p>

              {/* By-location breakdown */}
              {Object.keys(locationBreakdown).length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4">
                  {Object.entries(locationBreakdown).map(([loc, data]) => {
                    const pct = data.total > 0 ? Math.round((data.complete / data.total) * 100) : 0;
                    return (
                      <div key={loc} className="flex items-center gap-2">
                        <p className="text-[12px] text-forest/60 w-28 flex-shrink-0 truncate">{loc}</p>
                        <div className="flex-1 h-1.5 bg-cream-dark rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sage rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-forest/50 w-8 text-right flex-shrink-0">
                          {data.complete}/{data.total}
                          {data.complete === data.total && ' ✓'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filter bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {filterLabels.map(({ key, label }) => (
                  <FilterPill
                    key={key}
                    label={label}
                    active={filter === key}
                    onClick={() => setFilter(key)}
                  />
                ))}
              </div>
              <SearchInput
                value={searchQuery}
                onChange={setSearch}
                placeholder="Search tasks…"
              />
            </div>

            {/* Task list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-[32px] mb-3">🌲</p>
                <p className="text-[15px] font-semibold text-forest/60">
                  {filter === 'complete' ? 'No completed tasks yet' :
                   filter === 'pending' ? 'No pending tasks' :
                   filter === 'in_progress' ? 'Nothing in progress' :
                   `No ${activePhase}-camp tasks`}
                </p>
                <p className="text-[13px] text-forest/40 mt-1">
                  {searchQuery ? 'Try a different search term' : 'Add a task to get started'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    selected={task.id === selectedTaskId}
                    onClick={() => selectTask(task.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-detail min-w-detail border-l border-border bg-white flex flex-col overflow-hidden">
          {selectedTask ? (
            <TaskDetail task={selectedTask} />
          ) : (
            <div className="flex items-center justify-center h-full text-forest/30 text-[13px]">
              Select a task to view details
            </div>
          )}
        </div>
      </div>

      {isLogTaskModalOpen && <LogTaskModal />}
      {isSeasonModalOpen && <SeasonModal />}
    </div>
  );
}
