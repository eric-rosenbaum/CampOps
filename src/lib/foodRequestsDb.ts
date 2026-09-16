/**
 * All Supabase access for food requests.
 *
 * Reads join the `commissary-menu` domain (db.ts loadMenuData calls queryFoodRequestData), so
 * requests arrive and refresh on the same channel that already feeds kitchen demand. Writes are
 * RPCs only: the tables take no client writes, because the state machine has to hold for every
 * staff member and every staff member can otherwise write every commissary table.
 */
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  FoodProgram, FoodRequest, FoodRequestLine, FoodRequestSettings, FoodRequestMessage, FoodFormItem,
} from './foodRequestTypes';

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));
/** "14:00:00" → "14:00" */
const hhmm = (v: unknown) => String(v ?? '').slice(0, 5);

export function rowToFoodProgram(r: Record<string, unknown>): FoodProgram {
  return {
    id: r.id as string,
    campId: r.camp_id as string,
    name: r.name as string,
    leadName: str(r.lead_name),
    leadEmail: str(r.lead_email),
    leadPhone: str(r.lead_phone),
    color: str(r.color),
    requestToken: r.request_token as string,
    active: r.active !== false,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function rowToFoodRequest(r: Record<string, unknown>): FoodRequest {
  return {
    id: r.id as string,
    campId: r.camp_id as string,
    programId: str(r.program_id),
    requestedBy: str(r.requested_by),
    requesterName: r.requester_name as string,
    requesterEmail: str(r.requester_email),
    requesterPhone: str(r.requester_phone),
    notifyBy: r.notify_by === 'text' ? 'text' : 'email',
    source: r.source === 'app' ? 'app' : 'link',
    pickupDate: r.pickup_date as string,
    pickupTime: hhmm(r.pickup_time),
    purpose: str(r.purpose),
    headcount: num(r.headcount),
    status: r.status as FoodRequest['status'],
    noticeHours: Number(r.notice_hours ?? 0),
    cutoffHours: Number(r.cutoff_hours ?? 72),
    isLate: r.is_late === true,
    kitchenNote: str(r.kitchen_note),
    changedByKitchen: r.changed_by_kitchen === true,
    decidedBy: str(r.decided_by),
    decidedByName: str(r.decided_by_name),
    decidedAt: str(r.decided_at),
    readyAt: str(r.ready_at),
    pickedUpAt: str(r.picked_up_at),
    pickedUpByName: str(r.picked_up_by_name),
    missedAt: str(r.missed_at),
    cancelledAt: str(r.cancelled_at),
    cancelledBy: (r.cancelled_by as FoodRequest['cancelledBy']) ?? null,
    statusToken: r.status_token as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function rowToFoodRequestLine(r: Record<string, unknown>): FoodRequestLine {
  return {
    id: r.id as string,
    requestId: r.request_id as string,
    campId: r.camp_id as string,
    itemId: str(r.item_id),
    label: r.label as string,
    qtyRequested: Number(r.qty_requested ?? 0),
    unitLabel: str(r.unit_label),
    unitInBase: num(r.unit_in_base),
    qtyRequestedBase: num(r.qty_requested_base),
    qtyApproved: num(r.qty_approved),
    approvedUnitLabel: str(r.approved_unit_label),
    qtyApprovedBase: num(r.qty_approved_base),
    note: str(r.note),
    lineState: (r.line_state as FoodRequestLine['lineState']) ?? 'ok',
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export function rowToFoodSettings(r: Record<string, unknown>): FoodRequestSettings {
  return {
    campId: r.camp_id as string,
    cutoffHours: Number(r.cutoff_hours ?? 72),
    kitchenEmails: (r.kitchen_emails as string[]) ?? [],
    pickupLocation: str(r.pickup_location),
  };
}

export interface FoodRequestData {
  foodPrograms: FoodProgram[];
  foodRequests: FoodRequest[];
  foodRequestLines: FoodRequestLine[];
  foodRequestSettings: FoodRequestSettings | null;
}

/** The subscribe array for the commissary-menu channel. */
export const FOOD_REQUEST_TABLES = ['food_programs', 'food_requests', 'food_request_lines', 'food_request_settings'];

type Result = { error: { message: string } | null };

/** Loaded inside loadMenuData; returns the results for its assertLoaded check. */
export async function queryFoodRequestData(campId: string): Promise<{ results: Result[]; build: () => FoodRequestData }> {
  const [pRes, rRes, lRes, sRes] = await Promise.all([
    supabase.from('food_programs').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('food_requests').select('*').eq('camp_id', campId).order('pickup_date', { ascending: true }),
    supabase.from('food_request_lines').select('*').eq('camp_id', campId).order('sort_order', { ascending: true }),
    supabase.from('food_request_settings').select('*').eq('camp_id', campId).maybeSingle(),
  ]);
  return {
    results: [pRes, rRes, lRes, sRes],
    build: () => ({
      foodPrograms: (pRes.data ?? []).map((r) => rowToFoodProgram(r as Record<string, unknown>)),
      foodRequests: (rRes.data ?? []).map((r) => rowToFoodRequest(r as Record<string, unknown>)),
      foodRequestLines: (lRes.data ?? []).map((r) => rowToFoodRequestLine(r as Record<string, unknown>)),
      foodRequestSettings: sRes.data ? rowToFoodSettings(sRes.data as Record<string, unknown>) : null,
    }),
  };
}

// ─── Signed-in RPCs ────────────────────────────────────────────────────────────
// Each returns an error message a person can read, or null. The RPCs raise plain-English
// messages on purpose, so they are shown as-is.

async function call(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) console.error(`[food requests] ${fn}:`, error.message);
  return { data, error: error ? error.message : null };
}

export async function dbSubmitFoodRequest(campId: string, payload: Record<string, unknown>) {
  const { data, error } = await call('submit_food_request', { p_camp_id: campId, p_payload: payload });
  return { error, result: data as { id: string; status_token: string; is_late: boolean; notice_hours: number } | null };
}

export interface DecisionLineInput {
  id: string;
  qty?: number;
  item_id?: string | null;
  unavailable?: boolean;
}

export async function dbDecideFoodRequest(id: string, decision: 'approve' | 'decline', lines: DecisionLineInput[], note: string | null) {
  return (await call('decide_food_request', { p_request_id: id, p_decision: decision, p_lines: lines, p_note: note })).error;
}
export async function dbMarkFoodRequestReady(id: string) {
  return (await call('mark_food_request_ready', { p_request_id: id })).error;
}
export async function dbMarkFoodRequestPickedUp(id: string, byName: string | null) {
  return (await call('mark_food_request_picked_up', { p_request_id: id, p_by_name: byName })).error;
}
export async function dbMarkFoodRequestMissed(id: string) {
  return (await call('mark_food_request_missed', { p_request_id: id })).error;
}
export async function dbCancelFoodRequest(id: string) {
  return (await call('cancel_food_request', { p_request_id: id })).error;
}

export async function dbSaveFoodProgram(campId: string, p: {
  id: string | null; name: string; leadName: string; leadEmail: string; leadPhone: string; color: string | null; active: boolean;
}) {
  const { data, error } = await call('save_food_program', {
    p_camp_id: campId, p_id: p.id, p_name: p.name, p_lead_name: p.leadName || null, p_lead_email: p.leadEmail || null,
    p_lead_phone: p.leadPhone || null, p_color: p.color, p_active: p.active, p_sort_order: null,
  });
  return { error, id: data as string | null };
}

export async function dbRotateFoodProgramLink(programId: string) {
  const { data, error } = await call('rotate_food_program_link', { p_program_id: programId });
  return { error, token: data as string | null };
}

export async function dbSaveFoodRequestSettings(campId: string, s: { cutoffHours: number; kitchenEmails: string[]; pickupLocation: string }) {
  return (await call('save_food_request_settings', {
    p_camp_id: campId, p_cutoff_hours: s.cutoffHours, p_kitchen_emails: s.kitchenEmails, p_pickup_location: s.pickupLocation || null,
  })).error;
}

/** The outbox rows for one request: what the requester and the kitchen get, and when. */
export async function loadFoodRequestMessages(requestId: string): Promise<FoodRequestMessage[]> {
  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('id, rule_key, recipient_kind, to_email, subject, body_text, send_after, state, suppressed_reason')
    .eq('subject_type', 'food_request').eq('subject_id', requestId)
    .order('send_after', { ascending: true });
  if (error) { console.error('[food requests] messages:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    ruleKey: r.rule_key as string,
    recipientKind: r.recipient_kind as string,
    toEmail: r.to_email as string,
    subject: r.subject as string,
    bodyText: (r.body_text as string) ?? null,
    sendAfter: r.send_after as string,
    state: r.state as string,
    suppressedReason: (r.suppressed_reason as string) ?? null,
  }));
}

/** The camp's IANA time zone, for the late-notice preview on the signed-in form. */
export async function loadCampTimeZone(campId: string): Promise<string> {
  const { data } = await supabase.from('camps').select('timezone').eq('id', campId).maybeSingle();
  return (data?.timezone as string) || 'America/New_York';
}

// ─── No-login RPCs ─────────────────────────────────────────────────────────────

// A plain client for the public pages: no session, no fetch wrapper. Everything it calls is
// granted to anon on purpose, and a staff token left in this browser would make it no more
// capable. Its own storage key, so it never shares (or warns about) the app's auth storage.
// Created on first use, so the signed-in app never builds a second client it does not need.
function makePublicClient() {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'campcommand-food-public' } },
  );
}
let publicClient: ReturnType<typeof makePublicClient> | null = null;
function publicDb() {
  if (!publicClient) publicClient = makePublicClient();
  return publicClient;
}

export interface PublicFoodForm {
  program: { name: string; color: string | null; lead_name: string | null };
  camp: { name: string; logo_url: string | null; timezone: string };
  cutoff_hours: number;
  pickup_location: string | null;
  items: FoodFormItem[];
  upcoming: { pickup_date: string; pickup_time: string; status: FoodRequest['status'] }[];
}

export async function publicGetFoodForm(token: string): Promise<PublicFoodForm | null> {
  const { data, error } = await publicDb().rpc('get_food_request_form', { p_token: token });
  if (error) throw new Error(error.message);
  return (data as PublicFoodForm | null) ?? null;
}

export async function publicSubmitFoodRequest(token: string, payload: Record<string, unknown>) {
  const { data, error } = await publicDb().rpc('submit_food_request_public', { p_token: token, p_payload: payload });
  return { error: error ? error.message : null, result: data as { status_token: string; is_late: boolean } | null };
}

export interface PublicFoodStatus {
  camp: { name: string; logo_url: string | null };
  program_name: string | null;
  requester_name: string;
  pickup_date: string;
  pickup_time: string;
  pickup_location: string | null;
  status: FoodRequest['status'];
  is_late: boolean;
  notice_hours: number;
  cutoff_hours: number;
  kitchen_note: string | null;
  changed_by_kitchen: boolean;
  created_at: string;
  decided_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  missed_at: string | null;
  cancelled_at: string | null;
  can_cancel: boolean;
  lines: {
    label: string; qty_requested: number; unit_label: string | null; qty_approved: number | null;
    approved_unit_label: string | null; line_state: FoodRequestLine['lineState']; note: string | null;
  }[];
}

export async function publicGetFoodStatus(statusToken: string): Promise<PublicFoodStatus | null> {
  const { data, error } = await publicDb().rpc('get_food_request_status', { p_status_token: statusToken });
  if (error) throw new Error(error.message);
  return (data as PublicFoodStatus | null) ?? null;
}

export async function publicCancelFoodRequest(statusToken: string) {
  const { error } = await publicDb().rpc('cancel_food_request_public', { p_status_token: statusToken });
  return error ? error.message : null;
}
