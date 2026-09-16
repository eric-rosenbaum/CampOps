import { describe, it, expect } from 'vitest';
import {
  canTransition, requestDemandByItemDate, setAsideByItem, pendingByItem, requestDemandInWindow,
  zonedWallTimeToInstant, noticeHours, isLate, pickupReminderAt, formatClock, formatPickup, formatNotice,
  inboxOrder, pickupDays, checkDraft, draftToPayload, matchItems, lineChangeSummary, lineDemandBase, todayInZone,
  pullListHtml,
} from '@/lib/foodRequests';
import type { FoodRequest, FoodRequestLine, FoodRequestDraft } from '@/lib/foodRequestTypes';

let seq = 0;
function req(p: Partial<FoodRequest> = {}): FoodRequest {
  seq += 1;
  return {
    id: `r${seq}`, campId: 'c', programId: 'p1', requestedBy: null, requesterName: 'Casey', requesterEmail: 'c@example.com',
    requesterPhone: null, notifyBy: 'email', source: 'link', pickupDate: '2026-07-18', pickupTime: '14:00', purpose: null,
    headcount: null, status: 'approved', noticeHours: 80, cutoffHours: 72, isLate: false, kitchenNote: null,
    changedByKitchen: false, decidedBy: null, decidedByName: null, decidedAt: null, readyAt: null, pickedUpAt: null,
    pickedUpByName: null, missedAt: null, cancelledAt: null, cancelledBy: null, statusToken: `t${seq}`,
    createdAt: '2026-07-10T12:00:00Z', updatedAt: '2026-07-10T12:00:00Z', ...p,
  };
}
function line(requestId: string, p: Partial<FoodRequestLine> = {}): FoodRequestLine {
  seq += 1;
  return {
    id: `l${seq}`, requestId, campId: 'c', itemId: 'flour', label: 'Flour', qtyRequested: 5, unitLabel: 'lb',
    unitInBase: 453.592, qtyRequestedBase: 2267.96, qtyApproved: null, approvedUnitLabel: null, qtyApprovedBase: null,
    note: null, lineState: 'ok', sortOrder: 0, ...p,
  };
}
const programs = [{ id: 'p1', name: 'Cooking Club' }];

describe('state machine', () => {
  it('only allows the documented transitions', () => {
    expect(canTransition('submitted', 'approved')).toBe(true);
    expect(canTransition('submitted', 'declined')).toBe(true);
    expect(canTransition('submitted', 'cancelled')).toBe(true);
    expect(canTransition('approved', 'ready')).toBe(true);
    expect(canTransition('approved', 'missed')).toBe(true);
    expect(canTransition('ready', 'picked_up')).toBe(true);
    // No state lets a request be picked up without first being approved.
    expect(canTransition('submitted', 'picked_up')).toBe(false);
    expect(canTransition('submitted', 'ready')).toBe(false);
    expect(canTransition('approved', 'picked_up')).toBe(false);
    expect(canTransition('ready', 'cancelled')).toBe(false);
    expect(canTransition('declined', 'approved')).toBe(false);
    expect(canTransition('picked_up', 'missed')).toBe(false);
  });
});

