/**
 * Supabase sync layer.
 * - initializeSupabase(): on app load, seeds DB from seedData if empty, then loads into stores.
 * - Individual write functions mirror each Zustand mutation to Supabase.
 */

import { supabase } from './supabase';
import { SEED_USERS } from './seedData';
import type { Issue, ChecklistTask, ActivityEntry, Season } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function issueToRow(issue: Issue) {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    locations: issue.locations,
    priority: issue.priority,
    status: issue.status,
    assignee_id: issue.assigneeId,
    reported_by_id: issue.reportedById,
    estimated_cost_display: issue.estimatedCostDisplay,
    estimated_cost_value: issue.estimatedCostValue,
    actual_cost: issue.actualCost,
    photo_url: issue.photoUrl,
    due_date: issue.dueDate,
    is_recurring: issue.isRecurring,
    recurring_interval: issue.recurringInterval,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
  };
}

function rowToIssue(row: Record<string, unknown>, activityLog: ActivityEntry[]): Issue {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    locations: ((row.locations as string[]) ?? []) as Issue['locations'],
    priority: row.priority as Issue['priority'],
    status: row.status as Issue['status'],
    assigneeId: (row.assignee_id as string) ?? null,
    reportedById: row.reported_by_id as string,
    estimatedCostDisplay: (row.estimated_cost_display as string) ?? null,
    estimatedCostValue: (row.estimated_cost_value as number) ?? null,
    actualCost: (row.actual_cost as number) ?? null,
    photoUrl: (row.photo_url as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    isRecurring: (row.is_recurring as boolean) ?? false,
    recurringInterval: (row.recurring_interval as Issue['recurringInterval']) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    activityLog,
  };
}

function taskToRow(task: ChecklistTask) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    locations: task.locations,
    priority: task.priority,
    status: task.status,
    assignee_id: task.assigneeId,
    phase: task.phase,
    days_relative_to_opening: task.daysRelativeToOpening,
    due_date: task.dueDate,
    is_recurring: task.isRecurring,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function rowToTask(row: Record<string, unknown>, activityLog: ActivityEntry[]): ChecklistTask {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    locations: ((row.locations as string[]) ?? []) as ChecklistTask['locations'],
    priority: row.priority as ChecklistTask['priority'],
    status: row.status as ChecklistTask['status'],
    assigneeId: (row.assignee_id as string) ?? null,
    phase: row.phase as 'pre' | 'post',
    daysRelativeToOpening: row.days_relative_to_opening as number,
    dueDate: (row.due_date as string) ?? null,
    isRecurring: true,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    activityLog,
  };
}

function activityRowToEntry(row: Record<string, unknown>): ActivityEntry {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? 'system',
    userName: row.user_name as string,
    action: row.action as string,
    timestamp: row.created_at as string,
  };
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function initializeSupabase(): Promise<{
  issues: Issue[];
  tasks: ChecklistTask[];
  season: Season | null;
} | null> {
  console.log('[Supabase] initializeSupabase() called');
  console.log('[Supabase] URL:', import.meta.env.VITE_SUPABASE_URL);
  console.log('[Supabase] Key set:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

  try {
    // Always ensure users exist (required for FK constraints on issues/activity)
    const userRows = SEED_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, initials: u.initials }));
    const { error: ue } = await supabase.from('users').upsert(userRows, { onConflict: 'id' });
    if (ue) console.error('[Supabase] User upsert error:', ue.message);

    const data = await loadFromSupabase();
    console.log('[Supabase] Loaded:', data.issues.length, 'issues,', data.tasks.length, 'tasks');
    return data;
  } catch (e) {
    console.error('[Supabase] initializeSupabase threw:', e);
    return null;
  }
}


async function loadFromSupabase(): Promise<{
  issues: Issue[];
  tasks: ChecklistTask[];
  season: Season | null;
}> {
  // Load issues + activity
  const { data: issueRows, error: ie } = await supabase
    .from('issues')
    .select('*')
    .order('created_at', { ascending: false });
  if (ie) console.error('Load issues error:', ie.message);

  const { data: activityRows, error: ae } = await supabase
    .from('issue_activity')
    .select('*')
    .order('created_at', { ascending: false });
  if (ae) console.error('Load issue_activity error:', ae.message);

  const issues: Issue[] = (issueRows ?? []).map((row) => {
    const log = (activityRows ?? [])
      .filter((a) => a.issue_id === row.id)
      .map(activityRowToEntry);
    return rowToIssue(row as Record<string, unknown>, log);
  });

  // Load tasks + activity
  const { data: taskRows, error: te } = await supabase
    .from('checklist_tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (te) console.error('Load tasks error:', te.message);

  const { data: taskActivityRows, error: tae } = await supabase
    .from('checklist_activity')
    .select('*')
    .order('created_at', { ascending: false });
  if (tae) console.error('Load checklist_activity error:', tae.message);

  const tasks: ChecklistTask[] = (taskRows ?? []).map((row) => {
    const log = (taskActivityRows ?? [])
      .filter((a) => a.task_id === row.id)
      .map(activityRowToEntry);
    return rowToTask(row as Record<string, unknown>, log);
  });

  // Load latest season
  const { data: seasonRows, error: se } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  if (se) console.error('Load season error:', se.message);

  const season: Season | null = seasonRows?.[0]
    ? {
        id: seasonRows[0].id,
        name: seasonRows[0].name,
        openingDate: seasonRows[0].opening_date,
        closingDate: seasonRows[0].closing_date,
      }
    : null;

  return { issues, tasks, season };
}

// ─── Write functions (called alongside Zustand mutations) ─────────────────────

export async function dbUpsertIssue(issue: Issue) {
  const { error } = await supabase.from('issues').upsert(issueToRow(issue), { onConflict: 'id' });
  if (error) console.error('dbUpsertIssue error:', error.message);
}

export async function dbUpdateIssue(id: string, patch: Partial<Issue>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.locations !== undefined) row.locations = patch.locations;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
  if (patch.estimatedCostDisplay !== undefined) row.estimated_cost_display = patch.estimatedCostDisplay;
  if (patch.estimatedCostValue !== undefined) row.estimated_cost_value = patch.estimatedCostValue;
  if (patch.actualCost !== undefined) row.actual_cost = patch.actualCost;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.isRecurring !== undefined) row.is_recurring = patch.isRecurring;
  if (patch.recurringInterval !== undefined) row.recurring_interval = patch.recurringInterval;
  const { error } = await supabase.from('issues').update(row).eq('id', id);
  if (error) console.error('dbUpdateIssue error:', error.message);
}

