import { create } from 'zustand';
import { campLog, campError } from '@/lib/campLog';
import type { Issue, ActivityEntry, IssueStatus, Priority } from '@/lib/types';
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import {
  dbUpsertIssue,
  dbUpdateIssue,
  dbAddIssueActivity,
  dbDeleteIssue,
  dbDeletePhoto,
} from '@/lib/db';
import { useCampStore } from '@/store/campStore';

type FilterType = 'all' | 'urgent' | 'unassigned' | 'in_progress' | 'resolved';

interface IssuesStore {
  issues: Issue[];
  pendingIssues: Record<string, Issue>;
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
  pendingIssues: {},
  selectedIssueId: null,
  filter: 'all',
  searchQuery: '',

  setIssues: (issues) => {
    set((state) => {
      // Merge any in-flight optimistic adds back into the incoming list so a
      // refetch that raced a pending write doesn't erase the optimistic update.
      const pending = state.pendingIssues;
      const pendingEntries = Object.entries(pending);
      let merged = issues;
      if (pendingEntries.length > 0) {
        const incomingIds = new Set(issues.map((i) => i.id));
        const surviving = pendingEntries
          .filter(([id]) => !incomingIds.has(id))
          .map(([, issue]) => issue);
        if (surviving.length > 0) {
          campLog(`[CampOps] setIssues: preserving ${surviving.length} pending issue(s) from refetch overwrite`);
          merged = [...surviving, ...issues];
        }
      }
      const current = state.selectedIssueId;
      const nextSelected =
        merged.length > 0 && (!current || !merged.find((i) => i.id === current))
          ? merged[0].id
          : current;
      return { issues: merged, selectedIssueId: nextSelected };
    });
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
    campLog('[CampOps] addIssue called', issue.id, issue.title);
    set((state) => ({
      issues: [issue, ...state.issues],
      pendingIssues: { ...state.pendingIssues, [issue.id]: issue },
    }));

    let saved = false;

    const commit = () => {
      if (saved) return;
      saved = true;
      set((state) => {
        const { [issue.id]: _, ...rest } = state.pendingIssues;
        return { pendingIssues: rest };
      });
    };

    // Attempt 1 — immediate. fetchWithRetry uses XHR internally so AbortController
    // actually cancels stale TCP sockets; on a stale connection this resolves in ~5 s.
    dbUpsertIssue(issue).then(({ error }) => {
      if (!error) commit();
      else campError('[CampOps] addIssue attempt 1 error', error);
    });

    // Attempt 2 — 15 s safety net in case all fetchWithRetry internal retries failed.
    setTimeout(() => {
      if (saved) return;
      campLog('[CampOps] addIssue attempt 2 (safety net)');
      dbUpsertIssue(issue).then(({ error }) => {
        if (!error) commit();
        else campError('[CampOps] addIssue attempt 2 error', error);
      });
    }, 15_000);

    // Attempt 3 — 30 s; roll back only if this also fails
    setTimeout(() => {
      if (saved) return;
      campLog('[CampOps] addIssue attempt 3 (final)');
      dbUpsertIssue(issue).then(({ error }) => {
        if (!error) { commit(); return; }
        campError('[CampOps] addIssue attempt 3 failed — rolling back', error);
        if (saved) return;
        saved = true;
        set((state) => {
          const { [issue.id]: _, ...rest } = state.pendingIssues;
          return { issues: state.issues.filter((i) => i.id !== issue.id), pendingIssues: rest };
        });
      });
    }, 30_000);
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

// ─── Automated stale-TCP test ──────────────────────────────────────────────────
// campLog.ts registers campOpsDebug first (it's imported above), so we can safely
// merge runTest into the existing object.
//
// Usage: campOpsDebug.runTest()         — default 10s hang, resets at 4.5s
//        campOpsDebug.runTest(5000)     — 5s hang (faster iteration)
{
  const W = window as Record<string, unknown>;
  if (!W.campOpsDebug) W.campOpsDebug = {};
  (W.campOpsDebug as Record<string, unknown>).runTest = async (hangMs = 10_000) => {
    const debug = W.campOpsDebug as Record<string, unknown>;
    const campLogObj = W.campLog as { clear?: () => void; dump?: () => void } | undefined;

    const campId = useCampStore.getState().currentCamp?.id;
    const userId = useCampStore.getState().currentMember?.userId;
    if (!campId || !userId) { console.error('[runTest] No camp/member — are you logged in?'); return; }

    campLogObj?.clear?.();
    campLog(`[TEST] runTest START hangMs=${hangMs}`);

    const now = new Date().toISOString();
    const testIssue: Issue = {
      id: crypto.randomUUID(),
      title: `[AUTO-TEST] ${new Date().toLocaleTimeString()}`,
      description: 'Automated stale-TCP write test',
      locations: [],
      priority: 'normal',
      status: 'unassigned',
      assigneeId: null,
      reportedById: userId,
      estimatedCostDisplay: null,
      estimatedCostValue: null,
      actualCost: null,
      photoUrl: null,
      dueDate: null,
      isRecurring: false,
      recurringInterval: null,
      createdAt: now,
      updatedAt: now,
      activityLog: [],
    };

    (debug.simulateStaleFetch as (ms: number) => void)(hangMs);
    campLog('[TEST] stale simulation active — calling addIssue');
    useIssuesStore.getState().addIssue(testIssue);

    // Reset simulation after AbortController fires at 4s so the 5s retry hits real network.
    setTimeout(() => {
      campLog('[TEST] resetting stale simulation');
      (debug.resetFetch as () => void)?.();
    }, 4_500);

    // Report at 15s.
    setTimeout(() => {
      const s = useIssuesStore.getState();
      const pending = !!s.pendingIssues[testIssue.id];
      const inList = s.issues.some((i) => i.id === testIssue.id);
      if (!pending && inList) campLog('[TEST] PASS ✓ — issue saved and committed');
      else if (pending) campLog('[TEST] PENDING — write still in-flight (check dump for retries)');
      else campLog('[TEST] FAIL ✗ — issue was rolled back');
      campLog('[TEST] Dump:');
      campLogObj?.dump?.();
    }, 15_000);
  };
}
