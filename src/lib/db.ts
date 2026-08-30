import { supabase } from './supabase';
import { uploadToBucket } from './storageUpload';
import { createClient } from '@supabase/supabase-js';
import { campLog, campError } from './campLog';
import { loadAndApply, debounce, WAL_DEBOUNCE_MS } from './syncGuard';

// Plain client for public (unauthenticated) form submissions, no custom fetch
// wrapper, no timeout logic, no XHR workarounds. Mobile browsers handle vanilla
// fetch fine; the custom wrapper was built for the app's stale-TCP problem only.
const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
import type {
  Issue, ChecklistTask, ActivityEntry, Season,
  CampPool, ChemicalReading, PoolEquipment, ServiceLogEntry,
  PoolInspection, InspectionLogEntry, SeasonalTask,
  SafetyItem, SafetyInspectionLog, EmergencyDrill,
  SafetyStaff, StaffCertification, SafetyTempLog, SafetyLicense,
  CampAsset, AssetCheckout, AssetServiceRecord, AssetMaintenanceTask,
  Building, BuildingRoom, BuildingComponent, BuildingCircuit, BuildingSeasonalTask,
  CommissarySession, CommissaryVendor, InventoryItem, InventoryAdjustment, ItemVendorPack, CatalogProduct,
  Recipe, RecipeIngredient, RecipeStep, MenuEntry, RetreatMenuEntry, AdjustmentReason, WasteCategory,
  PurchaseOrder, PurchaseOrderLine, ProductionPlan, ProductionTask,
  ProductionIngredient, ProductionPrepTask, Camper, CamperRestriction, CamperSession, RestrictionSummaryRow,
  CommissaryExpense, MenuTemplate, MenuTemplateEntry, DietCount, MealEvent,
  CountSession, StorageMap, MenuCourse, MenuSubstitution, CommissaryFile,
} from './types';
import { todayStr } from '@/lib/utils';