describe('requestDemandByItemDate', () => {
  it('counts approved, ready and picked up; not submitted, declined, missed or cancelled', () => {
    const statuses = ['submitted', 'approved', 'declined', 'ready', 'picked_up', 'missed', 'cancelled'] as const;
    const requests = statuses.map((status, i) => req({ status, pickupDate: `2026-07-1${i}` }));
    const lines = requests.map((r) => line(r.id, { qtyRequestedBase: 100 }));
    const demand = requestDemandByItemDate(requests, lines);
    expect([...demand.get('flour')!.entries()].sort()).toEqual([
      ['2026-07-11', 100], ['2026-07-13', 100], ['2026-07-14', 100],
    ]);
  });

  it('uses the approved quantity over the requested one, skips unlinked lines and unavailable ones', () => {
    const r = req({ pickupDate: '2026-07-20' });
    const lines = [
      line(r.id, { qtyRequestedBase: 2267.96, qtyApprovedBase: 1360.776, lineState: 'changed' }),
      line(r.id, { itemId: null, label: 'Big marshmallows', qtyRequestedBase: null }),
      line(r.id, { itemId: 'sugar', qtyRequestedBase: 2000, qtyApprovedBase: 0, lineState: 'unavailable' }),
      line(r.id, { itemId: 'sugar', qtyRequestedBase: 500 }),
    ];
    const demand = requestDemandByItemDate([r], lines);
    expect(demand.get('flour')!.get('2026-07-20')).toBeCloseTo(1360.776);
    expect(demand.get('sugar')!.get('2026-07-20')).toBe(500);
    expect(demand.size).toBe(2);
  });

  it('sums two requests for the same item and day', () => {
    const a = req({ pickupDate: '2026-07-20' });
    const b = req({ pickupDate: '2026-07-20', status: 'ready' });
    const demand = requestDemandByItemDate([a, b], [line(a.id, { qtyRequestedBase: 100 }), line(b.id, { qtyRequestedBase: 50 })]);
    expect(demand.get('flour')!.get('2026-07-20')).toBe(150);
  });

  it('a free-text line the kitchen linked counts at its approved quantity', () => {
    const r = req();
    const l = line(r.id, { itemId: 'sugar', label: 'Big marshmallows', qtyRequestedBase: null, qtyApprovedBase: 1500, lineState: 'changed' });
    expect(lineDemandBase(l)).toBe(1500);
    expect(requestDemandByItemDate([r], [l]).get('sugar')!.get('2026-07-18')).toBe(1500);
  });
});

describe('setAsideByItem', () => {
  it('holds approved and ready requests from today on, with who and when', () => {
    const past = req({ pickupDate: '2026-07-10' });
    const today = req({ pickupDate: '2026-07-15', pickupTime: '09:00', status: 'ready' });
    const later = req({ pickupDate: '2026-07-18', programId: null, requesterName: 'Robin' });
    const pickedUp = req({ pickupDate: '2026-07-16', status: 'picked_up' });
    const pending = req({ pickupDate: '2026-07-16', status: 'submitted' });
    const all = [later, past, today, pickedUp, pending];
    const lines = all.map((r) => line(r.id, { qtyRequestedBase: 100 }));
    const aside = setAsideByItem(all, lines, '2026-07-15', programs).get('flour')!;
    expect(aside.totalBase).toBe(200);
    expect(aside.entries.map((e) => [e.pickupDate, e.who])).toEqual([['2026-07-15', 'Cooking Club'], ['2026-07-18', 'Robin']]);
  });
});

describe('pending and in-window request demand', () => {
  it('pending is submitted only, within the window', () => {
    const a = req({ status: 'submitted', pickupDate: '2026-07-16' });
    const b = req({ status: 'submitted', pickupDate: '2026-08-30' });
    const c = req({ status: 'approved', pickupDate: '2026-07-16' });
    const p = pendingByItem([a, b, c], [line(a.id), line(b.id), line(c.id)], '2026-07-15', '2026-07-29', programs);
    expect(p.get('flour')!.entries.map((e) => e.requestId)).toEqual([a.id]);
  });

  it('the ordering window is after today through its end, like the order math "used by"', () => {
    const today = req({ pickupDate: '2026-07-15' });
    const inside = req({ pickupDate: '2026-07-20', status: 'picked_up' });
    const end = req({ pickupDate: '2026-07-29' });
    const beyond = req({ pickupDate: '2026-07-30' });
    const all = [today, inside, end, beyond];
    const w = requestDemandInWindow(all, all.map((r) => line(r.id, { qtyRequestedBase: 10 })), '2026-07-15', '2026-07-29', programs);
    expect(w.get('flour')!.totalBase).toBe(20);
  });
});

