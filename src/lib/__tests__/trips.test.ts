import { describe, it, expect } from 'vitest';
import {
  addDays, weekStartOf, weekDates, daysBetween, layoutWeek, phoneDayOrder, seatUsage, claimOutcome,
  promotions, waitlistPosition, strandedRiders, strandedByDate, returnOptions, campNow, minutesUntil,
  leavingNext, countdownLabel, errandListOpen, leavingSoonSendAt, applyPreset, shoppingList, groupByStore,
  neededByState, hhmm, clock, tripTimeLabel, weekRangeLabel, isDateStr, canManageTrip, addMinutesLocal,
  legsFor, naturalLeg, routeLabel, seatSummary, freeSeats, seatClash, strandedHelp, errandTargets, hasDeparted,
  findDuplicateErrand, errandPeople, leavingSoonNote, coveredLeg, KIND_PRESETS,
} from '@/lib/trips';
import type { Trip, TripSeat, TripErrand, RideRequest, SeatLeg } from '@/lib/tripTypes';

let n = 0;
function trip(p: Partial<Trip> = {}): Trip {
  n += 1;
  return {
    id: p.id ?? `t${n}`, campId: 'c', kind: 'town_run', direction: 'round_trip', title: `Trip ${n}`, destination: 'Town',
    departDate: '2026-09-19', departTime: '13:00', returnDate: '2026-09-19', returnTime: '15:00',
    driverUserId: null, driverName: null, vehicleAssetId: null, vehicleLabel: null, passengerSeats: 3,
    errandsCloseTime: null, notes: null, status: 'planned', cancelledReason: null, createdBy: 'u-creator',
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...p,
  };
}
function seat(tripId: string, rider: string, leg: SeatLeg = 'both', status: TripSeat['status'] = 'confirmed', queuedAt?: string): TripSeat {
  n += 1;
  return {
    id: `s${String(n).padStart(4, '0')}`, campId: 'c', tripId, riderUserId: rider, riderName: rider, leg, status,
    queuedAt: queuedAt ?? `2026-09-10T10:00:${String(n % 60).padStart(2, '0')}Z`, confirmedAt: null, createdAt: '2026-09-10T10:00:00Z',
  };
}
function errand(p: Partial<TripErrand> = {}): TripErrand {
  n += 1;
  return {
    id: `e${n}`, campId: 'c', tripId: null, requestedBy: 'u1', requesterName: 'Priya', item: `Item ${n}`,
    quantity: null, store: null, estCost: null, neededBy: null, forActivity: null, alsoNeededBy: [], status: 'open',
    driverNote: null, doneAt: null, createdAt: `2026-09-10T10:00:${String(n % 60).padStart(2, '0')}Z`,
    updatedAt: '2026-09-10T10:00:00Z', ...p,
  };
}

describe('calendar arithmetic', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds days across both DST changes without repeating or skipping a day', () => {
    // America/Vancouver (the test zone) springs forward Mar 8 2026 and falls back Nov 1 2026.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(daysBetween('2026-10-26', '2026-11-02')).toBe(7);
  });

  it('starts weeks on Monday, including a week that contains a DST change', () => {
    expect(weekStartOf('2026-09-16')).toBe('2026-09-14'); // Wed
    expect(weekStartOf('2026-09-14')).toBe('2026-09-14'); // Mon
    expect(weekStartOf('2026-09-20')).toBe('2026-09-14'); // Sun
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26'); // the fall-back Sunday
    expect(weekDates('2026-10-26')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
    expect(weekDates('2026-03-02').at(-1)).toBe('2026-03-08');
    expect(new Set(weekDates('2026-03-02')).size).toBe(7);
  });

  it('builds a week that spans a month end', () => {
    expect(weekDates('2026-09-28')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(weekRangeLabel('2026-09-28')).toBe('Sep 28 – Oct 4');
    expect(weekRangeLabel('2026-09-14')).toBe('Sep 14 – 20');
  });

  it('moves a wall-clock time across midnight', () => {
    expect(addMinutesLocal('2026-09-19', '23:30', 90)).toEqual({ date: '2026-09-20', time: '01:00' });
    expect(addMinutesLocal('2026-09-19', '00:15', -30)).toEqual({ date: '2026-09-18', time: '23:45' });
  });

  it('validates dates from the URL', () => {
    expect(isDateStr('2026-09-14')).toBe(true);
    expect(isDateStr('2026-02-30')).toBe(false);
    expect(isDateStr('current')).toBe(false);
    expect(isDateStr(null)).toBe(false);
  });
});

