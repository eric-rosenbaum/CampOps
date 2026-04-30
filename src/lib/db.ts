import { supabase } from './supabase';
import type {
  Issue, ChecklistTask, ActivityEntry, Season,
  CampPool, ChemicalReading, PoolEquipment, ServiceLogEntry,
  PoolInspection, InspectionLogEntry, SeasonalTask,
  SafetyItem, SafetyInspectionLog, EmergencyDrill,
  SafetyStaff, StaffCertification, SafetyTempLog, SafetyLicense,
  CampAsset, AssetCheckout, AssetServiceRecord, AssetMaintenanceTask,
} from './types';

// ─── Camp ID ──────────────────────────────────────────────────────────────────
// Set by campStore when a camp is selected, used by all write functions.
let _campId = '';
export function setCampId(id: string) { _campId = id; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function issueToRow(issue: Issue) {
  return {
    id: issue.id,
    camp_id: _campId,
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
    camp_id: _campId,
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
    module_tag: task.moduleTag ?? null,
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
    daysRelativeToOpening: row.days_relative_to_opening as number | null,
    dueDate: (row.due_date as string) ?? null,
    isRecurring: true,
    moduleTag: (row.module_tag as string) ?? null,
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

export async function initializeSupabase(campId: string): Promise<{
  issues: Issue[];
  tasks: ChecklistTask[];
  season: Season | null;
} | null> {
  try {
    const [issueRows, activityRows, taskRows, taskActivityRows, seasonRows] = await Promise.all([
      supabase.from('issues').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
      supabase.from('issue_activity').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
      supabase.from('checklist_tasks').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
      supabase.from('checklist_activity').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
      supabase.from('seasons').select('*').eq('camp_id', campId).order('created_at', { ascending: false }).limit(1),
    ]);

    const issues: Issue[] = (issueRows.data ?? []).map((row) => {
      const log = (activityRows.data ?? [])
        .filter((a) => a.issue_id === row.id)
        .map(activityRowToEntry);
      return rowToIssue(row as Record<string, unknown>, log);
    });

    const tasks: ChecklistTask[] = (taskRows.data ?? []).map((row) => {
      const log = (taskActivityRows.data ?? [])
        .filter((a) => a.task_id === row.id)
        .map(activityRowToEntry);
      return rowToTask(row as Record<string, unknown>, log);
    });

    const season: Season | null = seasonRows.data?.[0]
      ? {
          id: seasonRows.data[0].id,
          name: seasonRows.data[0].name,
          openingDate: seasonRows.data[0].opening_date,
          closingDate: seasonRows.data[0].closing_date,
          acaInspectionDate: seasonRows.data[0].aca_inspection_date ?? null,
        }
      : null;

    return { issues, tasks, season };
  } catch (e) {
    console.error('[Supabase] initializeSupabase threw:', e);
    return null;
  }
}

// ─── Write functions ──────────────────────────────────────────────────────────

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
    camp_id: _campId,
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
  if (patch.phase !== undefined) row.phase = patch.phase;
  if (patch.daysRelativeToOpening !== undefined) row.days_relative_to_opening = patch.daysRelativeToOpening;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.moduleTag !== undefined) row.module_tag = patch.moduleTag;
  const { error } = await supabase.from('checklist_tasks').update(row).eq('id', id);
  if (error) console.error('dbUpdateTask error:', error.message);
}

export async function dbAddTaskActivity(taskId: string, entry: ActivityEntry) {
  const { error } = await supabase.from('checklist_activity').insert({
    id: entry.id,
    camp_id: _campId,
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
    camp_id: _campId,
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
  const path = `${_campId}/${issueId}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) {
    console.error('[Supabase] Photo upload error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
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

let issueChannelCount = 0;
let taskChannelCount = 0;

export function subscribeToIssues(campId: string, onUpdate: IssueCallback, onEventStart?: () => void): () => void {
  const channelName = `issues-channel-${++issueChannelCount}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issues', filter: `camp_id=eq.${campId}` }, async () => {
      onEventStart?.();
      const { data: issueRows } = await supabase.from('issues').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
      const { data: activityRows } = await supabase.from('issue_activity').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
      const issues: Issue[] = (issueRows ?? []).map((row) => {
        const log = (activityRows ?? []).filter((a) => a.issue_id === row.id).map(activityRowToEntry);
        return rowToIssue(row as Record<string, unknown>, log);
      });
      onUpdate(issues);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function subscribeToTasks(campId: string, onUpdate: TaskCallback, onEventStart?: () => void): () => void {
  const channelName = `tasks-channel-${++taskChannelCount}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_tasks', filter: `camp_id=eq.${campId}` }, async () => {
      onEventStart?.();
      const { data: taskRows } = await supabase.from('checklist_tasks').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
      const { data: taskActivityRows } = await supabase.from('checklist_activity').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
      const tasks: ChecklistTask[] = (taskRows ?? []).map((row) => {
        const log = (taskActivityRows ?? []).filter((a) => a.task_id === row.id).map(activityRowToEntry);
        return rowToTask(row as Record<string, unknown>, log);
      });
      onUpdate(tasks);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ─── Pool write functions ─────────────────────────────────────────────────────

export async function dbAddChemicalReading(r: ChemicalReading) {
  const { error } = await supabase.from('pool_chemical_readings').insert({
    id: r.id, camp_id: _campId, pool_id: r.poolId, free_chlorine: r.freeChlorine, ph: r.ph,
    alkalinity: r.alkalinity, cyanuric_acid: r.cyanuricAcid, water_temp: r.waterTemp,
    calcium_hardness: r.calciumHardness, reading_time: r.readingTime,
    logged_by_id: r.loggedById, logged_by_name: r.loggedByName,
    corrective_action: r.correctiveAction, pool_status: r.poolStatus, created_at: r.createdAt,
  });
  if (error) console.error('dbAddChemicalReading error:', error.message);
}

export async function dbUpdateChemicalReading(id: string, r: Partial<ChemicalReading>) {
  const patch: Record<string, unknown> = {};
  if (r.freeChlorine !== undefined) patch.free_chlorine = r.freeChlorine;
  if (r.ph !== undefined) patch.ph = r.ph;
  if (r.alkalinity !== undefined) patch.alkalinity = r.alkalinity;
  if (r.cyanuricAcid !== undefined) patch.cyanuric_acid = r.cyanuricAcid;
  if (r.waterTemp !== undefined) patch.water_temp = r.waterTemp;
  if (r.calciumHardness !== undefined) patch.calcium_hardness = r.calciumHardness;
  if (r.readingTime !== undefined) patch.reading_time = r.readingTime;
  if (r.correctiveAction !== undefined) patch.corrective_action = r.correctiveAction;
  if (r.poolStatus !== undefined) patch.pool_status = r.poolStatus;
  const { error } = await supabase.from('pool_chemical_readings').update(patch).eq('id', id);
  if (error) console.error('dbUpdateChemicalReading error:', error.message);
}

export async function dbDeleteChemicalReading(id: string) {
  const { error } = await supabase.from('pool_chemical_readings').delete().eq('id', id);
  if (error) console.error('dbDeleteChemicalReading error:', error.message);
}

export async function dbAddEquipment(e: PoolEquipment) {
  const row = {
    id: e.id, camp_id: _campId, pool_id: e.poolId, name: e.name, type: e.type, status: e.status,
    status_detail: e.statusDetail, last_serviced: e.lastServiced,
    next_service_due: e.nextServiceDue, vendor: e.vendor,
    specs: e.specs, created_at: e.createdAt, updated_at: e.updatedAt,
  };
  console.log('[dbAddEquipment] inserting', row);
  const { data, error } = await supabase.from('pool_equipment').insert(row).select();
  if (error) console.error('[dbAddEquipment] error:', error.code, error.message, error.details, error.hint);
  else console.log('[dbAddEquipment] success:', data);
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
    id: entry.id, camp_id: _campId, pool_id: entry.poolId, equipment_id: entry.equipmentId,
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
  const inspectionId = knownInspectionIds.includes(entry.inspectionId) ? entry.inspectionId : null;
  const row = {
    id: entry.id, camp_id: _campId, pool_id: entry.poolId, inspection_id: inspectionId,
    inspection_date: entry.inspectionDate, conducted_by: entry.conductedBy,
    result: entry.result, notes: entry.notes, next_due: entry.nextDue, created_at: entry.createdAt,
  };
  console.log('[dbAddInspectionLog] inserting', row);
  const { data, error } = await supabase.from('pool_inspection_log').insert(row).select();
  if (error) console.error('[dbAddInspectionLog] error:', error.code, error.message, error.details, error.hint);
  else console.log('[dbAddInspectionLog] success:', data);
}

export async function dbAddSeasonalTask(task: SeasonalTask) {
  const { error } = await supabase.from('pool_seasonal_tasks').insert({
    id: task.id, camp_id: _campId, pool_id: task.poolId, title: task.title,
    detail: task.detail, phase: task.phase, is_complete: task.isComplete,
    completed_by: task.completedBy, completed_date: task.completedDate,
    assignees: task.assignees, sort_order: task.sortOrder,
    created_at: task.createdAt, updated_at: task.updatedAt,
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

async function loadPoolData(campId: string) {
  const [poolRes, rRes, eRes, slRes, iRes, ilRes, stRes] = await Promise.all([
    supabase.from('pools').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('pool_chemical_readings').select('*').eq('camp_id', campId).order('reading_time', { ascending: false }),
    supabase.from('pool_equipment').select('*').eq('camp_id', campId).order('created_at', { ascending: true }),
    supabase.from('pool_service_log').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
    supabase.from('pool_inspections').select('*').eq('camp_id', campId).order('created_at', { ascending: true }),
    supabase.from('pool_inspection_log').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
    supabase.from('pool_seasonal_tasks').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
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

export async function loadPoolFromSupabase(campId: string) {
  try {
    return await loadPoolData(campId);
  } catch (e) {
    console.error('[Supabase] loadPoolFromSupabase threw:', e);
    return null;
  }
}

// ─── Pool CRUD ────────────────────────────────────────────────────────────────

const POOL_DEFAULT_INSPECTIONS: { name: string; frequency: string; authority: string | null; standard: string | null; poolTypes: string[] }[] = [
  { name: 'Health dept. water quality inspection', frequency: 'Every 30 days', authority: 'County Health Department', standard: 'State law required', poolTypes: ['pool', 'other'] },
  { name: 'Pool equipment monthly service check', frequency: 'Monthly', authority: null, standard: null, poolTypes: ['pool', 'other'] },
  { name: 'ACA waterfront safety inspection', frequency: 'Weekly during session', authority: 'Internal', standard: 'ACA Standard WS-4', poolTypes: ['waterfront', 'lake', 'river', 'pond'] },
  { name: 'Lifeguard certification verification', frequency: 'Before each session', authority: 'ACA & Red Cross', standard: null, poolTypes: ['pool', 'waterfront', 'lake', 'river', 'pond', 'other'] },
  { name: 'Pre-season opening inspection', frequency: 'Annual', authority: null, standard: null, poolTypes: ['pool', 'waterfront', 'lake', 'river', 'pond', 'other'] },
];

export async function dbAddPool(pool: CampPool) {
  const { error } = await supabase.from('pools').insert({
    id: pool.id, camp_id: _campId, name: pool.name, type: pool.type, is_active: pool.isActive,
    notes: pool.notes, sort_order: pool.sortOrder,
    created_at: pool.createdAt, updated_at: pool.updatedAt,
  });
  if (error) { console.error('dbAddPool error:', error.message); return; }

  const now = new Date().toISOString();
  const inspections = POOL_DEFAULT_INSPECTIONS
    .filter((t) => t.poolTypes.includes(pool.type))
    .map((t) => ({
      id: crypto.randomUUID(),
      camp_id: _campId, pool_id: pool.id,
      name: t.name, frequency: t.frequency, authority: t.authority, standard: t.standard,
      status: 'due', last_completed: null, next_due: new Date().toISOString().split('T')[0],
      history: [], created_at: now, updated_at: now,
    }));
  if (inspections.length > 0) {
    const { error: iErr } = await supabase.from('pool_inspections').insert(inspections);
    if (iErr) console.error('dbAddPool inspections error:', iErr.message);
  }
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
  await supabase.from('pool_inspection_log').delete().eq('camp_id', _campId);
  await supabase.from('pool_service_log').delete().eq('camp_id', _campId);
  await supabase.from('pool_seasonal_tasks').delete().eq('camp_id', _campId);
  await supabase.from('pool_inspections').delete().eq('camp_id', _campId);
  await supabase.from('pool_equipment').delete().eq('camp_id', _campId);
  await supabase.from('pool_chemical_readings').delete().eq('camp_id', _campId);
  await supabase.from('pools').delete().eq('camp_id', _campId);
}

let poolChannelCount = 0;

export function subscribeToPool(campId: string, onUpdate: PoolDataCallback, onEventStart?: () => void): () => void {
  const channelName = `pool-channel-${++poolChannelCount}`;
  const tables = ['pools', 'pool_chemical_readings', 'pool_equipment', 'pool_service_log', 'pool_seasonal_tasks', 'pool_inspections', 'pool_inspection_log'];
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, async () => {
      onEventStart?.();
      const data = await loadPoolData(campId);
      onUpdate(data);
    });
  }
  channel.subscribe();
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

async function loadSafetyData(campId: string): Promise<SafetyData> {
  const [itemsRes, logRes, drillsRes, staffRes, certsRes, tempRes, licRes] = await Promise.all([
    supabase.from('safety_items').select('*').eq('camp_id', campId).order('created_at', { ascending: true }),
    supabase.from('safety_inspection_log').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
    supabase.from('safety_drills').select('*').eq('camp_id', campId).order('scheduled_date', { ascending: true }),
    supabase.from('safety_staff').select('*').eq('camp_id', campId).order('name', { ascending: true }),
    supabase.from('staff_certifications').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
    supabase.from('safety_temp_logs').select('*').eq('camp_id', campId).order('log_date', { ascending: false }),
    supabase.from('safety_licenses').select('*').eq('camp_id', campId).order('name', { ascending: true }),
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

export async function loadSafetyFromSupabase(campId: string): Promise<SafetyData | null> {
  try {
    return await loadSafetyData(campId);
  } catch (e) {
    console.error('[Supabase] loadSafetyFromSupabase threw:', e);
    return null;
  }
}

export async function dbAddSafetyItem(item: SafetyItem) {
  const { error } = await supabase.from('safety_items').insert({
    id: item.id, camp_id: _campId, name: item.name, category: item.category, type: item.type,
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
    id: entry.id, camp_id: _campId, item_id: entry.itemId, category: entry.category,
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
    id: drill.id, camp_id: _campId, drill_type: drill.drillType, drill_name: drill.drillName,
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
    id: staff.id, camp_id: _campId, name: staff.name, title: staff.title,
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
    id: cert.id, camp_id: _campId, staff_id: cert.staffId, cert_type: cert.certType,
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
    id: log.id, camp_id: _campId, item_id: log.itemId, log_date: log.logDate,
    session: log.session, temperature: log.temperature, in_range: log.inRange,
    logged_by: log.loggedBy, notes: log.notes, created_at: log.createdAt,
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
    id: lic.id, camp_id: _campId, name: lic.name, license_type: lic.licenseType,
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

export function subscribeToSafety(campId: string, onUpdate: SafetyDataCallback, onEventStart?: () => void): () => void {
  const channelName = `safety-channel-${++safetyChannelCount}`;
  const reload = async () => { onEventStart?.(); onUpdate(await loadSafetyData(campId)); };
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_items', filter: `camp_id=eq.${campId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_inspection_log', filter: `camp_id=eq.${campId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_drills', filter: `camp_id=eq.${campId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_staff', filter: `camp_id=eq.${campId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_certifications', filter: `camp_id=eq.${campId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_temp_logs', filter: `camp_id=eq.${campId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_licenses', filter: `camp_id=eq.${campId}` }, reload)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ─── Assets & Vehicles ───────────────────────────────────────────────────────

function rowToAsset(r: Record<string, unknown>): CampAsset {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as CampAsset['category'],
    subtype: (r.subtype as string) ?? '',
    make: (r.make as string) ?? null,
    model: (r.model as string) ?? null,
    year: (r.year as number) ?? null,
    serialNumber: (r.serial_number as string) ?? null,
    licensePlate: (r.license_plate as string) ?? null,
    registrationExpiry: (r.registration_expiry as string) ?? null,
    storageLocation: (r.storage_location as string) ?? '',
    status: r.status as CampAsset['status'],
    currentOdometer: (r.current_odometer as number) ?? null,
    currentHours: (r.current_hours as number) ?? null,
    tracksOdometer: (r.tracks_odometer as boolean) ?? false,
    tracksHours: (r.tracks_hours as boolean) ?? false,
    notes: (r.notes as string) ?? null,
    isActive: (r.is_active as boolean) ?? true,
    hullId: (r.hull_id as string) ?? null,
    uscgRegistration: (r.uscg_registration as string) ?? null,
    uscgRegistrationExpiry: (r.uscg_registration_expiry as string) ?? null,
    capacity: (r.capacity as number) ?? null,
    motorType: (r.motor_type as string) ?? null,
    hasLifejackets: (r.has_lifejackets as boolean) ?? null,
    lifejacketCount: (r.lifejacket_count as number) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToCheckout(r: Record<string, unknown>): AssetCheckout {
  return {
    id: r.id as string,
    assetId: r.asset_id as string,
    checkedOutBy: r.checked_out_by as string,
    purpose: (r.purpose as string) ?? '',
    checkedOutAt: r.checked_out_at as string,
    expectedReturnAt: r.expected_return_at as string,
    returnedAt: (r.returned_at as string) ?? null,
    startOdometer: (r.start_odometer as number) ?? null,
    endOdometer: (r.end_odometer as number) ?? null,
    startHours: (r.start_hours as number) ?? null,
    endHours: (r.end_hours as number) ?? null,
    fuelLevelOut: (r.fuel_level_out as AssetCheckout['fuelLevelOut']) ?? null,
    fuelLevelIn: (r.fuel_level_in as AssetCheckout['fuelLevelIn']) ?? null,
    checkoutNotes: (r.checkout_notes as string) ?? null,
    returnNotes: (r.return_notes as string) ?? null,
    returnCondition: (r.return_condition as AssetCheckout['returnCondition']) ?? null,
    createdIssueId: (r.created_issue_id as string) ?? null,
    loggedBy: (r.logged_by as string) ?? '',
    createdAt: r.created_at as string,
  };
}

function rowToServiceRecord(r: Record<string, unknown>): AssetServiceRecord {
  return {
    id: r.id as string,
    assetId: r.asset_id as string,
    serviceType: r.service_type as AssetServiceRecord['serviceType'],
    datePerformed: r.date_performed as string,
    performedBy: (r.performed_by as string) ?? '',
    vendor: (r.vendor as string) ?? null,
    description: (r.description as string) ?? null,
    odometerAtService: (r.odometer_at_service as number) ?? null,
    hoursAtService: (r.hours_at_service as number) ?? null,
    cost: (r.cost as number) ?? null,
    nextServiceDate: (r.next_service_date as string) ?? null,
    nextServiceOdometer: (r.next_service_odometer as number) ?? null,
    nextServiceHours: (r.next_service_hours as number) ?? null,
    isInspection: (r.is_inspection as boolean) ?? false,
    createdAt: r.created_at as string,
  };
}

function rowToMaintenanceTask(r: Record<string, unknown>): AssetMaintenanceTask {
  return {
    id: r.id as string,
    assetId: r.asset_id as string,
    phase: r.phase as AssetMaintenanceTask['phase'],
    title: r.title as string,
    detail: (r.detail as string) ?? null,
    isComplete: (r.is_complete as boolean) ?? false,
    completedBy: (r.completed_by as string) ?? null,
    completedDate: (r.completed_date as string) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export type AssetData = {
  assets: CampAsset[];
  checkouts: AssetCheckout[];
  serviceRecords: AssetServiceRecord[];
  maintenanceTasks: AssetMaintenanceTask[];
};

async function loadAssetData(campId: string): Promise<AssetData> {
  const [aRes, cRes, sRes, mRes] = await Promise.all([
    supabase.from('camp_assets').select('*').eq('camp_id', campId).order('created_at', { ascending: true }),
    supabase.from('asset_checkouts').select('*').eq('camp_id', campId).order('checked_out_at', { ascending: false }),
    supabase.from('asset_service_records').select('*').eq('camp_id', campId).order('date_performed', { ascending: false }),
    supabase.from('asset_maintenance_tasks').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
  ]);
  return {
    assets: (aRes.data ?? []).map((r) => rowToAsset(r as Record<string, unknown>)),
    checkouts: (cRes.data ?? []).map((r) => rowToCheckout(r as Record<string, unknown>)),
    serviceRecords: (sRes.data ?? []).map((r) => rowToServiceRecord(r as Record<string, unknown>)),
    maintenanceTasks: (mRes.data ?? []).map((r) => rowToMaintenanceTask(r as Record<string, unknown>)),
  };
}

export async function loadAssetsFromSupabase(campId: string): Promise<AssetData | null> {
  try {
    return await loadAssetData(campId);
  } catch (e) {
    console.error('[Supabase] loadAssetsFromSupabase threw:', e);
    return null;
  }
}

export async function dbUpsertAsset(a: CampAsset) {
  const { error } = await supabase.from('camp_assets').upsert({
    id: a.id, camp_id: _campId, name: a.name, category: a.category, subtype: a.subtype,
    make: a.make, model: a.model, year: a.year, serial_number: a.serialNumber,
    license_plate: a.licensePlate, registration_expiry: a.registrationExpiry,
    storage_location: a.storageLocation, status: a.status,
    current_odometer: a.currentOdometer, current_hours: a.currentHours,
    tracks_odometer: a.tracksOdometer, tracks_hours: a.tracksHours,
    notes: a.notes, is_active: a.isActive,
    hull_id: a.hullId, uscg_registration: a.uscgRegistration,
    uscg_registration_expiry: a.uscgRegistrationExpiry, capacity: a.capacity,
    motor_type: a.motorType, has_lifejackets: a.hasLifejackets,
    lifejacket_count: a.lifejacketCount,
    created_at: a.createdAt, updated_at: a.updatedAt,
  }, { onConflict: 'id' });
  if (error) console.error('dbUpsertAsset error:', error.message);
}

export async function dbUpdateAssetStatus(id: string, status: CampAsset['status'], patch?: { currentOdometer?: number | null; currentHours?: number | null }) {
  const row: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (patch?.currentOdometer !== undefined) row.current_odometer = patch.currentOdometer;
  if (patch?.currentHours !== undefined) row.current_hours = patch.currentHours;
  const { error } = await supabase.from('camp_assets').update(row).eq('id', id);
  if (error) console.error('dbUpdateAssetStatus error:', error.message);
}

export async function dbDeleteAsset(id: string) {
  const { error } = await supabase.from('camp_assets').delete().eq('id', id);
  if (error) console.error('dbDeleteAsset error:', error.message);
}

export async function dbAddCheckout(c: AssetCheckout) {
  const { error } = await supabase.from('asset_checkouts').insert({
    id: c.id, camp_id: _campId, asset_id: c.assetId, checked_out_by: c.checkedOutBy,
    purpose: c.purpose, checked_out_at: c.checkedOutAt,
    expected_return_at: c.expectedReturnAt, returned_at: c.returnedAt,
    start_odometer: c.startOdometer, end_odometer: c.endOdometer,
    start_hours: c.startHours, end_hours: c.endHours,
    fuel_level_out: c.fuelLevelOut, fuel_level_in: c.fuelLevelIn,
    checkout_notes: c.checkoutNotes, return_notes: c.returnNotes,
    return_condition: c.returnCondition, created_issue_id: c.createdIssueId,
    logged_by: c.loggedBy, created_at: c.createdAt,
  });
  if (error) console.error('dbAddCheckout error:', error.message);
}

export async function dbReturnAsset(checkoutId: string, fields: {
  returnedAt: string; endOdometer: number | null; endHours: number | null;
  fuelLevelIn: AssetCheckout['fuelLevelIn']; returnNotes: string | null;
  returnCondition: AssetCheckout['returnCondition']; createdIssueId: string | null;
}) {
  const { error } = await supabase.from('asset_checkouts').update({
    returned_at: fields.returnedAt,
    end_odometer: fields.endOdometer,
    end_hours: fields.endHours,
    fuel_level_in: fields.fuelLevelIn,
    return_notes: fields.returnNotes,
    return_condition: fields.returnCondition,
    created_issue_id: fields.createdIssueId,
  }).eq('id', checkoutId);
  if (error) console.error('dbReturnAsset error:', error.message);
}

export async function dbAddAssetServiceRecord(r: AssetServiceRecord) {
  const { error } = await supabase.from('asset_service_records').insert({
    id: r.id, camp_id: _campId, asset_id: r.assetId, service_type: r.serviceType,
    date_performed: r.datePerformed, performed_by: r.performedBy,
    vendor: r.vendor, description: r.description,
    odometer_at_service: r.odometerAtService, hours_at_service: r.hoursAtService,
    cost: r.cost, next_service_date: r.nextServiceDate,
    next_service_odometer: r.nextServiceOdometer, next_service_hours: r.nextServiceHours,
    is_inspection: r.isInspection, created_at: r.createdAt,
  });
  if (error) console.error('dbAddAssetServiceRecord error:', error.message);
}

export async function dbDeleteAssetServiceRecord(id: string) {
  const { error } = await supabase.from('asset_service_records').delete().eq('id', id);
  if (error) console.error('dbDeleteAssetServiceRecord error:', error.message);
}

export async function dbUpdateAssetServiceRecord(r: AssetServiceRecord) {
  const { error } = await supabase.from('asset_service_records').update({
    service_type: r.serviceType, date_performed: r.datePerformed, performed_by: r.performedBy,
    vendor: r.vendor, description: r.description,
    odometer_at_service: r.odometerAtService, hours_at_service: r.hoursAtService,
    cost: r.cost, next_service_date: r.nextServiceDate,
    next_service_odometer: r.nextServiceOdometer, next_service_hours: r.nextServiceHours,
    is_inspection: r.isInspection,
  }).eq('id', r.id);
  if (error) console.error('dbUpdateAssetServiceRecord error:', error.message);
}

export async function dbUpdateCheckout(c: AssetCheckout) {
  const { error } = await supabase.from('asset_checkouts').update({
    checked_out_by: c.checkedOutBy, purpose: c.purpose,
    expected_return_at: c.expectedReturnAt, checked_out_at: c.checkedOutAt,
    start_odometer: c.startOdometer, start_hours: c.startHours,
    fuel_level_out: c.fuelLevelOut, checkout_notes: c.checkoutNotes,
    returned_at: c.returnedAt, end_odometer: c.endOdometer, end_hours: c.endHours,
    fuel_level_in: c.fuelLevelIn, return_notes: c.returnNotes,
    return_condition: c.returnCondition,
  }).eq('id', c.id);
  if (error) console.error('dbUpdateCheckout error:', error.message);
}

export async function dbDeleteCheckout(id: string) {
  const { error } = await supabase.from('asset_checkouts').delete().eq('id', id);
  if (error) console.error('dbDeleteCheckout error:', error.message);
}

export async function dbUpsertMaintenanceTask(t: AssetMaintenanceTask) {
  const { error } = await supabase.from('asset_maintenance_tasks').upsert({
    id: t.id, camp_id: _campId, asset_id: t.assetId, phase: t.phase, title: t.title,
    detail: t.detail, is_complete: t.isComplete, completed_by: t.completedBy,
    completed_date: t.completedDate, sort_order: t.sortOrder,
    created_at: t.createdAt, updated_at: t.updatedAt,
  }, { onConflict: 'id' });
  if (error) console.error('dbUpsertMaintenanceTask error:', error.message);
}

export async function dbToggleMaintenanceTask(id: string, isComplete: boolean, completedBy: string | null, completedDate: string | null) {
  const { error } = await supabase.from('asset_maintenance_tasks').update({
    is_complete: isComplete, completed_by: completedBy,
    completed_date: completedDate, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) console.error('dbToggleMaintenanceTask error:', error.message);
}

export async function dbDeleteMaintenanceTask(id: string) {
  const { error } = await supabase.from('asset_maintenance_tasks').delete().eq('id', id);
  if (error) console.error('dbDeleteMaintenanceTask error:', error.message);
}

let assetChannelCount = 0;
type AssetDataCallback = (data: AssetData) => void;

export function subscribeToAssets(campId: string, onUpdate: AssetDataCallback, onEventStart?: () => void): () => void {
  const channelName = `assets-channel-${++assetChannelCount}`;
  const reload = async () => { onEventStart?.(); onUpdate(await loadAssetData(campId)); };
  const tables = ['camp_assets', 'asset_checkouts', 'asset_service_records', 'asset_maintenance_tasks'];
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, reload);
  }
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}