describe('late notice in camp time', () => {
  it('turns a camp-local wall time into the right instant, summer and winter', () => {
    expect(zonedWallTimeToInstant('2026-07-18', '14:00', 'America/Vancouver').toISOString()).toBe('2026-07-18T21:00:00.000Z');
    expect(zonedWallTimeToInstant('2026-12-18', '14:00', 'America/Vancouver').toISOString()).toBe('2026-12-18T22:00:00.000Z');
    expect(zonedWallTimeToInstant('2026-07-18', '07:00', 'America/Toronto').toISOString()).toBe('2026-07-18T11:00:00.000Z');
  });

  it('is exactly 72 hours at the boundary and late one second under', () => {
    const now = new Date('2026-07-15T21:00:00Z'); // 14:00 PDT
    expect(noticeHours('2026-07-18', '14:00', 'America/Vancouver', now)).toBe(72);
    expect(isLate(72, 72)).toBe(false);
    const oneSecondLater = new Date(now.getTime() + 1000);
    const h = noticeHours('2026-07-18', '14:00', 'America/Vancouver', oneSecondLater);
    expect(h).toBeLessThan(72);
    expect(isLate(h, 72)).toBe(true);
  });

  it('counts real hours across the November clock change (Vancouver, DST ends Nov 1)', () => {
    const now = new Date('2026-10-30T21:00:00Z'); // Fri 14:00 PDT
    expect(noticeHours('2026-11-02', '14:00', 'America/Vancouver', now)).toBe(73);
    expect(noticeHours('2026-11-02', '13:00', 'America/Vancouver', now)).toBe(72);
  });

  it('counts real hours across the March clock change (Toronto, DST starts Mar 8)', () => {
    const now = new Date('2026-03-06T19:00:00Z'); // Fri 14:00 EST
    expect(noticeHours('2026-03-09', '14:00', 'America/Toronto', now)).toBe(71);
    expect(isLate(noticeHours('2026-03-09', '14:00', 'America/Toronto', now), 72)).toBe(true);
    expect(noticeHours('2026-03-09', '15:00', 'America/Toronto', now)).toBe(72);
  });

  it('knows the camp-local day, not the browser one', () => {
    // 03:30 UTC is still the previous evening in Vancouver.
    expect(todayInZone('America/Vancouver', new Date('2026-07-16T03:30:00Z'))).toBe('2026-07-15');
    expect(todayInZone('America/Toronto', new Date('2026-07-16T04:30:00Z'))).toBe('2026-07-16');
  });

  it('reminds an early pickup the evening before (quiet hours start at 08:00)', () => {
    expect(pickupReminderAt('07:00')).toEqual({ dayOffset: -1, time: '18:00' });
    expect(pickupReminderAt('09:59')).toEqual({ dayOffset: -1, time: '18:00' });
    expect(pickupReminderAt('10:00')).toEqual({ dayOffset: 0, time: '08:00' });
    expect(pickupReminderAt('14:00')).toEqual({ dayOffset: 0, time: '08:00' });
  });
});

describe('formatting', () => {
  it('reads like a person wrote it', () => {
    expect(formatClock('14:00')).toBe('2pm');
    expect(formatClock('07:30')).toBe('7:30am');
    expect(formatClock('00:00')).toBe('12am');
    expect(formatClock('12:15')).toBe('12:15pm');
    expect(formatPickup('2026-07-16', '14:00')).toBe('Thu, Jul 16, 2pm');
    expect(formatNotice(26.4)).toBe('26 hours');
    expect(formatNotice(1.2)).toBe('1 hour');
    expect(formatNotice(80)).toBe('3 days');
  });

  it('describes what the kitchen changed', () => {
    expect(lineChangeSummary(line('r', { lineState: 'changed', qtyApproved: 3, approvedUnitLabel: 'lb' }))).toBe('asked 5 lb, approved 3 lb');
    expect(lineChangeSummary(line('r', { lineState: 'unavailable' }))).toBe('not available');
    expect(lineChangeSummary(line('r'))).toBeNull();
  });
});