export async function dbAddIssueActivity(issueId: string, entry: ActivityEntry) {
  const { error } = await supabase.from('issue_activity').insert({
    id: entry.id,
    issue_id: issueId,
    user_id: entry.userId === 'system' ? null : entry.userId,
    user_name: entry.userName,
    action: entry.action,
    created_at: entry.timestamp,
  });
  if (error) console.error('dbAddIssueActivity error:', error.message);
}

export async function dbUpsertTask(task: ChecklistTask) {
  const { error } = await supabase.from('checklist_tasks').upsert(taskToRow(task), { onConflict: 'id' });
  if (error) console.error('dbUpsertTask error:', error.message);
}

export async function dbUpdateTask(id: string, patch: Partial<ChecklistTask>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.locations !== undefined) row.locations = patch.locations;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  const { error } = await supabase.from('checklist_tasks').update(row).eq('id', id);
  if (error) console.error('dbUpdateTask error:', error.message);
}

export async function dbAddTaskActivity(taskId: string, entry: ActivityEntry) {
  const { error } = await supabase.from('checklist_activity').insert({
    id: entry.id,
    task_id: taskId,
    user_id: entry.userId === 'system' ? null : entry.userId,
    user_name: entry.userName,
    action: entry.action,
    created_at: entry.timestamp,
  });
  if (error) console.error('dbAddTaskActivity error:', error.message);
}

export async function dbUpsertSeason(season: Season) {
  const { error } = await supabase.from('seasons').upsert({
    id: season.id,
    name: season.name,
    opening_date: season.openingDate,
    closing_date: season.closingDate,
  }, { onConflict: 'id' });
  if (error) console.error('dbUpsertSeason error:', error.message);
}

// ─── Photo storage ────────────────────────────────────────────────────────────

const PHOTO_BUCKET = 'issue-photos';

export async function dbUploadPhoto(file: File, issueId: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(issueId, file, { upsert: true, contentType: file.type });
  if (error) {
    console.error('[Supabase] Photo upload error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(issueId);
  return data.publicUrl;
}

export async function dbDeletePhoto(photoUrl: string): Promise<void> {
  const marker = `/${PHOTO_BUCKET}/`;
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(photoUrl.slice(idx + marker.length).split('?')[0]);
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error('[Supabase] Photo delete error:', error.message);
}

export async function dbDeleteIssue(id: string): Promise<void> {
  const { error } = await supabase.from('issues').delete().eq('id', id);
  if (error) console.error('[Supabase] Delete issue error:', error.message);
}

export async function dbDeleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_tasks').delete().eq('id', id);
  if (error) console.error('[Supabase] Delete task error:', error.message);
}

// ─── Realtime subscriptions ───────────────────────────────────────────────────

type IssueCallback = (issues: Issue[]) => void;
type TaskCallback = (tasks: ChecklistTask[]) => void;

// Each call creates a uniquely-named channel so React StrictMode's double-invoke
// doesn't hit "cannot add callbacks after subscribe()" on the same channel name.
let issueChannelCount = 0;
let taskChannelCount = 0;

export function subscribeToIssues(onUpdate: IssueCallback): () => void {
  const channelName = `issues-channel-${++issueChannelCount}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, async () => {
      const { data: issueRows } = await supabase.from('issues').select('*').order('created_at', { ascending: false });
      const { data: activityRows } = await supabase.from('issue_activity').select('*').order('created_at', { ascending: false });
      const issues: Issue[] = (issueRows ?? []).map((row) => {
        const log = (activityRows ?? []).filter((a) => a.issue_id === row.id).map(activityRowToEntry);
        return rowToIssue(row as Record<string, unknown>, log);
      });
      onUpdate(issues);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function subscribeToTasks(onUpdate: TaskCallback): () => void {
  const channelName = `tasks-channel-${++taskChannelCount}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_tasks' }, async () => {
      const { data: taskRows } = await supabase.from('checklist_tasks').select('*').order('created_at', { ascending: false });
      const { data: taskActivityRows } = await supabase.from('checklist_activity').select('*').order('created_at', { ascending: false });
      const tasks: ChecklistTask[] = (taskRows ?? []).map((row) => {
        const log = (taskActivityRows ?? []).filter((a) => a.task_id === row.id).map(activityRowToEntry);
        return rowToTask(row as Record<string, unknown>, log);
      });
      onUpdate(tasks);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
