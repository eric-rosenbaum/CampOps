import { create } from 'zustand';
import { addDays } from 'date-fns';
import type { ChecklistTask, ActivityEntry, Season, Location } from '@/lib/types';
import {
  dbUpsertTask,
  dbUpdateTask,
  dbAddTaskActivity,
  dbUpsertSeason,
  dbDeleteTask,
} from '@/lib/db';

type FilterType = 'all' | 'pending' | 'in_progress' | 'complete';

interface ChecklistStore {
  tasks: ChecklistTask[];
  season: Season | null;
  activePhase: 'pre' | 'post';
  selectedTaskId: string | null;
  filter: FilterType;
  searchQuery: string;

  setTasks: (tasks: ChecklistTask[]) => void;
  setSeason: (s: Season) => void;
  setPhase: (p: 'pre' | 'post') => void;
  setFilter: (f: FilterType) => void;
  setSearch: (q: string) => void;
  selectTask: (id: string | null) => void;
  addTask: (task: ChecklistTask) => void;
  updateTask: (id: string, patch: Partial<ChecklistTask>) => void;
  completeTask: (id: string) => void;
  addActivityEntry: (taskId: string, entry: ActivityEntry) => void;
  deleteTask: (id: string) => void;
  activateNewSeason: (season: Season, currentUserName: string) => void;

  filteredTasks: () => ChecklistTask[];
  completionPercent: (phase?: 'pre' | 'post') => number;
  completionByLocation: (phase?: 'pre' | 'post') => Record<string, { total: number; complete: number }>;
}

function computeDueDate(openingDate: string, daysRelative: number): string {
  return addDays(new Date(openingDate), daysRelative).toISOString().split('T')[0];
}

export const useChecklistStore = create<ChecklistStore>((set, get) => ({
  tasks: [],
  season: null,
  activePhase: 'pre',
  selectedTaskId: null,
  filter: 'all',
  searchQuery: '',

  setTasks: (tasks) => {
    set({ tasks });
    const preTasks = tasks.filter((t) => t.phase === 'pre');
    if (preTasks.length > 0) {
      const current = get().selectedTaskId;
      if (!current || !tasks.find((t) => t.id === current)) {
        set({ selectedTaskId: preTasks[0].id });
      }
    }
  },

  setSeason: (s) => set({ season: s }),

  setPhase: (p) => {
    set({ activePhase: p, filter: 'all', searchQuery: '' });
    const filtered = get().filteredTasks();
    set({ selectedTaskId: filtered[0]?.id ?? null });
  },

  setFilter: (f) => {
    set({ filter: f });
    const filtered = get().filteredTasks();
    if (filtered.length > 0 && !filtered.find((t) => t.id === get().selectedTaskId)) {
      set({ selectedTaskId: filtered[0].id });
    }
  },

  setSearch: (q) => {
    set({ searchQuery: q });
    const filtered = get().filteredTasks();
    if (filtered.length > 0 && !filtered.find((t) => t.id === get().selectedTaskId)) {
      set({ selectedTaskId: filtered[0].id });
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  addTask: (task) => {
    set((state) => ({ tasks: [task, ...state.tasks] }));
    dbUpsertTask(task);
  },

  updateTask: (id, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: now } : t,
      ),
    }));
    dbUpdateTask(id, { ...patch, updatedAt: now });
  },

  completeTask: (id) => {
    const now = new Date().toISOString();
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status: 'complete', updatedAt: now } : t,
      ),
    }));
    dbUpdateTask(id, { status: 'complete', updatedAt: now });
  },

  deleteTask: (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    dbDeleteTask(id);
  },

  addActivityEntry: (taskId, entry) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, activityLog: [entry, ...t.activityLog], updatedAt: new Date().toISOString() }
          : t,
      ),
    }));
    dbAddTaskActivity(taskId, entry);
  },

  activateNewSeason: (season, currentUserName) => {
    const now = new Date().toISOString();
    const updatedTasks = get().tasks.map((t) => ({
      ...t,
      status: 'pending' as const,
      dueDate: computeDueDate(season.openingDate, t.daysRelativeToOpening),
      updatedAt: now,
      activityLog: [
        {
          id: `a${Date.now()}-${t.id}`,
          userId: 'system',
          userName: currentUserName,
          action: `New season activated by ${currentUserName}`,
          timestamp: now,
        },
        ...t.activityLog,
      ],
    }));
    set({ season, tasks: updatedTasks });
    dbUpsertSeason(season);
    updatedTasks.forEach((t) => dbUpdateTask(t.id, { status: 'pending', dueDate: t.dueDate, updatedAt: now }));
  },

  filteredTasks: () => {
    const { tasks, activePhase, filter, searchQuery } = get();
    let result = tasks.filter((t) => t.phase === activePhase);

    if (filter === 'pending') result = result.filter((t) => t.status === 'pending');
    else if (filter === 'in_progress') result = result.filter((t) => t.status === 'in_progress');
    else if (filter === 'complete') result = result.filter((t) => t.status === 'complete');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.locations.some((l) => l.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      const aComplete = a.status === 'complete' ? 1 : 0;
      const bComplete = b.status === 'complete' ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;
      if (a.dueDate && b.dueDate)
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    });

    return result;
  },

  completionPercent: (phase) => {
    const p = phase ?? get().activePhase;
    const tasks = get().tasks.filter((t) => t.phase === p);
    if (tasks.length === 0) return 0;
    const complete = tasks.filter((t) => t.status === 'complete').length;
    return Math.round((complete / tasks.length) * 100);
  },

  completionByLocation: (phase) => {
    const p = phase ?? get().activePhase;
    const tasks = get().tasks.filter((t) => t.phase === p);
    const map: Record<string, { total: number; complete: number }> = {};
    for (const t of tasks) {
      for (const loc of t.locations) {
        if (!map[loc]) map[loc] = { total: 0, complete: 0 };
        map[loc].total++;
        if (t.status === 'complete') map[loc].complete++;
      }
    }
    return map;
  },
}));
