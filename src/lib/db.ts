/**
 * Supabase sync layer.
 * - initializeSupabase(): on app load, seeds DB from seedData if empty, then loads into stores.
 * - Individual write functions mirror each Zustand mutation to Supabase.
 */

import { supabase } from './supabase';
import { SEED_USERS } from './seedData';
import type {
  Issue, ChecklistTask, ActivityEntry, Season,
  CampPool, ChemicalReading, PoolEquipment, ServiceLogEntry,
  PoolInspection, InspectionLogEntry, SeasonalTask,
  SafetyItem, SafetyInspectionLog, EmergencyDrill,
  SafetyStaff, StaffCertification, SafetyTempLog, SafetyLicense,
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
        acaInspectionDate: seasonRows[0].aca_inspection_date ?? null,
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
    aca_inspection_date: season.acaInspectionDate ?? null,
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
    id: r.id, pool_id: r.poolId, free_chlorine: r.freeChlorine, ph: r.ph, alkalinity: r.alkalinity,
    cyanuric_acid: r.cyanuricAcid, water_temp: r.waterTemp, calcium_hardness: r.calciumHardness,
    reading_time: r.readingTime, logged_by_id: r.loggedById, logged_by_name: r.loggedByName,
    corrective_action: r.correctiveAction, pool_status: r.poolStatus, created_at: r.createdAt,
  });
  if (error) console.error('dbAddChemicalReading error:', error.message);
}

export async function dbAddEquipment(e: PoolEquipment) {
  const { error } = await supabase.from('pool_equipment').insert({
    id: e.id, pool_id: e.poolId, name: e.name, type: e.type, status: e.status,
    status_detail: e.statusDetail, last_serviced: e.lastServiced,
    next_service_due: e.nextServiceDue, vendor: e.vendor,
    specs: e.specs, created_at: e.createdAt, updated_at: e.updatedAt,
  });
  if (error) console.error('dbAddEquipment error:', error.message);
}

export async function dbUpdateEquipment(e: PoolEquipment) {
  const { error } = await supabase.from('pool_equipment').update({
    name: e.name, type: e.type, status: e.status, status_detail: e.statusDetail,
    last_serviced: e.lastServiced, next_service_due: e.nextServiceDue,
    vendor: e.vendor, specs: e.specs, updated_at: new Date().toISOString(),
  }).eq('id', e.id);
  if (error) console.error('dbUpdateEquipment error:', error.message);
}

export async function dbDeleteEquipment(id: string) {
  const { error } = await supabase.from('pool_equipment').delete().eq('id', id);
  if (error) console.error('dbDeleteEquipment error:', error.message);
}

export async function dbAddServiceLog(entry: ServiceLogEntry) {
  const { error } = await supabase.from('pool_service_log').insert({
    id: entry.id, pool_id: entry.poolId, equipment_id: entry.equipmentId,
    service_type: entry.serviceType, date_performed: entry.datePerformed,
    performed_by: entry.performedBy, notes: entry.notes, cost: entry.cost,
    next_service_due: entry.nextServiceDue, created_at: entry.createdAt,
  });
  if (error) console.error('dbAddServiceLog error:', error.message);
}

export async function dbUpdateServiceLog(id: string, patch: Partial<ServiceLogEntry>) {
  const row: Record<string, unknown> = {};
  if (patch.equipmentId !== undefined) row.equipment_id = patch.equipmentId;
  if (patch.serviceType !== undefined) row.service_type = patch.serviceType;
  if (patch.datePerformed !== undefined) row.date_performed = patch.datePerformed;
  if (patch.performedBy !== undefined) row.performed_by = patch.performedBy;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.cost !== undefined) row.cost = patch.cost;
  if (patch.nextServiceDue !== undefined) row.next_service_due = patch.nextServiceDue;
  const { error } = await supabase.from('pool_service_log').update(row).eq('id', id);
  if (error) console.error('dbUpdateServiceLog error:', error.message);
}

export async function dbDeleteServiceLog(id: string) {
  const { error } = await supabase.from('pool_service_log').delete().eq('id', id);
  if (error) console.error('dbDeleteServiceLog error:', error.message);
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
    id: entry.id, pool_id: entry.poolId, inspection_id: inspectionId,
    inspection_date: entry.inspectionDate, conducted_by: entry.conductedBy,
    result: entry.result, notes: entry.notes, next_due: entry.nextDue, created_at: entry.createdAt,
  });
  if (error) console.error('dbAddInspectionLog error:', error.message);
}

