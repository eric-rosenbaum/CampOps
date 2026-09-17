/**
 * Town Trips data layer.
 *
 * Reads follow the campgroundDb pattern: one bulk loader, one realtime channel with a binding per
 * table, debounced and routed through the sync guard so a reload that raced a write is dropped.
 *
 * Writes are different from the rest of the app on purpose. Everywhere else a write is
 * optimistic and fire-and-forget. Here the database decides the answer — whether you got the seat
 * or the waitlist — with the trip row locked, so an optimistic "you're in" would be a guess that
 * is wrong exactly when it matters (the last seat). Every writer awaits its RPC, returns the
 * outcome, and asks for an immediate reload rather than waiting for the WAL event to come round.
 */
import { supabase } from './supabase';
import { campLog } from './campLog';
import { loadAndApply, debounce, WAL_DEBOUNCE_MS } from './syncGuard';
import { todayStr } from './utils';
import { addDays, hhmm } from './trips';
import type {
  Trip, TripSeat, TripErrand, RideRequest, TripsData, TripDraft, ErrandDraft, RideRequestDraft,
  SeatLeg, SeatStatus, TripStatus, ErrandStatus, TripDirection,
} from './tripTypes';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

export const TRIPS_DOMAIN = 'trips';

// ─── Row → type ───────────────────────────────────────────────────────────────

