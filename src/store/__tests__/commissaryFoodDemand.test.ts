import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store pulls in the Supabase data layer and the retreat store, which need a browser. The
// demand selectors under test never call either, so both are stubbed.
vi.mock('@/lib/db', () => ({}));
const retreats = [{ id: 'rt1', headcount: 20, status: 'confirmed', departureDate: '2099-01-01' }];
vi.mock('@/store/retreatStore', () => ({ useRetreatStore: { getState: () => ({ retreats }) } }));

import { useCommissaryStore } from '@/store/commissaryStore';
import type { FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import type { InventoryItem } from '@/lib/types';
import { addDaysStr } from '@/lib/commissaryUnits';
import { todayStr } from '@/lib/utils';

const today = todayStr();
const inTwoDays = addDaysStr(today, 2);

const flour: InventoryItem = {
  id: 'flour', name: 'Flour', category: 'dry_goods', storageLocation: 'dry_storage', dimension: 'weight',
  baseUnit: 'g', stockUnit: 'lb', stockUnitInBase: 453.592, purchaseUnit: 'bag', purchaseUnitInBase: 22679.6,
  unitPrice: 30, onHandBase: 10 * 453.592, parLevelBase: 8 * 453.592, lastCountedAt: `${today}T08:00:00Z`,
  shelfLifeDays: null, vendorId: null, allergens: [], dietary: [], notes: null, sortOrder: 0,
  createdAt: '', updatedAt: '',
};

function request(status: FoodRequest['status'], pickupDate = inTwoDays): FoodRequest {
  return {
    id: `req-${status}`, campId: 'c', programId: 'p1', requestedBy: null, requesterName: 'Casey', requesterEmail: null,
    requesterPhone: null, notifyBy: 'email', source: 'link', pickupDate, pickupTime: '14:00', purpose: null, headcount: null,
    status, noticeHours: 48, cutoffHours: 72, isLate: true, kitchenNote: null, changedByKitchen: true, decidedBy: null,
    decidedByName: null, decidedAt: null, readyAt: null, pickedUpAt: null, pickedUpByName: null, missedAt: null,
    cancelledAt: null, cancelledBy: null, statusToken: 't', createdAt: '', updatedAt: '',
  };
}
function flourLine(requestId: string, lb: number, approvedLb: number | null = null): FoodRequestLine {
  return {
    id: `line-${requestId}`, requestId, campId: 'c', itemId: 'flour', label: 'Flour', qtyRequested: lb, unitLabel: 'lb',
    unitInBase: 453.592, qtyRequestedBase: lb * 453.592, qtyApproved: approvedLb, approvedUnitLabel: approvedLb == null ? null : 'lb',
    qtyApprovedBase: approvedLb == null ? null : approvedLb * 453.592, note: null, lineState: approvedLb == null ? 'ok' : 'changed', sortOrder: 0,
  };
}

function reset(mode: 'session' | 'retreats') {
  useCommissaryStore.setState({
    mode, items: [flour], sessions: [], activeSessionId: null, menuEntries: [], retreatMenuEntries: [],
    orders: [], orderLines: [], recipes: [], ingredients: [], mealEvents: [],
    foodPrograms: [{ id: 'p1', campId: 'c', name: 'Cooking Club', leadName: null, leadEmail: null, leadPhone: null, color: null, requestToken: 'x', active: true, sortOrder: 0, createdAt: '', updatedAt: '' }],
    foodRequests: [], foodRequestLines: [], foodRequestSettings: null,
  });
}

describe.each(['session', 'retreats'] as const)('program requests as kitchen demand (%s mode)', (mode) => {
  beforeEach(() => reset(mode));

  it('an approved request draws on its pickup day, at the approved quantity', () => {
    const r = request('approved');
    useCommissaryStore.setState({ foodRequests: [r], foodRequestLines: [flourLine(r.id, 5, 3)] });
    const cons = useCommissaryStore.getState().consumptionByItemDate();
    expect(cons.get('flour')?.get(inTwoDays)).toBeCloseTo(3 * 453.592);
  });

  it('a submitted request is not demand, but shows as pending in the order math', () => {
    const r = request('submitted');
    useCommissaryStore.setState({ foodRequests: [r], foodRequestLines: [flourLine(r.id, 5)] });
    const s = useCommissaryStore.getState();
    expect(s.consumptionByItemDate().get('flour')).toBeUndefined();
    const pending = s.pendingRequestsInWindow(addDaysStr(today, 14));
    expect(pending.get('flour')?.totalBase).toBeCloseTo(5 * 453.592);
  });

  it('approval changes the order: the math includes the request by program and date', () => {
    const windowEnd = addDaysStr(today, 14);
    // 10 lb on hand, 8 lb floor: nothing to order until the club takes 5 lb.
    expect(useCommissaryStore.getState().orderMath(windowEnd)).toEqual([]);
    const r = request('approved');
    useCommissaryStore.setState({ foodRequests: [r], foodRequestLines: [flourLine(r.id, 5)] });
    const rows = useCommissaryStore.getState().orderMath(windowEnd);
    expect(rows).toHaveLength(1);
    expect(rows[0].requestBase).toBeCloseTo(5 * 453.592);
    expect(rows[0].draw).toBeCloseTo(5 * 453.592);
    expect(rows[0].requests.map((e) => [e.who, e.pickupDate])).toEqual([['Cooking Club', inTwoDays]]);
    expect(rows[0].need).toBeCloseTo(3 * 453.592);
    expect(useCommissaryStore.getState().reconciledDraftOrders(windowEnd)[0].lines[0].itemId).toBe('flour');
  });

  it('picked up still counts (nothing wrote it to stock); missed, declined and cancelled do not', () => {
    for (const status of ['picked_up', 'missed', 'declined', 'cancelled'] as const) {
      const r = request(status);
      useCommissaryStore.setState({ foodRequests: [r], foodRequestLines: [flourLine(r.id, 5)] });
      const got = useCommissaryStore.getState().consumptionByItemDate().get('flour')?.get(inTwoDays);
      if (status === 'picked_up') expect(got).toBeCloseTo(5 * 453.592);
      else expect(got).toBeUndefined();
    }
  });
});
