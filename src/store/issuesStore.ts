import { create } from 'zustand';
import type { Issue, ActivityEntry, IssueStatus, Priority } from '@/lib/types';
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import {
  dbUpsertIssue,
  dbUpdateIssue,
  dbAddIssueActivity,
  dbDeleteIssue,
  dbDeletePhoto,
} from '@/lib/db';

type FilterType = 'all' | 'urgent' | 'unassigned' | 'in_progress' | 'resolved';

interface IssuesStore {
  issues: Issue[];
  selectedIssueId: string | null;
  filter: FilterType;
  searchQuery: string;

  setIssues: (issues: Issue[]) => void;
  setFilter: (f: FilterType) => void;
  setSearch: (q: string) => void;
  selectIssue: (id: string | null) => void;
  addIssue: (issue: Issue) => void;
  updateIssue: (id: string, patch: Partial<Issue>) => void;
  deleteIssue: (id: string) => void;
  resolveIssue: (id: string, actualCost?: number | null) => void;
  reopenIssue: (id: string) => void;
  addActivityEntry: (issueId: string, entry: ActivityEntry) => void;

  filteredIssues: () => Issue[];
  urgentCount: () => number;
  openCount: () => number;
  resolvedCount: () => number;
  totalCosts: () => number;
}

const priorityOrder: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
const statusOrder: Record<IssueStatus, number> = {
  unassigned: 0,
  assigned: 1,
  in_progress: 2,
  resolved: 3,
};

function computeNextDueDate(dueDate: string | null, interval: Issue['recurringInterval']): string | null {
  if (!dueDate || !interval) return null;
  const d = new Date(dueDate);
  switch (interval) {
    case 'daily': return addDays(d, 1).toISOString().split('T')[0];
    case 'weekly': return addWeeks(d, 1).toISOString().split('T')[0];
    case 'monthly': return addMonths(d, 1).toISOString().split('T')[0];
    case 'annually': return addYears(d, 1).toISOString().split('T')[0];
  }
}

export const useIssuesStore = create<IssuesStore>((set, get) => ({
  issues: [],
  selectedIssueId: null,
  filter: 'all',
  searchQuery: '',

  setIssues: (issues) => {
    set({ issues });
    if (issues.length > 0) {
      const current = get().selectedIssueId;
      if (!current || !issues.find((i) => i.id === current)) {
        set({ selectedIssueId: issues[0].id });
      }
    }
  },

  setFilter: (f) => {
    set({ filter: f });
    const filtered = get().filteredIssues();
    if (filtered.length > 0 && !filtered.find((i) => i.id === get().selectedIssueId)) {
      set({ selectedIssueId: filtered[0].id });
    }
  },

  setSearch: (q) => {
    set({ searchQuery: q });
    const filtered = get().filteredIssues();
    if (filtered.length > 0 && !filtered.find((i) => i.id === get().selectedIssueId)) {
      set({ selectedIssueId: filtered[0].id });
    }
  },

  selectIssue: (id) => set({ selectedIssueId: id }),

  addIssue: (issue) => {
    set((state) => ({ issues: [issue, ...state.issues] }));
    dbUpsertIssue(issue);
  },

  deleteIssue: (id) => {
    const issue = get().issues.find((i) => i.id === id);
    set((state) => ({
      issues: state.issues.filter((i) => i.id !== id),
      selectedIssueId: state.selectedIssueId === id ? null : state.selectedIssueId,
    }));
    if (issue?.photoUrl) dbDeletePhoto(issue.photoUrl);
    dbDeleteIssue(id);
  },

  updateIssue: (id, patch) => {
    const now = new Date().toISOString();
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === id ? { ...i, ...patch, updatedAt: now } : i,
      ),
    }));
    dbUpdateIssue(id, { ...patch, updatedAt: now });
  },

  resolveIssue: (id, actualCost) => {
    const issue = get().issues.find((i) => i.id === id);
    if (!issue) return;

    const now = new Date().toISOString();
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === id
          ? { ...i, status: 'resolved', actualCost: actualCost ?? i.actualCost, updatedAt: now }
          : i,
      ),
    }));
    dbUpdateIssue(id, { status: 'resolved', actualCost: actualCost ?? issue.actualCost, updatedAt: now });

    // Auto-clone recurring issues
    if (issue.isRecurring && issue.recurringInterval) {
      const newIssue: Issue = {
        ...issue,
        id: `i${Date.now()}`,
        status: issue.assigneeId ? 'assigned' : 'unassigned',
        actualCost: null,
        createdAt: now,
        updatedAt: now,
        dueDate: computeNextDueDate(issue.dueDate, issue.recurringInterval),
        activityLog: [
          {
            id: `a${Date.now()}`,
            userId: 'system',
            userName: 'System',
            action: 'Auto-created from recurring issue',
            timestamp: now,
          },
        ],
      };
      set((state) => ({ issues: [newIssue, ...state.issues] }));
      dbUpsertIssue(newIssue);
    }
  },

  reopenIssue: (id) => {
    const now = new Date().toISOString();
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === id ? { ...i, status: 'in_progress', updatedAt: now } : i,
      ),
    }));
    dbUpdateIssue(id, { status: 'in_progress', updatedAt: now });
  },

  addActivityEntry: (issueId, entry) => {
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === issueId
          ? { ...i, activityLog: [entry, ...i.activityLog], updatedAt: new Date().toISOString() }
          : i,
      ),
    }));
    dbAddIssueActivity(issueId, entry);
  },

  filteredIssues: () => {
    const { issues, filter, searchQuery } = get();
    let result = [...issues];

    if (filter === 'urgent') result = result.filter((i) => i.priority === 'urgent');
    else if (filter === 'unassigned') result = result.filter((i) => i.status === 'unassigned');
    else if (filter === 'in_progress') result = result.filter((i) => i.status === 'in_progress');
    else if (filter === 'resolved') result = result.filter((i) => i.status === 'resolved');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.locations.some((l) => l.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      const aResolved = a.status === 'resolved' ? 1 : 0;
      const bResolved = b.status === 'resolved' ? 1 : 0;
      if (aResolved !== bResolved) return aResolved - bResolved;
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pd !== 0) return pd;
      const sd = statusOrder[a.status] - statusOrder[b.status];
      if (sd !== 0) return sd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  },

  urgentCount: () =>
    get().issues.filter((i) => i.priority === 'urgent' && i.status !== 'resolved').length,

  openCount: () =>
    get().issues.filter((i) => i.status !== 'resolved').length,

  resolvedCount: () =>
    get().issues.filter((i) => i.status === 'resolved').length,

  totalCosts: () =>
    get().issues.reduce((sum, i) => {
      if (i.status === 'resolved') return sum + (i.actualCost ?? 0);
      return sum + (i.estimatedCostValue ?? 0);
    }, 0),
}));
