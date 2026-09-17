/**
 * Town Trips — the rules, with no React and no Supabase, so they can be tested.
 *
 * The database is the authority on seats (it decides with the trip row locked); the functions
 * here mirror its rules so the board can say "2 seats left" or "you'd be on the waitlist" before
 * anyone presses anything, and so the stranding warning — which only the board shows — has one
 * definition.
 *
 * Dates are camp-local "YYYY-MM-DD" strings and times "HH:MM". Date arithmetic is done on the
 * calendar (UTC components) rather than by adding 24h to a local Date: across a DST change a
 * local "midnight + 24h" lands at 11pm or 1am, and a week built that way repeats a day or
 * skips one.
 */
import type {
  Trip, TripSeat, TripErrand, RideRequest, SeatLeg, TripKind, TripDirection,
} from './tripTypes';

// ─── Calendar arithmetic ─────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-01" + 1 → "2026-11-02", whatever the clocks did that night. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (no timezone involved). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole calendar days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * The Monday that starts the week containing `date`.
 *
 * Monday, so Saturday and Sunday — the days off, when most rides into town happen — sit side by
 * side at the end of the board rather than split across two weeks.
 */
export function weekStartOf(date: string): string {
  const dow = weekdayOf(date);
  return addDays(date, -((dow + 6) % 7));
}