export async function dbAddSeasonalTask(task: SeasonalTask) {
  const { error } = await supabase.from('pool_seasonal_tasks').insert({
    id: task.id, pool_id: task.poolId, title: task.title, detail: task.detail,
    phase: task.phase, is_complete: task.isComplete, completed_by: task.completedBy,
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
  pools: CampPool[];
  readings: ChemicalReading[];
  equipment: PoolEquipment[];
  serviceLog: ServiceLogEntry[];
  inspections: PoolInspection[];
  inspectionLog: InspectionLogEntry[];
  seasonalTasks: SeasonalTask[];
}) => void;

async function loadPoolData() {
  const [poolRes, rRes, eRes, slRes, iRes, ilRes, stRes] = await Promise.all([
    supabase.from('pools').select('*').order('sort_order', { ascending: true }),
    supabase.from('pool_chemical_readings').select('*').order('reading_time', { ascending: false }),
    supabase.from('pool_equipment').select('*').order('created_at', { ascending: true }),
    supabase.from('pool_service_log').select('*').order('created_at', { ascending: false }),
    supabase.from('pool_inspections').select('*').order('created_at', { ascending: true }),
    supabase.from('pool_inspection_log').select('*').order('created_at', { ascending: false }),
    supabase.from('pool_seasonal_tasks').select('*').order('sort_order', { ascending: true }),
  ]);

  const pools: CampPool[] = (poolRes.data ?? []).map((p) => ({
    id: p.id, name: p.name, type: p.type, isActive: p.is_active,
    notes: p.notes ?? null, sortOrder: p.sort_order,
    createdAt: p.created_at, updatedAt: p.updated_at,
  }));

  const readings: ChemicalReading[] = (rRes.data ?? []).map((r) => ({
    id: r.id, poolId: r.pool_id, freeChlorine: r.free_chlorine, ph: r.ph,
    alkalinity: r.alkalinity, cyanuricAcid: r.cyanuric_acid, waterTemp: r.water_temp,
    calciumHardness: r.calcium_hardness ?? null,
    readingTime: r.reading_time ?? r.created_at,
    loggedById: r.logged_by_id, loggedByName: r.logged_by_name,
    correctiveAction: r.corrective_action ?? null, poolStatus: r.pool_status,
    createdAt: r.created_at,
  }));

  const equipment: PoolEquipment[] = (eRes.data ?? []).map((e) => ({
    id: e.id, poolId: e.pool_id, name: e.name, type: e.type, status: e.status,
    statusDetail: e.status_detail ?? '', lastServiced: e.last_serviced ?? null,
    nextServiceDue: e.next_service_due ?? null, vendor: e.vendor ?? null,
    specs: e.specs ?? null, createdAt: e.created_at, updatedAt: e.updated_at,
  }));

  const serviceLog: ServiceLogEntry[] = (slRes.data ?? []).map((s) => ({
    id: s.id, poolId: s.pool_id, equipmentId: s.equipment_id, serviceType: s.service_type,
    datePerformed: s.date_performed, performedBy: s.performed_by,
    notes: s.notes ?? null, cost: s.cost ?? null,
    nextServiceDue: s.next_service_due ?? null, createdAt: s.created_at,
  }));

  const inspections: PoolInspection[] = (iRes.data ?? []).map((i) => ({
    id: i.id, poolId: i.pool_id, name: i.name, frequency: i.frequency, authority: i.authority,
    standard: i.standard ?? null, status: i.status,
    lastCompleted: i.last_completed ?? null, nextDue: i.next_due ?? null,
    history: i.history ?? [], createdAt: i.created_at, updatedAt: i.updated_at,
  }));

  const inspectionLog: InspectionLogEntry[] = (ilRes.data ?? []).map((il) => ({
    id: il.id, poolId: il.pool_id, inspectionId: il.inspection_id,
    inspectionDate: il.inspection_date, conductedBy: il.conducted_by, result: il.result,
    notes: il.notes ?? null, nextDue: il.next_due ?? null, createdAt: il.created_at,
  }));

  const seasonalTasks: SeasonalTask[] = (stRes.data ?? []).map((t) => ({
    id: t.id, poolId: t.pool_id, title: t.title, detail: t.detail ?? null, phase: t.phase,
    isComplete: t.is_complete, completedBy: t.completed_by ?? null,
    completedDate: t.completed_date ?? null, assignees: t.assignees ?? [],
    sortOrder: t.sort_order, createdAt: t.created_at, updatedAt: t.updated_at,
  }));

  return { pools, readings, equipment, serviceLog, inspections, inspectionLog, seasonalTasks };
}

export async function loadPoolFromSupabase() {
  try {
    return await loadPoolData();
  } catch (e) {
    console.error('[Supabase] loadPoolFromSupabase threw:', e);
    return null;
  }
}

// ─── Pool CRUD ────────────────────────────────────────────────────────────────

export async function dbAddPool(pool: CampPool) {
  const { error } = await supabase.from('pools').insert({
    id: pool.id, name: pool.name, type: pool.type, is_active: pool.isActive,
    notes: pool.notes, sort_order: pool.sortOrder,
    created_at: pool.createdAt, updated_at: pool.updatedAt,
  });
  if (error) console.error('dbAddPool error:', error.message);
}

export async function dbUpdatePool(pool: CampPool) {
  const { error } = await supabase.from('pools').update({
    name: pool.name, type: pool.type, is_active: pool.isActive,
    notes: pool.notes, sort_order: pool.sortOrder, updated_at: new Date().toISOString(),
  }).eq('id', pool.id);
  if (error) console.error('dbUpdatePool error:', error.message);
}

export async function dbDeletePool(id: string) {
  const { error } = await supabase.from('pools').delete().eq('id', id);
  if (error) console.error('dbDeletePool error:', error.message);
}

export async function dbDeleteAllPoolData() {
  // Delete in dependency order
  await supabase.from('pool_inspection_log').delete().neq('id', '');
  await supabase.from('pool_service_log').delete().neq('id', '');
  await supabase.from('pool_seasonal_tasks').delete().neq('id', '');
  await supabase.from('pool_inspections').delete().neq('id', '');
  await supabase.from('pool_equipment').delete().neq('id', '');
  await supabase.from('pool_chemical_readings').delete().neq('id', '');
  await supabase.from('pools').delete().neq('id', '');
}

let poolChannelCount = 0;

export function subscribeToPool(onUpdate: PoolDataCallback): () => void {
  const channelName = `pool-channel-${++poolChannelCount}`;
  const tables = ['pools', 'pool_chemical_readings', 'pool_equipment', 'pool_service_log', 'pool_seasonal_tasks', 'pool_inspections', 'pool_inspection_log'];
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, async () => {
      const data = await loadPoolData();
      onUpdate(data);
    });
  }
  channel.subscribe();

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

