/**
 * Data layer for the Campground module — the work half.
 *
 * Kept out of the already-huge db.ts, and following the same house rules: row↔camelCase
 * mappers, one bulk loader per domain, granular non-throwing writers, and realtime through the
 * sync guard so a refetch that raced a save is dropped rather than applied.
 *
 * The database still calls this domain `issues`. That is deliberate — the module was renamed in
 * the product, not in Postgres, because renaming a table thirteen surfaces and an iOS app read
 * from is pure risk for zero user-visible gain.
 */
import { supabase } from './supabase';
import { campLog, campError } from './campLog';
import { getCampId, assertLoaded } from './db';
import { todayStr } from './utils';
import { loadAndApply, debounce, WAL_DEBOUNCE_MS } from './syncGuard';
import type {
  ServiceVendor, WorkRouting, WorkSchedule, WorkChecklistTemplate, ChecklistTemplateItem,
  IssueChecklistItem, IssueComment, Trade, QrTarget, SeasonReview, RentalsReview,
  PropertyCalendar, WorkOrderDraft, CampSession, CampTrade,
} from './types';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const CID = () => getCampId();

// ─── Row → type ───────────────────────────────────────────────────────────────

export function rowToVendor(r: Row): ServiceVendor {
  return {
    id: r.id as string, campId: r.camp_id as string, name: r.name as string,
    trade: s(r.trade), contactName: s(r.contact_name), phone: s(r.phone), email: s(r.email),
    website: s(r.website), accountNumber: s(r.account_number),
    insuranceExpiry: s(r.insurance_expiry), notes: s(r.notes), lastUsedOn: s(r.last_used_on),
    isActive: r.is_active !== false,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function rowToRouting(r: Row): WorkRouting {
  return {
    campId: r.camp_id as string, trade: r.trade as Trade,
    defaultStaffGroupId: s(r.default_staff_group_id),
    defaultAssigneeId: s(r.default_assignee_id),
    updatedAt: r.updated_at as string,
  };
}

export function rowToSchedule(r: Row): WorkSchedule {
  return {
    id: r.id as string, campId: r.camp_id as string,
    title: r.title as string, description: s(r.description),
    trade: (r.trade as Trade) ?? 'maintenance',
    priority: (r.priority as WorkSchedule['priority']) ?? 'normal',
    locationIds: (r.location_ids as string[]) ?? [],
    locations: (r.locations as string[]) ?? [],
    assetId: s(r.asset_id), assigneeId: s(r.assignee_id),
    staffGroupId: s(r.staff_group_id), vendorId: s(r.vendor_id),
    checklistTemplateId: s(r.checklist_template_id),
    cadence: (r.cadence as WorkSchedule['cadence']) ?? 'weekly',
    intervalCount: Number(r.interval_count ?? 1),
    byWeekday: (r.by_weekday as number[]) ?? null,
    byMonthday: n(r.by_monthday), anchorDate: s(r.anchor_date),
    daysRelativeToOpening: n(r.days_relative_to_opening),
    meterInterval: n(r.meter_interval), meterLastAt: n(r.meter_last_at),
    meterKind: (r.meter_kind as WorkSchedule['meterKind']) ?? 'hours',
    activeFrom: s(r.active_from), activeUntil: s(r.active_until),
    generateAheadDays: Number(r.generate_ahead_days ?? 14),
    rescheduleFrom: (r.reschedule_from as WorkSchedule['rescheduleFrom']) ?? 'due_date',
    lastGeneratedOn: s(r.last_generated_on),
    missedCount: Number(r.missed_count ?? 0),
    isActive: r.is_active !== false,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function rowToTemplate(r: Row): WorkChecklistTemplate {
  return {
    id: r.id as string, campId: r.camp_id as string, name: r.name as string,
    trade: (r.trade as Trade) ?? 'housekeeping',
    items: Array.isArray(r.items) ? (r.items as Row[]).map(templateItemFromJson) : [],
    isActive: r.is_active !== false,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function rowToChecklistItem(r: Row): IssueChecklistItem {
  return {
    id: r.id as string, campId: r.camp_id as string, issueId: r.issue_id as string,
    position: Number(r.position ?? 0), text: r.text as string, note: s(r.note),
    requiresPhoto: Boolean(r.requires_photo), templateId: s(r.template_id),
    isDone: Boolean(r.is_done),
    doneBy: s(r.done_by), doneByName: s(r.done_by_name), doneAt: s(r.done_at),
    photoUrl: s(r.photo_url), createdAt: r.created_at as string,
  };
}

export function rowToComment(r: Row): IssueComment {
  return {
    id: r.id as string, campId: r.camp_id as string, issueId: r.issue_id as string,
    authorId: s(r.author_id), authorName: (r.author_name as string) ?? 'Someone',
    body: (r.body as string) ?? '',
    photoUrls: (r.photo_urls as string[]) ?? [],
    mentions: (r.mentions as string[]) ?? [],
    visibleToReporter: Boolean(r.visible_to_reporter),
    createdAt: r.created_at as string, editedAt: s(r.edited_at), deletedAt: s(r.deleted_at),
  };
}

export function rowToSession(r: Row): CampSession {
  return {
    id: r.id as string, campId: r.camp_id as string, sourceId: s(r.source_id),
    name: r.name as string, startDate: r.start_date as string, endDate: r.end_date as string,
    camperCount: Number(r.camper_count ?? 0), staffCount: Number(r.staff_count ?? 0),
    isActive: r.is_active !== false,
  };
}

export function rowToTrade(r: Row): CampTrade {
  return {
    id: r.id as string, campId: r.camp_id as string,
    key: r.key as string, label: r.label as string,
    sortOrder: Number(r.sort_order ?? 0), isActive: r.is_active !== false,
  };
}


// ─── Load + subscribe ─────────────────────────────────────────────────────────

export interface CampgroundData {
  vendors: ServiceVendor[];
  routing: WorkRouting[];
  schedules: WorkSchedule[];
  templates: WorkChecklistTemplate[];
  checklistItems: IssueChecklistItem[];
  comments: IssueComment[];
  sessions: CampSession[];
  /** Who has been let in on a work order they could not otherwise see, by being tagged into it. */
  viewers: { issueId: string; userId: string }[];
}

const CAMPGROUND_TABLES = [
  'service_vendors', 'work_routing', 'work_schedules', 'work_checklist_templates',
  // issue_comments is deliberately absent: it gets its own channel below. This one carries
  // eight tables and the app opens dozens of postgres_changes bindings across every module;
  // a message somebody is waiting on cannot be the binding that quietly loses that queue.
  'issue_checklist_items', 'camp_sessions', 'issue_viewers',
];

async function loadInner(campId: string): Promise<CampgroundData> {
  const q = (t: string) => supabase.from(t).select('*').eq('camp_id', campId);
  const [ven, rout, sched, tmpl, items, comments, sessions, viewers] = await Promise.all([
    q('service_vendors').order('name'),
    q('work_routing'),
    q('work_schedules').order('title'),
    q('work_checklist_templates').order('name'),
    // Scoped to open work: a camp three seasons in has tens of thousands of ticked steps and
    // none of them are ever looked at again.
    supabase.from('issue_checklist_items').select('*, issues!inner(status)')
      .eq('camp_id', campId).neq('issues.status', 'resolved').order('position'),
    q('issue_comments').is('deleted_at', null).order('created_at'),
    q('issue_viewers'),
    q('camp_sessions').order('start_date'),
  ]);
  assertLoaded('campground', ven, rout, sched, tmpl, items, comments, sessions, viewers);
  return {
    vendors: (ven.data ?? []).map((r) => rowToVendor(r as Row)),
    routing: (rout.data ?? []).map((r) => rowToRouting(r as Row)),
    schedules: (sched.data ?? []).map((r) => rowToSchedule(r as Row)),
    templates: (tmpl.data ?? []).map((r) => rowToTemplate(r as Row)),
    checklistItems: (items.data ?? []).map((r) => rowToChecklistItem(r as Row)),
    comments: (comments.data ?? []).map((r) => rowToComment(r as Row)),
    viewers: (viewers.data ?? []).map((r) => ({
      issueId: (r as Row).issue_id as string, userId: (r as Row).user_id as string,
    })),
    sessions: (sessions.data ?? []).map((r) => rowToSession(r as Row)),
  };
}

export async function loadCampground(campId: string): Promise<CampgroundData | null> {
  try { return await loadInner(campId); }
  catch (e) { campError('[Supabase] loadCampground threw:', e); return null; }
}

let channelCount = 0;
/**
 * Messages on a work order, on a channel of their own.
 *
 * They used to ride the shared campground subscription and simply never arrived: two people on
 * the same job typed at each other and saw nothing until one reloaded. The table was missing
 * from the publication, and even once added it was one of eight bindings on a channel competing
 * with every other module's. `issues` has had its own channel for the same reason -- the things
 * people are actually waiting on get their own pipe.
 */
export function subscribeToIssueComments(
  campId: string, onUpdate: (rows: IssueComment[]) => void,
): () => void {
  const load = async (): Promise<IssueComment[]> => {
    const { data } = await supabase.from('issue_comments').select('*')
      .eq('camp_id', campId).is('deleted_at', null).order('created_at');
    return (data ?? []).map((r) => rowToComment(r as Row));
  };
  const reload = () => loadAndApply('issue_comments', load, onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  const channel = supabase.channel(`comments-${++channelCount}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'issue_comments', filter: `camp_id=eq.${campId}` }, onWal)
    .subscribe((status) => campLog('[CampOps] comments channel status:', status));
  return () => { supabase.removeChannel(channel); };
}

export function subscribeToCampground(campId: string, onUpdate: (d: CampgroundData) => void): () => void {
  const reload = () => loadAndApply('campground', () => loadInner(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(`campground-${++channelCount}`);
  for (const table of CAMPGROUND_TABLES) {
    channel = channel.on('postgres_changes',
      { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog('[CampOps] campground channel status:', status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) setTimeout(() => reload(), 10000);
      else everSubscribed = true;
    }
  });
  return () => { supabase.removeChannel(channel); };
}

// ─── Writers ──────────────────────────────────────────────────────────────────
// Fire-and-forget and non-throwing, like every other writer here: realtime delivers the
// authoritative row, and a write that fails logs rather than exploding a render.

async function ins(table: string, row: Row) {
  const { error } = await supabase.from(table).insert(row);
  if (error) campError(`insert ${table}`, error.message);
}
async function upd(table: string, id: string, patch: Row) {
  const { error } = await supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) campError(`update ${table}`, error.message);
}
async function del(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) campError(`delete ${table}`, error.message);
}

// Vendors ---------------------------------------------------------------------
const vendorRow = (v: ServiceVendor): Row => ({
  name: v.name, trade: v.trade, contact_name: v.contactName, phone: v.phone, email: v.email,
  website: v.website, account_number: v.accountNumber, insurance_expiry: v.insuranceExpiry,
  notes: v.notes, last_used_on: v.lastUsedOn, is_active: v.isActive,
});
export const dbAddVendor = (v: ServiceVendor) => ins('service_vendors', { id: v.id, camp_id: CID(), ...vendorRow(v) });
export const dbUpdateVendor = (v: ServiceVendor) => upd('service_vendors', v.id, vendorRow(v));
export const dbDeleteVendor = (id: string) => del('service_vendors', id);

// Routing ---------------------------------------------------------------------
export async function dbSetRouting(trade: Trade, staffGroupId: string | null, assigneeId: string | null) {
  const { error } = await supabase.from('work_routing').upsert({
    camp_id: CID(), trade,
    default_staff_group_id: staffGroupId, default_assignee_id: assigneeId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'camp_id,trade' });
  if (error) campError('set routing', error.message);
}

// Routines --------------------------------------------------------------------
const scheduleRow = (w: WorkSchedule): Row => ({
  title: w.title, description: w.description, trade: w.trade, priority: w.priority,
  location_ids: w.locationIds, locations: w.locations, asset_id: w.assetId,
  assignee_id: w.assigneeId, staff_group_id: w.staffGroupId, vendor_id: w.vendorId,
  checklist_template_id: w.checklistTemplateId,
  cadence: w.cadence, interval_count: w.intervalCount, by_weekday: w.byWeekday,
  by_monthday: w.byMonthday, anchor_date: w.anchorDate,
  days_relative_to_opening: w.daysRelativeToOpening,
  meter_interval: w.meterInterval, meter_kind: w.meterKind,
  active_from: w.activeFrom, active_until: w.activeUntil,
  generate_ahead_days: w.generateAheadDays, reschedule_from: w.rescheduleFrom,
  is_active: w.isActive,
  // last_generated_on / missed_count / meter_last_at belong to the generator. A form that wrote
  // them could make a routine skip a cycle or replay one.
});
export const dbAddSchedule = (w: WorkSchedule) => ins('work_schedules', { id: w.id, camp_id: CID(), ...scheduleRow(w) });
export const dbUpdateSchedule = (w: WorkSchedule) => upd('work_schedules', w.id, scheduleRow(w));
export const dbDeleteSchedule = (id: string) => del('work_schedules', id);

/**
 * Materialize any occurrences now due.
 *
 * Runs on module load as well as nightly by pg_cron. The opportunistic call matters more than it
 * sounds: it keeps staging and demo camps correct without waiting for a scheduled job, which is
 * the difference between a demo that shows today's work and one that shows an empty list.
 */
export async function dbGenerateScheduledWork(): Promise<number> {
  const { data, error } = await supabase.rpc('generate_scheduled_work', { p_camp_id: CID(), p_through: null });
  if (error) { campError('generate scheduled work', error.message); return 0; }
  return (data as number) ?? 0;
}

/** Record a meter reading, which may raise a meter-driven routine. Returns how many it raised. */
export async function dbRecordMeter(assetId: string, reading: number, kind: 'hours' | 'odometer'): Promise<number | string> {
  const { data, error } = await supabase.rpc('record_asset_meter',
    { p_asset_id: assetId, p_reading: reading, p_kind: kind });
  // A reading lower than the last one is refused by the database rather than absorbed, because
  // absorbing it would make every meter routine come due at once.
  if (error) { campError('record meter', error.message); return error.message; }
  return (data as number) ?? 0;
}

// Checklists ------------------------------------------------------------------
/**
 * The steps go into jsonb, so they need the same snake_case boundary every other column gets.
 * They did not have one: the editor wrote `requiresPhoto` while apply_checklist_template reads
 * `requires_photo`, so the flag survived in the template and vanished the moment a checklist was
 * applied to a work order. Seeded templates were written in SQL and worked; anything a camp
 * edited did not.
 */
const templateItemToJson = (i: ChecklistTemplateItem): Row => ({
  text: i.text,
  ...(i.note ? { note: i.note } : {}),
  ...(i.requiresPhoto ? { requires_photo: true } : {}),
});

/** Reads both spellings, so templates stored by the old client still ask for their photos. */
function templateItemFromJson(r: Row): ChecklistTemplateItem {
  return {
    text: String(r.text ?? ''),
    ...(r.note ? { note: String(r.note) } : {}),
    ...(r.requires_photo || r.requiresPhoto ? { requiresPhoto: true } : {}),
  };
}

const templateRow = (t: WorkChecklistTemplate): Row => ({
  name: t.name, trade: t.trade, items: t.items.map(templateItemToJson), is_active: t.isActive,
});
export const dbAddTemplate = (t: WorkChecklistTemplate) => ins('work_checklist_templates', { id: t.id, camp_id: CID(), ...templateRow(t) });
export const dbUpdateTemplate = (t: WorkChecklistTemplate) => upd('work_checklist_templates', t.id, templateRow(t));
export const dbDeleteTemplate = (id: string) => del('work_checklist_templates', id);

export async function dbApplyChecklist(issueId: string, templateId: string): Promise<number> {
  const { data, error } = await supabase.rpc('apply_checklist_template',
    { p_issue_id: issueId, p_template_id: templateId });
  if (error) { campError('apply checklist', error.message); return 0; }
  return (data as number) ?? 0;
}

/** The steps on one work order, in order. Used to show them the instant they are applied. */
export async function dbFetchChecklistItems(issueId: string): Promise<IssueChecklistItem[]> {
  const { data, error } = await supabase.from('issue_checklist_items')
    .select('*').eq('issue_id', issueId).order('position');
  if (error) { campError('fetch checklist', error.message); return []; }
  return (data ?? []).map((r) => rowToChecklistItem(r as Row));
}

/**
 * Tick or untick a step.
 *
 * Ticking the last one closes the work order and unticking one reopens it — both handled by a
 * database trigger, so the rule holds however the row was changed (web, iOS, or an offline queue
 * draining hours later).
 */
export async function dbSetChecklistItemDone(
  id: string, isDone: boolean, byId: string, byName: string, photoUrl?: string | null,
) {
  const { error } = await supabase.from('issue_checklist_items').update({
    is_done: isDone,
    done_by: isDone ? byId : null,
    done_by_name: isDone ? byName : null,
    done_at: isDone ? new Date().toISOString() : null,
    photo_url: photoUrl ?? null,
  }).eq('id', id);
  if (error) campError('tick checklist item', error.message);
}

export const dbAddChecklistItem = (i: IssueChecklistItem) => ins('issue_checklist_items', {
  id: i.id, camp_id: CID(), issue_id: i.issueId, position: i.position, text: i.text,
  note: i.note, requires_photo: i.requiresPhoto, is_done: i.isDone,
});
export const dbDeleteChecklistItem = (id: string) => del('issue_checklist_items', id);

/**
 * Let people see one work order they could not otherwise open.
 *
 * Idempotent: naming the same person twice in a thread must not fail the second time.
 */
export async function dbGrantIssueView(issueId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('issue_viewers').upsert(
    userIds.map((userId) => ({
      camp_id: CID(), issue_id: issueId, user_id: userId, granted_by: user?.id ?? null,
    })),
    { onConflict: 'issue_id,user_id' },
  );
  if (error) campError('grant issue view', error.message);
}

// Comments --------------------------------------------------------------------
export async function dbAddComment(c: IssueComment) {
  const { error } = await supabase.from('issue_comments').insert({
    id: c.id, camp_id: CID(), issue_id: c.issueId, author_id: c.authorId,
    author_name: c.authorName, body: c.body, photo_urls: c.photoUrls,
    mentions: c.mentions ?? [],
    visible_to_reporter: c.visibleToReporter, created_at: c.createdAt,
  });
  if (error) campError('add comment', error.message);
}

export const dbUpdateComment = (id: string, body: string) =>
  supabase.from('issue_comments').update({ body, edited_at: new Date().toISOString() }).eq('id', id)
    .then(({ error }) => { if (error) campError('edit comment', error.message); });

/** Soft delete: the timeline keeps its shape, and a deleted message does not silently rewrite history. */
export const dbDeleteComment = (id: string) =>
  supabase.from('issue_comments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    .then(({ error }) => { if (error) campError('delete comment', error.message); });

export async function dbMarkThreadRead(issueId: string, userId: string) {
  const { error } = await supabase.from('issue_comment_reads').upsert({
    issue_id: issueId, user_id: userId, camp_id: CID(), last_read_at: new Date().toISOString(),
  }, { onConflict: 'issue_id,user_id' });
  if (error) campError('mark thread read', error.message);
}

export async function dbUnreadWorkMessages(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_work_messages', { p_camp_id: CID() });
  if (error) { campError('unread messages', error.message); return 0; }
  return (data as number) ?? 0;
}

// ─── QR ───────────────────────────────────────────────────────────────────────

/**
 * Resolve a scanned sticker.
 *
 * Callable anonymously by design and returns display fields only — never an id the scanner did
 * not already hold a token for. One URL serves both audiences: signed in gets the location hub,
 * signed out gets the public report form, because a camp cannot manage two sticker types per
 * door.
 */
export async function resolveQrToken(token: string): Promise<QrTarget | null> {
  const { data, error } = await supabase.rpc('get_qr_target', { p_token: token });
  if (error) { campError('resolve qr', error.message); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const r = row as Row;
  return {
    campId: r.camp_id as string, campName: r.camp_name as string, campSlug: r.camp_slug as string,
    logoUrl: s(r.logo_url), kind: (r.kind as QrTarget['kind']) ?? 'location',
    targetId: r.target_id as string, targetName: r.target_name as string,
    targetPath: s(r.target_path),
  };
}

/** Reissue a location's token. For a sticker that got abused; every printed copy stops working. */
export async function dbRotateQrToken(kind: 'location' | 'asset', id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('rotate_qr_token', { p_kind: kind, p_id: id });
  if (error) { campError('rotate qr token', error.message); return null; }
  return (data as string) ?? null;
}

// ─── Out of service ───────────────────────────────────────────────────────────

/**
 * Take a location out of service, or put it back.
 *
 * Read by rental availability and the rooming board, not merely displayed — which is the whole
 * point. A cabin down for repairs must not be bookable.
 */
export async function dbSetLocationService(
  locationId: string,
  status: 'in_service' | 'out_of_service' | 'limited',
  reason: string | null,
  expectedBack: string | null,
) {
  const { error } = await supabase.from('locations').update({
    service_status: status,
    out_of_service_reason: status === 'in_service' ? null : reason,
    // todayStr(), never toISOString().slice(0,10) — the latter is the UTC day, so from 8pm
    // Eastern a cabin taken out of service tonight is recorded as going down tomorrow.
    out_of_service_since: status === 'in_service' ? null : todayStr(),
    expected_back: status === 'in_service' ? null : expectedBack,
    updated_at: new Date().toISOString(),
  }).eq('id', locationId);
  if (error) campError('set location service status', error.message);
}

// ─── Reviews and the calendar ─────────────────────────────────────────────────

/** `asOf` rebuilds the board as it stood at that instant; omit it for the live numbers. */
export async function fetchSeasonReview(
  from: string, to: string, asOf?: string | null,
): Promise<SeasonReview | null> {
  const { data, error } = await supabase.rpc('season_review',
    { p_camp_id: CID(), p_from: from, p_to: to, p_as_of: asOf ?? new Date().toISOString() });
  if (error) { campError('season review', error.message); return null; }
  return (data as SeasonReview) ?? null;
}

export async function fetchRentalsReview(from: string, to: string): Promise<RentalsReview | null> {
  const { data, error } = await supabase.rpc('rentals_review', { p_camp_id: CID(), p_from: from, p_to: to });
  if (error) { campError('rentals review', error.message); return null; }
  return (data as RentalsReview) ?? null;
}

export async function fetchPropertyCalendar(from: string, to: string): Promise<PropertyCalendar | null> {
  const { data, error } = await supabase.rpc('property_calendar', { p_camp_id: CID(), p_from: from, p_to: to });
  if (error) { campError('property calendar', error.message); return null; }
  return (data as PropertyCalendar) ?? null;
}

/**
 * Freeze a review.
 *
 * Generate live all summer, freeze on the closing date, so last year's report cannot quietly
 * change when somebody back-dates a closure in November.
 */
export async function dbSnapshotReview(
  kind: 'season' | 'rentals', from: string, to: string, asOf?: string | null,
) {
  const { error } = await supabase.rpc('snapshot_review',
    { p_camp_id: CID(), p_kind: kind, p_from: from, p_to: to,
      p_as_of: asOf ?? new Date().toISOString() });
  if (error) { campError('snapshot review', error.message); return false; }
  return true;
}

export interface ReviewSnapshotRow {
  id: string;
  /** The instant the numbers describe, which is not necessarily when it was taken. */
  as_of: string;
  taken_at: string;
  taken_by: string | null;
}

export async function dbListReviewSnapshots(
  kind: 'season' | 'rentals', from: string, to: string,
): Promise<ReviewSnapshotRow[]> {
  const { data, error } = await supabase.rpc('list_review_snapshots',
    { p_camp_id: CID(), p_kind: kind, p_from: from, p_to: to });
  if (error) { campError('list snapshots', error.message); return []; }
  return (data as ReviewSnapshotRow[]) ?? [];
}

export async function dbGetReviewSnapshot(id: string): Promise<SeasonReview | null> {
  const { data, error } = await supabase.rpc('get_review_snapshot', { p_id: id });
  if (error) { campError('read snapshot', error.message); return null; }
  return (data as SeasonReview) ?? null;
}

/** Unfreeze. The live review is unaffected; it is recomputed from the work orders every time. */
export async function dbReleaseReviewSnapshot(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('release_review_snapshot', { p_id: id });
  if (error) { campError('release snapshot', error.message); return false; }
  return true;
}

// ─── Capture ──────────────────────────────────────────────────────────────────

/**
 * Draft a work order from a photo, a spoken transcript, or both.
 *
 * One endpoint rather than two features, which is what makes "point the camera and say what's
 * wrong" free. It never files anything: the result lands in the form as a draft somebody edits.
 */
export async function draftWorkOrder(input: {
  imageBase64?: string;
  transcript?: string;
  context: {
    locationName?: string; locationId?: string; assetName?: string; assetId?: string;
    trade?: Trade;
    members: { id: string; name: string }[];
    locations: { id: string; name: string }[];
    assets?: { id: string; name: string }[];
    recentTitles: string[];
  };
}): Promise<WorkOrderDraft | null> {
  const { data, error } = await supabase.functions.invoke('draft-work-order', { body: input });
  if (error) { campError('draft work order', error.message); return null; }
  return (data as WorkOrderDraft) ?? null;
}