export function isDateStr(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "13:00:00" or "13:00" → "13:00". Postgres `time` arrives with seconds. */
export function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${pad(Number(m[1]))}:${m[2]}` : null;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(mins: number): string {
  const x = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
}

/** A wall-clock moment moved by some minutes, carrying into the next or previous day. */
export function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const total = toMinutes(time) + minutes;
  return { date: addDays(date, Math.floor(total / 1440)), time: fromMinutes(total) };
}

// ─── "Now", at the camp ──────────────────────────────────────────────────────

export interface LocalNow {
  date: string;
  /** Minutes since camp-local midnight. */
  minutes: number;
}

/**
 * The camp's wall clock. A coordinator in Toronto looking at a Vancouver camp's board must see
 * "leaves in 40 min" for the camp, not for their laptop.
 */
export function campNow(timezone: string, now: Date = new Date()): LocalNow {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // An unknown zone name in camps.timezone must not blank the board; the device clock is a
    // better answer than no answer.
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  };
}

/** Wall-clock minutes from `now` until a camp-local date and time. Negative once it has passed. */
export function minutesUntil(now: LocalNow, date: string, time: string): number {
  return daysBetween(now.date, date) * 1440 + toMinutes(time) - now.minutes;
}

// ─── Seats ───────────────────────────────────────────────────────────────────

export const usesThere = (leg: SeatLeg) => leg === 'both' || leg === 'there';
export const usesBack = (leg: SeatLeg) => leg === 'both' || leg === 'back';

export const LEG_LABELS: Record<SeatLeg, string> = {
  both: 'There & back',
  there: 'There only',
  back: 'Back only',
};

// ─── Direction ───────────────────────────────────────────────────────────────

export const DIRECTION_LABELS: Record<TripDirection, string> = {
  round_trip: 'Round trip',
  outbound: 'Into town only',
  pickup: 'Pickup from town',
};

export const DIRECTION_HINTS: Record<TripDirection, string> = {
  round_trip: 'Takes people there and brings them back',
  outbound: 'Drops people in town; they need another way back',
  pickup: 'Collects people in town and brings them to camp',
};

/** The legs a trip sells. Mirrors trips_direction_legs_internal. */
export function legsFor(direction: TripDirection): SeatLeg[] {
  if (direction === 'outbound') return ['there'];
  if (direction === 'pickup') return ['back'];
  return ['both', 'there', 'back'];
}

/** What "Grab a seat" means on this trip when nobody picks a leg. */
export function naturalLeg(direction: TripDirection): SeatLeg {
  return legsFor(direction)[0];
}

/**
 * "→ Main Street" for a car going out; "Town centre → camp" for a pickup, which starts in town.
 * A board that says "→ Town centre" on the late pickup reads as one more ride into town.
 */
export function routeLabel(trip: Pick<Trip, 'direction' | 'destination'>): string {
  const d = trip.destination.trim();
  if (trip.direction === 'pickup') return d ? `${d} → camp` : 'Back to camp';
  return d ? `→ ${d}` : '';
}

export interface SeatUsage {
  seats: number;
  thereUsed: number;
  backUsed: number;
  /** Seats free for a there-and-back rider: the tighter of the two legs. */
  freeBoth: number;
  freeThere: number;
  freeBack: number;
  confirmed: TripSeat[];
  /** In the order they would be promoted to. */
  waitlist: TripSeat[];
  /**
   * One entry per physical seat, for the dots: whether it is taken on the way out and on the way
   * back. Filled from the front, so a car with two both-ways riders and one there-only rider
   * draws two full dots, one half dot and the rest empty.
   */
  slots: { there: boolean; back: boolean }[];
}

const byQueue = (a: TripSeat, b: TripSeat) =>
  a.queuedAt === b.queuedAt ? a.id.localeCompare(b.id) : a.queuedAt.localeCompare(b.queuedAt);

export function seatUsage(trip: Pick<Trip, 'id' | 'passengerSeats'>, allSeats: TripSeat[]): SeatUsage {
  const mine = allSeats.filter((s) => s.tripId === trip.id);
  const confirmed = mine.filter((s) => s.status === 'confirmed').sort(byQueue);
  const waitlist = mine.filter((s) => s.status === 'waitlist').sort(byQueue);
  const thereUsed = confirmed.filter((s) => usesThere(s.leg)).length;
  const backUsed = confirmed.filter((s) => usesBack(s.leg)).length;
  const seats = trip.passengerSeats;
  const freeThere = Math.max(0, seats - thereUsed);
  const freeBack = Math.max(0, seats - backUsed);
  // Both-ways riders fill slots from the front on both legs; one-way riders then fill each leg's
  // remaining slots from the front, so a there-only and a back-only rider share a dot.
  const slots = Array.from({ length: seats }, (_, i) => ({ there: i < thereUsed, back: i < backUsed }));
  return {
    seats, thereUsed, backUsed,
    freeThere, freeBack, freeBoth: Math.min(freeThere, freeBack),
    confirmed, waitlist, slots,
  };
}

/**
 * The leg of a request a trip can carry: all of it, part of it ("there & back" on an into-town-only
 * ride carries the "there"), or none (a pickup is no use to someone who needs to get into town).
 */
export function coveredLeg(t: Pick<Trip, 'direction'>, r: Pick<RideRequest, 'leg'>): SeatLeg | null {
  if (t.direction === 'round_trip') return r.leg;
  const only = legsFor(t.direction)[0];
  return (only === 'there' ? usesThere(r.leg) : usesBack(r.leg)) ? only : null;
}

/** Free seats on the leg(s) this trip actually drives. */
export function freeSeats(trip: Pick<Trip, 'direction'>, usage: Pick<SeatUsage, 'freeBoth' | 'freeThere' | 'freeBack'>): number {
  if (trip.direction === 'outbound') return usage.freeThere;
  if (trip.direction === 'pickup') return usage.freeBack;
  return usage.freeBoth;
}

export interface SeatSummary {
  text: string;
  tone: 'open' | 'partial' | 'full';
}

/**
 * The one-line seat count on a card. Counts seats, never riders, and names the leg the free seats
 * are on: a round trip full on the way out but with room coming home says "Full going in · 3
 * seats back", not "Full · 3 back only", which read as three riders coming back only.
 */
export function seatSummary(trip: Pick<Trip, 'direction'>, usage: SeatUsage): SeatSummary {
  const plural = (n: number) => `${n} seat${n === 1 ? '' : 's'}`;
  if (usage.seats === 0) return { text: 'Driver only', tone: 'full' };
  const free = freeSeats(trip, usage);
  if (trip.direction !== 'round_trip') {
    return free > 0 ? { text: `${plural(free)} left`, tone: 'open' } : { text: 'Full', tone: 'full' };
  }
  if (free > 0) return { text: `${plural(free)} left`, tone: 'open' };
  if (usage.freeBack > 0) return { text: `Full going in · ${plural(usage.freeBack)} back`, tone: 'partial' };
  if (usage.freeThere > 0) return { text: `Full coming back · ${plural(usage.freeThere)} going in`, tone: 'partial' };
  return { text: 'Full', tone: 'full' };
}

/** Would a claim on this leg be confirmed or waitlisted right now? Mirrors trips_leg_fits_internal. */
export function claimOutcome(usage: Pick<SeatUsage, 'freeThere' | 'freeBack'>, leg: SeatLeg): 'confirmed' | 'waitlist' {
  const fits = (!usesThere(leg) || usage.freeThere > 0) && (!usesBack(leg) || usage.freeBack > 0);
  return fits ? 'confirmed' : 'waitlist';
}

/**
 * Who is promoted when seats free up: walking the waitlist in order, everyone who now fits.
 * Mirrors trips_promote_waitlist_internal — "who fits", not strictly "who is first", so a
 * back-only rider can take a free return seat while a both-ways rider ahead of them still has no
 * seat out.
 */
export function promotions(trip: Pick<Trip, 'id' | 'passengerSeats'>, seats: TripSeat[]): string[] {
  const u = seatUsage(trip, seats);
  let there = u.thereUsed;
  let back = u.backUsed;
  const promoted: string[] = [];
  for (const s of u.waitlist) {
    const fits = (!usesThere(s.leg) || there < trip.passengerSeats) && (!usesBack(s.leg) || back < trip.passengerSeats);
    if (fits) {
      promoted.push(s.id);
      if (usesThere(s.leg)) there += 1;
      if (usesBack(s.leg)) back += 1;
    }
  }
  return promoted;
}

/** Where someone stands on a waitlist, 1-based, or null. */
export function waitlistPosition(usage: SeatUsage, seatId: string): number | null {
  const i = usage.waitlist.findIndex((s) => s.id === seatId);
  return i < 0 ? null : i + 1;
}

// ─── One car at a time ───────────────────────────────────────────────────────

const startOf = (t: Pick<Trip, 'departDate' | 'departTime'>) => `${t.departDate}T${t.departTime}`;
const endOf = (t: Pick<Trip, 'departDate' | 'departTime' | 'returnDate' | 'returnTime'>) =>
  t.returnDate && t.returnTime ? `${t.returnDate}T${t.returnTime}` : startOf(t);

const legsShare = (a: SeatLeg, b: SeatLeg) => (usesThere(a) && usesThere(b)) || (usesBack(a) && usesBack(b));

export interface SeatClash {
  seat: TripSeat;
  trip: Trip;
}

/**
 * A live seat this person already holds that taking `leg` on `trip` would clash with: the same leg
 * (both going in, or both coming back) on a trip whose times overlap. Riding in on the 5pm and home
 * on the 9:30pm pickup is not a clash. Mirrors trips_seat_clash_internal, which refuses the claim;
 * this lets the drawer say so, and offer a switch, before anyone presses anything.
 */
export function seatClash(trip: Trip, leg: SeatLeg, userId: string, trips: Trip[], seats: TripSeat[]): SeatClash | null {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const hits = seats
    .filter((s) => s.riderUserId === userId && (s.status === 'confirmed' || s.status === 'waitlist') && s.tripId !== trip.id)
    .map((s) => ({ seat: s, trip: byId.get(s.tripId) }))
    .filter((x): x is SeatClash => !!x.trip && (x.trip.status === 'planned' || x.trip.status === 'out'))
    .filter((x) => legsShare(leg, x.seat.leg))
    .filter((x) => startOf(x.trip) <= endOf(trip) && startOf(trip) <= endOf(x.trip))
    .sort((a, b) => compareTrips(a.trip, b.trip));
  return hits[0] ?? null;
}

// ─── Stranding ───────────────────────────────────────────────────────────────

export interface StrandedRider {
  seat: TripSeat;
  trip: Trip;
}

const riderKey = (s: Pick<TripSeat, 'riderUserId' | 'riderName'>) =>
  s.riderUserId ?? `name:${s.riderName.trim().toLowerCase()}`;

/**
 * People who have a ride into town and none out.
 *
 * A confirmed `there` seat on a live trip is stranded unless the same person also has a
 * confirmed seat coming back (`back` or `both`) on another live trip that leaves no earlier than
 * the ride out, on that day or the next. The next day counts because an overnight day off is a
 * plan; three days later is not a way back from a day off, it is a different trip.
 *
 * A waitlisted return does not count: "you might get a ride back" is exactly how people end up
 * paying for a taxi.
 */
export function strandedRiders(trips: Trip[], seats: TripSeat[]): StrandedRider[] {
  const live = new Map(trips.filter((t) => t.status !== 'cancelled').map((t) => [t.id, t]));
  const confirmed = seats.filter((s) => s.status === 'confirmed' && live.has(s.tripId));
  const out: StrandedRider[] = [];
  for (const seat of confirmed) {
    if (seat.leg !== 'there') continue;
    const trip = live.get(seat.tripId)!;
    const key = riderKey(seat);
    const hasWayBack = confirmed.some((other) => {
      if (other.id === seat.id || other.tripId === seat.tripId || riderKey(other) !== key) return false;
      if (!usesBack(other.leg)) return false;
      const back = live.get(other.tripId)!;
      const gap = daysBetween(trip.departDate, back.departDate);
      if (gap < 0 || gap > 1) return false;
      return gap > 0 || toMinutes(back.departTime) >= toMinutes(trip.departTime);
    });
    if (!hasWayBack) out.push({ seat, trip });
  }
  return out;
}

/** Stranded riders counted on the day they ride out. */
export function strandedByDate(trips: Trip[], seats: TripSeat[]): Map<string, StrandedRider[]> {
  const map = new Map<string, StrandedRider[]>();
  for (const r of strandedRiders(trips, seats)) {
    const list = map.get(r.trip.departDate) ?? [];
    list.push(r);
    map.set(r.trip.departDate, list);
  }
  return map;
}

/**
 * Trips that could bring a there-only rider home: live, not the trip out, leaving that day
 * (no earlier) or the next, with a free seat on the way back.
 */
export function returnOptions(trip: Trip, trips: Trip[], seats: TripSeat[]): Trip[] {
  return trips
    .filter((t) => t.id !== trip.id && t.status === 'planned' && t.direction !== 'outbound')
    .filter((t) => {
      const gap = daysBetween(trip.departDate, t.departDate);
      if (gap < 0 || gap > 1) return false;
      return gap > 0 || toMinutes(t.departTime) >= toMinutes(trip.departTime);
    })
    .filter((t) => seatUsage(t, seats).freeBack > 0)
    .sort(compareTrips);
}

export interface StrandedHelp {
  rider: StrandedRider;
  /** Trips that could bring them back, soonest first. */
  options: Trip[];
  /** An open ride request of theirs for a way back, if someone already asked. */
  openRequest: RideRequest | null;
  /** The viewer is this rider. */
  isMe: boolean;
  /** The viewer may put them on each option (rider, the trip out's creator/driver, or admin). */
  canOfferOn: (t: Trip) => boolean;
  /** The viewer may ask for a ride on their behalf. */
  canAsk: boolean;
}

const sameRider = (seat: TripSeat, userId: string | null, name: string) =>
  seat.riderUserId ? seat.riderUserId === userId : !userId && seat.riderName.trim().toLowerCase() === name.trim().toLowerCase();

/**
 * What can be done for each stranded rider, from the viewer's chair. Mirrors the permissions of
 * offer_ride_back and request_ride_back.
 */
export function strandedHelp(
  stranded: StrandedRider[], trips: Trip[], seats: TripSeat[], requests: RideRequest[],
  userId: string, role: 'admin' | 'staff' | 'viewer',
): StrandedHelp[] {
  return stranded.map((rider) => {
    const isMe = rider.seat.riderUserId === userId;
    const managesOut = canManageTrip(rider.trip, userId, role);
    const writer = role !== 'viewer';
    const openRequest = requests.find((r) =>
      r.status === 'open' && (r.leg === 'back' || r.leg === 'both')
      && daysBetween(rider.trip.departDate, r.wantedDate) >= 0 && daysBetween(rider.trip.departDate, r.wantedDate) <= 1
      && sameRider(rider.seat, r.requestedBy, r.requesterName)) ?? null;
    return {
      rider,
      options: returnOptions(rider.trip, trips, seats),
      openRequest,
      isMe,
      canOfferOn: (t: Trip) => writer && (isMe || managesOut || canManageTrip(t, userId, role)),
      canAsk: writer && (isMe || managesOut),
    };
  });
}

// ─── Week layout ─────────────────────────────────────────────────────────────

export const compareTrips = (a: Pick<Trip, 'departDate' | 'departTime' | 'title'>, b: Pick<Trip, 'departDate' | 'departTime' | 'title'>) =>
  a.departDate.localeCompare(b.departDate) || a.departTime.localeCompare(b.departTime) || a.title.localeCompare(b.title);

export interface BoardDay {
  date: string;
  isToday: boolean;
  isPast: boolean;
  trips: Trip[];
  /** Open ride requests for the day. */
  rideDemand: RideRequest[];
  stranded: StrandedRider[];
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * The seven columns of the board. Cancelled trips stay on it (struck through) so somebody who
 * was counting on one sees that it is off rather than that it vanished.
 */
export function layoutWeek(
  weekStart: string, today: string, trips: Trip[], seats: TripSeat[], requests: RideRequest[],
): BoardDay[] {
  const stranded = strandedByDate(trips, seats);
  return weekDates(weekStart).map((date) => ({
    date,
    isToday: date === today,
    isPast: date < today,
    trips: trips.filter((t) => t.departDate === date).sort(compareTrips),
    rideDemand: requests.filter((r) => r.status === 'open' && r.wantedDate === date),
    stranded: stranded.get(date) ?? [],
  }));
}

/**
 * The phone stacks days instead of columns, and nobody scrolls past Monday's finished trips to
 * reach today. In the current week: today, the rest of the week, then the days already gone.
 * Any other week reads in calendar order.
 */
export function phoneDayOrder(days: BoardDay[]): BoardDay[] {
  const i = days.findIndex((d) => d.isToday);
  if (i <= 0) return days;
  return [...days.slice(i), ...days.slice(0, i)];
}

// ─── Leaving next ────────────────────────────────────────────────────────────

export function isUpcoming(trip: Trip, now: LocalNow): boolean {
  return trip.status === 'planned' && minutesUntil(now, trip.departDate, trip.departTime) > 0;
}

export function leavingNext(trips: Trip[], now: LocalNow, count = 2): Trip[] {
  return trips.filter((t) => isUpcoming(t, now)).sort(compareTrips).slice(0, count);
}

/** "in 40 min", "in 2h 15m", "tomorrow", "in 3 days". */
export function countdownLabel(minutes: number, now: LocalNow, date: string): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const days = daysBetween(now.date, date);
  if (days === 0 || minutes < 6 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  }
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Whether a trip still takes errands from people who are not driving it. Mirrors the database. */
export function errandListOpen(trip: Trip, now: LocalNow): boolean {
  if (trip.status !== 'planned') return false;
  if (minutesUntil(now, trip.departDate, trip.departTime) <= 0) return false;
  if (trip.errandsCloseTime && minutesUntil(now, trip.departDate, trip.errandsCloseTime) <= 0) return false;
  return true;
}

/**
 * The sentence under a trip about its reminder, saying why when it is not simply an hour before:
 * nothing is sent between 8pm and 8am, so an early departure is reminded the evening before and a
 * late one at 7pm.
 */
export function leavingSoonNote(date: string, time: string): string {
  const at = leavingSoonSendAt(date, time);
  const hourBefore = addMinutesLocal(date, time, -60);
  if (at.date === hourBefore.date && at.time === hourBefore.time) return `a “leaving soon” reminder at ${clock(at.time)}, an hour before`;
  const when = at.date === date ? `at ${clock(at.time)}` : `the evening before at ${clock(at.time)}`;
  return `a “leaving soon” reminder ${when} (no messages go out 8pm–8am)`;
}

/**
 * When the "leaving soon" reminder goes out, camp-local. Mirrors trip_leaving_soon_at_internal:
 * an hour before, except the outbox only sends 08:00–19:59, so a departure before 9am is
 * reminded at 8am when it leaves after 8, or at 6pm the evening before when it leaves earlier.
 */
export function leavingSoonSendAt(date: string, time: string): { date: string; time: string } {
  const at = addMinutesLocal(date, time, -60);
  const hour = Math.floor(toMinutes(at.time) / 60);
  if (hour < 8) {
    return toMinutes(time) >= 8 * 60 ? { date, time: '08:00' } : { date: addDays(date, -1), time: '18:00' };
  }
  if (hour >= 20) return { date: at.date, time: '19:00' };
  return at;
}

// ─── Kinds and presets ───────────────────────────────────────────────────────

export interface KindPreset {
  kind: TripKind;
  label: string;
  /** One line under the preset in the planner. */
  hint: string;
  durationMin: number;
  seats: number;
  /** Errand list closes this long before departure; null for trips that don't shop. */
  closeBeforeMin: number | null;
  direction: TripDirection;
}

export const KIND_PRESETS: Record<TripKind, KindPreset> = {
  town_run: { kind: 'town_run', label: 'Town run', hint: '2 hours · 4 seats · list closes 30 min before', durationMin: 120, seats: 4, closeBeforeMin: 30, direction: 'round_trip' },
  day_off: { kind: 'day_off', label: 'Day-off shuttle', hint: 'Drop off and pick up · 6 seats', durationMin: 8 * 60, seats: 6, closeBeforeMin: null, direction: 'round_trip' },
  supply_run: { kind: 'supply_run', label: 'Supply run', hint: '3 hours · 2 seats · list closes 1 hour before', durationMin: 180, seats: 2, closeBeforeMin: 60, direction: 'round_trip' },
  pickup: { kind: 'pickup', label: 'Pickup from town', hint: 'Brings people back to camp · 4 seats', durationMin: 45, seats: 4, closeBeforeMin: null, direction: 'pickup' },
  other: { kind: 'other', label: 'Appointment or other', hint: 'Doctor, airport, bus station', durationMin: 90, seats: 3, closeBeforeMin: null, direction: 'round_trip' },
};

export function applyPreset(kind: TripKind, departDate: string, departTime: string) {
  const p = KIND_PRESETS[kind];
  const ret = addMinutesLocal(departDate, departTime, p.durationMin);
  return {
    returnDate: ret.date,
    returnTime: ret.time,
    passengerSeats: p.seats,
    direction: p.direction,
    errandsCloseTime: p.closeBeforeMin == null ? null : addMinutesLocal(departDate, departTime, -p.closeBeforeMin).time,
  };
}

// ─── Errands ─────────────────────────────────────────────────────────────────

export interface StoreGroup {
  store: string;
  errands: TripErrand[];
}

/** Open errands by store, the way a driver walks a town: one stop, everything for that stop. */
export function groupByStore(errands: TripErrand[]): StoreGroup[] {
  const map = new Map<string, { label: string; errands: TripErrand[] }>();
  for (const e of errands) {
    const label = e.store?.trim() || '';
    const key = label.toLowerCase();
    const g = map.get(key) ?? { label, errands: [] };
    g.errands.push(e);
    map.set(key, g);
  }
  const groups = [...map.values()].map((g) => ({
    store: g.label || 'Any store',
    errands: g.errands.sort((a, b) =>
      (a.neededBy ?? '9999').localeCompare(b.neededBy ?? '9999') || a.createdAt.localeCompare(b.createdAt)),
  }));
  // "Any store" last: it is the group the driver fits in wherever they happen to be.
  return groups.sort((a, b) =>
    (a.store === 'Any store' ? 1 : 0) - (b.store === 'Any store' ? 1 : 0) || a.store.localeCompare(b.store));
}

export interface ShoppingList {
  needsTrip: StoreGroup[];
  onTrip: StoreGroup[];
  /** Still open on a car that has already left (or come back): bought, or does it need another trip? */
  onDeparted: StoreGroup[];
  needsTripCount: number;
  onTripCount: number;
  onDepartedCount: number;
}

/** Whether the car has gone: marked out or back, or past its departure time whatever was marked. */
export function hasDeparted(trip: Trip, now: LocalNow): boolean {
  return trip.status === 'out' || trip.status === 'back'
    || (trip.status === 'planned' && minutesUntil(now, trip.departDate, trip.departTime) <= 0);
}

/**
 * Open errands in three piles. On a trip: a car that hasn't left yet. On a trip that already left:
 * still open, so either the driver has it in hand or it needs putting on another car -- shown
 * apart, because "on Wed 2pm Town run" on Friday looked like it was handled. Needs a trip: nobody,
 * or a cancelled trip (whose errands the database returns to the list anyway).
 */
export function shoppingList(errands: TripErrand[], trips: Trip[], now: LocalNow): ShoppingList {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const open = errands.filter((e) => e.status === 'open');
  const onTrip: TripErrand[] = [];
  const onDeparted: TripErrand[] = [];
  const needsTrip: TripErrand[] = [];
  for (const e of open) {
    const t = e.tripId ? byId.get(e.tripId) : undefined;
    if (!t || t.status === 'cancelled') needsTrip.push(e);
    else if (hasDeparted(t, now)) onDeparted.push(e);
    else onTrip.push(e);
  }
  return {
    needsTrip: groupByStore(needsTrip), onTrip: groupByStore(onTrip), onDeparted: groupByStore(onDeparted),
    needsTripCount: needsTrip.length, onTripCount: onTrip.length, onDepartedCount: onDeparted.length,
  };
}

/** "AA Batteries " and "aa battery" are the same errand; so are "boxes" and "box". */
const normItem = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  .replace(/ies$/, 'y').replace(/(ss|x|z|ch|sh)es$/, '$1').replace(/([^s])s$/, '$1');

/**
 * An open errand for the same thing, so "AA batteries" typed a second time finds Noor's first.
 * Case, spacing and a simple English plural are ignored; the quantity is not compared (the hint
 * shows it).
 */
export function findDuplicateErrand(errands: TripErrand[], item: string): TripErrand | null {
  const key = normItem(item);
  if (key.length < 2) return null;
  return errands.find((e) => e.status === 'open' && normItem(e.item) === key) ?? null;
}

/** Everybody waiting on an errand: who asked, then who needs it too. */
export function errandPeople(e: TripErrand): string {
  const others = e.alsoNeededBy.map((x) => x.name);
  return [e.requesterName, ...others].join(', ');
}

export type NeededByState = 'overdue' | 'soon' | 'later' | null;

export function neededByState(neededBy: string | null, today: string): NeededByState {
  if (!neededBy) return null;
  const d = daysBetween(today, neededBy);
  if (d < 0) return 'overdue';
  if (d <= 1) return 'soon';
  return 'later';
}

/** Trips that could still take an errand, soonest first. */
export function tripsTakingErrands(trips: Trip[], now: LocalNow): Trip[] {
  return trips.filter((t) => errandListOpen(t, now)).sort(compareTrips);
}

/**
 * Where an errand can go, soonest first: any trip whose list is open, plus -- for the trips this
 * person manages -- ones whose list has closed but that have not left. Never a car that already
 * went; a driver adding to it from the parking lot has no use for the option, and everyone else
 * reads it as "somebody is getting this".
 */
export function errandTargets(trips: Trip[], now: LocalNow, managedTripIds: Set<string>): Trip[] {
  return trips
    .filter((t) => t.status === 'planned' && !hasDeparted(t, now) && (errandListOpen(t, now) || managedTripIds.has(t.id)))
    .sort(compareTrips);
}

// ─── Permissions (UI mirror; the RPCs enforce) ───────────────────────────────

export function canManageTrip(trip: Trip, userId: string, role: 'admin' | 'staff' | 'viewer'): boolean {
  if (role === 'viewer') return false;
  return role === 'admin' || trip.createdBy === userId || trip.driverUserId === userId;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/** "1pm", "1:30pm". */
export function clock(t: string | null | undefined): string {
  const v = hhmm(t);
  if (!v) return '';
  const [h, m] = v.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat Sep 19" */
export function dayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${DOW[weekdayOf(date)]} ${MON[m - 1]} ${d}`;
}

export function shortDow(date: string): string {
  return DOW[weekdayOf(date)];
}

export function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MON[m - 1]} ${d}`;
}

/** "Sep 14 – 20" or "Sep 28 – Oct 4". */
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [, sm] = weekStart.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  return sm === em ? `${monthDay(weekStart)} – ${ed}` : `${monthDay(weekStart)} – ${MON[em - 1]} ${ed}`;
}

/** "1pm → 3pm", "Sat 9am → Sun 5pm" when the return is another day. */
export function tripTimeLabel(trip: Pick<Trip, 'departDate' | 'departTime' | 'returnDate' | 'returnTime'>): string {
  const out = clock(trip.departTime);
  if (!trip.returnTime) return out;
  if (trip.returnDate && trip.returnDate !== trip.departDate) {
    return `${out} → ${shortDow(trip.returnDate)} ${clock(trip.returnTime)}`;
  }
  return `${out} → ${clock(trip.returnTime)}`;
}