// ─── Camp ID ──────────────────────────────────────────────────────────────────
// Set by campStore when a camp is selected, used by all write functions.
let _campId = '';
export function setCampId(id: string) { _campId = id; }
/** Current camp id, for db helpers that live in sibling files (e.g. retreatsDb). */
export function getCampId() { return _campId; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Throw if any response in a parallel snapshot read failed.
 *
 * This exists because of a data-loss bug that is easy to reintroduce. supabase-js does NOT
 * throw on an HTTP error: a 401 mid-token-refresh, a 500, or a statement timeout all come
 * back as `{ data: null, error }`. Every loader below then does `res.data ?? []`, so a
 * failed read turned into a perfectly well-formed snapshot full of empty arrays · and
 * `loadAndApply` has no way to tell that from a camp that genuinely has no rows, so it
 * applied it and wiped the module's state in the UI while the database was fine.
 *
 * The `try/catch → return null` wrappers around each loader were already there, but only a
 * *thrown* error ever reached them. Converting an errored response into a throw is what
 * makes those wrappers actually do their job: loadAndApply sees null and skips the apply,
 * leaving the last good state (and any optimistic write) untouched.
 */
export function assertLoaded(
  label: string,
  ...responses: { error: { message: string } | null }[]
): void {
  for (const r of responses) {
    if (r.error) throw new Error(`${label} read failed: ${r.error.message}`);
  }
}

function issueToRow(issue: Issue) {
  return {
    id: issue.id,
    camp_id: _campId,
    title: issue.title,
    description: issue.description,
    location_ids: issue.locationIds,
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
    is_public_report: issue.isPublicReport,
    reporter_name: issue.reporterName,
    reporter_contact: issue.reporterContact,
    source: issue.source,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
  };
}

function rowToIssue(row: Record<string, unknown>, activityLog: ActivityEntry[]): Issue {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    locationIds: (row.location_ids as string[]) ?? [],
    locations: ((row.locations as string[]) ?? []) as Issue['locations'],
    priority: row.priority as Issue['priority'],
    status: row.status as Issue['status'],
    assigneeId: (row.assignee_id as string) ?? null,
    reportedById: (row.reported_by_id as string) ?? null,
    estimatedCostDisplay: (row.estimated_cost_display as string) ?? null,
    estimatedCostValue: (row.estimated_cost_value as number) ?? null,
    actualCost: (row.actual_cost as number) ?? null,
    photoUrl: (row.photo_url as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    isRecurring: (row.is_recurring as boolean) ?? false,
    recurringInterval: (row.recurring_interval as Issue['recurringInterval']) ?? null,
    isPublicReport: (row.is_public_report as boolean) ?? false,
    reporterName: (row.reporter_name as string) ?? null,
    reporterContact: (row.reporter_contact as string) ?? null,
    source: (row.source as Issue['source']) ?? null,
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
    location_ids: task.locationIds,
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
    locationIds: (row.location_ids as string[]) ?? [],
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

export async function dbUpsertIssue(issue: Issue): Promise<{ error: unknown }> {
  campLog('[CampOps] dbUpsertIssue START', issue.id, issue.title);
  const { error } = await supabase.from('issues').upsert(issueToRow(issue), { onConflict: 'id' });
  if (error) {
    campError('[CampOps] dbUpsertIssue FAILED', error.message, error);
  } else {
    campLog('[CampOps] dbUpsertIssue SUCCESS', issue.id);
  }
  return { error };
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
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;
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
  const path = `${_campId}/${issueId}-${Date.now()}`;
  try {
    await uploadToBucket(supabase, PHOTO_BUCKET, path, file);
  } catch (err) {
    console.error('[Supabase] Photo upload error:', err instanceof Error ? err.message : err);
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

const PUBLIC_REPORT_BUCKET = 'public-report-photos';

export async function dbUploadPublicReportPhoto(file: File, campId: string, issueId: string): Promise<string | null> {
  const path = `${campId}/${issueId}-${Date.now()}`;
  try {
    await uploadToBucket(supabasePublic, PUBLIC_REPORT_BUCKET, path, file);
  } catch (err) {
    console.error('[Supabase] Public report photo upload error:', err instanceof Error ? err.message : err);
    return null;
  }
  const { data } = supabasePublic.storage.from(PUBLIC_REPORT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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

export function subscribeToIssues(campId: string, onUpdate: IssueCallback): () => void {
  const channelName = `issues-channel-${++issueChannelCount}`;
  const loadIssues = async (source: string): Promise<Issue[]> => {
    campLog('[CampOps] issues reload START source=' + source);
    const { data: issueRows, error: issueErr } = await supabase.from('issues').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
    const { data: activityRows } = await supabase.from('issue_activity').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
    if (issueErr) campError('[CampOps] issues reload query error', issueErr);
    const issues: Issue[] = (issueRows ?? []).map((row) => {
      const log = (activityRows ?? []).filter((a) => a.issue_id === row.id).map(activityRowToEntry);
      return rowToIssue(row as Record<string, unknown>, log);
    });
    campLog('[CampOps] issues reload DONE count=' + issues.length + ' source=' + source);
    return issues;
  };
  const reload = (source = 'WAL') => loadAndApply('issues', () => loadIssues(source), onUpdate);
  const onWal = debounce(() => reload('WAL'), WAL_DEBOUNCE_MS);
  let everSubscribed = false;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issues', filter: `camp_id=eq.${campId}` }, onWal)
    .subscribe((status) => {
      campLog('[CampOps] issues channel status:', status);
      if (status === 'SUBSCRIBED') {
        if (everSubscribed) { campLog('[CampOps] issues reconnected, reloading in 10s'); setTimeout(() => reload('reconnect'), 10000); }
        else { campLog('[CampOps] issues initial subscription'); everSubscribed = true; }
      }
    });

  return () => { supabase.removeChannel(channel); };
}

export function subscribeToTasks(campId: string, onUpdate: TaskCallback): () => void {
  const channelName = `tasks-channel-${++taskChannelCount}`;
  const loadTasks = async (): Promise<ChecklistTask[]> => {
    const { data: taskRows } = await supabase.from('checklist_tasks').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
    const { data: taskActivityRows } = await supabase.from('checklist_activity').select('*').eq('camp_id', campId).order('created_at', { ascending: false });
    return (taskRows ?? []).map((row) => {
      const log = (taskActivityRows ?? []).filter((a) => a.task_id === row.id).map(activityRowToEntry);
      return rowToTask(row as Record<string, unknown>, log);
    });
  };
  const reload = () => loadAndApply('tasks', loadTasks, onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let everSubscribed = false;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_tasks', filter: `camp_id=eq.${campId}` }, onWal)
    .subscribe((status) => {
      campLog('[CampOps] tasks channel status:', status);
      if (status === 'SUBSCRIBED') {
        if (everSubscribed) { campLog('[CampOps] tasks reconnected, reloading in 10s'); setTimeout(() => reload(), 10000); }
        else { campLog('[CampOps] tasks initial subscription'); everSubscribed = true; }
      }
    });

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
  assertLoaded('pool', poolRes, rRes, eRes, slRes, iRes, ilRes, stRes);

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
    stripPhotoUrl: r.strip_photo_url ?? null,
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
      status: 'due', last_completed: null, next_due: todayStr(),
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

export function subscribeToPool(campId: string, onUpdate: PoolDataCallback): () => void {
  const channelName = `pool-channel-${++poolChannelCount}`;
  const tables = ['pools', 'pool_chemical_readings', 'pool_equipment', 'pool_service_log', 'pool_seasonal_tasks', 'pool_inspections', 'pool_inspection_log'];
  const reload = () => loadAndApply('pool', () => loadPoolData(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog('[CampOps] pool channel status:', status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) { campLog('[CampOps] pool reconnected, reloading in 10s'); setTimeout(() => reload(), 10000); }
      else { campLog('[CampOps] pool initial subscription'); everSubscribed = true; }
    }
  });
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
    locationId: (r.location_id as string) ?? null,
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
    dateOfBirth: (r.date_of_birth as string) ?? null,
    sex: (r.sex as string) ?? null,
    education: (r.education as string) ?? null,
    qualifyingExperience: (r.qualifying_experience as string) ?? null,
    professionalLicenseNumber: (r.professional_license_number as string) ?? null,
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
    // Explicit column list, not select('*'): the personal columns are revoked from authenticated
    // and asking for them would fail the whole query. Admins fetch those separately.
    supabase.from('safety_staff')
      .select('id, camp_id, name, title, is_active, created_at, updated_at')
      .eq('camp_id', campId).order('name', { ascending: true }),
    supabase.from('staff_certifications').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
    supabase.from('safety_temp_logs').select('*').eq('camp_id', campId).order('log_date', { ascending: false }),
    supabase.from('safety_licenses').select('*').eq('camp_id', campId).order('name', { ascending: true }),
  ]);
  assertLoaded('safety', itemsRes, logRes, drillsRes, staffRes, certsRes, tempRes, licRes);

  // Refused for anyone who is not an admin, and that refusal is not an error worth surfacing:
  // a counselor opening the safety module simply does not get their colleagues' birthdays.
  const personal = await dbLoadStaffPersonal(campId);

  return {
    items: (itemsRes.data ?? []).map((r) => rowToSafetyItem(r as Record<string, unknown>)),
    inspectionLog: (logRes.data ?? []).map((r) => rowToSafetyLog(r as Record<string, unknown>)),
    drills: (drillsRes.data ?? []).map((r) => rowToDrill(r as Record<string, unknown>)),
    // Personal details are merged in only when the caller is an admin; for everybody else the
    // fetch is refused and these stay null, which is the point.
    staff: (staffRes.data ?? []).map((r) => ({
      ...rowToSafetyStaff(r as Record<string, unknown>),
      ...(personal[(r as Record<string, unknown>).id as string] ?? {}),
    })),
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
    location_id: item.locationId, location: item.location, unit_count: item.unitCount, frequency: item.frequency,
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
    is_active: staff.isActive,
    date_of_birth: staff.dateOfBirth, sex: staff.sex, education: staff.education,
    qualifying_experience: staff.qualifyingExperience,
    professional_license_number: staff.professionalLicenseNumber,
    created_at: staff.createdAt, updated_at: staff.updatedAt,
  });
  if (error) console.error('dbAddSafetyStaff error:', error.message);
}

export async function dbUpdateSafetyStaff(id: string, patch: Partial<SafetyStaff>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.dateOfBirth !== undefined) row.date_of_birth = patch.dateOfBirth;
  if (patch.sex !== undefined) row.sex = patch.sex;
  if (patch.education !== undefined) row.education = patch.education;
  if (patch.qualifyingExperience !== undefined) row.qualifying_experience = patch.qualifyingExperience;
  if (patch.professionalLicenseNumber !== undefined) {
    row.professional_license_number = patch.professionalLicenseNumber;
  }
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

export function subscribeToSafety(campId: string, onUpdate: SafetyDataCallback): () => void {
  const channelName = `safety-channel-${++safetyChannelCount}`;
  const reload = () => loadAndApply('safety', () => loadSafetyData(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let everSubscribed = false;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_items', filter: `camp_id=eq.${campId}` }, onWal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_inspection_log', filter: `camp_id=eq.${campId}` }, onWal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_drills', filter: `camp_id=eq.${campId}` }, onWal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_staff', filter: `camp_id=eq.${campId}` }, onWal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_certifications', filter: `camp_id=eq.${campId}` }, onWal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_temp_logs', filter: `camp_id=eq.${campId}` }, onWal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_licenses', filter: `camp_id=eq.${campId}` }, onWal)
    .subscribe((status) => {
      campLog('[CampOps] safety channel status:', status);
      if (status === 'SUBSCRIBED') {
        if (everSubscribed) { campLog('[CampOps] safety reconnected, reloading in 10s'); setTimeout(() => reload(), 10000); }
        else { campLog('[CampOps] safety initial subscription'); everSubscribed = true; }
      }
    });
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
    locationId: (r.location_id as string) ?? null,
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
  assertLoaded('assets', aRes, cRes, sRes, mRes);
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
    location_id: a.locationId, storage_location: a.storageLocation, status: a.status,
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

export function subscribeToAssets(campId: string, onUpdate: AssetDataCallback): () => void {
  const channelName = `assets-channel-${++assetChannelCount}`;
  const reload = () => loadAndApply('assets', () => loadAssetData(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  const tables = ['camp_assets', 'asset_checkouts', 'asset_service_records', 'asset_maintenance_tasks'];
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog('[CampOps] assets channel status:', status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) { campLog('[CampOps] assets reconnected, reloading in 10s'); setTimeout(() => reload(), 10000); }
      else { campLog('[CampOps] assets initial subscription'); everSubscribed = true; }
    }
  });
  return () => { supabase.removeChannel(channel); };
}

// ─── Building Systems ───────────────────────────────────────────────────────────

// Buildings and rooms are no longer their own tables. They are nodes in the
// unified `locations` tree (loaded by locationStore). This module now loads only
// the electrical/plumbing data that hangs off those location nodes.

function rowToComponent(r: Record<string, unknown>): BuildingComponent {
  return {
    id: r.id as string,
    locationId: r.location_id as string,
    system: r.system as BuildingComponent['system'],
    type: r.type as BuildingComponent['type'],
    label: r.label as string,
    locationDetail: (r.location_detail as string) ?? null,
    status: (r.status as BuildingComponent['status']) ?? 'operational',
    statusDetail: (r.status_detail as string) ?? null,
    lastServiced: (r.last_serviced as string) ?? null,
    nextServiceDue: (r.next_service_due as string) ?? null,
    photoUrl: (r.photo_url as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    controllingCircuitId: (r.controlling_circuit_id as string) ?? null,
    notes: (r.notes as string) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToCircuit(r: Record<string, unknown>): BuildingCircuit {
  return {
    id: r.id as string,
    panelId: r.panel_id as string,
    breakerNumber: (r.breaker_number as string) ?? null,
    label: (r.label as string) ?? null,
    amperage: (r.amperage as number) ?? null,
    controls: (r.controls as string) ?? null,
    isOn: (r.is_on as boolean) ?? true,
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToBuildingSeasonalTask(r: Record<string, unknown>): BuildingSeasonalTask {
  return {
    id: r.id as string,
    locationId: (r.location_id as string) ?? null,
    title: r.title as string,
    detail: (r.detail as string) ?? null,
    phase: r.phase as BuildingSeasonalTask['phase'],
    isComplete: (r.is_complete as boolean) ?? false,
    completedBy: (r.completed_by as string) ?? null,
    completedDate: (r.completed_date as string) ?? null,
    assignees: ((r.assignees as string[]) ?? []),
    sortOrder: (r.sort_order as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export type BuildingData = {
  buildings: Building[];
  rooms: BuildingRoom[];
  components: BuildingComponent[];
  circuits: BuildingCircuit[];
  seasonalTasks: BuildingSeasonalTask[];
};

async function loadBuildingData(campId: string): Promise<BuildingData> {
  // Buildings & rooms now live in the `locations` tree (loaded by locationStore).
  // This loader only fetches the infrastructure data keyed by location_id.
  const [cRes, ciRes, sRes] = await Promise.all([
    supabase.from('building_components').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('building_circuits').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('building_seasonal_tasks').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
  ]);
  assertLoaded('building systems', cRes, ciRes, sRes);
  return {
    buildings: [],
    rooms: [],
    components: (cRes.data ?? []).map((r) => rowToComponent(r as Record<string, unknown>)),
    circuits: (ciRes.data ?? []).map((r) => rowToCircuit(r as Record<string, unknown>)),
    seasonalTasks: (sRes.data ?? []).map((r) => rowToBuildingSeasonalTask(r as Record<string, unknown>)),
  };
}

export async function loadBuildingFromSupabase(campId: string): Promise<BuildingData | null> {
  try {
    return await loadBuildingData(campId);
  } catch (e) {
    console.error('[Supabase] loadBuildingFromSupabase threw:', e);
    return null;
  }
}

// Buildings & rooms are created/edited/deleted through the locations tree
// (locationStore + locationsDb), so this module no longer writes those tables.

// Components
function componentToRow(c: BuildingComponent) {
  return {
    id: c.id, camp_id: _campId, location_id: c.locationId,
    system: c.system, type: c.type, label: c.label, location_detail: c.locationDetail,
    status: c.status, status_detail: c.statusDetail, last_serviced: c.lastServiced,
    next_service_due: c.nextServiceDue, photo_url: c.photoUrl, metadata: c.metadata,
    controlling_circuit_id: c.controllingCircuitId, notes: c.notes, sort_order: c.sortOrder,
    created_at: c.createdAt, updated_at: c.updatedAt,
  };
}

export async function dbAddComponent(c: BuildingComponent) {
  const { error } = await supabase.from('building_components').insert(componentToRow(c));
  if (error) console.error('dbAddComponent error:', error.message);
}

export async function dbUpdateComponent(c: BuildingComponent) {
  const { camp_id, id, created_at, ...patch } = componentToRow(c); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { error } = await supabase.from('building_components')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', c.id);
  if (error) console.error('dbUpdateComponent error:', error.message);
}

export async function dbDeleteComponent(id: string) {
  const { error } = await supabase.from('building_components').delete().eq('id', id);
  if (error) console.error('dbDeleteComponent error:', error.message);
}

// Circuits
export async function dbAddCircuit(c: BuildingCircuit) {
  const { error } = await supabase.from('building_circuits').insert({
    id: c.id, camp_id: _campId, panel_id: c.panelId, breaker_number: c.breakerNumber,
    label: c.label, amperage: c.amperage, controls: c.controls, is_on: c.isOn,
    sort_order: c.sortOrder, created_at: c.createdAt, updated_at: c.updatedAt,
  });
  if (error) console.error('dbAddCircuit error:', error.message);
}

export async function dbUpdateCircuit(c: BuildingCircuit) {
  const { error } = await supabase.from('building_circuits').update({
    breaker_number: c.breakerNumber, label: c.label, amperage: c.amperage,
    controls: c.controls, is_on: c.isOn, sort_order: c.sortOrder,
    updated_at: new Date().toISOString(),
  }).eq('id', c.id);
  if (error) console.error('dbUpdateCircuit error:', error.message);
}

export async function dbDeleteCircuit(id: string) {
  const { error } = await supabase.from('building_circuits').delete().eq('id', id);
  if (error) console.error('dbDeleteCircuit error:', error.message);
}

// Seasonal tasks
export async function dbAddBuildingSeasonalTask(t: BuildingSeasonalTask) {
  const { error } = await supabase.from('building_seasonal_tasks').insert({
    id: t.id, camp_id: _campId, location_id: t.locationId, title: t.title,
    detail: t.detail, phase: t.phase, is_complete: t.isComplete,
    completed_by: t.completedBy, completed_date: t.completedDate,
    assignees: t.assignees, sort_order: t.sortOrder,
    created_at: t.createdAt, updated_at: t.updatedAt,
  });
  if (error) console.error('dbAddBuildingSeasonalTask error:', error.message);
}

export async function dbUpdateBuildingSeasonalTask(id: string, patch: Partial<BuildingSeasonalTask>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.detail !== undefined) row.detail = patch.detail;
  if (patch.phase !== undefined) row.phase = patch.phase;
  if (patch.locationId !== undefined) row.location_id = patch.locationId;
  if (patch.assignees !== undefined) row.assignees = patch.assignees;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await supabase.from('building_seasonal_tasks').update(row).eq('id', id);
  if (error) console.error('dbUpdateBuildingSeasonalTask error:', error.message);
}

export async function dbToggleBuildingSeasonalTask(id: string, isComplete: boolean, completedBy: string | null, completedDate: string | null) {
  const { error } = await supabase.from('building_seasonal_tasks').update({
    is_complete: isComplete, completed_by: completedBy,
    completed_date: completedDate, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) console.error('dbToggleBuildingSeasonalTask error:', error.message);
}

export async function dbDeleteBuildingSeasonalTask(id: string) {
  const { error } = await supabase.from('building_seasonal_tasks').delete().eq('id', id);
  if (error) console.error('dbDeleteBuildingSeasonalTask error:', error.message);
}

let buildingChannelCount = 0;
type BuildingDataCallback = (data: BuildingData) => void;

export function subscribeToBuilding(campId: string, onUpdate: BuildingDataCallback): () => void {
  const channelName = `building-channel-${++buildingChannelCount}`;
  const reload = () => loadAndApply('building', () => loadBuildingData(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  const tables = ['building_components', 'building_circuits', 'building_seasonal_tasks'];
  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog('[CampOps] building channel status:', status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) { campLog('[CampOps] building reconnected, reloading in 10s'); setTimeout(() => reload(), 10000); }
      else { campLog('[CampOps] building initial subscription'); everSubscribed = true; }
    }
  });
  return () => { supabase.removeChannel(channel); };
}

// ─── Commissary ─────────────────────────────────────────────────────────────────
// Split into THREE subscription domains, inventory, catalog (recipes), menu -
// rather than the one-domain-per-module pattern the other five modules use.
// Commissary is the first module big enough that reloading everything on any WAL
// event visibly hurts: a cook adjusting one item's stock should not refetch every
// recipe, every ingredient and every menu chip for the session.

function rowToSession(r: Record<string, unknown>): CommissarySession {
  return {
    id: r.id as string,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    camperCount: Number(r.camper_count ?? 0),
    staffCount: Number(r.staff_count ?? 0),
    isActive: (r.is_active as boolean) ?? true,
    notes: (r.notes as string) ?? null,
    budgetPerPersonPerDay: r.budget_per_person_per_day == null ? null : Number(r.budget_per_person_per_day),
    mealsPerDay: Number(r.meals_per_day ?? 3),
    mealCounts: (r.meal_counts as CommissarySession['mealCounts']) ?? null,
    orderFrequencyDays: Number(r.order_frequency_days ?? 7),
    countDay: (r.count_day as string) ?? null,
    orderDay: (r.order_day as string) ?? null,
    deliveryDay: (r.delivery_day as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToVendor(r: Record<string, unknown>): CommissaryVendor {
  return {
    id: r.id as string,
    name: r.name as string,
    specialty: (r.specialty as string) ?? null,
    accountNumber: (r.account_number as string) ?? null,
    repName: (r.rep_name as string) ?? null,
    repEmail: (r.rep_email as string) ?? null,
    repPhone: (r.rep_phone as string) ?? null,
    orderCutoff: (r.order_cutoff as string) ?? null,
    deliveryDay: (r.delivery_day as string) ?? null,
    minOrder: r.min_order == null ? null : Number(r.min_order),
    deliveryFee: r.delivery_fee == null ? null : Number(r.delivery_fee),
    notes: (r.notes as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToInventoryItem(r: Record<string, unknown>): InventoryItem {
  return {
    id: r.id as string,
    name: r.name as string,
    category: (r.category as InventoryItem['category']) ?? 'other',
    storageLocation: (r.storage_location as InventoryItem['storageLocation']) ?? 'other',
    dimension: (r.dimension as InventoryItem['dimension']) ?? 'count',
    baseUnit: (r.base_unit as string) ?? 'each',
    stockUnit: (r.stock_unit as string) ?? 'each',
    stockUnitInBase: Number(r.stock_unit_in_base ?? 1),
    purchaseUnit: (r.purchase_unit as string) ?? 'each',
    purchaseUnitInBase: Number(r.purchase_unit_in_base ?? 1),
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
    onHandBase: Number(r.on_hand_base ?? 0),
    parLevelBase: Number(r.par_level_base ?? 0),
    lastCountedAt: (r.last_counted_at as string) ?? null,
    shelfLifeDays: r.shelf_life_days == null ? null : Number(r.shelf_life_days),
    vendorId: (r.vendor_id as string) ?? null,
    allergens: (r.allergens as string[]) ?? [],
    dietary: (r.dietary as string[]) ?? [],
    notes: (r.notes as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToCatalogProduct(r: Record<string, unknown>): CatalogProduct {
  return {
    id: r.id as string,
    name: r.name as string,
    category: (r.category as CatalogProduct['category']) ?? 'other',
    dimension: (r.dimension as CatalogProduct['dimension']) ?? 'count',
    stockUnit: (r.stock_unit as string) ?? 'each',
    stockUnitInBase: Number(r.stock_unit_in_base ?? 1),
    packUnit: (r.pack_unit as string) ?? null,
    packSize: r.pack_size == null ? null : Number(r.pack_size),
    allergens: (r.allergens as string[]) ?? [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// Global (not camp-scoped) shared catalog. Loaded once; no realtime channel.
export async function loadProductCatalog(): Promise<CatalogProduct[] | null> {
  try {
    const { data, error } = await supabase.from('product_catalog').select('*').order('name', { ascending: true });
    if (error) { console.error('loadProductCatalog error:', error.message); return null; }
    return (data ?? []).map((r) => rowToCatalogProduct(r as Record<string, unknown>));
  } catch (e) { console.error('[Supabase] loadProductCatalog threw:', e); return null; }
}

function rowToItemVendorPack(r: Record<string, unknown>): ItemVendorPack {
  return {
    id: r.id as string,
    itemId: r.item_id as string,
    vendorId: r.vendor_id as string,
    purchaseUnit: (r.purchase_unit as string) ?? 'each',
    purchaseUnitInBase: Number(r.purchase_unit_in_base ?? 1),
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToAdjustment(r: Record<string, unknown>): InventoryAdjustment {
  return {
    id: r.id as string,
    itemId: r.item_id as string,
    deltaBase: Number(r.delta_base ?? 0),
    resultingOnHandBase: Number(r.resulting_on_hand_base ?? 0),
    reason: (r.reason as AdjustmentReason) ?? 'other',
    wasteCategory: (r.waste_category as WasteCategory) ?? null,
    notes: (r.notes as string) ?? null,
    adjustedBy: (r.adjusted_by as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToRecipe(r: Record<string, unknown>): Recipe {
  return {
    id: r.id as string,
    name: r.name as string,
    mealPeriod: (r.meal_period as Recipe['mealPeriod']) ?? 'dinner',
    baseYield: Number(r.base_yield ?? 50),
    scaleTo: r.scale_to == null ? null : Number(r.scale_to),
    prepTime: (r.prep_time as string) ?? null,
    cookTime: (r.cook_time as string) ?? null,
    method: (r.method as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToIngredient(r: Record<string, unknown>): RecipeIngredient {
  return {
    id: r.id as string,
    recipeId: r.recipe_id as string,
    itemId: (r.item_id as string) ?? null,
    label: r.label as string,
    qtyInBase: r.qty_in_base == null ? null : Number(r.qty_in_base),
    freeTextQty: (r.free_text_qty as string) ?? null,
    // NOTE: null and [] mean different things here (inherit vs. explicitly none),
    // so this must not collapse to `?? []`.
    allergenOverride: (r.allergen_override as string[] | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToRecipeStep(r: Record<string, unknown>): RecipeStep {
  return {
    id: r.id as string,
    recipeId: r.recipe_id as string,
    stepNumber: Number(r.step_number ?? 1),
    instruction: r.instruction as string,
    leadDays: Number(r.lead_days ?? 0),
    timeSlot: (r.time_slot as RecipeStep['timeSlot']) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToMenuEntry(r: Record<string, unknown>): MenuEntry {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    weekNumber: Number(r.week_number ?? 1),
    dayIndex: Number(r.day_index ?? 0),
    mealPeriod: (r.meal_period as MenuEntry['mealPeriod']) ?? 'breakfast',
    recipeId: (r.recipe_id as string) ?? null,
    itemId: (r.item_id as string) ?? null,
    itemQtyBase: r.item_qty_base == null ? null : Number(r.item_qty_base),
    course: (r.course as string) ?? null,
    label: (r.label as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export interface CommissaryInventoryData {
  items: InventoryItem[];
  adjustments: InventoryAdjustment[];
  vendors: CommissaryVendor[];
  itemVendors: ItemVendorPack[];
  countSessions: CountSession[];
  storageMap: StorageMap[];
}
export interface CommissaryCatalogData {
  recipes: Recipe[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}
function rowToRetreatMenuEntry(r: Record<string, unknown>): RetreatMenuEntry {
  return {
    id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    dayDate: r.day_date as string, mealPeriod: (r.meal_period as RetreatMenuEntry['mealPeriod']) ?? 'breakfast',
    recipeId: (r.recipe_id as string) ?? null, itemId: (r.item_id as string) ?? null,
    itemQtyBase: r.item_qty_base == null ? null : Number(r.item_qty_base),
    label: (r.label as string) ?? null,
    allergens: Array.isArray(r.allergens) ? (r.allergens as string[]) : null,
    alternatives: (r.alternatives as string) ?? null,
    portionsOverride: r.portions_override == null ? null : Number(r.portions_override),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export interface CommissaryMenuData {
  sessions: CommissarySession[];
  menuEntries: MenuEntry[];
  retreatMenuEntries: RetreatMenuEntry[];
  templates: MenuTemplate[];
  templateEntries: MenuTemplateEntry[];
  dietCounts: DietCount[];
  mealEvents: MealEvent[];
  courses: MenuCourse[];
  substitutions: MenuSubstitution[];
}

async function loadInventoryData(campId: string): Promise<CommissaryInventoryData> {
  const [iRes, aRes, vRes, ivRes, cRes, smRes] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('camp_id', campId).order('name', { ascending: true }),
    // The adjustment log is unbounded; the UI only ever shows recent history.
    supabase.from('inventory_adjustments').select('*').eq('camp_id', campId).order('created_at', { ascending: false }).limit(200),
    supabase.from('commissary_vendors').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('commissary_item_vendors').select('*').eq('camp_id', campId),
    supabase.from('commissary_count_sessions').select('*').eq('camp_id', campId).order('date', { ascending: false }).limit(50),
    supabase.from('commissary_storage_map').select('*').eq('camp_id', campId),
  ]);
  assertLoaded('commissary inventory', iRes, aRes, vRes, ivRes, cRes, smRes);
  return {
    items: (iRes.data ?? []).map((r) => rowToInventoryItem(r as Record<string, unknown>)),
    adjustments: (aRes.data ?? []).map((r) => rowToAdjustment(r as Record<string, unknown>)),
    vendors: (vRes.data ?? []).map((r) => rowToVendor(r as Record<string, unknown>)),
    itemVendors: (ivRes.data ?? []).map((r) => rowToItemVendorPack(r as Record<string, unknown>)),
    countSessions: (cRes.data ?? []).map((r) => rowToCountSession(r as Record<string, unknown>)),
    storageMap: (smRes.data ?? []).map((r) => rowToStorageMap(r as Record<string, unknown>)),
  };
}

async function loadCatalogData(campId: string): Promise<CommissaryCatalogData> {
  const [rRes, iRes, sRes] = await Promise.all([
    supabase.from('recipes').select('*').eq('camp_id', campId).order('name', { ascending: true }),
    supabase.from('recipe_ingredients').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('recipe_steps').select('*').eq('camp_id', campId).order('step_number', { ascending: true }),
  ]);
  assertLoaded('commissary catalog', rRes, iRes, sRes);
  return {
    recipes: (rRes.data ?? []).map((r) => rowToRecipe(r as Record<string, unknown>)),
    ingredients: (iRes.data ?? []).map((r) => rowToIngredient(r as Record<string, unknown>)),
    steps: (sRes.data ?? []).map((r) => rowToRecipeStep(r as Record<string, unknown>)),
  };
}

async function loadMenuData(campId: string): Promise<CommissaryMenuData> {
  const [sRes, mRes, rmRes, tRes, teRes, dcRes, meRes, coRes, subRes] = await Promise.all([
    supabase.from('commissary_sessions').select('*').eq('camp_id', campId).order('start_date', { ascending: true }),
    supabase.from('menu_entries').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('retreat_menu_entries').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('menu_templates').select('*').eq('camp_id', campId).order('name', { ascending: true }),
    supabase.from('menu_template_entries').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('commissary_diet_counts').select('*').eq('camp_id', campId),
    supabase.from('commissary_meal_events').select('*').eq('camp_id', campId).order('date', { ascending: true }),
    supabase.from('commissary_menu_courses').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('menu_substitutions').select('*').eq('camp_id', campId),
  ]);
  assertLoaded('commissary menu', sRes, mRes, rmRes, tRes, teRes, dcRes, meRes, coRes, subRes);
  return {
    sessions: (sRes.data ?? []).map((r) => rowToSession(r as Record<string, unknown>)),
    menuEntries: (mRes.data ?? []).map((r) => rowToMenuEntry(r as Record<string, unknown>)),
    retreatMenuEntries: (rmRes.data ?? []).map((r) => rowToRetreatMenuEntry(r as Record<string, unknown>)),
    templates: (tRes.data ?? []).map((r) => rowToTemplate(r as Record<string, unknown>)),
    templateEntries: (teRes.data ?? []).map((r) => rowToTemplateEntry(r as Record<string, unknown>)),
    dietCounts: (dcRes.data ?? []).map((r) => rowToDietCount(r as Record<string, unknown>)),
    mealEvents: (meRes.data ?? []).map((r) => rowToMealEvent(r as Record<string, unknown>)),
    courses: (coRes.data ?? []).map((r) => rowToMenuCourse(r as Record<string, unknown>)),
    substitutions: (subRes.data ?? []).map((r) => rowToSubstitution(r as Record<string, unknown>)),
  };
}

export async function loadCommissaryInventory(campId: string): Promise<CommissaryInventoryData | null> {
  try { return await loadInventoryData(campId); }
  catch (e) { console.error('[Supabase] loadCommissaryInventory threw:', e); return null; }
}
export async function loadCommissaryCatalog(campId: string): Promise<CommissaryCatalogData | null> {
  try { return await loadCatalogData(campId); }
  catch (e) { console.error('[Supabase] loadCommissaryCatalog threw:', e); return null; }
}
export async function loadCommissaryMenu(campId: string): Promise<CommissaryMenuData | null> {
  try { return await loadMenuData(campId); }
  catch (e) { console.error('[Supabase] loadCommissaryMenu threw:', e); return null; }
}

// Sessions
export async function dbAddSession(s: CommissarySession) {
  const { error } = await supabase.from('commissary_sessions').insert({
    id: s.id, camp_id: _campId, name: s.name, start_date: s.startDate, end_date: s.endDate,
    camper_count: s.camperCount, staff_count: s.staffCount, is_active: s.isActive,
    notes: s.notes, budget_per_person_per_day: s.budgetPerPersonPerDay,
    meals_per_day: s.mealsPerDay, meal_counts: s.mealCounts,
    order_frequency_days: s.orderFrequencyDays, count_day: s.countDay, order_day: s.orderDay, delivery_day: s.deliveryDay,
    created_at: s.createdAt, updated_at: s.updatedAt,
  });
  if (error) console.error('dbAddSession error:', error.message);
}

export async function dbUpdateSession(s: CommissarySession) {
  const { error } = await supabase.from('commissary_sessions').update({
    name: s.name, start_date: s.startDate, end_date: s.endDate,
    camper_count: s.camperCount, staff_count: s.staffCount, is_active: s.isActive,
    notes: s.notes, budget_per_person_per_day: s.budgetPerPersonPerDay,
    meals_per_day: s.mealsPerDay, meal_counts: s.mealCounts,
    order_frequency_days: s.orderFrequencyDays, count_day: s.countDay, order_day: s.orderDay, delivery_day: s.deliveryDay,
    updated_at: new Date().toISOString(),
  }).eq('id', s.id);
  if (error) console.error('dbUpdateSession error:', error.message);
}

export async function dbDeleteSession(id: string) {
  const { error } = await supabase.from('commissary_sessions').delete().eq('id', id);
  if (error) console.error('dbDeleteSession error:', error.message);
}

// Vendors
export async function dbAddVendor(v: CommissaryVendor) {
  const { error } = await supabase.from('commissary_vendors').insert({
    id: v.id, camp_id: _campId, name: v.name, specialty: v.specialty,
    account_number: v.accountNumber, rep_name: v.repName, rep_email: v.repEmail,
    rep_phone: v.repPhone, order_cutoff: v.orderCutoff, delivery_day: v.deliveryDay,
    min_order: v.minOrder, delivery_fee: v.deliveryFee, notes: v.notes,
    sort_order: v.sortOrder, created_at: v.createdAt, updated_at: v.updatedAt,
  });
  if (error) console.error('dbAddVendor error:', error.message);
}

export async function dbUpdateVendor(v: CommissaryVendor) {
  const { error } = await supabase.from('commissary_vendors').update({
    name: v.name, specialty: v.specialty, account_number: v.accountNumber,
    rep_name: v.repName, rep_email: v.repEmail, rep_phone: v.repPhone,
    order_cutoff: v.orderCutoff, delivery_day: v.deliveryDay, min_order: v.minOrder,
    delivery_fee: v.deliveryFee, notes: v.notes, sort_order: v.sortOrder,
    updated_at: new Date().toISOString(),
  }).eq('id', v.id);
  if (error) console.error('dbUpdateVendor error:', error.message);
}

export async function dbDeleteVendor(id: string) {
  const { error } = await supabase.from('commissary_vendors').delete().eq('id', id);
  if (error) console.error('dbDeleteVendor error:', error.message);
}

// Inventory items
function inventoryItemToRow(i: InventoryItem) {
  return {
    id: i.id, camp_id: _campId, name: i.name, category: i.category,
    storage_location: i.storageLocation, dimension: i.dimension, base_unit: i.baseUnit,
    stock_unit: i.stockUnit, stock_unit_in_base: i.stockUnitInBase,
    purchase_unit: i.purchaseUnit, purchase_unit_in_base: i.purchaseUnitInBase,
    unit_price: i.unitPrice, on_hand_base: i.onHandBase, par_level_base: i.parLevelBase,
    last_counted_at: i.lastCountedAt, shelf_life_days: i.shelfLifeDays,
    vendor_id: i.vendorId, allergens: i.allergens, dietary: i.dietary, notes: i.notes,
    sort_order: i.sortOrder, created_at: i.createdAt, updated_at: i.updatedAt,
  };
}

export async function dbAddInventoryItem(i: InventoryItem) {
  const { error } = await supabase.from('inventory_items').insert(inventoryItemToRow(i));
  if (error) console.error('dbAddInventoryItem error:', error.message);
}

export async function dbUpdateInventoryItem(i: InventoryItem) {
  const { camp_id, id, created_at, ...patch } = inventoryItemToRow(i); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { error } = await supabase.from('inventory_items')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', i.id);
  if (error) console.error('dbUpdateInventoryItem error:', error.message);
}

export async function dbDeleteInventoryItem(id: string) {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) console.error('dbDeleteInventoryItem error:', error.message);
}

/** Wipe ALL commissary data for the current camp (settings / testing). Never the catalog. */
export async function dbWipeCommissary(): Promise<boolean> {
  const { error } = await supabase.rpc('delete_all_commissary_data', { p_camp_id: _campId });
  if (error) { console.error('dbWipeCommissary error:', error.message); return false; }
  return true;
}

/** Update an item's price estimate to what was last actually paid (from a received invoice). */
export async function dbSetItemPrice(itemId: string, price: number) {
  const { error } = await supabase.from('inventory_items')
    .update({ unit_price: price, updated_at: new Date().toISOString() }).eq('id', itemId);
  if (error) console.error('dbSetItemPrice error:', error.message);
}

/** Stamp an item as counted (on-hand affirmatively established). Used by count/recount paths. */
export async function dbSetItemCounted(itemId: string, ts: string) {
  const { error } = await supabase.from('inventory_items')
    .update({ last_counted_at: ts, updated_at: new Date().toISOString() }).eq('id', itemId);
  if (error) console.error('dbSetItemCounted error:', error.message);
}

/**
 * Add or update a SINGLE vendor pack on an item without touching its other packs.
 * Upserts on the (item_id, vendor_id) unique key, used by the CSV merge path, where a
 * second distributor's sheet layers its pack onto an item the camp already stocks.
 */
export async function dbUpsertItemVendor(pack: ItemVendorPack) {
  const { error } = await supabase.from('commissary_item_vendors').upsert({
    id: pack.id, camp_id: _campId, item_id: pack.itemId, vendor_id: pack.vendorId,
    purchase_unit: pack.purchaseUnit, purchase_unit_in_base: pack.purchaseUnitInBase,
    unit_price: pack.unitPrice, is_default: pack.isDefault,
    created_at: pack.createdAt, updated_at: pack.updatedAt,
  }, { onConflict: 'item_id,vendor_id' });
  if (error) console.error('dbUpsertItemVendor error:', error.message);
}

/**
 * Replace an item's whole set of vendor packs. Wholesale replace mirrors how recipe
 * children are saved: the editor has no stable per-row identity across an edit session,
 * and this keeps the DB exactly matching what the form shows. Row FK CASCADEs from the
 * item, so packs vanish when the item is deleted.
 */
export async function dbReplaceItemVendors(itemId: string, packs: ItemVendorPack[]) {
  const { error: delErr } = await supabase.from('commissary_item_vendors').delete().eq('item_id', itemId);
  if (delErr) { console.error('dbReplaceItemVendors delete error:', delErr.message); return; }
  if (!packs.length) return;
  const { error } = await supabase.from('commissary_item_vendors').insert(
    packs.map((p) => ({
      id: p.id, camp_id: _campId, item_id: itemId, vendor_id: p.vendorId,
      purchase_unit: p.purchaseUnit, purchase_unit_in_base: p.purchaseUnitInBase,
      unit_price: p.unitPrice, is_default: p.isDefault,
      created_at: p.createdAt, updated_at: p.updatedAt,
    })),
  );
  if (error) console.error('dbReplaceItemVendors insert error:', error.message);
}

/**
 * Adjust stock. Goes through an RPC rather than a read-modify-write from the
 * client: two people counting the same walk-in would otherwise each compute
 * `onHand + delta` from a stale snapshot and the second save would erase the first.
 * The RPC also writes the audit row in the same transaction.
 *
 * Returns the authoritative new on-hand (base units), or null on failure · unlike
 * the fire-and-forget writers above, the caller needs this value to reconcile its
 * optimistic update.
 */
export async function dbAdjustInventory(
  itemId: string,
  deltaBase: number,
  reason: AdjustmentReason,
  notes: string | null,
  adjustedBy: string | null,
  wasteCategory: WasteCategory | null = null,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('adjust_inventory_item', {
    p_item_id: itemId,
    p_delta_base: deltaBase,
    p_reason: reason,
    p_notes: notes,
    p_adjusted_by: adjustedBy,
    // The RPC nulls this itself unless the reason is 'waste', so a stale selection in
    // the form can never violate the reason/category CHECK.
    p_waste_category: wasteCategory,
  });
  if (error) { console.error('dbAdjustInventory error:', error.message); return null; }
  return data == null ? null : Number(data);
}

// Recipes
export async function dbAddRecipe(r: Recipe) {
  const { error } = await supabase.from('recipes').insert({
    id: r.id, camp_id: _campId, name: r.name, meal_period: r.mealPeriod,
    base_yield: r.baseYield, scale_to: r.scaleTo, prep_time: r.prepTime, cook_time: r.cookTime,
    method: r.method, notes: r.notes, created_at: r.createdAt, updated_at: r.updatedAt,
  });
  if (error) console.error('dbAddRecipe error:', error.message);
}

export async function dbUpdateRecipe(r: Recipe) {
  const { error } = await supabase.from('recipes').update({
    name: r.name, meal_period: r.mealPeriod, base_yield: r.baseYield, scale_to: r.scaleTo,
    prep_time: r.prepTime, cook_time: r.cookTime, method: r.method, notes: r.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', r.id);
  if (error) console.error('dbUpdateRecipe error:', error.message);
}

/**
 * Persist just the recipe card's "Scale to" number. Its own writer rather than a full
 * dbUpdateRecipe because it is edited inline from the recipe list, where nothing else on
 * the recipe is in play, a whole-row update there would write back whatever the local
 * copy happened to hold for every other field.
 */
export async function dbUpdateRecipeScale(recipeId: string, scaleTo: number | null) {
  const { error } = await supabase.from('recipes')
    .update({ scale_to: scaleTo, updated_at: new Date().toISOString() }).eq('id', recipeId);
  if (error) console.error('dbUpdateRecipeScale error:', error.message);
}

export async function dbDeleteRecipe(id: string) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) console.error('dbDeleteRecipe error:', error.message);
}

/**
 * Ingredients and steps are replaced wholesale when a recipe is saved. The editor
 * is a repeater with no stable row identity across an edit session, so diffing
 * would be guesswork; delete-then-insert is what the UI actually means.
 */
export async function dbReplaceRecipeChildren(
  recipeId: string,
  ingredients: RecipeIngredient[],
  steps: RecipeStep[],
) {
  const [delIng, delSteps] = await Promise.all([
    supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId),
    supabase.from('recipe_steps').delete().eq('recipe_id', recipeId),
  ]);
  if (delIng.error) console.error('dbReplaceRecipeChildren delete ingredients:', delIng.error.message);
  if (delSteps.error) console.error('dbReplaceRecipeChildren delete steps:', delSteps.error.message);

  if (ingredients.length) {
    const { error } = await supabase.from('recipe_ingredients').insert(
      ingredients.map((g) => ({
        id: g.id, camp_id: _campId, recipe_id: recipeId, item_id: g.itemId,
        label: g.label, qty_in_base: g.qtyInBase, free_text_qty: g.freeTextQty,
        allergen_override: g.allergenOverride, sort_order: g.sortOrder,
        created_at: g.createdAt, updated_at: g.updatedAt,
      })),
    );
    if (error) console.error('dbReplaceRecipeChildren insert ingredients:', error.message);
  }
  if (steps.length) {
    const { error } = await supabase.from('recipe_steps').insert(
      steps.map((s) => ({
        id: s.id, camp_id: _campId, recipe_id: recipeId,
        step_number: s.stepNumber, instruction: s.instruction,
        lead_days: s.leadDays, time_slot: s.timeSlot,
        created_at: s.createdAt, updated_at: s.updatedAt,
      })),
    );
    if (error) console.error('dbReplaceRecipeChildren insert steps:', error.message);
  }
}

// Menu entries
export async function dbAddMenuEntry(m: MenuEntry) {
  const { error } = await supabase.from('menu_entries').insert({
    id: m.id, camp_id: _campId, session_id: m.sessionId, week_number: m.weekNumber,
    day_index: m.dayIndex, meal_period: m.mealPeriod, recipe_id: m.recipeId,
    item_id: m.itemId, item_qty_base: m.itemQtyBase, course: m.course,
    label: m.label, sort_order: m.sortOrder, created_at: m.createdAt, updated_at: m.updatedAt,
  });
  if (error) console.error('dbAddMenuEntry error:', error.message);
}

export async function dbDeleteMenuEntry(id: string) {
  const { error } = await supabase.from('menu_entries').delete().eq('id', id);
  if (error) console.error('dbDeleteMenuEntry error:', error.message);
}

// Retreat menu entries (commissary retreats mode)
function retreatMenuEntryRow(m: RetreatMenuEntry) {
  return {
    id: m.id, camp_id: _campId, retreat_id: m.retreatId, day_date: m.dayDate, meal_period: m.mealPeriod,
    recipe_id: m.recipeId, item_id: m.itemId, item_qty_base: m.itemQtyBase, label: m.label,
    allergens: m.allergens, alternatives: m.alternatives, portions_override: m.portionsOverride,
    sort_order: m.sortOrder, updated_at: m.updatedAt,
  };
}
export async function dbAddRetreatMenuEntry(m: RetreatMenuEntry) {
  const { error } = await supabase.from('retreat_menu_entries').insert({ ...retreatMenuEntryRow(m), created_at: m.createdAt });
  if (error) console.error('dbAddRetreatMenuEntry error:', error.message);
}
export async function dbUpdateRetreatMenuEntry(m: RetreatMenuEntry) {
  const { error } = await supabase.from('retreat_menu_entries').update(retreatMenuEntryRow(m)).eq('id', m.id);
  if (error) console.error('dbUpdateRetreatMenuEntry error:', error.message);
}
export async function dbDeleteRetreatMenuEntry(id: string) {
  const { error } = await supabase.from('retreat_menu_entries').delete().eq('id', id);
  if (error) console.error('dbDeleteRetreatMenuEntry error:', error.message);
}

/** Bulk insert · used by "Copy last week". */
export async function dbAddMenuEntries(entries: MenuEntry[]) {
  if (!entries.length) return;
  const { error } = await supabase.from('menu_entries').insert(
    entries.map((m) => ({
      id: m.id, camp_id: _campId, session_id: m.sessionId, week_number: m.weekNumber,
      day_index: m.dayIndex, meal_period: m.mealPeriod, recipe_id: m.recipeId,
      item_id: m.itemId, item_qty_base: m.itemQtyBase, course: m.course,
      label: m.label, sort_order: m.sortOrder, created_at: m.createdAt, updated_at: m.updatedAt,
    })),
  );
  if (error) console.error('dbAddMenuEntries error:', error.message);
}

/** Bulk delete · used by "Clear week". */
export async function dbDeleteMenuWeek(sessionId: string, weekNumber: number) {
  const { error } = await supabase.from('menu_entries').delete()
    .eq('session_id', sessionId).eq('week_number', weekNumber);
  if (error) console.error('dbDeleteMenuWeek error:', error.message);
}

// ─── Commissary subscriptions (three independent domains) ──────────────────────

function makeCommissaryChannel<T>(
  name: string,
  campId: string,
  tables: string[],
  load: (campId: string) => Promise<T>,
  onUpdate: (data: T) => void,
): () => void {
  // `domain` is stable across reconnects (the channel name carries a counter), so the
  // snapshot ordering in syncGuard survives a resubscribe.
  const domain = name.replace(/-\d+$/, '');
  const reload = () => loadAndApply(domain, () => load(campId), onUpdate);
  // WAL events arrive one per changed row; a single save can fire a dozen. Debounce so
  // the burst costs one reload, and so the reload starts after the save has finished.
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(name);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog(`[CampOps] ${name} status:`, status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) { campLog(`[CampOps] ${name} reconnected, reloading in 10s`); setTimeout(() => reload(), 10000); }
      else { campLog(`[CampOps] ${name} initial subscription`); everSubscribed = true; }
    }
  });
  return () => { supabase.removeChannel(channel); };
}

let commissaryChannelCount = 0;

export function subscribeToCommissaryInventory(campId: string, onUpdate: (d: CommissaryInventoryData) => void): () => void {
  return makeCommissaryChannel(
    `commissary-inventory-${++commissaryChannelCount}`, campId,
    ['inventory_items', 'inventory_adjustments', 'commissary_vendors', 'commissary_item_vendors', 'commissary_count_sessions', 'commissary_storage_map'],
    loadInventoryData, onUpdate,
  );
}

export function subscribeToCommissaryCatalog(campId: string, onUpdate: (d: CommissaryCatalogData) => void): () => void {
  return makeCommissaryChannel(
    `commissary-catalog-${++commissaryChannelCount}`, campId,
    ['recipes', 'recipe_ingredients', 'recipe_steps'],
    loadCatalogData, onUpdate,
  );
}

export function subscribeToCommissaryMenu(campId: string, onUpdate: (d: CommissaryMenuData) => void): () => void {
  return makeCommissaryChannel(
    `commissary-menu-${++commissaryChannelCount}`, campId,
    ['commissary_sessions', 'menu_entries', 'retreat_menu_entries', 'menu_templates', 'menu_template_entries',
     'commissary_diet_counts', 'commissary_meal_events', 'commissary_menu_courses', 'menu_substitutions'],
    loadMenuData, onUpdate,
  );
}

// ─── Commissary phase 2: ordering, production, allergy ─────────────────────────
// Three further independent subscription domains, for the same reason as the first
// three: ticking one production checkbox must not refetch every purchase order.

function rowToOrder(r: Record<string, unknown>): PurchaseOrder {
  return {
    id: r.id as string,
    vendorId: (r.vendor_id as string) ?? null,
    vendorName: r.vendor_name as string,
    status: (r.status as PurchaseOrder['status']) ?? 'draft',
    source: (r.source as PurchaseOrder['source']) ?? 'par',
    sessionId: (r.session_id as string) ?? null,
    weekNumber: r.week_number == null ? null : Number(r.week_number),
    subtotal: Number(r.subtotal ?? 0),
    deliveryFee: Number(r.delivery_fee ?? 0),
    total: Number(r.total ?? 0),
    deliveryInstructions: (r.delivery_instructions as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    expectedDelivery: (r.expected_delivery as string) ?? null,
    receivedAt: (r.received_at as string) ?? null,
    invoiceTotal: r.invoice_total == null ? null : Number(r.invoice_total),
    invoiceNumber: (r.invoice_number as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToOrderLine(r: Record<string, unknown>): PurchaseOrderLine {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    itemId: (r.item_id as string) ?? null,
    itemName: r.item_name as string,
    stockUnit: r.stock_unit as string,
    purchaseUnit: r.purchase_unit as string,
    purchaseUnitInBase: Number(r.purchase_unit_in_base ?? 1),
    onHandBase: Number(r.on_hand_base ?? 0),
    neededBase: Number(r.needed_base ?? 0),
    orderQty: Number(r.order_qty ?? 0),
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
    lineTotal: Number(r.line_total ?? 0),
    receivedQty: r.received_qty == null ? null : Number(r.received_qty),
    receivedUnitPrice: r.received_unit_price == null ? null : Number(r.received_unit_price),
    receivedNote: (r.received_note as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToPlan(r: Record<string, unknown>): ProductionPlan {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    weekNumber: Number(r.week_number ?? 1),
    dayIndex: Number(r.day_index ?? 0),
    portions: Number(r.portions ?? 0),
    menuSignature: (r.menu_signature as string) ?? '',
    generatedBy: (r.generated_by as string) ?? null,
    generatedAt: r.generated_at as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToProductionTask(r: Record<string, unknown>): ProductionTask {
  return {
    id: r.id as string,
    planId: r.plan_id as string,
    recipeId: (r.recipe_id as string) ?? null,
    mealPeriod: (r.meal_period as ProductionTask['mealPeriod']) ?? 'breakfast',
    title: r.title as string,
    portions: Number(r.portions ?? 0),
    ingredients: (r.ingredients as ProductionIngredient[]) ?? [],
    allergens: (r.allergens as string[]) ?? [],
    prepTime: (r.prep_time as string) ?? null,
    cookTime: (r.cook_time as string) ?? null,
    notes: (r.notes as string) ?? null,
    isComplete: (r.is_complete as boolean) ?? false,
    completedBy: (r.completed_by as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToCamper(r: Record<string, unknown>): Camper {
  return {
    id: r.id as string,
    sessionId: (r.session_id as string) ?? null,
    name: r.name as string,
    cabin: (r.cabin as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToRestriction(r: Record<string, unknown>): CamperRestriction {
  return {
    id: r.id as string,
    camperId: r.camper_id as string,
    restriction: r.restriction as string,
    kind: (r.kind as CamperRestriction['kind']) ?? 'allergen',
    severity: (r.severity as CamperRestriction['severity']) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export interface CommissaryOrderData {
  orders: PurchaseOrder[];
  orderLines: PurchaseOrderLine[];
  expenses: CommissaryExpense[];
}
export interface CommissaryProductionData {
  plans: ProductionPlan[];
  productionTasks: ProductionTask[];
  prepTasks: ProductionPrepTask[];
}
export interface CommissaryAllergyData {
  campers: Camper[];
  restrictions: CamperRestriction[];
  camperSessions: CamperSession[];
  /** Aggregate: readable by every member, even those denied camper names. */
  summary: RestrictionSummaryRow[];
  /** Source-document locker. Health-gated, so empty for members without access. */
  files: CommissaryFile[];
}

async function loadOrderData(campId: string): Promise<CommissaryOrderData> {
  const [oRes, lRes, eRes] = await Promise.all([
    supabase.from('purchase_orders').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
    supabase.from('purchase_order_lines').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('commissary_expenses').select('*').eq('camp_id', campId).order('date', { ascending: false }).limit(500),
  ]);
  assertLoaded('commissary orders', oRes, lRes, eRes);
  return {
    orders: (oRes.data ?? []).map((r) => rowToOrder(r as Record<string, unknown>)),
    orderLines: (lRes.data ?? []).map((r) => rowToOrderLine(r as Record<string, unknown>)),
    expenses: (eRes.data ?? []).map((r) => rowToExpense(r as Record<string, unknown>)),
  };
}

async function loadProductionData(campId: string): Promise<CommissaryProductionData> {
  const [pRes, tRes, ptRes] = await Promise.all([
    supabase.from('production_plans').select('*').eq('camp_id', campId),
    supabase.from('production_tasks').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('production_prep_tasks').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
  ]);
  assertLoaded('commissary production', pRes, tRes, ptRes);
  return {
    plans: (pRes.data ?? []).map((r) => rowToPlan(r as Record<string, unknown>)),
    productionTasks: (tRes.data ?? []).map((r) => rowToProductionTask(r as Record<string, unknown>)),
    prepTasks: (ptRes.data ?? []).map((r) => rowToPrepTask(r as Record<string, unknown>)),
  };
}

/**
 * `campers` and `camper_restrictions` are gated by RLS to admins and health-flagged
 * staff groups. For everyone else those two selects legitimately return zero rows -
 * that is not an error, and the summary view still returns counts. Never surface an
 * empty roster as "no campers"; check canViewCamperNames.
 */
async function loadAllergyData(campId: string): Promise<CommissaryAllergyData> {
  const [cRes, rRes, csRes, sRes, fRes] = await Promise.all([
    supabase.from('campers').select('*').eq('camp_id', campId).order('name', { ascending: true }),
    supabase.from('camper_restrictions').select('*').eq('camp_id', campId),
    supabase.from('camper_sessions').select('camper_id, session_id').eq('camp_id', campId),
    supabase.rpc('get_restriction_summary', { p_camp_id: campId }),
    supabase.from('commissary_files').select('*').eq('camp_id', campId).order('created_at', { ascending: false }),
  ]);
  assertLoaded('commissary allergy', cRes, rRes, csRes, sRes, fRes);
  return {
    files: (fRes.data ?? []).map((r) => rowToCommissaryFile(r as Record<string, unknown>)),
    campers: (cRes.data ?? []).map((r) => rowToCamper(r as Record<string, unknown>)),
    restrictions: (rRes.data ?? []).map((r) => rowToRestriction(r as Record<string, unknown>)),
    camperSessions: (csRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return { camperId: row.camper_id as string, sessionId: row.session_id as string };
    }),
    summary: ((sRes.data as Record<string, unknown>[] | null) ?? []).map((row) => {
      return {
        sessionId: (row.session_id as string) ?? null,
        restriction: row.restriction as string,
        kind: (row.kind as RestrictionSummaryRow['kind']) ?? 'allergen',
        camperCount: Number(row.camper_count ?? 0),
        anaphylacticCount: Number(row.anaphylactic_count ?? 0),
      };
    }),
  };
}

export async function loadCommissaryOrders(campId: string): Promise<CommissaryOrderData | null> {
  try { return await loadOrderData(campId); }
  catch (e) { console.error('[Supabase] loadCommissaryOrders threw:', e); return null; }
}
export async function loadCommissaryProduction(campId: string): Promise<CommissaryProductionData | null> {
  try { return await loadProductionData(campId); }
  catch (e) { console.error('[Supabase] loadCommissaryProduction threw:', e); return null; }
}
export async function loadCommissaryAllergy(campId: string): Promise<CommissaryAllergyData | null> {
  try { return await loadAllergyData(campId); }
  catch (e) { console.error('[Supabase] loadCommissaryAllergy threw:', e); return null; }
}

// Purchase orders
export async function dbCreateOrder(order: PurchaseOrder, lines: PurchaseOrderLine[]) {
  const { error: oErr } = await supabase.from('purchase_orders').insert({
    id: order.id, camp_id: _campId, vendor_id: order.vendorId, vendor_name: order.vendorName,
    status: order.status, source: order.source, session_id: order.sessionId,
    week_number: order.weekNumber, subtotal: order.subtotal, delivery_fee: order.deliveryFee,
    total: order.total, delivery_instructions: order.deliveryInstructions,
    expected_delivery: order.expectedDelivery, sent_at: order.sentAt,
    created_by: order.createdBy, created_at: order.createdAt, updated_at: order.updatedAt,
  });
  if (oErr) { console.error('dbCreateOrder error:', oErr.message); return; }

  if (!lines.length) return;
  const { error: lErr } = await supabase.from('purchase_order_lines').insert(
    lines.map((l) => ({
      id: l.id, camp_id: _campId, order_id: order.id, item_id: l.itemId,
      item_name: l.itemName, stock_unit: l.stockUnit, purchase_unit: l.purchaseUnit,
      purchase_unit_in_base: l.purchaseUnitInBase, on_hand_base: l.onHandBase,
      needed_base: l.neededBase, order_qty: l.orderQty, unit_price: l.unitPrice,
      line_total: l.lineTotal, sort_order: l.sortOrder,
      created_at: l.createdAt, updated_at: l.updatedAt,
    })),
  );
  if (lErr) console.error('dbCreateOrder lines error:', lErr.message);
}

export async function dbUpdateOrderStatus(id: string, status: PurchaseOrder['status'], deliveryInstructions?: string | null, expectedDelivery?: string | null) {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (deliveryInstructions !== undefined) patch.delivery_instructions = deliveryInstructions;
  if (expectedDelivery !== undefined) patch.expected_delivery = expectedDelivery;
  const { error } = await supabase.from('purchase_orders').update(patch).eq('id', id);
  if (error) console.error('dbUpdateOrderStatus error:', error.message);
}

export async function dbUpdateOrderLineQty(id: string, orderQty: number, lineTotal: number) {
  const { error } = await supabase.from('purchase_order_lines')
    .update({ order_qty: orderQty, line_total: lineTotal, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('dbUpdateOrderLineQty error:', error.message);
}

export async function dbUpdateOrderTotals(id: string, subtotal: number, total: number) {
  const { error } = await supabase.from('purchase_orders')
    .update({ subtotal, total, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('dbUpdateOrderTotals error:', error.message);
}

export async function dbDeleteOrder(id: string) {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
  if (error) console.error('dbDeleteOrder error:', error.message);
}

export async function dbAddOrderLine(orderId: string, l: PurchaseOrderLine) {
  const { error } = await supabase.from('purchase_order_lines').insert({
    id: l.id, camp_id: _campId, order_id: orderId, item_id: l.itemId,
    item_name: l.itemName, stock_unit: l.stockUnit, purchase_unit: l.purchaseUnit,
    purchase_unit_in_base: l.purchaseUnitInBase, on_hand_base: l.onHandBase,
    needed_base: l.neededBase, order_qty: l.orderQty, unit_price: l.unitPrice,
    line_total: l.lineTotal, sort_order: l.sortOrder,
    created_at: l.createdAt, updated_at: l.updatedAt,
  });
  if (error) console.error('dbAddOrderLine error:', error.message);
}

export async function dbDeleteOrderLine(id: string) {
  const { error } = await supabase.from('purchase_order_lines').delete().eq('id', id);
  if (error) console.error('dbDeleteOrderLine error:', error.message);
}

/**
 * Re-point a line at a different vendor's pack: swaps the frozen pack fields + price and
 * may move the line into another order (order_id). Used by the multi-vendor line switch.
 */
export async function dbUpdateOrderLinePack(id: string, patch: {
  orderId?: string; purchaseUnit: string; purchaseUnitInBase: number;
  unitPrice: number | null; orderQty: number; lineTotal: number;
}) {
  const row: Record<string, unknown> = {
    purchase_unit: patch.purchaseUnit, purchase_unit_in_base: patch.purchaseUnitInBase,
    unit_price: patch.unitPrice, order_qty: patch.orderQty, line_total: patch.lineTotal,
    updated_at: new Date().toISOString(),
  };
  if (patch.orderId !== undefined) row.order_id = patch.orderId;
  const { error } = await supabase.from('purchase_order_lines').update(row).eq('id', id);
  if (error) console.error('dbUpdateOrderLinePack error:', error.message);
}

/** Re-vendor a draft order in place (single-line switch), new vendor, fee and totals. */
export async function dbUpdateOrderVendor(id: string, vendorId: string, vendorName: string, deliveryFee: number, subtotal: number, total: number) {
  const { error } = await supabase.from('purchase_orders')
    .update({ vendor_id: vendorId, vendor_name: vendorName, delivery_fee: deliveryFee, subtotal, total, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('dbUpdateOrderVendor error:', error.message);
}

/**
 * Books every line into stock and marks the order received, in one transaction.
 * Returns true on success. The caller must NOT optimistically apply stock changes,
 * because the RPC is the only thing that knows the authoritative post-increment values.
 */
export async function dbReceiveOrder(orderId: string, receivedBy: string | null): Promise<boolean> {
  const { error } = await supabase.rpc('receive_purchase_order', {
    p_order_id: orderId,
    p_received_by: receivedBy,
  });
  if (error) { console.error('dbReceiveOrder error:', error.message); return false; }
  return true;
}

function rowToPrepTask(r: Record<string, unknown>): ProductionPrepTask {
  return {
    id: r.id as string,
    planId: r.plan_id as string,
    recipeId: (r.recipe_id as string) ?? null,
    prepDate: r.prep_date as string,
    timeSlot: (r.time_slot as ProductionPrepTask['timeSlot']) ?? null,
    mealPeriod: (r.meal_period as ProductionPrepTask['mealPeriod']) ?? 'dinner',
    serviceDate: r.service_date as string,
    title: r.title as string,
    instruction: r.instruction as string,
    portions: Number(r.portions ?? 0),
    isComplete: (r.is_complete as boolean) ?? false,
    completedBy: (r.completed_by as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// Production
export async function dbSavePlan(plan: ProductionPlan, tasks: ProductionTask[], prepTasks: ProductionPrepTask[]) {
  // Regeneration replaces the plan wholesale; dish AND prep tasks cascade on delete.
  const { error: dErr } = await supabase.from('production_plans')
    .delete().eq('session_id', plan.sessionId).eq('week_number', plan.weekNumber).eq('day_index', plan.dayIndex);
  if (dErr) console.error('dbSavePlan delete error:', dErr.message);

  const { error: pErr } = await supabase.from('production_plans').insert({
    id: plan.id, camp_id: _campId, session_id: plan.sessionId, week_number: plan.weekNumber,
    day_index: plan.dayIndex, portions: plan.portions, menu_signature: plan.menuSignature,
    generated_by: plan.generatedBy, generated_at: plan.generatedAt,
    created_at: plan.createdAt, updated_at: plan.updatedAt,
  });
  if (pErr) { console.error('dbSavePlan error:', pErr.message); return; }

  if (tasks.length) {
    const { error: tErr } = await supabase.from('production_tasks').insert(
      tasks.map((t) => ({
        id: t.id, camp_id: _campId, plan_id: plan.id, recipe_id: t.recipeId,
        meal_period: t.mealPeriod, title: t.title, portions: t.portions,
        ingredients: t.ingredients, allergens: t.allergens, prep_time: t.prepTime,
        cook_time: t.cookTime, notes: t.notes, is_complete: t.isComplete,
        sort_order: t.sortOrder, created_at: t.createdAt, updated_at: t.updatedAt,
      })),
    );
    if (tErr) console.error('dbSavePlan tasks error:', tErr.message);
  }

  if (prepTasks.length) {
    const { error: ptErr } = await supabase.from('production_prep_tasks').insert(
      prepTasks.map((t) => ({
        id: t.id, camp_id: _campId, plan_id: plan.id, recipe_id: t.recipeId,
        prep_date: t.prepDate, time_slot: t.timeSlot, meal_period: t.mealPeriod,
        service_date: t.serviceDate, title: t.title, instruction: t.instruction,
        portions: t.portions, is_complete: t.isComplete,
        sort_order: t.sortOrder, created_at: t.createdAt, updated_at: t.updatedAt,
      })),
    );
    if (ptErr) console.error('dbSavePlan prep tasks error:', ptErr.message);
  }
}

export async function dbToggleProductionTask(id: string, isComplete: boolean, completedBy: string | null) {
  const { error } = await supabase.from('production_tasks').update({
    is_complete: isComplete,
    completed_by: isComplete ? completedBy : null,
    completed_at: isComplete ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) console.error('dbToggleProductionTask error:', error.message);
}

export async function dbToggleProductionPrepTask(id: string, isComplete: boolean, completedBy: string | null) {
  const { error } = await supabase.from('production_prep_tasks').update({
    is_complete: isComplete,
    completed_by: isComplete ? completedBy : null,
    completed_at: isComplete ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) console.error('dbToggleProductionPrepTask error:', error.message);
}

export async function dbDeletePlan(id: string) {
  const { error } = await supabase.from('production_plans').delete().eq('id', id);
  if (error) console.error('dbDeletePlan error:', error.message);
}

// Campers + restrictions
export async function dbAddCamper(c: Camper, restrictions: CamperRestriction[]) {
  const { error } = await supabase.from('campers').insert({
    id: c.id, camp_id: _campId, session_id: c.sessionId, name: c.name,
    cabin: c.cabin, notes: c.notes, created_at: c.createdAt, updated_at: c.updatedAt,
  });
  if (error) { console.error('dbAddCamper error:', error.message); return; }
  if (restrictions.length) await dbReplaceCamperRestrictions(c.id, restrictions);
}

export async function dbUpdateCamper(c: Camper) {
  const { error } = await supabase.from('campers').update({
    name: c.name, cabin: c.cabin, session_id: c.sessionId, notes: c.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', c.id);
  if (error) console.error('dbUpdateCamper error:', error.message);
}

export async function dbDeleteCamper(id: string) {
  const { error } = await supabase.from('campers').delete().eq('id', id);
  if (error) console.error('dbDeleteCamper error:', error.message);
}

/**
 * Replace a camper's allergies and dietary preferences.
 *
 * Written as upsert-then-delete-the-rest rather than delete-then-insert. Delete-first
 * loses the whole set if the insert fails (offline, RLS, a bad row), and this is health
 * data, losing it silently is the worst outcome available. `camper_restrictions` has a
 * UNIQUE (camper_id, restriction), so the upsert is well defined and the delete only has
 * to remove what the user actually unchecked.
 */
export async function dbReplaceCamperRestrictions(camperId: string, rows: CamperRestriction[]) {
  if (rows.length) {
    // `id` and `created_at` are deliberately omitted: they default on insert, and on
    // conflict an existing row keeps the identity and creation time it already had.
    const { error } = await supabase.from('camper_restrictions').upsert(
      rows.map((r) => ({
        camp_id: _campId, camper_id: camperId, restriction: r.restriction,
        kind: r.kind, severity: r.severity, notes: r.notes, updated_at: r.updatedAt,
      })),
      { onConflict: 'camper_id,restriction' },
    );
    // Bail out before the delete: if we could not write the new set, keeping the old one
    // is strictly better than ending up with neither.
    if (error) { console.error('dbReplaceCamperRestrictions upsert error:', error.message); return; }
  }

  let stale = supabase.from('camper_restrictions').delete().eq('camper_id', camperId);
  if (rows.length) {
    const keep = rows.map((r) => `"${r.restriction.replace(/"/g, '')}"`).join(',');
    stale = stale.not('restriction', 'in', `(${keep})`);
  }
  const { error: dErr } = await stale;
  if (dErr) console.error('dbReplaceCamperRestrictions delete error:', dErr.message);
}

/** Replace a camper's session assignments (many-to-many). */
export async function dbReplaceCamperSessions(camperId: string, sessionIds: string[]) {
  const { error: dErr } = await supabase.from('camper_sessions').delete().eq('camper_id', camperId);
  if (dErr) console.error('dbReplaceCamperSessions delete error:', dErr.message);
  if (!sessionIds.length) return;
  const { error } = await supabase.from('camper_sessions').insert(
    sessionIds.map((sid) => ({ camp_id: _campId, camper_id: camperId, session_id: sid })),
  );
  if (error) console.error('dbReplaceCamperSessions insert error:', error.message);
}

/** Bulk roster import. Chunked so a 220-camper CSV does not hit request limits. */
export async function dbImportCampers(rows: { camper: Camper; restrictions: CamperRestriction[] }[]) {
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('campers').insert(
      chunk.map(({ camper: c }) => ({
        id: c.id, camp_id: _campId, session_id: c.sessionId, name: c.name,
        cabin: c.cabin, notes: c.notes, created_at: c.createdAt, updated_at: c.updatedAt,
      })),
    );
    if (error) { console.error('dbImportCampers error:', error.message); return; }

    const allRestrictions = chunk.flatMap(({ camper, restrictions }) =>
      restrictions.map((r) => ({
        id: r.id, camp_id: _campId, camper_id: camper.id, restriction: r.restriction,
        kind: r.kind, severity: r.severity, notes: r.notes,
        created_at: r.createdAt, updated_at: r.updatedAt,
      })),
    );
    if (allRestrictions.length) {
      const { error: rErr } = await supabase.from('camper_restrictions').insert(allRestrictions);
      if (rErr) console.error('dbImportCampers restrictions error:', rErr.message);
    }
  }
}

export function subscribeToCommissaryOrders(campId: string, onUpdate: (d: CommissaryOrderData) => void): () => void {
  return makeCommissaryChannel(
    `commissary-orders-${++commissaryChannelCount}`, campId,
    ['purchase_orders', 'purchase_order_lines', 'commissary_expenses'],
    loadOrderData, onUpdate,
  );
}

export function subscribeToCommissaryProduction(campId: string, onUpdate: (d: CommissaryProductionData) => void): () => void {
  return makeCommissaryChannel(
    `commissary-production-${++commissaryChannelCount}`, campId,
    ['production_plans', 'production_tasks', 'production_prep_tasks'],
    loadProductionData, onUpdate,
  );
}

// Realtime respects RLS, so a client without camper health access receives no events
// on these tables. Their aggregate refreshes via the app's periodic refetchAll.
export function subscribeToCommissaryAllergy(campId: string, onUpdate: (d: CommissaryAllergyData) => void): () => void {
  return makeCommissaryChannel(
    `commissary-allergy-${++commissaryChannelCount}`, campId,
    ['campers', 'camper_restrictions', 'camper_sessions', 'commissary_files'],
    loadAllergyData, onUpdate,
  );
}

// ─── Commissary phase 3: mappers ───────────────────────────────────────────────

function rowToExpense(r: Record<string, unknown>): CommissaryExpense {
  return {
    id: r.id as string,
    sessionId: (r.session_id as string) ?? null,
    date: r.date as string,
    category: (r.category as CommissaryExpense['category']) ?? 'other',
    description: (r.description as string) ?? null,
    amount: Number(r.amount ?? 0),
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToTemplate(r: Record<string, unknown>): MenuTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    lengthWeeks: Number(r.length_weeks ?? 1),
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToTemplateEntry(r: Record<string, unknown>): MenuTemplateEntry {
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    weekNumber: Number(r.week_number ?? 1),
    dayIndex: Number(r.day_index ?? 0),
    mealPeriod: (r.meal_period as MenuTemplateEntry['mealPeriod']) ?? 'breakfast',
    recipeId: (r.recipe_id as string) ?? null,
    itemId: (r.item_id as string) ?? null,
    itemQtyBase: r.item_qty_base == null ? null : Number(r.item_qty_base),
    course: (r.course as string) ?? null,
    label: (r.label as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToDietCount(r: Record<string, unknown>): DietCount {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    restriction: r.restriction as string,
    count: Number(r.count ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToMealEvent(r: Record<string, unknown>): MealEvent {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    date: r.date as string,
    mealPeriod: (r.meal_period as MealEvent['mealPeriod']) ?? null,
    kind: (r.kind as MealEvent['kind']) ?? 'override',
    countMode: (r.count_mode as MealEvent['countMode']) ?? 'absolute',
    count: Number(r.count ?? 0),
    label: r.label as string,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToMenuCourse(r: Record<string, unknown>): MenuCourse {
  return {
    id: r.id as string,
    name: r.name as string,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToSubstitution(r: Record<string, unknown>): MenuSubstitution {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    weekNumber: Number(r.week_number ?? 1),
    dayIndex: Number(r.day_index ?? 0),
    mealPeriod: (r.meal_period as MenuSubstitution['mealPeriod']) ?? 'dinner',
    forRestriction: (r.for_restriction as string) ?? null,
    mainRecipeId: (r.main_recipe_id as string) ?? null,
    mainItemId: (r.main_item_id as string) ?? null,
    mainLabel: r.main_label as string,
    sideRecipeId: (r.side_recipe_id as string) ?? null,
    sideItemId: (r.side_item_id as string) ?? null,
    sideLabel: (r.side_label as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToCommissaryFile(r: Record<string, unknown>): CommissaryFile {
  return {
    id: r.id as string,
    sessionId: (r.session_id as string) ?? null,
    name: r.name as string,
    path: r.path as string,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    contentType: (r.content_type as string) ?? null,
    uploadedBy: (r.uploaded_by as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToCountSession(r: Record<string, unknown>): CountSession {
  return {
    id: r.id as string,
    date: r.date as string,
    countedBy: (r.counted_by as string) ?? null,
    note: (r.note as string) ?? null,
    itemCount: Number(r.item_count ?? 0),
    createdAt: r.created_at as string,
  };
}

function rowToStorageMap(r: Record<string, unknown>): StorageMap {
  return {
    id: r.id as string,
    storageLocation: r.storage_location as StorageMap['storageLocation'],
    safetyItemId: (r.safety_item_id as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ─── Commissary phase 3: writers ────────────────────────────────────────────────

// Expenses
export async function dbAddExpense(e: CommissaryExpense) {
  const { error } = await supabase.from('commissary_expenses').insert({
    id: e.id, camp_id: _campId, session_id: e.sessionId, date: e.date,
    category: e.category, description: e.description, amount: e.amount,
    created_by: e.createdBy, created_at: e.createdAt, updated_at: e.updatedAt,
  });
  if (error) console.error('dbAddExpense error:', error.message);
}
export async function dbDeleteExpense(id: string) {
  const { error } = await supabase.from('commissary_expenses').delete().eq('id', id);
  if (error) console.error('dbDeleteExpense error:', error.message);
}

// Receiving actuals, write the per-line and per-order actuals, then call the RPC.
export async function dbSaveReceivingLine(lineId: string, receivedQty: number | null, receivedUnitPrice: number | null, receivedNote: string | null) {
  const { error } = await supabase.from('purchase_order_lines').update({
    received_qty: receivedQty, received_unit_price: receivedUnitPrice,
    received_note: receivedNote, updated_at: new Date().toISOString(),
  }).eq('id', lineId);
  if (error) console.error('dbSaveReceivingLine error:', error.message);
}
export async function dbSaveOrderInvoice(orderId: string, invoiceTotal: number | null, invoiceNumber: string | null) {
  const { error } = await supabase.from('purchase_orders').update({
    invoice_total: invoiceTotal, invoice_number: invoiceNumber, updated_at: new Date().toISOString(),
  }).eq('id', orderId);
  if (error) console.error('dbSaveOrderInvoice error:', error.message);
}

// Menu templates
export async function dbAddTemplate(t: MenuTemplate) {
  const { error } = await supabase.from('menu_templates').insert({
    id: t.id, camp_id: _campId, name: t.name, length_weeks: t.lengthWeeks,
    notes: t.notes, created_at: t.createdAt, updated_at: t.updatedAt,
  });
  if (error) console.error('dbAddTemplate error:', error.message);
}
export async function dbUpdateTemplate(t: MenuTemplate) {
  const { error } = await supabase.from('menu_templates').update({
    name: t.name, length_weeks: t.lengthWeeks, notes: t.notes, updated_at: new Date().toISOString(),
  }).eq('id', t.id);
  if (error) console.error('dbUpdateTemplate error:', error.message);
}
export async function dbDeleteTemplate(id: string) {
  const { error } = await supabase.from('menu_templates').delete().eq('id', id);
  if (error) console.error('dbDeleteTemplate error:', error.message);
}
export async function dbAddTemplateEntry(e: MenuTemplateEntry) {
  const { error } = await supabase.from('menu_template_entries').insert({
    id: e.id, camp_id: _campId, template_id: e.templateId, week_number: e.weekNumber,
    day_index: e.dayIndex, meal_period: e.mealPeriod, recipe_id: e.recipeId,
    item_id: e.itemId, item_qty_base: e.itemQtyBase, course: e.course,
    label: e.label, sort_order: e.sortOrder, created_at: e.createdAt, updated_at: e.updatedAt,
  });
  if (error) console.error('dbAddTemplateEntry error:', error.message);
}
export async function dbDeleteTemplateEntry(id: string) {
  const { error } = await supabase.from('menu_template_entries').delete().eq('id', id);
  if (error) console.error('dbDeleteTemplateEntry error:', error.message);
}
/** Bulk insert template entries · used by "save week/menu as template". */
export async function dbAddTemplateEntries(entries: MenuTemplateEntry[]) {
  if (!entries.length) return;
  const { error } = await supabase.from('menu_template_entries').insert(
    entries.map((e) => ({
      id: e.id, camp_id: _campId, template_id: e.templateId, week_number: e.weekNumber,
      day_index: e.dayIndex, meal_period: e.mealPeriod, recipe_id: e.recipeId,
      item_id: e.itemId, item_qty_base: e.itemQtyBase, course: e.course,
      label: e.label, sort_order: e.sortOrder, created_at: e.createdAt, updated_at: e.updatedAt,
    })),
  );
  if (error) console.error('dbAddTemplateEntries error:', error.message);
}

// Diet counts (upsert on session+restriction)
export async function dbUpsertDietCount(d: DietCount) {
  const { error } = await supabase.from('commissary_diet_counts').upsert({
    id: d.id, camp_id: _campId, session_id: d.sessionId, restriction: d.restriction,
    count: d.count, created_at: d.createdAt, updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id,restriction' });
  if (error) console.error('dbUpsertDietCount error:', error.message);
}
export async function dbDeleteDietCount(id: string) {
  const { error } = await supabase.from('commissary_diet_counts').delete().eq('id', id);
  if (error) console.error('dbDeleteDietCount error:', error.message);
}

// Meal events
export async function dbAddMealEvent(e: MealEvent) {
  const { error } = await supabase.from('commissary_meal_events').insert({
    id: e.id, camp_id: _campId, session_id: e.sessionId, date: e.date,
    meal_period: e.mealPeriod, kind: e.kind, count_mode: e.countMode, count: e.count,
    label: e.label, notes: e.notes, created_at: e.createdAt, updated_at: e.updatedAt,
  });
  if (error) console.error('dbAddMealEvent error:', error.message);
}
export async function dbUpdateMealEvent(e: MealEvent) {
  const { error } = await supabase.from('commissary_meal_events').update({
    date: e.date, meal_period: e.mealPeriod, kind: e.kind, count_mode: e.countMode,
    count: e.count, label: e.label, notes: e.notes, updated_at: new Date().toISOString(),
  }).eq('id', e.id);
  if (error) console.error('dbUpdateMealEvent error:', error.message);
}
export async function dbDeleteMealEvent(id: string) {
  const { error } = await supabase.from('commissary_meal_events').delete().eq('id', id);
  if (error) console.error('dbDeleteMealEvent error:', error.message);
}

// Count sessions (a physical-count event; the reconciling adjustments go through the RPC)
export async function dbAddCountSession(c: CountSession) {
  const { error } = await supabase.from('commissary_count_sessions').insert({
    id: c.id, camp_id: _campId, date: c.date, counted_by: c.countedBy,
    note: c.note, item_count: c.itemCount, created_at: c.createdAt,
  });
  if (error) console.error('dbAddCountSession error:', error.message);
}

// Storage → safety temp-item map (upsert on camp+location)
export async function dbUpsertStorageMap(m: StorageMap) {
  const { error } = await supabase.from('commissary_storage_map').upsert({
    id: m.id, camp_id: _campId, storage_location: m.storageLocation,
    safety_item_id: m.safetyItemId, created_at: m.createdAt, updated_at: new Date().toISOString(),
  }, { onConflict: 'camp_id,storage_location' });
  if (error) console.error('dbUpsertStorageMap error:', error.message);
}

// ─── Menu courses (per-camp bucket list) ───────────────────────────────────────
export async function dbAddMenuCourse(c: MenuCourse) {
  const { error } = await supabase.from('commissary_menu_courses').insert({
    id: c.id, camp_id: _campId, name: c.name, sort_order: c.sortOrder,
    created_at: c.createdAt, updated_at: c.updatedAt,
  });
  if (error) console.error('dbAddMenuCourse error:', error.message);
}
export async function dbUpdateMenuCourse(c: MenuCourse) {
  const { error } = await supabase.from('commissary_menu_courses')
    .update({ name: c.name, sort_order: c.sortOrder, updated_at: new Date().toISOString() }).eq('id', c.id);
  if (error) console.error('dbUpdateMenuCourse error:', error.message);
}
export async function dbDeleteMenuCourse(id: string) {
  const { error } = await supabase.from('commissary_menu_courses').delete().eq('id', id);
  if (error) console.error('dbDeleteMenuCourse error:', error.message);
}

// ─── Menu substitutions (replacement meals) ────────────────────────────────────
function substitutionToRow(s: MenuSubstitution) {
  return {
    id: s.id, camp_id: _campId, session_id: s.sessionId, week_number: s.weekNumber,
    day_index: s.dayIndex, meal_period: s.mealPeriod, for_restriction: s.forRestriction,
    main_recipe_id: s.mainRecipeId, main_item_id: s.mainItemId, main_label: s.mainLabel,
    side_recipe_id: s.sideRecipeId, side_item_id: s.sideItemId, side_label: s.sideLabel,
    notes: s.notes, created_at: s.createdAt, updated_at: s.updatedAt,
  };
}
export async function dbAddSubstitution(s: MenuSubstitution) {
  const { error } = await supabase.from('menu_substitutions').insert(substitutionToRow(s));
  if (error) console.error('dbAddSubstitution error:', error.message);
}
export async function dbUpdateSubstitution(s: MenuSubstitution) {
  const { camp_id, id, created_at, ...patch } = substitutionToRow(s); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { error } = await supabase.from('menu_substitutions')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', s.id);
  if (error) console.error('dbUpdateSubstitution error:', error.message);
}
export async function dbDeleteSubstitution(id: string) {
  const { error } = await supabase.from('menu_substitutions').delete().eq('id', id);
  if (error) console.error('dbDeleteSubstitution error:', error.message);
}

// ─── Commissary files (allergy source-document locker) ─────────────────────────
const COMMISSARY_FILE_BUCKET = 'commissary-files';

/** Upload a source document and record its metadata. Returns the stored row, or null. */
export async function dbUploadCommissaryFile(file: File, sessionId: string | null, uploadedBy: string | null): Promise<CommissaryFile | null> {
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${_campId}/${id}-${safeName}`;
  try {
    await uploadToBucket(supabase, COMMISSARY_FILE_BUCKET, path, file);
  } catch (err) {
    console.error('dbUploadCommissaryFile upload error:', err instanceof Error ? err.message : err);
    return null;
  }

  const row = {
    id, camp_id: _campId, session_id: sessionId, name: file.name, path,
    size_bytes: file.size, content_type: file.type || null, uploaded_by: uploadedBy,
  };
  const { data, error } = await supabase.from('commissary_files').insert(row).select('*').single();
  if (error) {
    console.error('dbUploadCommissaryFile insert error:', error.message);
    await supabase.storage.from(COMMISSARY_FILE_BUCKET).remove([path]);
    return null;
  }
  return rowToCommissaryFile(data as Record<string, unknown>);
}

export async function dbDeleteCommissaryFile(f: CommissaryFile) {
  const { error: sErr } = await supabase.storage.from(COMMISSARY_FILE_BUCKET).remove([f.path]);
  if (sErr) console.error('dbDeleteCommissaryFile storage error:', sErr.message);
  const { error } = await supabase.from('commissary_files').delete().eq('id', f.id);
  if (error) console.error('dbDeleteCommissaryFile error:', error.message);
}

/** Short-lived signed URL to view/download a stored file (bucket is private). */
export async function dbSignCommissaryFile(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(COMMISSARY_FILE_BUCKET).createSignedUrl(path, 300);
  if (error) { console.error('dbSignCommissaryFile error:', error.message); return null; }
  return data?.signedUrl ?? null;
}


/**
 * Staff personal details for the permit forms: dates of birth, education, licence numbers.
 *
 * Separate from the roster load because these columns are revoked from `authenticated` and
 * reachable only through an admin-gated function. A non-admin calling this gets an error, which
 * is the correct outcome and is why the caller treats failure as "no details" rather than
 * surfacing it: a counselor opening the safety module has not done anything wrong.
 */
export async function dbLoadStaffPersonal(
  campId: string,
): Promise<Record<string, Partial<SafetyStaff>>> {
  const { data, error } = await supabase.rpc('get_camp_staff_personal', { p_camp_id: campId });
  if (error) return {};
  const out: Record<string, Partial<SafetyStaff>> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out[r.id as string] = {
      dateOfBirth: (r.date_of_birth as string) ?? null,
      sex: (r.sex as string) ?? null,
      education: (r.education as string) ?? null,
      qualifyingExperience: (r.qualifying_experience as string) ?? null,
      professionalLicenseNumber: (r.professional_license_number as string) ?? null,
    };
  }
  return out;
}