export function rowToTrip(r: Row): Trip {
  return {
    id: r.id as string, campId: r.camp_id as string, kind: r.kind as Trip['kind'],
    // A row from before trips had a direction (a stale realtime payload) reads the way the
    // migration backfilled them: no return means into town only.
    direction: (r.direction as TripDirection | undefined) ?? (r.return_time ? 'round_trip' : 'outbound'),
    title: r.title as string, destination: (r.destination as string) ?? '',
    departDate: r.depart_date as string, departTime: hhmm(r.depart_time as string) ?? '00:00',
    returnDate: s(r.return_date), returnTime: hhmm(s(r.return_time)),
    driverUserId: s(r.driver_user_id), driverName: s(r.driver_name),
    vehicleAssetId: s(r.vehicle_asset_id), vehicleLabel: s(r.vehicle_label),
    passengerSeats: Number(r.passenger_seats ?? 0),
    errandsCloseTime: hhmm(s(r.errands_close_time)), notes: s(r.notes),
    status: r.status as TripStatus, cancelledReason: s(r.cancelled_reason),
    createdBy: s(r.created_by), createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function rowToSeat(r: Row): TripSeat {
  return {
    id: r.id as string, campId: r.camp_id as string, tripId: r.trip_id as string,
    riderUserId: s(r.rider_user_id), riderName: (r.rider_name as string) ?? 'Someone',
    leg: r.leg as SeatLeg, status: r.status as SeatStatus,
    queuedAt: r.queued_at as string, confirmedAt: s(r.confirmed_at), createdAt: r.created_at as string,
  };
}

export function rowToErrand(r: Row): TripErrand {
  return {
    id: r.id as string, campId: r.camp_id as string, tripId: s(r.trip_id),
    requestedBy: s(r.requested_by), requesterName: (r.requester_name as string) ?? 'Someone',
    item: r.item as string, quantity: s(r.quantity), store: s(r.store),
    estCost: r.est_cost == null ? null : Number(r.est_cost), neededBy: s(r.needed_by),
    forActivity: s(r.for_activity),
    alsoNeededBy: Array.isArray(r.also_needed_by)
      ? (r.also_needed_by as Row[]).map((x) => ({ userId: String(x.user_id ?? ''), name: String(x.name ?? 'Someone'), quantity: x.quantity == null ? null : String(x.quantity) }))
      : [],
    status: r.status as ErrandStatus, driverNote: s(r.driver_note),
    doneAt: s(r.done_at), createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function rowToRideRequest(r: Row): RideRequest {
  return {
    id: r.id as string, campId: r.camp_id as string, requestedBy: s(r.requested_by),
    requesterName: (r.requester_name as string) ?? 'Someone', wantedDate: r.wanted_date as string,
    earliestTime: hhmm(s(r.earliest_time)), latestTime: hhmm(s(r.latest_time)),
    destination: s(r.destination), leg: r.leg as SeatLeg, note: s(r.note),
    status: r.status as RideRequest['status'], matchedTripId: s(r.matched_trip_id),
    matchedSeatId: s(r.matched_seat_id), createdAt: r.created_at as string,
  };
}

// ─── Load + subscribe ─────────────────────────────────────────────────────────

const TRIP_TABLES = ['trips', 'trip_seats', 'trip_errands', 'ride_requests'];

/**
 * How far back the board reaches. A season of trips is a few hundred rows; the window only
 * stops a camp in its fifth year from loading four summers of them. Errands are loaded whole
 * while open (an open errand from last month still needs getting) and for a month once closed.
 */
const HISTORY_DAYS = 120;

async function loadInner(campId: string): Promise<TripsData> {
  const since = addDays(todayStr(), -HISTORY_DAYS);
  const recent = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [camp, trips, seats, errands, requests] = await Promise.all([
    supabase.from('camps').select('timezone').eq('id', campId).maybeSingle(),
    supabase.from('trips').select('*').eq('camp_id', campId).gte('depart_date', since).order('depart_date').order('depart_time'),
    supabase.from('trip_seats').select('*, trips!inner(depart_date)').eq('camp_id', campId)
      .gte('trips.depart_date', since).order('queued_at'),
    supabase.from('trip_errands').select('*').eq('camp_id', campId)
      .or(`status.eq.open,updated_at.gte."${recent}"`).order('created_at'),
    supabase.from('ride_requests').select('*').eq('camp_id', campId).gte('wanted_date', addDays(todayStr(), -14))
      .order('wanted_date'),
  ]);
  for (const r of [camp, trips, seats, errands, requests]) {
    if (r.error) throw new Error(`trips read failed: ${r.error.message}`);
  }
  return {
    timezone: ((camp.data as Row | null)?.timezone as string) || 'America/Toronto',
    trips: (trips.data ?? []).map((r) => rowToTrip(r as Row)),
    seats: (seats.data ?? []).map((r) => rowToSeat(r as Row)),
    errands: (errands.data ?? []).map((r) => rowToErrand(r as Row)),
    rideRequests: (requests.data ?? []).map((r) => rowToRideRequest(r as Row)),
  };
}

export async function loadTrips(campId: string): Promise<TripsData | null> {
  try { return await loadInner(campId); }
  catch (e) { campLog('[Trips] load failed', String(e)); return null; }
}

/** Set while a subscription is live, so a writer can ask for the answer now instead of in 350ms. */
let activeReload: (() => Promise<boolean>) | null = null;
let channelCount = 0;

export function subscribeToTrips(campId: string, onUpdate: (d: TripsData) => void): () => void {
  const reload = () => loadAndApply(TRIPS_DOMAIN, () => loadInner(campId), onUpdate);
  const onWal = debounce(() => { void reload(); }, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(`trips-${++channelCount}`);
  for (const table of TRIP_TABLES) {
    channel = channel.on('postgres_changes',
      { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog('[CampOps] trips channel status:', status);
    if (status === 'SUBSCRIBED') {
      // A reconnect means events may have been missed while the socket was down.
      if (everSubscribed) setTimeout(() => { void reload(); }, 2000);
      else everSubscribed = true;
    }
  });
  activeReload = reload;
  return () => {
    if (activeReload === reload) activeReload = null;
    supabase.removeChannel(channel);
  };
}

export function reloadTripsNow(): Promise<boolean> {
  return activeReload ? activeReload() : Promise.resolve(false);
}

// ─── Writers ──────────────────────────────────────────────────────────────────

export interface RpcResult<T = null> {
  ok: boolean;
  data: T | null;
  /** Said to a person, not a developer. */
  error: string | null;
  /** The database's short code ('overlapping_seat'), for screens that answer it with an action. */
  code?: string | null;
  /** The raise's DETAIL, e.g. the clashing trip as JSON. */
  detail?: string | null;
}

/**
 * The database raises short codes; these are what somebody standing in the parking lot reads.
 */
const FRIENDLY: Record<string, string> = {
  not_signed_in: 'You are signed out. Sign in again and retry.',
  not_a_member: 'You are not a member of this camp.',
  read_only: 'Your account can view trips but not change them.',
  not_allowed: 'Only the person who planned this trip, its driver or an admin can do that.',
  trip_not_found: 'That trip no longer exists.',
  trip_not_open: 'This trip is no longer taking riders.',
  trip_cancelled: 'This trip has been cancelled.',
  trip_already_left: 'This trip has already left.',
  driver_is_not_a_passenger: 'You are driving this one, so you already have a seat.',
  seats_below_riders: 'More people are already confirmed than that. Move someone off the trip first.',
  errand_list_closed: 'The errand list for this trip has closed. Ask the driver, or add it to the shared list.',
  title_required: 'Give the trip a name.',
  departure_required: 'Pick a departure date and time.',
  item_required: 'Say what you need.',
  date_required: 'Pick the day you need a ride.',
  request_not_open: 'That request has already been matched or cancelled.',
  driver_not_a_member: 'The driver has to be a member of this camp.',
  vehicle_not_found: 'That vehicle is not in this camp’s assets.',
  trips_return_after_departure: 'The return has to be after the departure.',
  leg_not_offered: 'This trip doesn’t go that way. Pick a leg it drives, or another trip.',
  overlapping_seat: 'You already have a seat on another trip at that time. Switch to this one, or leave that seat first.',
  riders_on_other_leg: 'Riders are booked on a leg this trip would no longer drive. Move them first.',
  not_a_one_way_seat: 'That rider already has a way back.',
  returns_before_ride_out: 'That trip leaves before they ride in, so it can’t bring them back.',
  same_trip: 'That’s the trip you’re already on.',
  errand_not_open: 'That errand has already been picked up or removed.',
  seat_not_found: 'That seat no longer exists.',
  no_seat_back: 'That car is full on the way back now. Try another trip back, or ask for a ride.',
  seat_on_waitlist: 'That seat is still on the waitlist, so a ride back can’t be added to it yet.',
  errand_not_found: 'That errand no longer exists.',
};

const CODE_RE = new RegExp(Object.keys(FRIENDLY).join('|'));

function friendly(message: string): string {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k));
  return key ? FRIENDLY[key] : 'That did not save. Check your connection and try again.';
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // Logged, not console.error'd: a refused action is an answer, not a crash.
    campLog(`[Trips] ${fn} refused: ${error.message}`);
    return {
      ok: false, data: null, error: friendly(error.message),
      code: CODE_RE.exec(error.message)?.[0] ?? null, detail: (error as { details?: string }).details ?? null,
    };
  }
  // Awaited: the person who pressed the button should see the database's answer (seat or
  // waitlist) when the button stops spinning, not a beat later.
  await reloadTripsNow();
  return { ok: true, data: (data as T) ?? null, error: null };
}

function tripPayload(d: Partial<TripDraft>): Row {
  const out: Row = {};
  const map: [keyof TripDraft, string][] = [
    ['kind', 'kind'], ['direction', 'direction'], ['title', 'title'], ['destination', 'destination'], ['departDate', 'depart_date'],
    ['departTime', 'depart_time'], ['returnDate', 'return_date'], ['returnTime', 'return_time'],
    ['driverUserId', 'driver_user_id'], ['driverName', 'driver_name'], ['vehicleAssetId', 'vehicle_asset_id'],
    ['passengerSeats', 'passenger_seats'], ['errandsCloseTime', 'errands_close_time'], ['notes', 'notes'],
  ];
  for (const [k, col] of map) {
    if (k in d) out[col] = d[k] ?? '';
  }
  return out;
}

export const dbCreateTrip = (campId: string, draft: TripDraft) =>
  rpc<string>('create_trip', { p_camp_id: campId, p_trip: tripPayload(draft) });

export const dbUpdateTrip = (tripId: string, patch: Partial<TripDraft>) =>
  rpc<null>('update_trip', { p_trip_id: tripId, p_patch: tripPayload(patch) });

export const dbSetTripStatus = (tripId: string, status: Exclude<TripStatus, 'cancelled'>) =>
  rpc<null>('set_trip_status', { p_trip_id: tripId, p_status: status });

export const dbCancelTrip = (tripId: string, reason: string | null) =>
  rpc<null>('cancel_trip', { p_trip_id: tripId, p_reason: reason });

export interface ClaimResult {
  seat_id: string; status: 'confirmed' | 'waitlist'; leg: SeatLeg; already: boolean;
  /** Set when this claim took the last seat back that these people were waiting on. */
  last_seat_wanted_by?: string[];
  /** offer_ride_back on the rider's own car: the there-only seat became there-and-back. */
  same_trip?: boolean;
}

/** `leg` null: whatever the trip drives (there & back, into town, or back to camp). */
export const dbClaimSeat = (tripId: string, leg: SeatLeg | null, riderUserId: string | null = null) =>
  rpc<ClaimResult>('claim_trip_seat', { p_trip_id: tripId, p_leg: leg, p_rider_user_id: riderUserId });

export interface ReleaseResult { promoted: number; promoted_names: string[] }

export const dbReleaseSeat = (seatId: string) =>
  rpc<ReleaseResult>('release_trip_seat', { p_seat_id: seatId });

/** Leave one seat and take another in one transaction; if the new one is refused, nothing changes. */
export const dbSwitchSeat = (seatId: string, tripId: string, leg: SeatLeg | null) =>
  rpc<ClaimResult & { released_trip_id: string; promoted_names: string[] }>('switch_trip_seat', { p_seat_id: seatId, p_trip_id: tripId, p_leg: leg });

/** Put a there-only rider on a later trip's way back. */
export const dbOfferRideBack = (seatId: string, tripId: string) =>
  rpc<ClaimResult>('offer_ride_back', { p_seat_id: seatId, p_trip_id: tripId });

/** Ask for a ride back on a there-only rider's behalf (idempotent). */
export const dbRequestRideBack = (seatId: string) =>
  rpc<string>('request_ride_back', { p_seat_id: seatId });

/** "I need it too", with the joiner's own amount (kept per person). */
export const dbAlsoNeedErrand = (errandId: string, quantity: string | null = null) =>
  rpc<null>('also_need_errand', { p_errand_id: errandId, p_quantity: quantity });

export const dbAddErrand = (campId: string, d: ErrandDraft) =>
  rpc<string>('add_errand', {
    p_camp_id: campId,
    p_errand: {
      item: d.item, quantity: d.quantity ?? '', store: d.store ?? '', est_cost: d.estCost ?? '',
      needed_by: d.neededBy ?? '', for_activity: d.forActivity ?? '', trip_id: d.tripId ?? '',
    },
  });

export const dbAttachErrands = (tripId: string, errandIds: string[]) =>
  rpc<number>('attach_errands', { p_trip_id: tripId, p_errand_ids: errandIds });

export const dbDetachErrand = (errandId: string) =>
  rpc<null>('detach_errand', { p_errand_id: errandId });

export const dbSetErrandStatus = (errandId: string, status: ErrandStatus, note: string | null = null) =>
  rpc<null>('set_errand_status', { p_errand_id: errandId, p_status: status, p_note: note });

export const dbRequestRide = (campId: string, d: RideRequestDraft) =>
  rpc<string>('request_ride', {
    p_camp_id: campId,
    p_request: {
      wanted_date: d.wantedDate, earliest_time: d.earliestTime ?? '', latest_time: d.latestTime ?? '',
      destination: d.destination ?? '', leg: d.leg, note: d.note ?? '',
    },
  });

export const dbCancelRideRequest = (requestId: string) =>
  rpc<null>('cancel_ride_request', { p_request_id: requestId });

export const dbMatchRideRequest = (requestId: string, tripId: string) =>
  rpc<ClaimResult & { remaining_leg?: SeatLeg }>('match_ride_request', { p_request_id: requestId, p_trip_id: tripId });
