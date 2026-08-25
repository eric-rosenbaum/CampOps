// Data layer for the Retreats module. Kept separate from the (already huge) db.ts.
// Ops side uses the authenticated `supabase` client + normal RLS; the guest portal talks
// to token-keyed RPCs from its own anon client (see pages/portal). Low data volume per
// camp, so a single realtime channel + one loader covers the whole module.
import { supabase } from './supabase';
import { uploadToBucket, verifyReadable } from './storageUpload';
import type { UploadProgress } from './uploadProgress';
import { campLog, campError } from './campLog';
import { getCampId, assertLoaded } from './db';
import { loadAndApply, debounce, WAL_DEBOUNCE_MS } from './syncGuard';
import type {
  Retreat, RetreatGuest, RetreatSpace, RetreatHousing, RetreatHousingVersion, RetreatDocument, RetreatMeal,
  RetreatChangeRequest, RetreatCost, RetreatCharge, RetreatPayment, RetreatIssue,
  RetreatChecklistItem, RetreatScheduleItem, RetreatFeedback, RetreatReminder, MealPeriod,
  RetreatInvoice, RetreatInvoiceLine,
} from './types';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

// ─── Row → type ──────────────────────────────────────────────────────────────
export function rowToRetreat(r: Row): Retreat {
  return {
    id: r.id as string, campId: r.camp_id as string,
    groupName: r.group_name as string, groupType: (r.group_type as string) ?? 'other',
    arrivalDate: r.arrival_date as string, departureDate: r.departure_date as string,
    headcount: Number(r.headcount ?? 0),
    pricingModel: (r.pricing_model as Retreat['pricingModel']) ?? 'per_person_night',
    ratePerPersonNight: n(r.rate_per_person_night), flatRate: n(r.flat_rate),
    depositRequired: n(r.deposit_required),
    depositReceived: n(r.deposit_received),
    depositDue: s(r.deposit_due),
    coordinatorName: s(r.coordinator_name), coordinatorEmail: s(r.coordinator_email), coordinatorPhone: s(r.coordinator_phone),
    status: (r.status as Retreat['status']) ?? 'inquiry',
    housingDeadline: s(r.housing_deadline), headcountCutoff: s(r.headcount_cutoff),
    finalHeadcount: n(r.final_headcount), finalHeadcountAt: s(r.final_headcount_at), finalHeadcountBy: s(r.final_headcount_by),
    housingSubmittedAt: s(r.housing_submitted_at), housingSubmittedBy: s(r.housing_submitted_by),
    dietaryFlags: (r.dietary_flags as Record<string, number>) ?? null,
    notes: s(r.notes), portalToken: r.portal_token as string,
    menuPublished: Boolean(r.menu_published), changeRequestsEnabled: Boolean(r.change_requests_enabled),
    feedbackOpens: s(r.feedback_opens),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}
function rowToSpace(r: Row): RetreatSpace {
  return { id: r.id as string, campId: r.camp_id as string, name: r.name as string, bedCapacity: Number(r.bed_capacity ?? 0), accessible: Boolean(r.accessible), notes: s(r.notes), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToHousing(r: Row): RetreatHousing {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, locationId: s(r.location_id), spaceId: s(r.space_id), spaceName: s(r.space_name), subgroupName: s(r.subgroup_name), peopleCount: Number(r.people_count ?? 0), unnamedCount: Number(r.unnamed_count ?? 0), notes: s(r.notes), locked: Boolean(r.locked), rosterDriven: Boolean(r.roster_driven), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToGuest(r: Row): RetreatGuest {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    fullName: r.full_name as string, subgroup: s(r.subgroup), gender: s(r.gender), dietary: s(r.dietary),
    needsAccessible: Boolean(r.needs_accessible), notes: s(r.notes), locationId: s(r.location_id),
    sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToHousingVersion(r: Row): RetreatHousingVersion {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, version: Number(r.version ?? 1), label: s(r.label), summary: s(r.summary), createdBy: s(r.created_by), createdAt: r.created_at as string };
}
function rowToDocument(r: Row): RetreatDocument {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, docType: (r.doc_type as RetreatDocument['docType']) ?? 'other', name: r.name as string, status: (r.status as RetreatDocument['status']) ?? 'missing', filePath: s(r.file_path), signedBy: s(r.signed_by), signedAt: s(r.signed_at), dueDate: s(r.due_date), meta: (r.meta as Record<string, unknown>) ?? null, sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToMeal(r: Row): RetreatMeal {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, dayDate: r.day_date as string, mealPeriod: (r.meal_period as MealPeriod) ?? 'breakfast', name: s(r.name), items: s(r.items), allergens: (r.allergens as string[]) ?? [], alternatives: s(r.alternatives), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToChangeRequest(r: Row): RetreatChangeRequest {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, origin: (r.origin as RetreatChangeRequest['origin']) ?? 'guest', kind: (r.kind as RetreatChangeRequest['kind']) ?? 'other', submittedBy: s(r.submitted_by), submittedAt: r.submitted_at as string, body: r.body as string, status: (r.status as RetreatChangeRequest['status']) ?? 'pending', responseMessage: s(r.response_message), internalNote: s(r.internal_note), respondedBy: s(r.responded_by), respondedAt: s(r.responded_at), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToCost(r: Row): RetreatCost {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, category: r.category as string, budgeted: Number(r.budgeted ?? 0), actual: n(r.actual), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToCharge(r: Row): RetreatCharge {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, description: r.description as string, qty: Number(r.qty ?? 1), unitRate: Number(r.unit_rate ?? 0), amount: Number(r.amount ?? 0), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToPayment(r: Row): RetreatPayment {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, paidOn: r.paid_on as string, amount: Number(r.amount ?? 0), method: s(r.method), kind: (r.kind as RetreatPayment['kind']) ?? 'payment', note: s(r.note), createdAt: r.created_at as string };
}
function rowToIssue(r: Row): RetreatIssue {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, title: r.title as string, reportedBy: s(r.reported_by), priority: (r.priority as string) ?? 'normal', assignedTo: s(r.assigned_to), status: (r.status as RetreatIssue['status']) ?? 'open', notes: s(r.notes), createdAt: r.created_at as string, resolvedAt: s(r.resolved_at), updatedAt: r.updated_at as string };
}
function rowToChecklistItem(r: Row): RetreatChecklistItem {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, phase: (r.phase as RetreatChecklistItem['phase']) ?? 'setup', title: r.title as string, isDone: Boolean(r.is_done), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToScheduleItem(r: Row): RetreatScheduleItem {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, dayDate: s(r.day_date), timeLabel: s(r.time_label), title: r.title as string, location: s(r.location), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function rowToFeedback(r: Row): RetreatFeedback {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, overall: n(r.overall), accommodations: n(r.accommodations), food: n(r.food), communication: n(r.communication), comment: s(r.comment), returningStatus: s(r.returning_status), receivedAt: r.received_at as string, createdAt: r.created_at as string };
}
function rowToReminder(r: Row): RetreatReminder {
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, reminderType: s(r.reminder_type), message: s(r.message), sentBy: s(r.sent_by), sentAt: r.sent_at as string };
}
function rowToInvoice(r: Row): RetreatInvoice {
  return {
    id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    kind: (r.kind as RetreatInvoice['kind']) ?? 'balance', number: r.number as string,
    amount: Number(r.amount ?? 0), note: s(r.note), dueDate: s(r.due_date),
    status: (r.status as RetreatInvoice['status']) ?? 'sent',
    discount: Number(r.discount ?? 0), discountNote: s(r.discount_note),
    lineItems: Array.isArray(r.line_items) ? (r.line_items as RetreatInvoiceLine[]) : [],
    issuedAt: (r.issued_at as string) ?? (r.created_at as string), createdBy: s(r.created_by),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

// ─── Load + subscribe (one domain. Retreat data is low-volume) ──────────────
export interface RetreatData {
  retreats: Retreat[]; spaces: RetreatSpace[]; housing: RetreatHousing[]; housingVersions: RetreatHousingVersion[];
  guests: RetreatGuest[];
  documents: RetreatDocument[]; meals: RetreatMeal[]; changeRequests: RetreatChangeRequest[];
  costs: RetreatCost[]; charges: RetreatCharge[]; payments: RetreatPayment[]; issues: RetreatIssue[];
  checklist: RetreatChecklistItem[]; scheduleItems: RetreatScheduleItem[]; feedback: RetreatFeedback[]; reminders: RetreatReminder[];
  invoices: RetreatInvoice[];
}

const RETREAT_TABLES = [
  'retreats', 'retreat_spaces', 'retreat_housing', 'retreat_housing_versions', 'retreat_guests', 'retreat_documents',
  'retreat_meals', 'retreat_change_requests', 'retreat_costs', 'retreat_charges', 'retreat_payments',
  'retreat_issues', 'retreat_checklist', 'retreat_schedule_items', 'retreat_feedback', 'retreat_reminders',
  'retreat_invoices',
];

async function loadRetreatDataInner(campId: string): Promise<RetreatData> {
  const q = (t: string) => supabase.from(t).select('*').eq('camp_id', campId);
  const [re, sp, ho, hv, gst, docs, meals, cr, costs, charges, pays, iss, chk, sched, fb, rem, inv] = await Promise.all([
    q('retreats').order('arrival_date', { ascending: true }),
    q('retreat_spaces').order('sort_order', { ascending: true }),
    q('retreat_housing').order('sort_order', { ascending: true }),
    q('retreat_housing_versions').order('version', { ascending: false }),
    q('retreat_guests').order('sort_order', { ascending: true }),
    q('retreat_documents').order('sort_order', { ascending: true }),
    q('retreat_meals').order('day_date', { ascending: true }),
    q('retreat_change_requests').order('submitted_at', { ascending: false }),
    q('retreat_costs').order('sort_order', { ascending: true }),
    q('retreat_charges').order('sort_order', { ascending: true }),
    q('retreat_payments').order('paid_on', { ascending: false }),
    q('retreat_issues').order('created_at', { ascending: false }),
    q('retreat_checklist').order('sort_order', { ascending: true }),
    q('retreat_schedule_items').order('sort_order', { ascending: true }),
    q('retreat_feedback').order('received_at', { ascending: false }),
    q('retreat_reminders').order('sent_at', { ascending: false }),
    q('retreat_invoices').order('issued_at', { ascending: false }),
  ]);
  assertLoaded('retreats', re, sp, ho, hv, gst, docs, meals, cr, costs, charges, pays, iss, chk, sched, fb, rem, inv);
  return {
    retreats: (re.data ?? []).map((r) => rowToRetreat(r as Row)),
    spaces: (sp.data ?? []).map((r) => rowToSpace(r as Row)),
    housing: (ho.data ?? []).map((r) => rowToHousing(r as Row)),
    housingVersions: (hv.data ?? []).map((r) => rowToHousingVersion(r as Row)),
    guests: (gst.data ?? []).map((r) => rowToGuest(r as Row)),
    documents: (docs.data ?? []).map((r) => rowToDocument(r as Row)),
    meals: (meals.data ?? []).map((r) => rowToMeal(r as Row)),
    changeRequests: (cr.data ?? []).map((r) => rowToChangeRequest(r as Row)),
    costs: (costs.data ?? []).map((r) => rowToCost(r as Row)),
    charges: (charges.data ?? []).map((r) => rowToCharge(r as Row)),
    payments: (pays.data ?? []).map((r) => rowToPayment(r as Row)),
    issues: (iss.data ?? []).map((r) => rowToIssue(r as Row)),
    checklist: (chk.data ?? []).map((r) => rowToChecklistItem(r as Row)),
    scheduleItems: (sched.data ?? []).map((r) => rowToScheduleItem(r as Row)),
    feedback: (fb.data ?? []).map((r) => rowToFeedback(r as Row)),
    reminders: (rem.data ?? []).map((r) => rowToReminder(r as Row)),
    invoices: (inv.data ?? []).map((r) => rowToInvoice(r as Row)),
  };
}

export async function loadRetreats(campId: string): Promise<RetreatData | null> {
  try { return await loadRetreatDataInner(campId); }
  catch (e) { campError('[Supabase] loadRetreats threw:', e); return null; }
}

let retreatChannelCount = 0;
export function subscribeToRetreats(campId: string, onUpdate: (d: RetreatData) => void): () => void {
  const reload = () => loadAndApply('retreats', () => loadRetreatDataInner(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(`retreats-${++retreatChannelCount}`);
  for (const table of RETREAT_TABLES) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog(`[CampOps] retreats status:`, status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) { setTimeout(() => reload(), 10000); } else everSubscribed = true;
    }
  });
  return () => { supabase.removeChannel(channel); };
}

// ─── Writers (fire-and-forget; realtime delivers the authoritative rows) ─────
async function ins(table: string, row: Row) { const { error } = await supabase.from(table).insert(row); if (error) campError(`insert ${table}`, error.message); }
async function upd(table: string, id: string, patch: Row) { const { error } = await supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); if (error) campError(`update ${table}`, error.message); }
async function del(table: string, id: string) { const { error } = await supabase.from(table).delete().eq('id', id); if (error) campError(`delete ${table}`, error.message); }

const CID = () => getCampId();

export function retreatToRow(r: Retreat): Row {
  return {
    id: r.id, camp_id: CID(), group_name: r.groupName, group_type: r.groupType,
    arrival_date: r.arrivalDate, departure_date: r.departureDate, headcount: r.headcount,
    pricing_model: r.pricingModel, flat_rate: r.flatRate,
    rate_per_person_night: r.ratePerPersonNight, deposit_required: r.depositRequired, deposit_received: r.depositReceived,
    deposit_due: r.depositDue,
    coordinator_name: r.coordinatorName, coordinator_email: r.coordinatorEmail, coordinator_phone: r.coordinatorPhone,
    status: r.status, housing_deadline: r.housingDeadline, headcount_cutoff: r.headcountCutoff,
    final_headcount: r.finalHeadcount, final_headcount_at: r.finalHeadcountAt, final_headcount_by: r.finalHeadcountBy,
    housing_submitted_at: r.housingSubmittedAt, housing_submitted_by: r.housingSubmittedBy,
    dietary_flags: r.dietaryFlags, notes: r.notes, portal_token: r.portalToken,
    menu_published: r.menuPublished, change_requests_enabled: r.changeRequestsEnabled, feedback_opens: r.feedbackOpens,
    created_at: r.createdAt, updated_at: r.updatedAt,
  };
}
export const dbAddRetreat = (r: Retreat) => ins('retreats', retreatToRow(r));
export function dbUpdateRetreat(r: Retreat) {
  const row = retreatToRow(r); delete row.id; delete row.camp_id; delete row.created_at;
  return upd('retreats', r.id, row);
}
export const dbDeleteRetreat = (id: string) => del('retreats', id);

export const dbAddSpace = (x: RetreatSpace) => ins('retreat_spaces', { id: x.id, camp_id: CID(), name: x.name, bed_capacity: x.bedCapacity, accessible: x.accessible, notes: x.notes, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateSpace = (x: RetreatSpace) => upd('retreat_spaces', x.id, { name: x.name, bed_capacity: x.bedCapacity, accessible: x.accessible, notes: x.notes, sort_order: x.sortOrder });
export const dbDeleteSpace = (id: string) => del('retreat_spaces', id);

export const dbAddHousing = (x: RetreatHousing) => ins('retreat_housing', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, location_id: x.locationId, space_id: x.spaceId, space_name: x.spaceName, subgroup_name: x.subgroupName, people_count: x.peopleCount, unnamed_count: x.unnamedCount, notes: x.notes, locked: x.locked, roster_driven: x.rosterDriven, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateHousing = (x: RetreatHousing) => upd('retreat_housing', x.id, { location_id: x.locationId, space_id: x.spaceId, space_name: x.spaceName, subgroup_name: x.subgroupName, people_count: x.peopleCount, unnamed_count: x.unnamedCount, notes: x.notes, locked: x.locked, roster_driven: x.rosterDriven, sort_order: x.sortOrder });
export const dbDeleteHousing = (id: string) => del('retreat_housing', id);
export async function dbSetHousingLock(retreatId: string, locked: boolean) { const { error } = await supabase.from('retreat_housing').update({ locked, updated_at: new Date().toISOString() }).eq('retreat_id', retreatId); if (error) campError('lock housing', error.message); }

/** Move guests between rooms (or back to unassigned). A DB trigger keeps retreat_housing in step. */
export async function dbAssignGuests(guestIds: string[], locationId: string | null) {
  if (guestIds.length === 0) return;
  const { error } = await supabase.from('retreat_guests')
    .update({ location_id: locationId, updated_at: new Date().toISOString() })
    .in('id', guestIds);
  if (error) campError('assign guests', error.message);
}

export const dbAddHousingVersion = (x: RetreatHousingVersion) => ins('retreat_housing_versions', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, version: x.version, label: x.label, summary: x.summary, created_by: x.createdBy, created_at: x.createdAt });

export const dbAddDocument = (x: RetreatDocument) => ins('retreat_documents', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, doc_type: x.docType, name: x.name, status: x.status, file_path: x.filePath, signed_by: x.signedBy, signed_at: x.signedAt, due_date: x.dueDate, meta: x.meta, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateDocument = (x: RetreatDocument) => upd('retreat_documents', x.id, { doc_type: x.docType, name: x.name, status: x.status, file_path: x.filePath, signed_by: x.signedBy, signed_at: x.signedAt, due_date: x.dueDate, meta: x.meta, sort_order: x.sortOrder });
export const dbDeleteDocument = (id: string) => del('retreat_documents', id);

export const dbAddMeal = (x: RetreatMeal) => ins('retreat_meals', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, day_date: x.dayDate, meal_period: x.mealPeriod, name: x.name, items: x.items, allergens: x.allergens, alternatives: x.alternatives, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateMeal = (x: RetreatMeal) => upd('retreat_meals', x.id, { day_date: x.dayDate, meal_period: x.mealPeriod, name: x.name, items: x.items, allergens: x.allergens, alternatives: x.alternatives, sort_order: x.sortOrder });
export const dbDeleteMeal = (id: string) => del('retreat_meals', id);

export const dbAddChangeRequest = (x: RetreatChangeRequest) => ins('retreat_change_requests', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, origin: x.origin, kind: x.kind, submitted_by: x.submittedBy, submitted_at: x.submittedAt, body: x.body, status: x.status, response_message: x.responseMessage, internal_note: x.internalNote, responded_by: x.respondedBy, responded_at: x.respondedAt, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateChangeRequest = (x: RetreatChangeRequest) => upd('retreat_change_requests', x.id, { kind: x.kind, body: x.body, status: x.status, response_message: x.responseMessage, internal_note: x.internalNote, responded_by: x.respondedBy, responded_at: x.respondedAt });

export const dbAddCost = (x: RetreatCost) => ins('retreat_costs', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, category: x.category, budgeted: x.budgeted, actual: x.actual, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateCost = (x: RetreatCost) => upd('retreat_costs', x.id, { category: x.category, budgeted: x.budgeted, actual: x.actual, sort_order: x.sortOrder });
export const dbDeleteCost = (id: string) => del('retreat_costs', id);

export const dbAddCharge = (x: RetreatCharge) => ins('retreat_charges', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, description: x.description, qty: x.qty, unit_rate: x.unitRate, amount: x.amount, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateCharge = (x: RetreatCharge) => upd('retreat_charges', x.id, { description: x.description, qty: x.qty, unit_rate: x.unitRate, amount: x.amount, sort_order: x.sortOrder });
export const dbDeleteCharge = (id: string) => del('retreat_charges', id);

export const dbAddPayment = (x: RetreatPayment) => ins('retreat_payments', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, paid_on: x.paidOn, amount: x.amount, method: x.method, kind: x.kind, note: x.note, created_at: x.createdAt });
// retreat_payments has no updated_at column, so we can't use the shared `upd` helper.
export async function dbUpdatePayment(x: RetreatPayment) { const { error } = await supabase.from('retreat_payments').update({ paid_on: x.paidOn, amount: x.amount, method: x.method, kind: x.kind, note: x.note }).eq('id', x.id); if (error) campError('update payment', error.message); }
export const dbDeletePayment = (id: string) => del('retreat_payments', id);

export const dbAddIssue = (x: RetreatIssue) => ins('retreat_issues', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, title: x.title, reported_by: x.reportedBy, priority: x.priority, assigned_to: x.assignedTo, status: x.status, notes: x.notes, created_at: x.createdAt, resolved_at: x.resolvedAt, updated_at: x.updatedAt });
export const dbUpdateIssue = (x: RetreatIssue) => upd('retreat_issues', x.id, { title: x.title, reported_by: x.reportedBy, priority: x.priority, assigned_to: x.assignedTo, status: x.status, notes: x.notes, resolved_at: x.resolvedAt });
export const dbDeleteIssue = (id: string) => del('retreat_issues', id);

export const dbAddChecklistItem = (x: RetreatChecklistItem) => ins('retreat_checklist', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, phase: x.phase, title: x.title, is_done: x.isDone, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateChecklistItem = (x: RetreatChecklistItem) => upd('retreat_checklist', x.id, { phase: x.phase, title: x.title, is_done: x.isDone, sort_order: x.sortOrder });
export const dbDeleteChecklistItem = (id: string) => del('retreat_checklist', id);

export const dbAddScheduleItem = (x: RetreatScheduleItem) => ins('retreat_schedule_items', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, day_date: x.dayDate, time_label: x.timeLabel, title: x.title, location: x.location, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateScheduleItem = (x: RetreatScheduleItem) => upd('retreat_schedule_items', x.id, { day_date: x.dayDate, time_label: x.timeLabel, title: x.title, location: x.location, sort_order: x.sortOrder });
export const dbDeleteScheduleItem = (id: string) => del('retreat_schedule_items', id);

export const dbAddFeedback = (x: RetreatFeedback) => ins('retreat_feedback', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, overall: x.overall, accommodations: x.accommodations, food: x.food, communication: x.communication, comment: x.comment, returning_status: x.returningStatus, received_at: x.receivedAt, created_at: x.createdAt });
export const dbDeleteFeedback = (id: string) => del('retreat_feedback', id);

export const dbAddReminder = (x: RetreatReminder) => ins('retreat_reminders', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, reminder_type: x.reminderType, message: x.message, sent_by: x.sentBy, sent_at: x.sentAt });

export const dbAddInvoice = (x: RetreatInvoice) => ins('retreat_invoices', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, kind: x.kind, number: x.number, amount: x.amount, note: x.note, due_date: x.dueDate, status: x.status, discount: x.discount, discount_note: x.discountNote, line_items: x.lineItems, issued_at: x.issuedAt, created_by: x.createdBy, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateInvoice = (x: RetreatInvoice) => upd('retreat_invoices', x.id, { kind: x.kind, number: x.number, amount: x.amount, note: x.note, due_date: x.dueDate, status: x.status, discount: x.discount, discount_note: x.discountNote, line_items: x.lineItems });
export const dbDeleteInvoice = (id: string) => del('retreat_invoices', id);

// ─── Document storage (private bucket, signed URLs) ──────────────────────────
const DOC_BUCKET = 'retreat-documents';

/** Throws UploadError if the file did not store. Never returns a path for a failed upload. */
export async function dbUploadRetreatDocument(
  file: File, retreatId: string, onProgress?: UploadProgress,
): Promise<string> {
  const path = `${CID()}/${retreatId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  return uploadToBucket(supabase, DOC_BUCKET, path, file, onProgress);
}

/** Can this document be opened? Signs it and reads a byte back, exactly as a viewer would. */
export const dbVerifyRetreatDocument = (path: string) => verifyReadable(supabase, DOC_BUCKET, path);

/**
 * Read the stored row back and confirm it points at the file.
 *
 * The optimistic row in the store proves nothing about what the database holds. This is what
 * closes the loop between "we sent an insert" and "a document exists that anyone else loading
 * this retreat will also see".
 */
export async function dbConfirmDocumentStored(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('retreat_documents').select('id, file_path').eq('id', id).maybeSingle();
  if (error) { campError('confirm document stored', error.message); return false; }
  return !!data?.file_path;
}
export async function dbSignRetreatDocument(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('retreat-documents').createSignedUrl(path, 60 * 30);
  if (error) { campError('sign retreat doc', error.message); return null; }
  return data?.signedUrl ?? null;
}

/** Rotate the guest-portal token, invalidating the old link. Returns the new token. */
export async function dbRegeneratePortalToken(retreatId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('regenerate_portal_token', { p_retreat_id: retreatId });
  if (error) { campError('regenerate portal token', error.message); return null; }
  return (data as string) ?? null;
}