// ─── Safety & Compliance ──────────────────────────────────────────────────────

type SafetyData = {
  items: SafetyItem[];
  inspectionLog: SafetyInspectionLog[];
  drills: EmergencyDrill[];
  staff: SafetyStaff[];
  certifications: StaffCertification[];
  tempLogs: SafetyTempLog[];
  licenses: SafetyLicense[];
};

function rowToSafetyItem(r: Record<string, unknown>): SafetyItem {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as SafetyItem['category'],
    type: r.type as SafetyItem['type'],
    location: (r.location as string) ?? '',
    unitCount: (r.unit_count as number) ?? 1,
    frequency: r.frequency as SafetyItem['frequency'],
    frequencyDays: r.frequency_days as number,
    lastInspected: (r.last_inspected as string) ?? null,
    nextDue: (r.next_due as string) ?? null,
    vendor: (r.vendor as string) ?? null,
    notes: (r.notes as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToSafetyLog(r: Record<string, unknown>): SafetyInspectionLog {
  return {
    id: r.id as string,
    itemId: (r.item_id as string) ?? null,
    category: r.category as SafetyInspectionLog['category'],
    locationNote: (r.location_note as string) ?? '',
    inspectionDate: r.inspection_date as string,
    completedBy: r.completed_by as string,
    result: r.result as SafetyInspectionLog['result'],
    notes: (r.notes as string) ?? null,
    cost: (r.cost as number) ?? null,
    nextDue: (r.next_due as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToDrill(r: Record<string, unknown>): EmergencyDrill {
  return {
    id: r.id as string,
    drillType: r.drill_type as EmergencyDrill['drillType'],
    drillName: (r.drill_name as string) ?? null,
    status: r.status as EmergencyDrill['status'],
    scheduledDate: r.scheduled_date as string,
    completedDate: (r.completed_date as string) ?? null,
    lead: (r.lead as string) ?? '',
    participantCount: (r.participant_count as number) ?? null,
    responseTime: (r.response_time as string) ?? null,
    allAccounted: (r.all_accounted as boolean) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToSafetyStaff(r: Record<string, unknown>): SafetyStaff {
  return {
    id: r.id as string,
    name: r.name as string,
    title: (r.title as string) ?? '',
    isActive: (r.is_active as boolean) ?? true,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToCert(r: Record<string, unknown>): StaffCertification {
  return {
    id: r.id as string,
    staffId: r.staff_id as string,
    certType: r.cert_type as StaffCertification['certType'],
    certName: r.cert_name as string,
    issuedDate: (r.issued_date as string) ?? null,
    expiryDate: (r.expiry_date as string) ?? null,
    provider: (r.provider as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToTempLog(r: Record<string, unknown>): SafetyTempLog {
  return {
    id: r.id as string,
    itemId: r.item_id as string,
    logDate: r.log_date as string,
    session: r.session as 'am' | 'pm',
    temperature: r.temperature as number,
    inRange: r.in_range as boolean,
    loggedBy: r.logged_by as string,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToLicense(r: Record<string, unknown>): SafetyLicense {
  return {
    id: r.id as string,
    name: r.name as string,
    licenseType: r.license_type as SafetyLicense['licenseType'],
    issuingAuthority: (r.issuing_authority as string) ?? null,
    licenseNumber: (r.license_number as string) ?? null,
    issuedDate: (r.issued_date as string) ?? null,
    expiryDate: (r.expiry_date as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

async function loadSafetyData(): Promise<SafetyData> {
  const [itemsRes, logRes, drillsRes, staffRes, certsRes, tempRes, licRes] = await Promise.all([
    supabase.from('safety_items').select('*').order('created_at', { ascending: true }),
    supabase.from('safety_inspection_log').select('*').order('created_at', { ascending: false }),
    supabase.from('safety_drills').select('*').order('scheduled_date', { ascending: true }),
    supabase.from('safety_staff').select('*').order('name', { ascending: true }),
    supabase.from('staff_certifications').select('*').order('created_at', { ascending: false }),
    supabase.from('safety_temp_logs').select('*').order('log_date', { ascending: false }),
    supabase.from('safety_licenses').select('*').order('name', { ascending: true }),
  ]);

  return {
    items: (itemsRes.data ?? []).map((r) => rowToSafetyItem(r as Record<string, unknown>)),
    inspectionLog: (logRes.data ?? []).map((r) => rowToSafetyLog(r as Record<string, unknown>)),
    drills: (drillsRes.data ?? []).map((r) => rowToDrill(r as Record<string, unknown>)),
    staff: (staffRes.data ?? []).map((r) => rowToSafetyStaff(r as Record<string, unknown>)),
    certifications: (certsRes.data ?? []).map((r) => rowToCert(r as Record<string, unknown>)),
    tempLogs: (tempRes.data ?? []).map((r) => rowToTempLog(r as Record<string, unknown>)),
    licenses: (licRes.data ?? []).map((r) => rowToLicense(r as Record<string, unknown>)),
  };
}

export async function loadSafetyFromSupabase(): Promise<SafetyData | null> {
  try {
    return await loadSafetyData();
  } catch (e) {
    console.error('[Supabase] loadSafetyFromSupabase threw:', e);
    return null;
  }
}

export async function dbAddSafetyItem(item: SafetyItem) {
  const { error } = await supabase.from('safety_items').insert({
    id: item.id, name: item.name, category: item.category, type: item.type,
    location: item.location, unit_count: item.unitCount, frequency: item.frequency,
    frequency_days: item.frequencyDays, last_inspected: item.lastInspected,
    next_due: item.nextDue, vendor: item.vendor, notes: item.notes,
    metadata: item.metadata, created_at: item.createdAt, updated_at: item.updatedAt,
  });
  if (error) console.error('dbAddSafetyItem error:', error.message);
}

export async function dbUpdateSafetyItem(id: string, patch: Partial<SafetyItem>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.unitCount !== undefined) row.unit_count = patch.unitCount;
  if (patch.frequency !== undefined) row.frequency = patch.frequency;
  if (patch.frequencyDays !== undefined) row.frequency_days = patch.frequencyDays;
  if (patch.lastInspected !== undefined) row.last_inspected = patch.lastInspected;
  if (patch.nextDue !== undefined) row.next_due = patch.nextDue;
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;
  const { error } = await supabase.from('safety_items').update(row).eq('id', id);
  if (error) console.error('dbUpdateSafetyItem error:', error.message);
}

export async function dbAddSafetyInspectionLog(entry: SafetyInspectionLog) {
  const { error } = await supabase.from('safety_inspection_log').insert({
    id: entry.id, item_id: entry.itemId, category: entry.category,
    location_note: entry.locationNote, inspection_date: entry.inspectionDate,
    completed_by: entry.completedBy, result: entry.result, notes: entry.notes,
    cost: entry.cost, next_due: entry.nextDue, created_at: entry.createdAt,
  });
  if (error) console.error('dbAddSafetyInspectionLog error:', error.message);
}

export async function dbUpdateSafetyInspectionLog(id: string, patch: Partial<SafetyInspectionLog>) {
  const row: Record<string, unknown> = {};
  if (patch.itemId !== undefined) row.item_id = patch.itemId;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.locationNote !== undefined) row.location_note = patch.locationNote;
  if (patch.inspectionDate !== undefined) row.inspection_date = patch.inspectionDate;
  if (patch.completedBy !== undefined) row.completed_by = patch.completedBy;
  if (patch.result !== undefined) row.result = patch.result;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.cost !== undefined) row.cost = patch.cost;
  if (patch.nextDue !== undefined) row.next_due = patch.nextDue;
  const { error } = await supabase.from('safety_inspection_log').update(row).eq('id', id);
  if (error) console.error('dbUpdateSafetyInspectionLog error:', error.message);
}

export async function dbDeleteSafetyInspectionLog(id: string) {
  const { error } = await supabase.from('safety_inspection_log').delete().eq('id', id);
  if (error) console.error('dbDeleteSafetyInspectionLog error:', error.message);
}

export async function dbAddSafetyDrill(drill: EmergencyDrill) {
  const { error } = await supabase.from('safety_drills').insert({
    id: drill.id, drill_type: drill.drillType, drill_name: drill.drillName,
    status: drill.status, scheduled_date: drill.scheduledDate,
    completed_date: drill.completedDate, lead: drill.lead,
    participant_count: drill.participantCount, response_time: drill.responseTime,
    all_accounted: drill.allAccounted, notes: drill.notes,
    created_at: drill.createdAt, updated_at: drill.updatedAt,
  });
  if (error) console.error('dbAddSafetyDrill error:', error.message);
}

export async function dbUpdateSafetyDrill(id: string, patch: Partial<EmergencyDrill>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.drillType !== undefined) row.drill_type = patch.drillType;
  if (patch.drillName !== undefined) row.drill_name = patch.drillName;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.scheduledDate !== undefined) row.scheduled_date = patch.scheduledDate;
  if (patch.completedDate !== undefined) row.completed_date = patch.completedDate;
  if (patch.lead !== undefined) row.lead = patch.lead;
  if (patch.participantCount !== undefined) row.participant_count = patch.participantCount;
  if (patch.responseTime !== undefined) row.response_time = patch.responseTime;
  if (patch.allAccounted !== undefined) row.all_accounted = patch.allAccounted;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { error } = await supabase.from('safety_drills').update(row).eq('id', id);
  if (error) console.error('dbUpdateSafetyDrill error:', error.message);
}

export async function dbDeleteSafetyDrill(id: string) {
  const { error } = await supabase.from('safety_drills').delete().eq('id', id);
  if (error) console.error('dbDeleteSafetyDrill error:', error.message);
}

export async function dbDeleteSafetyItem(id: string) {
  const { error } = await supabase.from('safety_items').delete().eq('id', id);
  if (error) console.error('dbDeleteSafetyItem error:', error.message);
}

export async function dbDeleteSafetyStaff(id: string) {
  const { error } = await supabase.from('safety_staff').delete().eq('id', id);
  if (error) console.error('dbDeleteSafetyStaff error:', error.message);
}

export async function dbAddSafetyStaff(staff: SafetyStaff) {
  const { error } = await supabase.from('safety_staff').insert({
    id: staff.id, name: staff.name, title: staff.title,
    is_active: staff.isActive, created_at: staff.createdAt, updated_at: staff.updatedAt,
  });
  if (error) console.error('dbAddSafetyStaff error:', error.message);
}

export async function dbUpdateSafetyStaff(id: string, patch: Partial<SafetyStaff>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  const { error } = await supabase.from('safety_staff').update(row).eq('id', id);
  if (error) console.error('dbUpdateSafetyStaff error:', error.message);
}

export async function dbAddStaffCert(cert: StaffCertification) {
  const { error } = await supabase.from('staff_certifications').insert({
    id: cert.id, staff_id: cert.staffId, cert_type: cert.certType,
    cert_name: cert.certName, issued_date: cert.issuedDate, expiry_date: cert.expiryDate,
    provider: cert.provider, notes: cert.notes,
    created_at: cert.createdAt, updated_at: cert.updatedAt,
  });
  if (error) console.error('dbAddStaffCert error:', error.message);
}

export async function dbUpdateStaffCert(id: string, patch: Partial<StaffCertification>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.certType !== undefined) row.cert_type = patch.certType;
  if (patch.certName !== undefined) row.cert_name = patch.certName;
  if (patch.issuedDate !== undefined) row.issued_date = patch.issuedDate;
  if (patch.expiryDate !== undefined) row.expiry_date = patch.expiryDate;
  if (patch.provider !== undefined) row.provider = patch.provider;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { error } = await supabase.from('staff_certifications').update(row).eq('id', id);
  if (error) console.error('dbUpdateStaffCert error:', error.message);
}

export async function dbDeleteStaffCert(id: string) {
  const { error } = await supabase.from('staff_certifications').delete().eq('id', id);
  if (error) console.error('dbDeleteStaffCert error:', error.message);
}

export async function dbAddSafetyTempLog(log: SafetyTempLog) {
  const { error } = await supabase.from('safety_temp_logs').insert({
    id: log.id, item_id: log.itemId, log_date: log.logDate, session: log.session,
    temperature: log.temperature, in_range: log.inRange, logged_by: log.loggedBy,
    notes: log.notes, created_at: log.createdAt,
  });
  if (error) console.error('dbAddSafetyTempLog error:', error.message);
}

export async function dbUpdateSafetyTempLog(id: string, patch: Partial<SafetyTempLog>) {
  const col: Record<string, unknown> = {};
  if (patch.temperature !== undefined) col.temperature = patch.temperature;
  if (patch.session !== undefined) col.session = patch.session;
  if (patch.logDate !== undefined) col.log_date = patch.logDate;
  if (patch.loggedBy !== undefined) col.logged_by = patch.loggedBy;
  if (patch.inRange !== undefined) col.in_range = patch.inRange;
  if (patch.notes !== undefined) col.notes = patch.notes;
  const { error } = await supabase.from('safety_temp_logs').update(col).eq('id', id);
  if (error) console.error('dbUpdateSafetyTempLog error:', error.message);
}

export async function dbDeleteSafetyTempLog(id: string) {
  const { error } = await supabase.from('safety_temp_logs').delete().eq('id', id);
  if (error) console.error('dbDeleteSafetyTempLog error:', error.message);
}

export async function dbAddSafetyLicense(lic: SafetyLicense) {
  const { error } = await supabase.from('safety_licenses').insert({
    id: lic.id, name: lic.name, license_type: lic.licenseType,
    issuing_authority: lic.issuingAuthority, license_number: lic.licenseNumber,
    issued_date: lic.issuedDate, expiry_date: lic.expiryDate,
    notes: lic.notes, created_at: lic.createdAt, updated_at: lic.updatedAt,
  });
  if (error) console.error('dbAddSafetyLicense error:', error.message);
}

export async function dbUpdateSafetyLicense(id: string, patch: Partial<SafetyLicense>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.licenseType !== undefined) row.license_type = patch.licenseType;
  if (patch.issuingAuthority !== undefined) row.issuing_authority = patch.issuingAuthority;
  if (patch.licenseNumber !== undefined) row.license_number = patch.licenseNumber;
  if (patch.issuedDate !== undefined) row.issued_date = patch.issuedDate;
  if (patch.expiryDate !== undefined) row.expiry_date = patch.expiryDate;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { error } = await supabase.from('safety_licenses').update(row).eq('id', id);
  if (error) console.error('dbUpdateSafetyLicense error:', error.message);
}

export async function dbDeleteSafetyLicense(id: string) {
  const { error } = await supabase.from('safety_licenses').delete().eq('id', id);
  if (error) console.error('dbDeleteSafetyLicense error:', error.message);
}

let safetyChannelCount = 0;

type SafetyDataCallback = (data: SafetyData) => void;

export function subscribeToSafety(onUpdate: SafetyDataCallback): () => void {
  const channelName = `safety-channel-${++safetyChannelCount}`;
  const reload = async () => { onUpdate(await loadSafetyData()); };
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_items' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_inspection_log' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_drills' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_staff' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_certifications' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_temp_logs' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_licenses' }, reload)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
