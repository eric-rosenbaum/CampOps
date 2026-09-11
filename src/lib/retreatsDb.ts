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
  RetreatSpaceRequest, RetreatContact, RetreatTouchpoint, RetreatProposal, RetreatAddon,
  ScheduledMessage, SpaceRequestConflicts, RetreatIntakeDraft,
} from './types';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

// ─── Row → type ──────────────────────────────────────────────────────────────
export function rowToRetreat(r: Row): Retreat {
  return {
    id: r.id as string, campId: r.camp_id as string,
    groupName: r.group_name as string, groupType: (r.group_type as string) ?? 'other',
    arrivalDate: s(r.arrival_date), departureDate: s(r.departure_date),
    arrivalTime: s(r.arrival_time), departureTime: s(r.departure_time),
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
    dietaryNotes: s(r.dietary_notes),
    enquirySeenAt: s(r.enquiry_seen_at),
    dietaryNoneConfirmed: Boolean(r.dietary_none_confirmed),
    notes: s(r.notes), portalToken: r.portal_token as string,
    // Pipeline. Rows written before these columns existed are real bookings, not leads, so an
    // absent stage reads as 'won' rather than dropping every existing retreat into a funnel.
    leadStage: (r.lead_stage as Retreat['leadStage']) ?? 'won',
    leadSource: s(r.lead_source), lostReason: s(r.lost_reason),
    nextAction: s(r.next_action), nextActionOn: s(r.next_action_on),
    ownerId: s(r.owner_id), estimatedValue: n(r.estimated_value),
    dateFlexibility: s(r.date_flexibility), intakeNotes: s(r.intake_notes),
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
  return { id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string, description: r.description as string, qty: Number(r.qty ?? 1), unitRate: Number(r.unit_rate ?? 0), amount: Number(r.amount ?? 0), addonId: s(r.addon_id), requestedByGuest: Boolean(r.requested_by_guest), sortOrder: Number(r.sort_order ?? 0), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
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
    stripeSessionId: s(r.stripe_session_id), paymentLinkUrl: s(r.payment_link_url),
    paymentLinkExpiresAt: s(r.payment_link_expires_at), paidAt: s(r.paid_at),
    amountPaid: Number(r.amount_paid ?? 0),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

function rowToSpaceRequest(r: Row): RetreatSpaceRequest {
  return {
    id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    locationId: r.location_id as string, dayDate: r.day_date as string,
    endDate: (r.end_date as string) ?? (r.day_date as string),
    startLabel: s(r.start_label), endLabel: s(r.end_label), purpose: s(r.purpose),
    expectedCount: n(r.expected_count),
    layout: (r.layout as RetreatSpaceRequest['layout']) ?? 'open',
    layoutOther: s(r.layout_other),
    setupNotes: s(r.setup_notes), campNotes: s(r.camp_notes),
    status: (r.status as RetreatSpaceRequest['status']) ?? 'requested',
    responseMessage: s(r.response_message), respondedBy: s(r.responded_by),
    respondedAt: s(r.responded_at),
    workOrderId: s(r.work_order_id), strikeOrderId: s(r.strike_order_id),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}
function rowToContact(r: Row): RetreatContact {
  return {
    id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    name: r.name as string, role: s(r.role), email: s(r.email), phone: s(r.phone),
    isPrimary: Boolean(r.is_primary), notes: s(r.notes),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}
function rowToTouchpoint(r: Row): RetreatTouchpoint {
  return {
    id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    kind: (r.kind as RetreatTouchpoint['kind']) ?? 'note',
    occurredAt: r.occurred_at as string, summary: r.summary as string,
    byUserId: s(r.by_user_id), byName: s(r.by_name), createdAt: r.created_at as string,
  };
}
function rowToProposal(r: Row): RetreatProposal {
  return {
    id: r.id as string, campId: r.camp_id as string, retreatId: r.retreat_id as string,
    version: Number(r.version ?? 1),
    lineItems: Array.isArray(r.line_items) ? (r.line_items as RetreatInvoiceLine[]) : [],
    total: Number(r.total ?? 0), validUntil: s(r.valid_until),
    terms: s(r.terms), intro: s(r.intro),
    status: (r.status as RetreatProposal['status']) ?? 'draft',
    sentAt: s(r.sent_at), viewedAt: s(r.viewed_at), acceptedAt: s(r.accepted_at),
    acceptedByName: s(r.accepted_by_name), declinedAt: s(r.declined_at),
    declineReason: s(r.decline_reason), createdBy: s(r.created_by),
    depositAmount: r.deposit_amount != null ? Number(r.deposit_amount) : null,
    pricingModel: s(r.pricing_model),
    ratePerPersonNight: r.rate_per_person_night != null ? Number(r.rate_per_person_night) : null,
    flatRate: r.flat_rate != null ? Number(r.flat_rate) : null,
    peopleCount: r.people_count != null ? Number(r.people_count) : null,
    nights: r.nights != null ? Number(r.nights) : null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}
function rowToAddon(r: Row): RetreatAddon {
  return {
    id: r.id as string, campId: r.camp_id as string, name: r.name as string,
    description: s(r.description), unit: (r.unit as RetreatAddon['unit']) ?? 'per_person',
    rate: Number(r.rate ?? 0), guestSelectable: Boolean(r.guest_selectable),
    isActive: r.is_active !== false, sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}
function rowToScheduledMessage(r: Row): ScheduledMessage {
  return {
    id: r.id as string, campId: r.camp_id as string,
    subjectType: (r.subject_type as ScheduledMessage['subjectType']) ?? 'retreat',
    subjectId: r.subject_id as string, ruleKey: r.rule_key as string,
    recipientKind: (r.recipient_kind as ScheduledMessage['recipientKind']) ?? 'guest',
    toEmail: r.to_email as string, toName: s(r.to_name), replyTo: s(r.reply_to),
    subject: r.subject as string, bodyHtml: r.body_html as string,
    sendAfter: r.send_after as string,
    state: (r.state as ScheduledMessage['state']) ?? 'scheduled',
    suppressedReason: s(r.suppressed_reason), sentAt: s(r.sent_at), error: s(r.error),
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
  spaceRequests: RetreatSpaceRequest[];
  contacts: RetreatContact[];
  touchpoints: RetreatTouchpoint[];
  proposals: RetreatProposal[];
  addons: RetreatAddon[];
  /** What is queued to go out. Nothing sends silently — the camp can see and cancel it. */
  outbox: ScheduledMessage[];
}

const RETREAT_TABLES = [
  'retreats', 'retreat_spaces', 'retreat_housing', 'retreat_housing_versions', 'retreat_guests', 'retreat_documents',
  'retreat_meals', 'retreat_change_requests', 'retreat_costs', 'retreat_charges', 'retreat_payments',
  'retreat_issues', 'retreat_checklist', 'retreat_schedule_items', 'retreat_feedback', 'retreat_reminders',
  'retreat_invoices', 'retreat_space_requests', 'retreat_contacts', 'retreat_touchpoints',
  'retreat_proposals', 'retreat_addon_catalog', 'scheduled_messages',
];

async function loadRetreatDataInner(campId: string): Promise<RetreatData> {
  const q = (t: string) => supabase.from(t).select('*').eq('camp_id', campId);
  const [re, sp, ho, hv, gst, docs, meals, cr, costs, charges, pays, iss, chk, sched, fb, rem, inv,
         sreq, cont, touch, props, addons, obox] = await Promise.all([
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
    q('retreat_space_requests').order('day_date', { ascending: true }),
    q('retreat_contacts').order('created_at', { ascending: true }),
    q('retreat_touchpoints').order('occurred_at', { ascending: false }),
    q('retreat_proposals').order('version', { ascending: false }),
    q('retreat_addon_catalog').order('sort_order', { ascending: true }),
    q('scheduled_messages').order('send_after', { ascending: true }),
  ]);
  assertLoaded('retreats', re, sp, ho, hv, gst, docs, meals, cr, costs, charges, pays, iss, chk,
               sched, fb, rem, inv, sreq, cont, touch, props, addons, obox);
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
    spaceRequests: (sreq.data ?? []).map((r) => rowToSpaceRequest(r as Row)),
    contacts: (cont.data ?? []).map((r) => rowToContact(r as Row)),
    touchpoints: (touch.data ?? []).map((r) => rowToTouchpoint(r as Row)),
    proposals: (props.data ?? []).map((r) => rowToProposal(r as Row)),
    addons: (addons.data ?? []).map((r) => rowToAddon(r as Row)),
    outbox: (obox.data ?? []).map((r) => rowToScheduledMessage(r as Row)),
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
    arrival_date: r.arrivalDate, departure_date: r.departureDate,
    arrival_time: r.arrivalTime, departure_time: r.departureTime, headcount: r.headcount,
    pricing_model: r.pricingModel, flat_rate: r.flatRate,
    rate_per_person_night: r.ratePerPersonNight, deposit_required: r.depositRequired, deposit_received: r.depositReceived,
    deposit_due: r.depositDue,
    coordinator_name: r.coordinatorName, coordinator_email: r.coordinatorEmail, coordinator_phone: r.coordinatorPhone,
    status: r.status, housing_deadline: r.housingDeadline, headcount_cutoff: r.headcountCutoff,
    final_headcount: r.finalHeadcount, final_headcount_at: r.finalHeadcountAt, final_headcount_by: r.finalHeadcountBy,
    housing_submitted_at: r.housingSubmittedAt, housing_submitted_by: r.housingSubmittedBy,
    dietary_flags: r.dietaryFlags, dietary_notes: r.dietaryNotes,
    dietary_none_confirmed: r.dietaryNoneConfirmed,
    notes: r.notes, portal_token: r.portalToken,
    lead_stage: r.leadStage, lead_source: r.leadSource, lost_reason: r.lostReason,
    next_action: r.nextAction, next_action_on: r.nextActionOn, owner_id: r.ownerId,
    estimated_value: r.estimatedValue, date_flexibility: r.dateFlexibility,
    intake_notes: r.intakeNotes,
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

/**
 * Remove the work orders a booking generated.
 *
 * Must run BEFORE the retreat row goes: issues.retreat_id is ON DELETE SET NULL, so once the
 * parent is gone there is nothing left to find them by.
 */
export async function dbDeleteRetreatWorkOrders(retreatId: string): Promise<void> {
  const { error } = await supabase.from('issues').delete().eq('retreat_id', retreatId);
  if (error) campError('delete retreat work orders', error.message);
}

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

/** Somebody has looked at this enquiry, so the banner can stop announcing it. */
export async function dbMarkEnquirySeen(retreatId: string) {
  const { error } = await supabase.rpc('mark_enquiry_seen', { p_retreat_id: retreatId });
  if (error) campError('mark enquiry seen', error.message);
}

/**
 * Re-read this camp's documents.
 *
 * For the paths where a row is created by the DATABASE rather than by the client -- the agreement
 * that attaches itself from the camp's template -- so the list shows what actually exists rather
 * than an optimistic guess at it.
 */
export async function dbFetchRetreatDocuments(): Promise<RetreatDocument[] | null> {
  const { data, error } = await supabase
    .from('retreat_documents').select('*').eq('camp_id', CID())
    .order('sort_order', { ascending: true });
  if (error) { campError('fetch documents', error.message); return null; }
  return (data ?? []).map((r) => rowToDocument(r as Row));
}

export const dbAddMeal = (x: RetreatMeal) => ins('retreat_meals', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, day_date: x.dayDate, meal_period: x.mealPeriod, name: x.name, items: x.items, allergens: x.allergens, alternatives: x.alternatives, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateMeal = (x: RetreatMeal) => upd('retreat_meals', x.id, { day_date: x.dayDate, meal_period: x.mealPeriod, name: x.name, items: x.items, allergens: x.allergens, alternatives: x.alternatives, sort_order: x.sortOrder });
export const dbDeleteMeal = (id: string) => del('retreat_meals', id);

export const dbAddChangeRequest = (x: RetreatChangeRequest) => ins('retreat_change_requests', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, origin: x.origin, kind: x.kind, submitted_by: x.submittedBy, submitted_at: x.submittedAt, body: x.body, status: x.status, response_message: x.responseMessage, internal_note: x.internalNote, responded_by: x.respondedBy, responded_at: x.respondedAt, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateChangeRequest = (x: RetreatChangeRequest) => upd('retreat_change_requests', x.id, { kind: x.kind, body: x.body, status: x.status, response_message: x.responseMessage, internal_note: x.internalNote, responded_by: x.respondedBy, responded_at: x.respondedAt });

export const dbAddCost = (x: RetreatCost) => ins('retreat_costs', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, category: x.category, budgeted: x.budgeted, actual: x.actual, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateCost = (x: RetreatCost) => upd('retreat_costs', x.id, { category: x.category, budgeted: x.budgeted, actual: x.actual, sort_order: x.sortOrder });
export const dbDeleteCost = (id: string) => del('retreat_costs', id);

export const dbAddCharge = (x: RetreatCharge) => ins('retreat_charges', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, description: x.description, qty: x.qty, unit_rate: x.unitRate, amount: x.amount, addon_id: x.addonId, requested_by_guest: x.requestedByGuest, sort_order: x.sortOrder, created_at: x.createdAt, updated_at: x.updatedAt });
export const dbUpdateCharge = (x: RetreatCharge) => upd('retreat_charges', x.id, { description: x.description, qty: x.qty, unit_rate: x.unitRate, amount: x.amount, addon_id: x.addonId, sort_order: x.sortOrder });
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

// amount_paid / paid_at / stripe_session_id are written by the Stripe webhook with the service
// role, never from a form. A camp editing an invoice must not be able to declare it paid.
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

/**
 * The camp's own agreement, kept once and reused for every group.
 *
 * Same bucket as the per-retreat documents, filed under the camp rather than a retreat because it
 * belongs to none of them. attach_agreement_from_template() copies it onto each booking that has
 * no agreement of its own.
 */
export async function dbUploadCampAgreement(
  file: File, onProgress?: UploadProgress,
): Promise<string> {
  const path = `${CID()}/camp-agreement/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  return uploadToBucket(supabase, DOC_BUCKET, path, file, onProgress);
}

/**
 * Point the camp at a stored agreement.
 *
 * Written only after the file has been read back. The whole reason a camp-level template exists
 * is that a proposal attaches it unattended -- a path that points at nothing would attach nothing,
 * silently, on every proposal from then on.
 */
export async function dbSetCampAgreement(
  campId: string, path: string | null, name: string | null,
): Promise<string | null> {
  if (path && !(await verifyReadable(supabase, DOC_BUCKET, path))) {
    return 'The file uploaded but could not be opened afterwards. Nothing was saved, so try again.';
  }
  const { error } = await supabase
    .from('camps')
    .update({ agreement_template_path: path, agreement_template_name: name })
    .eq('id', campId);
  if (error) { campError('set camp agreement', error.message); return error.message; }
  return null;
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

// ═══════════════════════════════════════════════════════════════════════════════
// The seam: a group's request becomes the property team's work
// ═══════════════════════════════════════════════════════════════════════════════

const spaceRequestRow = (x: RetreatSpaceRequest): Row => ({
  location_id: x.locationId, day_date: x.dayDate, end_date: x.endDate ?? x.dayDate,
  start_label: x.startLabel, end_label: x.endLabel, purpose: x.purpose,
  expected_count: x.expectedCount, layout: x.layout, layout_other: x.layoutOther,
  setup_notes: x.setupNotes, camp_notes: x.campNotes, status: x.status,
  response_message: x.responseMessage,
  // work_order_id / strike_order_id are set by approve_space_request(), never from a form. A
  // work order that lost its link would be work nobody could trace back to a group.
});

export const dbAddSpaceRequest = (x: RetreatSpaceRequest) =>
  ins('retreat_space_requests', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, ...spaceRequestRow(x) });
export const dbUpdateSpaceRequest = (x: RetreatSpaceRequest) =>
  upd('retreat_space_requests', x.id, spaceRequestRow(x));
export const dbDeleteSpaceRequest = (id: string) => del('retreat_space_requests', id);

/**
 * What the camp needs to see before saying yes.
 *
 * Warnings, plus exactly one hard stop (the space is out of service). Approval is a judgement
 * call — some camps genuinely do run two groups through the Lodge on the same afternoon — so the
 * system's job is to surface the collision, not to refuse it.
 */
export async function fetchSpaceRequestConflicts(id: string): Promise<SpaceRequestConflicts | null> {
  const { data, error } = await supabase.rpc('space_request_conflicts', { p_request_id: id });
  if (error) { campError('space request conflicts', error.message); return null; }
  const d = data as Record<string, unknown> | null;
  if (!d) return null;
  return {
    doubleBooked: (d.double_booked as SpaceRequestConflicts['doubleBooked']) ?? [],
    alsoADorm: Boolean(d.also_a_dorm),
    housedThatNight: (d.housed_that_night as string[]) ?? [],
    buildingHousingOthers: (d.building_housing_others as string[]) ?? [],
    outOfService: Boolean(d.out_of_service),
    outOfServiceReason: (d.out_of_service_reason as string) ?? null,
    expectedBack: (d.expected_back as string) ?? null,
    overCapacity: Boolean(d.over_capacity),
    capacitySeated: (d.capacity_seated as number) ?? null,
  };
}

/**
 * Approve, and generate the work.
 *
 * TWO work orders, not one: set-up before, strike after. Camps forget the strike every time, and
 * a rental turnover is set-up plus tear-down without exception. Returns the ids so the UI can
 * link straight through to the work it just created.
 */
export async function dbApproveSpaceRequest(
  id: string, campNotes: string | null, message: string | null,
): Promise<{ setupId: string; strikeId: string | null } | string> {
  const { data, error } = await supabase.rpc('approve_space_request',
    { p_request_id: id, p_camp_notes: campNotes, p_message: message });
  if (error) { campError('approve space request', error.message); return error.message; }
  const d = data as Record<string, unknown>;
  return { setupId: d.setup_id as string, strikeId: (d.strike_id as string) ?? null };
}

export async function dbDeclineSpaceRequest(id: string, message: string | null) {
  const { error } = await supabase.from('retreat_space_requests')
    .update({ status: 'declined', response_message: message, responded_at: new Date().toISOString() })
    .eq('id', id);
  if (error) campError('decline space request', error.message);
}

/**
 * The bigger job: one housekeeping work order per assigned room when a group departs.
 *
 * The same generator as the program-space seam, pointed at retreat_housing instead. Idempotent,
 * so running it twice for one departure does not double the crew's list.
 */
export async function dbGenerateTurnover(retreatId: string, scope: 'room' | 'building' = 'room'): Promise<number> {
  const { data, error } = await supabase.rpc('generate_turnover_work',
    { p_retreat_id: retreatId, p_scope: scope });
  if (error) { campError('generate turnover', error.message); return 0; }
  return (data as number) ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

const contactRow = (x: RetreatContact): Row => ({
  name: x.name, role: x.role, email: x.email, phone: x.phone,
  is_primary: x.isPrimary, notes: x.notes,
});
export const dbAddContact = (x: RetreatContact) =>
  ins('retreat_contacts', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, ...contactRow(x) });
export const dbUpdateContact = (x: RetreatContact) => upd('retreat_contacts', x.id, contactRow(x));
export const dbDeleteContact = (id: string) => del('retreat_contacts', id);

export const dbAddTouchpoint = (x: RetreatTouchpoint) => ins('retreat_touchpoints', {
  id: x.id, camp_id: CID(), retreat_id: x.retreatId, kind: x.kind,
  occurred_at: x.occurredAt, summary: x.summary, by_user_id: x.byUserId, by_name: x.byName,
});
export const dbDeleteTouchpoint = (id: string) => del('retreat_touchpoints', id);

// ═══════════════════════════════════════════════════════════════════════════════
// Proposals and add-ons
// ═══════════════════════════════════════════════════════════════════════════════

const proposalRow = (x: RetreatProposal): Row => ({
  version: x.version, line_items: x.lineItems, total: x.total, valid_until: x.validUntil,
  terms: x.terms, intro: x.intro, status: x.status, sent_at: x.sentAt,
  created_by: x.createdBy,
  deposit_amount: x.depositAmount, pricing_model: x.pricingModel,
  rate_per_person_night: x.ratePerPersonNight, flat_rate: x.flatRate,
  people_count: x.peopleCount, nights: x.nights,
  // viewed_at / accepted_at are written when the GROUP acts, through the portal RPC. A camp
  // marking its own proposal "viewed" would destroy the one signal this table exists for.
});
export const dbAddProposal = (x: RetreatProposal) =>
  ins('retreat_proposals', { id: x.id, camp_id: CID(), retreat_id: x.retreatId, ...proposalRow(x) });
export const dbUpdateProposal = (x: RetreatProposal) => upd('retreat_proposals', x.id, proposalRow(x));
/**
 * Give a retreat the camp's stored agreement to sign, if it has none of its own.
 *
 * Returns the new document id, or null when the camp keeps no template or this group already
 * has an agreement -- including one uploaded for them specifically, which wins.
 */
export async function dbAttachAgreementFromTemplate(retreatId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('attach_agreement_from_template', { p_retreat_id: retreatId });
  if (error) { campError('attach agreement', error.message); return null; }
  return (data as string) ?? null;
}

export const dbDeleteProposal = (id: string) => del('retreat_proposals', id);

/** Build the lines from the rate card and existing charges, rather than asking anyone to retype them. */
export async function fetchProposalLines(retreatId: string): Promise<RetreatInvoiceLine[]> {
  const { data, error } = await supabase.rpc('build_proposal_lines', { p_retreat_id: retreatId });
  if (error) { campError('build proposal lines', error.message); return []; }
  return (data as RetreatInvoiceLine[]) ?? [];
}

const addonRow = (x: RetreatAddon): Row => ({
  name: x.name, description: x.description, unit: x.unit, rate: x.rate,
  guest_selectable: x.guestSelectable, is_active: x.isActive, sort_order: x.sortOrder,
});
export const dbAddAddon = (x: RetreatAddon) => ins('retreat_addon_catalog', { id: x.id, camp_id: CID(), ...addonRow(x) });
export const dbUpdateAddon = (x: RetreatAddon) => upd('retreat_addon_catalog', x.id, addonRow(x));
export const dbDeleteAddon = (id: string) => del('retreat_addon_catalog', id);

// ═══════════════════════════════════════════════════════════════════════════════
// Payments (Stripe Connect — the money is the camp's, not ours)
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchPaymentsStatus(): Promise<{ connected: boolean; chargesEnabled: boolean } | null> {
  const { data, error } = await supabase.rpc('camp_payments_status', { p_camp_id: CID() });
  if (error) { campError('payments status', error.message); return null; }
  const d = data as Record<string, unknown> | null;
  if (!d) return null;
  return { connected: Boolean(d.connected), chargesEnabled: Boolean(d.charges_enabled) };
}

/** Start (or resume) Stripe onboarding. Returns a URL to send the camp admin to. */
/**
 * The real error out of an edge function.
 *
 * `functions.invoke` rejects with a generic FunctionsHttpError whose `.message` is only
 * "Edge Function returned a non-2xx status code" — the actual sentence is in the response body.
 * Reporting the generic one told us "Stripe could not be reached" for a plain 400 about a missing
 * field, and sent us looking at the network instead of at the call. `src/lib/email.ts` already
 * unwraps it this way; Stripe should too.
 */
async function fnErrorMessage(error: { message?: string; context?: Response }, fallback: string): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch { /* fall through to the generic message */ }
  return error?.message || fallback;
}

/**
 * Where Stripe sends the browser back to.
 *
 * The function will fall back to the request's Origin header, but sending it explicitly is what
 * makes the return land on the right host when the app is opened from a preview URL rather than
 * the canonical one.
 */
const appOrigin = () => (typeof window === 'undefined' ? undefined : window.location.origin);

/**
 * Start (or resume) Stripe onboarding for THIS camp.
 *
 * `campId` is required by the function and is not optional: `onboard` and `status` both act on a
 * camp, and the function re-checks is_camp_admin() against whichever camp it is given rather than
 * trusting the caller's session to imply one. Omitting it returns a 400 that surfaces in the UI
 * as "Stripe could not be reached", which is how this was missed until it ran for real.
 */
export async function startStripeOnboarding(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('stripe-connect',
    { body: { action: 'onboard', campId: CID(), origin: appOrigin() } });
  if (error) {
    const msg = await fnErrorMessage(error, 'Could not start Stripe onboarding.');
    campError('stripe onboard', msg);
    throw new Error(msg);
  }
  return (data as { url?: string })?.url ?? null;
}

export async function refreshStripeStatus(): Promise<void> {
  const { error } = await supabase.functions.invoke('stripe-connect',
    { body: { action: 'status', campId: CID() } });
  if (error) campError('stripe status', await fnErrorMessage(error, 'Could not read Stripe status.'));
}

/**
 * Mint a Checkout link for one invoice. Funds settle to the camp's own connected account.
 *
 * No campId here on purpose: the function derives the camp from the invoice, so an admin of one
 * camp cannot mint a link against another camp's invoice by pairing their own campId with it.
 */
export async function createPaymentLink(invoiceId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('stripe-connect',
    { body: { action: 'payment_link', invoiceId, origin: appOrigin() } });
  if (error) {
    const msg = await fnErrorMessage(error, 'Could not create a payment link.');
    campError('payment link', msg);
    throw new Error(msg);
  }
  return (data as { url?: string })?.url ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Intake and the outbox
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Turn pasted call notes or an email thread into a draft retreat.
 *
 * Never auto-creates. Every field comes back with the sentence it was taken from, because
 * without that people re-read the email to check and the feature has saved nothing.
 */
export async function draftRetreatFromNotes(text: string, campName: string): Promise<RetreatIntakeDraft> {
  const { data, error } = await supabase.functions.invoke('retreat-intake', {
    body: { text, today: new Date().toISOString().slice(0, 10), campName },
  });
  // The reason has to reach the screen. Returning null lost it, so a missing API key, text that
  // was too long and a dropped connection all surfaced as the same sentence and none of them
  // told the user which one it was.
  if (error) {
    const msg = await fnErrorMessage(error, 'The notes could not be read.');
    campError('retreat intake', msg);
    throw new Error(msg);
  }
  // Several paths in the function report failure with a 200 and an { error } body, so a
  // successful HTTP call is not on its own a successful read.
  const body = data as (RetreatIntakeDraft & { error?: string }) | null;
  if (!body || body.error) throw new Error(body?.error ?? 'The notes could not be read.');
  return body;
}

/** Re-plan the outbox now rather than waiting for tonight. Used after a deadline changes. */
export async function dbReplanMessages(): Promise<number> {
  const { data, error } = await supabase.rpc('plan_retreat_messages', { p_camp_id: CID() });
  if (error) { campError('plan messages', error.message); return 0; }
  return (data as number) ?? 0;
}

/** Cancel one queued message. Nothing sends silently, and nothing is unstoppable. */
export async function dbCancelMessage(id: string, reason = 'cancelled by the camp') {
  const { error } = await supabase.from('scheduled_messages')
    .update({ state: 'cancelled', suppressed_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', id).eq('state', 'scheduled');
  if (error) campError('cancel message', error.message);
}

export async function dbEditQueuedMessage(id: string, subject: string, bodyHtml: string) {
  const { error } = await supabase.from('scheduled_messages')
    .update({ subject, body_html: bodyHtml, updated_at: new Date().toISOString() })
    .eq('id', id).eq('state', 'scheduled');
  if (error) campError('edit queued message', error.message);
}
