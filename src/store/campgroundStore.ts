/**
 * Campground state: the things a work order needs that are not the work order itself.
 *
 * Deliberately a separate store from issuesStore, which stays the owner of `issues` and its
 * optimistic write queue. This one holds the surrounding furniture — routines, checklists,
 * comments, vendors, routing — so the two can be loaded, subscribed and reasoned about apart.
 *
 * Selector rule for this codebase (React 19 + zustand v5): never return a freshly-allocated
 * array or object from a selector, or the "getSnapshot should be cached" loop white-screens the
 * app. Everything below either returns a stable slice or is a plain function called in a render
 * body after destructuring.
 */
import { create } from 'zustand';
import { campLog } from '@/lib/campLog';
import { generateId, todayStr } from '@/lib/utils';
import type {
  ServiceVendor, WorkRouting, WorkSchedule, WorkChecklistTemplate,
  IssueChecklistItem, IssueComment, Trade, CampSession, Issue, CampTrade,
} from '@/lib/types';
import {
  dbAddVendor, dbUpdateVendor, dbDeleteVendor, dbSetRouting,
  dbAddSchedule, dbUpdateSchedule, dbDeleteSchedule,
  dbAddTemplate, dbUpdateTemplate, dbDeleteTemplate,
  dbAddComment, dbDeleteComment, dbMarkThreadRead,
  dbSetChecklistItemDone, dbApplyChecklist, dbAddChecklistItem, dbDeleteChecklistItem,
  dbFetchChecklistItems,
  dbAddTrade, dbUpdateTrade, dbDeleteTrade,
} from '@/lib/campgroundDb';

/** The board's lane filter. `all` is the default so nobody is hidden from anyone's work. */
export type TradeFilter = 'all' | Trade;

interface CampgroundState {
  vendors: ServiceVendor[];
  routing: WorkRouting[];
  schedules: WorkSchedule[];
  templates: WorkChecklistTemplate[];
  trades: CampTrade[];
  checklistItems: IssueChecklistItem[];
  comments: IssueComment[];
  sessions: CampSession[];

  /** Per-issue unread marker, kept client-side between reads so the dot clears on open. */
  readAt: Record<string, string>;

  tradeFilter: TradeFilter;

  setVendors: (v: ServiceVendor[]) => void;
  setRouting: (r: WorkRouting[]) => void;
  setSchedules: (s: WorkSchedule[]) => void;
  setTemplates: (t: WorkChecklistTemplate[]) => void;
  setTrades: (t: CampTrade[]) => void;
  /** Returns an error message, or null on success — a duplicate key is a real answer. */
  addTrade: (t: CampTrade) => Promise<string | null>;
  updateTrade: (t: CampTrade) => void;
  /** Only safe when nothing has ever been filed under it — the card enforces that. */
  deleteTrade: (id: string) => void;
  setChecklistItems: (i: IssueChecklistItem[]) => void;
  setComments: (c: IssueComment[]) => void;
  setSessions: (s: CampSession[]) => void;
  setTradeFilter: (t: TradeFilter) => void;

  addVendor: (v: ServiceVendor) => void;
  updateVendor: (v: ServiceVendor) => void;
  deleteVendor: (id: string) => void;

  setTradeRouting: (trade: Trade, staffGroupId: string | null, assigneeId: string | null) => void;

  addSchedule: (s: WorkSchedule) => void;
  updateSchedule: (s: WorkSchedule) => void;
  deleteSchedule: (id: string) => void;

  addTemplate: (t: WorkChecklistTemplate) => void;
  updateTemplate: (t: WorkChecklistTemplate) => void;
  deleteTemplate: (id: string) => void;

  postComment: (issueId: string, body: string, author: { id: string; name: string },
                photoUrls?: string[], visibleToReporter?: boolean) => void;
  removeComment: (id: string) => void;
  markRead: (issueId: string, userId: string) => void;

  applyTemplate: (issueId: string, templateId: string) => Promise<void>;
  tickChecklistItem: (id: string, isDone: boolean, by: { id: string; name: string },
                     photoUrl?: string | null) => void;
  addChecklistStep: (issueId: string, text: string) => void;
  removeChecklistStep: (id: string) => void;
}