describe('kitchen lists', () => {
  it('puts late requests on top of the inbox, then soonest pickup', () => {
    const a = req({ status: 'submitted', pickupDate: '2026-07-20' });
    const b = req({ status: 'submitted', pickupDate: '2026-07-25', isLate: true });
    const c = req({ status: 'submitted', pickupDate: '2026-07-18' });
    const d = req({ status: 'approved', pickupDate: '2026-07-17' });
    expect(inboxOrder([a, b, c, d]).map((r) => r.id)).toEqual([b.id, c.id, a.id]);
  });

  it('groups pickups by day with Today first, and past-due ones called out above', () => {
    const overdue = req({ pickupDate: '2026-07-14', status: 'ready' });
    const tomorrow = req({ pickupDate: '2026-07-16' });
    const later = req({ pickupDate: '2026-07-20' });
    const done = req({ pickupDate: '2026-07-16', status: 'picked_up' });
    const days = pickupDays([later, done, tomorrow, overdue], '2026-07-15', '2026-07-16');
    expect(days.map((d) => d.label)).toEqual(['Past due', 'Today', 'Tomorrow · Thu, Jul 16', 'Mon, Jul 20']);
    expect(days[1].requests).toEqual([]);
    expect(days[2].requests.map((r) => r.id)).toEqual([tomorrow.id]);
  });
});

describe('the request form', () => {
  const draft = (p: Partial<FoodRequestDraft> = {}): FoodRequestDraft => ({
    programId: null, requesterName: 'Casey', requesterEmail: 'casey@example.com', requesterPhone: '', notifyBy: 'email',
    pickupDate: '2026-07-17', pickupTime: '14:00', purpose: '', headcount: '',
    lines: [
      { itemId: 'flour', label: 'Flour', qty: '5', unitLabel: 'lb' },
      { itemId: null, label: 'Big marshmallows', qty: '3', unitLabel: 'bags' },
      { itemId: null, label: '', qty: '', unitLabel: '' },
    ], ...p,
  });
  const now = new Date('2026-07-15T21:00:00Z');
  const opts = { timeZone: 'America/Vancouver', cutoffHours: 72, now, requireContact: true };

  it('flags late before submit without blocking it', () => {
    const c = checkDraft(draft(), opts);
    expect(c.errors).toEqual([]);
    expect(c.hours).toBe(48);
    expect(c.late).toBe(true);
    expect(checkDraft(draft({ pickupDate: '2026-07-19' }), opts).late).toBe(false);
  });

  it('asks for what is missing in plain words', () => {
    const c = checkDraft(draft({ requesterEmail: 'nope', pickupTime: '', lines: [{ label: 'Eggs', qty: '', unitLabel: '' }] }), opts);
    expect(c.errors).toEqual(['Add an email address so the kitchen can reply.', 'Pick a pickup day and time.', 'How much Eggs?']);
    expect(checkDraft(draft({ pickupDate: '2026-07-15', pickupTime: '13:00' }), opts).errors).toContain('That pickup time has already passed.');
  });

  it('builds the RPC payload: linked lines send the item, free text sends a label, blanks are dropped', () => {
    const p = draftToPayload(draft({ headcount: '14' }));
    expect(p.headcount).toBe(14);
    expect(p.lines).toEqual([
      { item_id: 'flour', qty: 5, note: null },
      { label: 'Big marshmallows', qty: 3, unit_label: 'bags', note: null },
    ]);
  });

  it('matches items by prefix, then word start, then anywhere', () => {
    const items = [{ name: 'All-purpose flour' }, { name: 'Flour tortillas' }, { name: 'Cauliflower' }, { name: 'Sugar' }];
    expect(matchItems(items, 'flo').map((i) => i.name)).toEqual(['Flour tortillas', 'All-purpose flour', 'Cauliflower']);
    expect(matchItems(items, '  ')).toEqual([]);
  });
});

describe('pull list', () => {
  it('lists what to pull per request and strikes what is not available', () => {
    const r = req({ status: 'approved', kitchenNote: 'Only 3 lb' });
    const html = pullListHtml({
      campName: 'Camp <Test>', dayLabel: 'Thu Jul 18', requests: [r], programs, pickupLocation: 'back door',
      lines: [
        line(r.id, { qtyApproved: 3, approvedUnitLabel: 'lb', lineState: 'changed' }),
        line(r.id, { label: 'Sugar', lineState: 'unavailable', sortOrder: 1 }),
      ],
    });
    expect(html).toContain('2pm · Cooking Club');
    expect(html).toContain('3 lb');
    expect(html).toContain('class="na"');
    expect(html).toContain('Camp &lt;Test&gt;');
  });
});