describe('camp clock', () => {
  it('reads the camp zone, not the device zone', () => {
    // 2026-09-19 02:30 UTC is still the 18th in Toronto and in Vancouver (the test's own zone).
    const at = new Date('2026-09-19T02:30:00Z');
    expect(campNow('America/Toronto', at)).toEqual({ date: '2026-09-18', minutes: 22 * 60 + 30 });
    expect(campNow('Europe/London', at)).toEqual({ date: '2026-09-19', minutes: 3 * 60 + 30 });
  });

  it('falls back to the device clock for an unknown zone rather than throwing', () => {
    expect(campNow('Not/AZone', new Date('2026-09-19T12:00:00Z')).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts minutes to a departure across midnight', () => {
    const now = { date: '2026-09-18', minutes: 23 * 60 };
    expect(minutesUntil(now, '2026-09-19', '01:00')).toBe(120);
    expect(minutesUntil(now, '2026-09-18', '22:00')).toBe(-60);
  });

  it('labels a countdown', () => {
    const now = { date: '2026-09-18', minutes: 12 * 60 };
    expect(countdownLabel(45, now, '2026-09-18')).toBe('in 45 min');
    expect(countdownLabel(135, now, '2026-09-18')).toBe('in 2h 15m');
    expect(countdownLabel(24 * 60, now, '2026-09-19')).toBe('tomorrow');
    expect(countdownLabel(3 * 24 * 60, now, '2026-09-21')).toBe('in 3 days');
  });
});

describe('seat math per leg', () => {
  it('counts a both-ways rider on each leg and one-way riders on theirs', () => {
    const t = trip({ id: 'A', passengerSeats: 3 });
    const seats = [seat('A', 'b'), seat('A', 'c', 'there'), seat('A', 'd', 'back'), seat('A', 'e', 'both', 'waitlist'),
      seat('A', 'f', 'both', 'cancelled'), seat('OTHER', 'g')];
    const u = seatUsage(t, seats);
    expect(u.thereUsed).toBe(2);
    expect(u.backUsed).toBe(2);
    expect(u.freeThere).toBe(1);
    expect(u.freeBack).toBe(1);
    expect(u.freeBoth).toBe(1);
    expect(u.confirmed.map((s) => s.riderUserId)).toEqual(['b', 'c', 'd']);
    expect(u.waitlist.map((s) => s.riderUserId)).toEqual(['e']);
  });

  it('lets a there-only and a back-only rider share one seat', () => {
    const t = trip({ id: 'A', passengerSeats: 1 });
    const seats = [seat('A', 'c', 'there')];
    expect(claimOutcome(seatUsage(t, seats), 'back')).toBe('confirmed');
    expect(claimOutcome(seatUsage(t, seats), 'both')).toBe('waitlist');
    expect(claimOutcome(seatUsage(t, seats), 'there')).toBe('waitlist');
    const shared = seatUsage(t, [...seats, seat('A', 'd', 'back')]);
    expect(shared.slots).toEqual([{ there: true, back: true }]);
  });

  it('draws dots filled from the front: two full, one half, rest empty', () => {
    const t = trip({ id: 'A', passengerSeats: 4 });
    const u = seatUsage(t, [seat('A', 'b'), seat('A', 'c'), seat('A', 'd', 'there')]);
    expect(u.slots).toEqual([
      { there: true, back: true }, { there: true, back: true }, { there: true, back: false }, { there: false, back: false },
    ]);
  });

  it('never reports negative free seats for an over-full car', () => {
    const u = seatUsage(trip({ id: 'A', passengerSeats: 1 }), [seat('A', 'b'), seat('A', 'c')]);
    expect(u.freeBoth).toBe(0);
  });

  it('the last seat claimed twice: one confirmed, one waitlist', () => {
    const t = trip({ id: 'A', passengerSeats: 2 });
    const seats = [seat('A', 'b')];
    expect(claimOutcome(seatUsage(t, seats), 'both')).toBe('confirmed');
    seats.push(seat('A', 'c'));
    expect(claimOutcome(seatUsage(t, seats), 'both')).toBe('waitlist');
  });
});

describe('waitlist promotion', () => {
  it('promotes in queue order, as many as now fit', () => {
    const t = trip({ id: 'A', passengerSeats: 2 });
    const seats = [
      seat('A', 'b', 'both', 'confirmed', '2026-09-10T10:00:00Z'),
      seat('A', 'd1', 'both', 'waitlist', '2026-09-10T10:05:00Z'),
      seat('A', 'd2', 'both', 'waitlist', '2026-09-10T10:06:00Z'),
      seat('A', 'd3', 'both', 'waitlist', '2026-09-10T10:07:00Z'),
    ];
    expect(promotions(t, seats).map((id) => seats.find((s) => s.id === id)!.riderUserId)).toEqual(['d1']);
    expect(waitlistPosition(seatUsage(t, seats), seats[3].id)).toBe(3);
  });

  it('skips a waitlisted rider who does not fit for one behind who does', () => {
    const t = trip({ id: 'A', passengerSeats: 1 });
    const seats = [
      seat('A', 'back-rider', 'back', 'confirmed', '2026-09-10T10:00:00Z'),
      seat('A', 'both-rider', 'both', 'waitlist', '2026-09-10T10:01:00Z'),
      seat('A', 'there-rider', 'there', 'waitlist', '2026-09-10T10:02:00Z'),
    ];
    expect(promotions(t, seats).map((id) => seats.find((s) => s.id === id)!.riderUserId)).toEqual(['there-rider']);
  });

  it('orders by queue time, not by row order', () => {
    const t = trip({ id: 'A', passengerSeats: 1 });
    const late = seat('A', 'late', 'both', 'waitlist', '2026-09-10T11:00:00Z');
    const early = seat('A', 'early', 'both', 'waitlist', '2026-09-10T09:00:00Z');
    expect(promotions(t, [late, early])).toEqual([early.id]);
  });
});

describe('stranding rule', () => {
  it('flags a there-only rider with no way back', () => {
    const out = trip({ id: 'OUT', departDate: '2026-09-19', departTime: '09:00' });
    const stranded = strandedRiders([out], [seat('OUT', 'sam', 'there')]);
    expect(stranded).toHaveLength(1);
    expect(strandedByDate([out], [seat('OUT', 'sam', 'there')]).get('2026-09-19')).toHaveLength(1);
  });

  it('clears when the same person has a confirmed return that day, later', () => {
    const out = trip({ id: 'OUT', departDate: '2026-09-19', departTime: '09:00' });
    const back = trip({ id: 'BACK', departDate: '2026-09-19', departTime: '16:00' });
    expect(strandedRiders([out, back], [seat('OUT', 'sam', 'there'), seat('BACK', 'sam', 'back')])).toHaveLength(0);
    // a both-ways seat on the pick-up trip counts as a way back too
    expect(strandedRiders([out, back], [seat('OUT', 'sam', 'there'), seat('BACK', 'sam', 'both')])).toHaveLength(0);
  });

  it('accepts a return the next day, not two days later', () => {
    const out = trip({ id: 'OUT', departDate: '2026-09-30', departTime: '17:00' });
    const nextDay = trip({ id: 'N', departDate: '2026-10-01', departTime: '08:00' });
    const later = trip({ id: 'L', departDate: '2026-10-02', departTime: '08:00' });
    expect(strandedRiders([out, nextDay], [seat('OUT', 'sam', 'there'), seat('N', 'sam', 'back')])).toHaveLength(0);
    expect(strandedRiders([out, later], [seat('OUT', 'sam', 'there'), seat('L', 'sam', 'back')])).toHaveLength(1);
  });

  it('does not count a return that leaves before the ride out, a waitlisted return, someone else, or a cancelled trip', () => {
    const out = trip({ id: 'OUT', departDate: '2026-09-19', departTime: '13:00' });
    const earlier = trip({ id: 'E', departDate: '2026-09-19', departTime: '08:00' });
    const later = trip({ id: 'L', departDate: '2026-09-19', departTime: '17:00' });
    const cancelled = trip({ id: 'X', departDate: '2026-09-19', departTime: '18:00', status: 'cancelled' });
    const trips = [out, earlier, later, cancelled];
    expect(strandedRiders(trips, [seat('OUT', 'sam', 'there'), seat('E', 'sam', 'back')])).toHaveLength(1);
    expect(strandedRiders(trips, [seat('OUT', 'sam', 'there'), seat('L', 'sam', 'back', 'waitlist')])).toHaveLength(1);
    expect(strandedRiders(trips, [seat('OUT', 'sam', 'there'), seat('L', 'kim', 'back')])).toHaveLength(1);
    expect(strandedRiders(trips, [seat('OUT', 'sam', 'there'), seat('X', 'sam', 'back')])).toHaveLength(1);
  });

  it('ignores riders on a cancelled trip out, and both-ways riders', () => {
    const out = trip({ id: 'OUT', status: 'cancelled' });
    const t2 = trip({ id: 'T2' });
    expect(strandedRiders([out, t2], [seat('OUT', 'sam', 'there'), seat('T2', 'kim', 'both')])).toHaveLength(0);
  });

  it('offers return trips with a free seat back', () => {
    const out = trip({ id: 'OUT', departDate: '2026-09-19', departTime: '09:00' });
    const full = trip({ id: 'FULL', departDate: '2026-09-19', departTime: '16:00', passengerSeats: 1 });
    const open = trip({ id: 'OPEN', departDate: '2026-09-20', departTime: '10:00' });
    const seats = [seat('OUT', 'sam', 'there'), seat('FULL', 'kim', 'both')];
    expect(returnOptions(out, [out, full, open], seats).map((t) => t.id)).toEqual(['OPEN']);
  });
});

describe('week layout', () => {
  it('places trips on their day, sorted by time, with demand and stranding', () => {
    const a = trip({ id: 'a', departDate: '2026-09-19', departTime: '15:00' });
    const b = trip({ id: 'b', departDate: '2026-09-19', departTime: '09:00' });
    const nextWeek = trip({ id: 'c', departDate: '2026-09-21' });
    const req: RideRequest = {
      id: 'r', campId: 'c', requestedBy: 'u', requesterName: 'U', wantedDate: '2026-09-19', earliestTime: null,
      latestTime: null, destination: null, leg: 'both', note: null, status: 'open', matchedTripId: null,
      matchedSeatId: null, createdAt: '',
    };
    const days = layoutWeek('2026-09-14', '2026-09-16', [a, b, nextWeek], [seat('b', 'sam', 'there')], [req, { ...req, id: 'r2', status: 'matched' }]);
    expect(days).toHaveLength(7);
    const sat = days[5];
    expect(sat.date).toBe('2026-09-19');
    expect(sat.trips.map((t) => t.id)).toEqual(['b', 'a']);
    expect(sat.rideDemand).toHaveLength(1);
    expect(sat.stranded).toHaveLength(1);
    expect(days[2].isToday).toBe(true);
    expect(days[1].isPast).toBe(true);
    expect(days.flatMap((d) => d.trips).map((t) => t.id)).not.toContain('c');
  });

  it('stacks today first on a phone, then the rest of the week, then the days already gone', () => {
    const days = layoutWeek('2026-09-14', '2026-09-16', [], [], []);
    expect(phoneDayOrder(days).map((d) => d.date)).toEqual([
      '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-14', '2026-09-15',
    ]);
    const other = layoutWeek('2026-09-21', '2026-09-16', [], [], []);
    expect(phoneDayOrder(other).map((d) => d.date)[0]).toBe('2026-09-21');
  });
});

describe('leaving next and the errand list', () => {
  const now = { date: '2026-09-19', minutes: 12 * 60 };

  it('picks the next planned departures', () => {
    const gone = trip({ id: 'gone', departTime: '11:00' });
    const soon = trip({ id: 'soon', departTime: '12:30' });
    const later = trip({ id: 'later', departDate: '2026-09-20', departTime: '09:00' });
    const cancelled = trip({ id: 'x', departTime: '12:15', status: 'cancelled' });
    const third = trip({ id: 'third', departDate: '2026-09-21' });
    expect(leavingNext([later, gone, cancelled, third, soon], now).map((t) => t.id)).toEqual(['soon', 'later']);
  });

  it('closes the list at its close time, and when the car leaves', () => {
    expect(errandListOpen(trip({ departTime: '13:00', errandsCloseTime: '12:30' }), now)).toBe(true);
    expect(errandListOpen(trip({ departTime: '13:00', errandsCloseTime: '11:30' }), now)).toBe(false);
    expect(errandListOpen(trip({ departTime: '11:00' }), now)).toBe(false);
    expect(errandListOpen(trip({ departDate: '2026-09-20', departTime: '09:00', errandsCloseTime: '08:00' }), now)).toBe(true);
    expect(errandListOpen(trip({ departDate: '2026-09-20', status: 'cancelled' }), now)).toBe(false);
  });

  it('moves the leaving-soon reminder out of quiet hours, like the database', () => {
    expect(leavingSoonSendAt('2026-09-19', '13:00')).toEqual({ date: '2026-09-19', time: '12:00' });
    expect(leavingSoonSendAt('2026-09-19', '08:30')).toEqual({ date: '2026-09-19', time: '08:00' });
    expect(leavingSoonSendAt('2026-09-19', '07:00')).toEqual({ date: '2026-09-18', time: '18:00' });
    expect(leavingSoonSendAt('2026-10-01', '06:00')).toEqual({ date: '2026-09-30', time: '18:00' });
    expect(leavingSoonSendAt('2026-09-19', '21:30')).toEqual({ date: '2026-09-19', time: '19:00' });
    expect(leavingSoonSendAt('2026-09-19', '00:30')).toEqual({ date: '2026-09-18', time: '19:00' });
  });

  it('applies kind presets', () => {
    expect(applyPreset('town_run', '2026-09-19', '13:00')).toEqual({
      returnDate: '2026-09-19', returnTime: '15:00', passengerSeats: 4, errandsCloseTime: '12:30', direction: 'round_trip',
    });
    expect(applyPreset('pickup', '2026-09-19', '21:30')).toMatchObject({ direction: 'pickup', returnTime: '22:15', errandsCloseTime: null });
    expect(applyPreset('day_off', '2026-09-19', '20:00').returnDate).toBe('2026-09-20');
    expect(applyPreset('day_off', '2026-09-19', '09:00').errandsCloseTime).toBeNull();
  });
});

describe('shopping list', () => {
  it('splits open errands into needs a trip / on a trip, grouped by store with "Any store" last', () => {
    const planned = trip({ id: 'P' });
    const cancelled = trip({ id: 'C', status: 'cancelled' });
    const errands = [
      errand({ store: 'Walmart', neededBy: '2026-09-21' }),
      errand({ store: 'walmart ', neededBy: '2026-09-19' }),
      errand({ store: null }),
      errand({ store: 'Canadian Tire', tripId: 'P' }),
      errand({ store: 'Dollarama', tripId: 'C' }),
      errand({ store: 'Walmart', status: 'bought' }),
    ];
    const list = shoppingList(errands, [planned, cancelled], { date: '2026-09-10', minutes: 600 });
    expect(list.needsTripCount).toBe(4);
    expect(list.onTripCount).toBe(1);
    expect(list.needsTrip.map((g) => g.store)).toEqual(['Dollarama', 'Walmart', 'Any store']);
    expect(list.needsTrip[1].errands.map((e) => e.neededBy)).toEqual(['2026-09-19', '2026-09-21']);
    expect(list.onTrip[0].store).toBe('Canadian Tire');
    expect(groupByStore([])).toEqual([]);
  });

  it('marks needed-by dates', () => {
    expect(neededByState('2026-09-18', '2026-09-19')).toBe('overdue');
    expect(neededByState('2026-09-20', '2026-09-19')).toBe('soon');
    expect(neededByState('2026-09-25', '2026-09-19')).toBe('later');
    expect(neededByState(null, '2026-09-19')).toBeNull();
  });
});

describe('labels and permissions', () => {
  it('formats times', () => {
    expect(hhmm('13:05:00')).toBe('13:05');
    expect(clock('13:00:00')).toBe('1pm');
    expect(clock('00:30')).toBe('12:30am');
    expect(tripTimeLabel(trip({ departTime: '09:00', returnTime: '17:30' }))).toBe('9am → 5:30pm');
    expect(tripTimeLabel(trip({ departDate: '2026-09-19', departTime: '18:00', returnDate: '2026-09-20', returnTime: '10:00' }))).toBe('6pm → Sun 10am');
    expect(tripTimeLabel(trip({ returnTime: null }))).toBe('1pm');
  });

  it('lets the creator, driver and admins manage; never a viewer', () => {
    const t = trip({ createdBy: 'me', driverUserId: 'driver' });
    expect(canManageTrip(t, 'me', 'staff')).toBe(true);
    expect(canManageTrip(t, 'driver', 'staff')).toBe(true);
    expect(canManageTrip(t, 'someone', 'staff')).toBe(false);
    expect(canManageTrip(t, 'someone', 'admin')).toBe(true);
    expect(canManageTrip(t, 'me', 'viewer')).toBe(false);
  });
});

describe('direction', () => {
  it('sells only the legs a trip drives, and defaults the picker to them', () => {
    expect(legsFor('round_trip')).toEqual(['both', 'there', 'back']);
    expect(legsFor('outbound')).toEqual(['there']);
    expect(legsFor('pickup')).toEqual(['back']);
    expect(naturalLeg('round_trip')).toBe('both');
    expect(naturalLeg('outbound')).toBe('there');
    expect(naturalLeg('pickup')).toBe('back');
    expect(KIND_PRESETS.pickup.direction).toBe('pickup');
  });

  it('describes a pickup as coming from town to camp', () => {
    expect(routeLabel(trip({ direction: 'pickup', destination: 'Town centre' }))).toBe('Town centre → camp');
    expect(routeLabel(trip({ direction: 'outbound', destination: 'Town centre' }))).toBe('→ Town centre');
    expect(routeLabel(trip({ direction: 'round_trip', destination: '' }))).toBe('');
  });

  it('covers the part of a ride request a one-way trip can carry', () => {
    expect(coveredLeg({ direction: 'outbound' }, { leg: 'both' })).toBe('there');
    expect(coveredLeg({ direction: 'outbound' }, { leg: 'back' })).toBeNull();
    expect(coveredLeg({ direction: 'pickup' }, { leg: 'both' })).toBe('back');
    expect(coveredLeg({ direction: 'pickup' }, { leg: 'there' })).toBeNull();
    expect(coveredLeg({ direction: 'round_trip' }, { leg: 'there' })).toBe('there');
  });

  it('never offers an into-town-only trip as a way back', () => {
    const out = trip({ id: 'OUT', departTime: '17:00', direction: 'outbound', returnTime: null });
    const alsoOut = trip({ id: 'OUT2', departTime: '19:00', direction: 'outbound', returnTime: null });
    const pickup = trip({ id: 'PICK', departTime: '21:30', direction: 'pickup' });
    expect(returnOptions(out, [out, alsoOut, pickup], [seat('OUT', 'ruby', 'there')]).map((t) => t.id)).toEqual(['PICK']);
  });
});

describe('seat summary text', () => {
  it('counts seats on the leg, not riders — the "Full · 3 back only" bug', () => {
    // A round trip with four seats and four there-only riders: full going in, four seats back.
    const t = trip({ id: 'R', passengerSeats: 4 });
    const seats = ['a', 'b', 'c', 'd'].map((r) => seat('R', r, 'there'));
    const u = seatUsage(t, seats);
    expect(seatSummary(t, u)).toEqual({ text: 'Full going in · 4 seats back', tone: 'partial' });
    const backs = ['a', 'b', 'c'].map((r) => seat('R', r, 'back'));
    expect(seatSummary(t, seatUsage(trip({ id: 'R', passengerSeats: 3 }), backs)).text).toBe('Full coming back · 3 seats going in');
  });

  it('says plain seats left on a one-way trip, whatever the other leg looks like', () => {
    const out = trip({ id: 'O', direction: 'outbound', passengerSeats: 4 });
    const seats = ['a', 'b', 'c'].map((r) => seat('O', r, 'there'));
    expect(seatSummary(out, seatUsage(out, seats)).text).toBe('1 seat left');
    expect(freeSeats(out, seatUsage(out, seats))).toBe(1);
    const pick = trip({ id: 'P', direction: 'pickup', passengerSeats: 2 });
    const full = seatUsage(pick, [seat('P', 'a', 'back'), seat('P', 'b', 'back')]);
    expect(seatSummary(pick, full)).toEqual({ text: 'Full', tone: 'full' });
    expect(seatSummary(trip({ id: 'Z', passengerSeats: 0 }), seatUsage(trip({ id: 'Z', passengerSeats: 0 }), [])).text).toBe('Driver only');
    expect(seatSummary(trip({ id: 'Y', passengerSeats: 3 }), seatUsage(trip({ id: 'Y', passengerSeats: 3 }), [seat('Y', 'a')])).text).toBe('2 seats left');
  });
});

describe('one car at a time', () => {
  const a = trip({ id: 'A', departTime: '13:00', returnTime: '15:00' });
  const b = trip({ id: 'B', departTime: '14:00', returnTime: '16:00' });
  const c = trip({ id: 'C', departTime: '16:30', returnTime: '18:00' });
  const evening = trip({ id: 'EV', departTime: '17:00', returnTime: null, returnDate: null, direction: 'outbound' });
  const pickup = trip({ id: 'PU', departTime: '21:30', returnTime: '22:15', direction: 'pickup' });
  const trips = [a, b, c, evening, pickup];

  it('flags the same leg on overlapping trips', () => {
    const seats = [seat('A', 'me', 'both')];
    expect(seatClash(b, 'both', 'me', trips, seats)?.trip.id).toBe('A');
    expect(seatClash(b, 'back', 'me', trips, seats)?.trip.id).toBe('A');
    expect(seatClash(c, 'both', 'me', trips, seats)).toBeNull();
    expect(seatClash(b, 'both', 'someone-else', trips, seats)).toBeNull();
  });

  it('allows in on one car and home on another, and ignores left or cancelled seats', () => {
    expect(seatClash(pickup, 'back', 'me', trips, [seat('EV', 'me', 'there')])).toBeNull();
    expect(seatClash(b, 'both', 'me', trips, [seat('A', 'me', 'both', 'cancelled')])).toBeNull();
    expect(seatClash(b, 'there', 'me', trips, [seat('A', 'me', 'back')])).toBeNull();
    const cancelledA = { ...a, status: 'cancelled' as const };
    expect(seatClash(b, 'both', 'me', [cancelledA, b], [seat('A', 'me', 'both')])).toBeNull();
    // a waitlist place still holds you to that car
    expect(seatClash(b, 'both', 'me', trips, [seat('A', 'me', 'both', 'waitlist')])?.seat.status).toBe('waitlist');
  });
});

describe('stranded riders: what can be done', () => {
  const out = trip({ id: 'EV', departTime: '17:00', returnTime: null, returnDate: null, direction: 'outbound', createdBy: 'planner', driverUserId: 'aisha' });
  const pickup = trip({ id: 'PU', departTime: '21:30', returnTime: '22:15', direction: 'pickup', passengerSeats: 3, createdBy: 'other', driverUserId: 'other' });
  const ruby: TripSeat = { ...seat('EV', 'x', 'there'), riderUserId: null, riderName: 'Ruby Walsh' };
  const mine = seat('EV', 'me', 'there');
  const request: RideRequest = {
    id: 'rq', campId: 'c', requestedBy: null, requesterName: 'ruby walsh ', wantedDate: '2026-09-19', earliestTime: null,
    latestTime: null, destination: null, leg: 'back', note: null, status: 'open', matchedTripId: null, matchedSeatId: null,
    createdAt: '2026-09-10T00:00:00Z',
  };

  it('offers the pickup and finds the request someone already made', () => {
    const trips = [out, pickup];
    const seats = [ruby, mine];
    const stranded = strandedRiders(trips, seats);
    const help = strandedHelp(stranded, trips, seats, [request], 'aisha', 'staff');
    const r = help.find((h) => h.rider.seat.id === ruby.id)!;
    expect(r.options.map((t) => t.id)).toEqual(['PU']);
    expect(r.openRequest?.id).toBe('rq');
    expect(r.isMe).toBe(false);
    // Aisha drives Ruby's ride in, so she may give her a seat back on someone else's pickup.
    expect(r.canOfferOn(pickup)).toBe(true);
    expect(r.canAsk).toBe(true);
  });

  it('lets the rider help themselves, and nobody else unrelated', () => {
    const trips = [out, pickup];
    const seats = [ruby, mine];
    const stranded = strandedRiders(trips, seats);
    const me = strandedHelp(stranded, trips, seats, [], 'me', 'staff').find((h) => h.isMe)!;
    expect(me.canOfferOn(pickup)).toBe(true);
    expect(me.canAsk).toBe(true);
    const stranger = strandedHelp(stranded, trips, seats, [], 'stranger', 'staff').find((h) => h.rider.seat.id === ruby.id)!;
    expect(stranger.canOfferOn(pickup)).toBe(false);
    expect(stranger.canAsk).toBe(false);
    const admin = strandedHelp(stranded, trips, seats, [], 'stranger', 'admin')[0];
    expect(admin.canOfferOn(pickup) && admin.canAsk).toBe(true);
    const viewer = strandedHelp(stranded, trips, seats, [], 'me', 'viewer').find((h) => h.isMe)!;
    expect(viewer.canOfferOn(pickup) || viewer.canAsk).toBe(false);
  });

  it('has no options when the pickup is full on the way back', () => {
    const full = { ...pickup, passengerSeats: 1 };
    const seats = [ruby, seat('PU', 'ines', 'back')];
    const help = strandedHelp(strandedRiders([out, full], seats), [out, full], seats, [], 'aisha', 'staff');
    expect(help[0].options).toEqual([]);
  });
});

describe('errands: where they can go, and duplicates', () => {
  const now = { date: '2026-09-19', minutes: 12 * 60 };
  it('offers only upcoming trips, soonest first, with managed trips past their list close', () => {
    const gone = trip({ id: 'GONE', departDate: '2026-09-17', departTime: '14:00' });
    const later = trip({ id: 'LATER', departDate: '2026-09-21', departTime: '09:00' });
    const soon = trip({ id: 'SOON', departDate: '2026-09-19', departTime: '15:00' });
    const closed = trip({ id: 'CLOSED', departDate: '2026-09-19', departTime: '13:00', errandsCloseTime: '11:00' });
    const out = trip({ id: 'OUT', departDate: '2026-09-20', departTime: '10:00', status: 'out' });
    const trips = [later, gone, closed, soon, out];
    expect(errandTargets(trips, now, new Set()).map((t) => t.id)).toEqual(['SOON', 'LATER']);
    expect(errandTargets(trips, now, new Set(['CLOSED', 'GONE', 'OUT'])).map((t) => t.id)).toEqual(['CLOSED', 'SOON', 'LATER']);
    expect(hasDeparted(gone, now)).toBe(true);
    expect(hasDeparted(soon, now)).toBe(false);
  });

  it('puts errands on a car that already left in their own pile', () => {
    const gone = trip({ id: 'GONE', departDate: '2026-09-17', departTime: '14:00' });
    const soon = trip({ id: 'SOON', departDate: '2026-09-19', departTime: '15:00' });
    const list = shoppingList([errand({ tripId: 'GONE' }), errand({ tripId: 'SOON' }), errand()], [gone, soon], now);
    expect([list.onDepartedCount, list.onTripCount, list.needsTripCount]).toEqual([1, 1, 1]);
  });

  it('finds an identical open errand regardless of case, spacing or a plural', () => {
    const noor = errand({ item: 'AA batteries', quantity: '24', requesterName: 'Noor Haddad' });
    const errands = [noor, errand({ item: 'Glue', status: 'bought' })];
    expect(findDuplicateErrand(errands, '  aa   Batteries ')?.id).toBe(noor.id);
    expect(findDuplicateErrand(errands, 'AA battery')?.id).toBe(noor.id);
    expect(findDuplicateErrand(errands, 'glue')).toBeNull();
    expect(findDuplicateErrand(errands, 'a')).toBeNull();
    expect(errandPeople({ ...noor, alsoNeededBy: [{ userId: 'u9', name: 'Kai' }] })).toBe('Noor Haddad, Kai');
  });

  it('explains when the reminder moves out of quiet hours', () => {
    expect(leavingSoonNote('2026-09-19', '17:00')).toBe('a “leaving soon” reminder at 4pm, an hour before');
    expect(leavingSoonNote('2026-09-19', '07:00')).toBe('a “leaving soon” reminder the evening before at 6pm (no messages go out 8pm–8am)');
    expect(leavingSoonNote('2026-09-19', '08:30')).toBe('a “leaving soon” reminder at 8am (no messages go out 8pm–8am)');
    expect(leavingSoonNote('2026-09-19', '21:30')).toBe('a “leaving soon” reminder at 7pm (no messages go out 8pm–8am)');
    expect(leavingSoonNote('2026-09-19', '00:30')).toBe('a “leaving soon” reminder the evening before at 7pm (no messages go out 8pm–8am)');
  });
});