export const useCampgroundStore = create<CampgroundState>((set, get) => ({
  vendors: [], routing: [], schedules: [], templates: [], trades: [],
  checklistItems: [], comments: [], sessions: [],
  readAt: {},
  tradeFilter: 'all',

  setVendors: (vendors) => set({ vendors }),
  setRouting: (routing) => set({ routing }),
  setSchedules: (schedules) => set({ schedules }),
  setTemplates: (templates) => set({ templates }),
  setTrades: (trades) => set({ trades }),

  // ── Trades ─────────────────────────────────────────────────────────────────
  addTrade: async (t) => {
    const { error } = await dbAddTrade(t);
    if (error) return error;
    set((s) => ({ trades: [...s.trades, t] }));
    return null;
  },
  updateTrade: (t) => {
    set((s) => ({ trades: s.trades.map((x) => (x.id === t.id ? t : x)) }));
    void dbUpdateTrade(t);
  },
  deleteTrade: (id) => {
    set((s) => ({ trades: s.trades.filter((x) => x.id !== id) }));
    void dbDeleteTrade(id);
  },
  setChecklistItems: (checklistItems) => set({ checklistItems }),
  setComments: (comments) => set({ comments }),
  setSessions: (sessions) => set({ sessions }),
  setTradeFilter: (tradeFilter) => set({ tradeFilter }),

  // ── Vendors ────────────────────────────────────────────────────────────────
  addVendor: (v) => { set((s) => ({ vendors: [...s.vendors, v] })); void dbAddVendor(v); },
  updateVendor: (v) => {
    set((s) => ({ vendors: s.vendors.map((x) => (x.id === v.id ? v : x)) }));
    void dbUpdateVendor(v);
  },
  deleteVendor: (id) => {
    set((s) => ({ vendors: s.vendors.filter((x) => x.id !== id) }));
    void dbDeleteVendor(id);
  },

  // ── Routing ────────────────────────────────────────────────────────────────
  setTradeRouting: (trade, staffGroupId, assigneeId) => {
    set((s) => {
      const rest = s.routing.filter((r) => r.trade !== trade);
      return {
        routing: [...rest, {
          campId: '', trade, defaultStaffGroupId: staffGroupId,
          defaultAssigneeId: assigneeId, updatedAt: new Date().toISOString(),
        }],
      };
    });
    void dbSetRouting(trade, staffGroupId, assigneeId);
  },

  // ── Routines ───────────────────────────────────────────────────────────────
  addSchedule: (w) => { set((s) => ({ schedules: [...s.schedules, w] })); void dbAddSchedule(w); },
  updateSchedule: (w) => {
    set((s) => ({ schedules: s.schedules.map((x) => (x.id === w.id ? w : x)) }));
    void dbUpdateSchedule(w);
  },
  deleteSchedule: (id) => {
    set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }));
    void dbDeleteSchedule(id);
  },

  // ── Checklist templates ────────────────────────────────────────────────────
  addTemplate: (t) => { set((s) => ({ templates: [...s.templates, t] })); void dbAddTemplate(t); },
  updateTemplate: (t) => {
    set((s) => ({ templates: s.templates.map((x) => (x.id === t.id ? t : x)) }));
    void dbUpdateTemplate(t);
  },
  deleteTemplate: (id) => {
    set((s) => ({ templates: s.templates.filter((x) => x.id !== id) }));
    void dbDeleteTemplate(id);
  },

  // ── Comments ───────────────────────────────────────────────────────────────
  postComment: (issueId, body, author, photoUrls = [], visibleToReporter = false) => {
    const c: IssueComment = {
      id: generateId(), campId: '', issueId,
      authorId: author.id, authorName: author.name,
      body, photoUrls, visibleToReporter,
      createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
    };
    set((s) => ({ comments: [...s.comments, c] }));
    campLog('[CampOps] comment posted', issueId);
    void dbAddComment(c);
  },
  removeComment: (id) => {
    // Soft delete, so the timeline keeps its shape rather than silently rewriting history.
    set((s) => ({ comments: s.comments.filter((c) => c.id !== id) }));
    void dbDeleteComment(id);
  },
  markRead: (issueId, userId) => {
    const now = new Date().toISOString();
    set((s) => ({ readAt: { ...s.readAt, [issueId]: now } }));
    void dbMarkThreadRead(issueId, userId);
  },

  // ── Checklists ─────────────────────────────────────────────────────────────
  applyTemplate: async (issueId, templateId) => {
    const n = await dbApplyChecklist(issueId, templateId);
    if (n === 0) return;
    // Read the steps straight back rather than waiting to be told about them. The server picks
    // the positions and refuses to apply a template twice, so there is nothing to guess -- and
    // a checklist that appears a beat after you asked for it reads as one that did not apply.
    const items = await dbFetchChecklistItems(issueId);
    set((s) => ({
      checklistItems: [...s.checklistItems.filter((i) => i.issueId !== issueId), ...items],
    }));
  },
  tickChecklistItem: (id, isDone, by, photoUrl) => {
    set((s) => ({
      checklistItems: s.checklistItems.map((i) => (i.id === id ? {
        ...i, isDone,
        doneBy: isDone ? by.id : null,
        doneByName: isDone ? by.name : null,
        doneAt: isDone ? new Date().toISOString() : null,
        photoUrl: photoUrl ?? i.photoUrl,
      } : i)),
    }));
    void dbSetChecklistItemDone(id, isDone, by.id, by.name, photoUrl);
  },
  addChecklistStep: (issueId, text) => {
    const existing = get().checklistItems.filter((i) => i.issueId === issueId);
    const item: IssueChecklistItem = {
      id: generateId(), campId: '', issueId,
      position: existing.length, text, note: null, requiresPhoto: false, templateId: null,
      isDone: false, doneBy: null, doneByName: null, doneAt: null, photoUrl: null,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ checklistItems: [...s.checklistItems, item] }));
    void dbAddChecklistItem(item);
  },
  removeChecklistStep: (id) => {
    set((s) => ({ checklistItems: s.checklistItems.filter((i) => i.id !== id) }));
    void dbDeleteChecklistItem(id);
  },
}));

