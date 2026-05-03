import type { Issue } from './types';

const QUEUE_KEY = 'campops_pending_issues';

interface QueuedIssue {
  issue: Issue;
  queuedAt: number;
}

function read(): QueuedIssue[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); }
  catch { return []; }
}

function save(q: QueuedIssue[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch { /* storage full */ }
}

export function enqueueIssue(issue: Issue): void {
  const q = read();
  const idx = q.findIndex((w) => w.issue.id === issue.id);
  if (idx >= 0) q[idx].issue = issue;
  else q.push({ issue, queuedAt: Date.now() });
  save(q);
}

export function dequeueIssue(id: string): void {
  save(read().filter((w) => w.issue.id !== id));
}

export function getQueuedIssues(): Issue[] {
  return read().map((w) => w.issue);
}

// Called at store creation time to restore pending state across page refreshes.
export function loadInitialPending(): Record<string, Issue> {
  return Object.fromEntries(read().map((w) => [w.issue.id, w.issue]));
}
