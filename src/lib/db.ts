/**
 * Supabase sync layer.
 * - initializeSupabase(): on app load, seeds DB from seedData if empty, then loads into stores.
 * - Individual write functions mirror each Zustand mutation to Supabase.
 */

import { supabase } from './supabase';
import { SEED_USERS } from './seedData';
import type {
  Issue, ChecklistTask, ActivityEntry, Season,
  ChemicalReading, PoolEquipment, ServiceLogEntry,
  PoolInspection, InspectionLogEntry, SeasonalTask,
} from './types';

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

// ─── Pool write functions ─────────────────────────────────────────────────────

export async function dbAddChemicalReading(r: ChemicalReading) {
  const { error } = await supabase.from('pool_chemical_readings').insert({
    id: r.id, free_chlorine: r.freeChlorine, ph: r.ph, alkalinity: r.alkalinity,
    cyanuric_acid: r.cyanuricAcid, water_temp: r.waterTemp, calcium_hardness: r.calciumHardness,
    time_of_day: r.timeOfDay, logged_by_id: r.loggedById, logged_by_name: r.loggedByName,
    corrective_action: r.correctiveAction, pool_status: r.poolStatus, created_at: r.createdAt,
  });
  if (error) console.error('dbAddChemicalReading error:', error.message);
}

export async function dbAddEquipment(e: PoolEquipment) {
  const { error } = await supabase.from('pool_equipment').insert({
    id: e.id, name: e.name, type: e.type, status: e.status, status_detail: e.statusDetail,
    last_serviced: e.lastServiced, next_service_due: e.nextServiceDue, vendor: e.vendor,
    specs: e.specs, created_at: e.createdAt, updated_at: e.updatedAt,
  });
  if (error) console.error('dbAddEquipment error:', error.message);
}

export async function dbAddServiceLog(entry: ServiceLogEntry) {
  const { error } = await supabase.from('pool_service_log').insert({
    id: entry.id, equipment_id: entry.equipmentId, service_type: entry.serviceType,
    date_performed: entry.datePerformed, performed_by: entry.performedBy,
    notes: entry.notes, cost: entry.cost, next_service_due: entry.nextServiceDue,
    created_at: entry.createdAt,
  });
  if (error) console.error('dbAddServiceLog error:', error.message);
}

export async function dbUpdateInspection(insp: PoolInspection) {
  const { error } = await supabase.from('pool_inspections').update({
    status: insp.status, last_completed: insp.lastCompleted,
    next_due: insp.nextDue, history: insp.history, updated_at: new Date().toISOString(),
  }).eq('id', insp.id);
  if (error) console.error('dbUpdateInspection error:', error.message);
}

export async function dbAddInspectionLog(entry: InspectionLogEntry, knownInspectionIds: string[]) {
  // Only set the FK if the inspectionId is a real row in pool_inspections
  const inspectionId = knownInspectionIds.includes(entry.inspectionId) ? entry.inspectionId : null;
  const { error } = await supabase.from('pool_inspection_log').insert({
    id: entry.id, inspection_id: inspectionId, inspection_date: entry.inspectionDate,
    conducted_by: entry.conductedBy, result: entry.result, notes: entry.notes,
    next_due: entry.nextDue, created_at: entry.createdAt,
  });
  if (error) console.error('dbAddInspectionLog error:', error.message);
}

export async function dbAddSeasonalTask(task: SeasonalTask) {
  const { error } = await supabase.from('pool_seasonal_tasks').insert({
    id: task.id, title: task.title, detail: task.detail, phase: task.phase,
    is_complete: task.isComplete, completed_by: task.completedBy,
    completed_date: task.completedDate, assignees: task.assignees,
    sort_order: task.sortOrder, created_at: task.createdAt, updated_at: task.updatedAt,
  });
  if (error) console.error('dbAddSeasonalTask error:', error.message);
}

export async function dbUpdateSeasonalTask(id: string, patch: Partial<SeasonalTask>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.detail !== undefined) row.detail = patch.detail;
  if (patch.phase !== undefined) row.phase = patch.phase;
  if (patch.assignees !== undefined) row.assignees = patch.assignees;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await supabase.from('pool_seasonal_tasks').update(row).eq('id', id);
  if (error) console.error('dbUpdateSeasonalTask error:', error.message);
}

export async function dbDeleteSeasonalTask(id: string) {
  const { error } = await supabase.from('pool_seasonal_tasks').delete().eq('id', id);
  if (error) console.error('dbDeleteSeasonalTask error:', error.message);
}

export async function dbUpdateInspectionLog(id: string, patch: Partial<InspectionLogEntry>) {
  const row: Record<string, unknown> = {};
  if (patch.inspectionDate !== undefined) row.inspection_date = patch.inspectionDate;
  if (patch.conductedBy !== undefined) row.conducted_by = patch.conductedBy;
  if (patch.result !== undefined) row.result = patch.result;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.nextDue !== undefined) row.next_due = patch.nextDue;
  const { error } = await supabase.from('pool_inspection_log').update(row).eq('id', id);
  if (error) console.error('dbUpdateInspectionLog error:', error.message);
}