// ─── Derivations ──────────────────────────────────────────────────────────────
// Plain functions taking the slice, NOT store selectors. A selector that filters an array
// allocates a new one every render, and under React 19 + zustand v5 that is an infinite loop and
// a white screen — the single most expensive gotcha in this codebase.

export function checklistFor(items: IssueChecklistItem[], issueId: string): IssueChecklistItem[] {
  return items.filter((i) => i.issueId === issueId).sort((a, b) => a.position - b.position);
}

export function commentsFor(comments: IssueComment[], issueId: string): IssueComment[] {
  return comments
    .filter((c) => c.issueId === issueId && !c.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** "7 of 11" — what a housekeeping lead needs to see without walking to the cabin. */
export function checklistProgress(items: IssueChecklistItem[], issueId: string): { done: number; total: number } | null {
  const mine = items.filter((i) => i.issueId === issueId);
  if (mine.length === 0) return null;
  return { done: mine.filter((i) => i.isDone).length, total: mine.length };
}

export function hasUnread(
  comments: IssueComment[], readAt: Record<string, string>, issueId: string, userId: string,
): boolean {
  const seen = readAt[issueId];
  return comments.some((c) =>
    c.issueId === issueId && !c.deletedAt && c.authorId !== userId && (!seen || c.createdAt > seen));
}

/**
 * Am I in this conversation?
 *
 * A message only wants my attention if the job is mine or I have already said something on it.
 * Without this, a busy camp lights up every card on the board and the marker stops meaning
 * anything -- which is worse than not having one.
 */
export function inThread(issue: Issue, comments: IssueComment[], userId: string): boolean {
  if (issue.assigneeId === userId) return true;
  return comments.some((c) => c.issueId === issue.id && !c.deletedAt && c.authorId === userId);
}

/** Work orders I am part of that have said something since I last looked. Newest first. */
export function unreadThreadsForMe(
  issues: Issue[], comments: IssueComment[], readAt: Record<string, string>, userId: string,
): Issue[] {
  return issues.filter(
    (i) => i.status !== 'resolved'
      && inThread(i, comments, userId)
      && hasUnread(comments, readAt, i.id, userId),
  );
}

export function routingFor(routing: WorkRouting[], trade: Trade): WorkRouting | undefined {
  return routing.find((r) => r.trade === trade);
}

/** Routines that are behind, worst first. The camp's real maintenance debt in one list. */
export function routinesBehind(schedules: WorkSchedule[]): WorkSchedule[] {
  return schedules
    .filter((s) => s.isActive && s.missedCount > 0)
    .sort((a, b) => b.missedCount - a.missedCount);
}

/** The occurrence a routine is currently waiting on. There is at most one, by design. */
export function openOccurrence(issues: Issue[], scheduleId: string): Issue | undefined {
  return issues.find((i) => i.scheduleId === scheduleId && i.status !== 'resolved');
}

/** The session a date falls inside, for the review's session scoping. */
export function sessionOn(sessions: CampSession[], date = todayStr()): CampSession | undefined {
  return sessions.find((s) => s.startDate <= date && s.endDate >= date);
}