export async function dbDeleteInspectionLog(id: string) {
  const { error } = await supabase.from('pool_inspection_log').delete().eq('id', id);
  if (error) console.error('dbDeleteInspectionLog error:', error.message);
}

export async function dbToggleSeasonalTask(
  id: string, isComplete: boolean, completedBy: string | null, completedDate: string | null,
) {
  const { error } = await supabase.from('pool_seasonal_tasks').update({
    is_complete: isComplete, completed_by: completedBy,
    completed_date: completedDate, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) console.error('dbToggleSeasonalTask error:', error.message);
}

// ─── Pool read/subscribe ──────────────────────────────────────────────────────

type PoolDataCallback = (data: {
  readings: ChemicalReading[];
  equipment: PoolEquipment[];
  serviceLog: ServiceLogEntry[];
  inspections: PoolInspection[];
  inspectionLog: InspectionLogEntry[];
  seasonalTasks: SeasonalTask[];
}) => void;

async function loadPoolData() {
  const [rRes, eRes, slRes, iRes, ilRes, stRes] = await Promise.all([
    supabase.from('pool_chemical_readings').select('*').order('created_at', { ascending: false }),
    supabase.from('pool_equipment').select('*').order('created_at', { ascending: true }),
    supabase.from('pool_service_log').select('*').order('created_at', { ascending: false }),
    supabase.from('pool_inspections').select('*').order('created_at', { ascending: true }),
    supabase.from('pool_inspection_log').select('*').order('created_at', { ascending: false }),
    supabase.from('pool_seasonal_tasks').select('*').order('sort_order', { ascending: true }),
  ]);

  const readings: ChemicalReading[] = (rRes.data ?? []).map((r) => ({
    id: r.id, freeChlorine: r.free_chlorine, ph: r.ph, alkalinity: r.alkalinity,
    cyanuricAcid: r.cyanuric_acid, waterTemp: r.water_temp,
    calciumHardness: r.calcium_hardness ?? null, timeOfDay: r.time_of_day,
    loggedById: r.logged_by_id, loggedByName: r.logged_by_name,
    correctiveAction: r.corrective_action ?? null, poolStatus: r.pool_status,
    createdAt: r.created_at,
  }));

  const equipment: PoolEquipment[] = (eRes.data ?? []).map((e) => ({
    id: e.id, name: e.name, type: e.type, status: e.status,
    statusDetail: e.status_detail ?? '', lastServiced: e.last_serviced ?? null,
    nextServiceDue: e.next_service_due ?? null, vendor: e.vendor ?? null,
    specs: e.specs ?? null, createdAt: e.created_at, updatedAt: e.updated_at,
  }));

  const serviceLog: ServiceLogEntry[] = (slRes.data ?? []).map((s) => ({
    id: s.id, equipmentId: s.equipment_id, serviceType: s.service_type,
    datePerformed: s.date_performed, performedBy: s.performed_by,
    notes: s.notes ?? null, cost: s.cost ?? null,
    nextServiceDue: s.next_service_due ?? null, createdAt: s.created_at,
  }));

  const inspections: PoolInspection[] = (iRes.data ?? []).map((i) => ({
    id: i.id, name: i.name, frequency: i.frequency, authority: i.authority,
    standard: i.standard ?? null, status: i.status,
    lastCompleted: i.last_completed ?? null, nextDue: i.next_due ?? null,
    history: i.history ?? [], createdAt: i.created_at, updatedAt: i.updated_at,
  }));

  const inspectionLog: InspectionLogEntry[] = (ilRes.data ?? []).map((il) => ({
    id: il.id, inspectionId: il.inspection_id, inspectionDate: il.inspection_date,
    conductedBy: il.conducted_by, result: il.result,
    notes: il.notes ?? null, nextDue: il.next_due ?? null, createdAt: il.created_at,
  }));

  const seasonalTasks: SeasonalTask[] = (stRes.data ?? []).map((t) => ({
    id: t.id, title: t.title, detail: t.detail ?? null, phase: t.phase,
    isComplete: t.is_complete, completedBy: t.completed_by ?? null,
    completedDate: t.completed_date ?? null, assignees: t.assignees ?? [],
    sortOrder: t.sort_order, createdAt: t.created_at, updatedAt: t.updated_at,
  }));

  return { readings, equipment, serviceLog, inspections, inspectionLog, seasonalTasks };
}

export async function loadPoolFromSupabase() {
  try {
    return await loadPoolData();
  } catch (e) {
    console.error('[Supabase] loadPoolFromSupabase threw:', e);
    return null;
  }
}

let poolChannelCount = 0;

export function subscribeToPool(onUpdate: PoolDataCallback): () => void {
  const channelName = `pool-channel-${++poolChannelCount}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_chemical_readings' }, async () => {
      const data = await loadPoolData();
      onUpdate(data);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_equipment' }, async () => {
      const data = await loadPoolData();
      onUpdate(data);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_seasonal_tasks' }, async () => {
      const data = await loadPoolData();
      onUpdate(data);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_inspections' }, async () => {
      const data = await loadPoolData();
      onUpdate(data);
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
