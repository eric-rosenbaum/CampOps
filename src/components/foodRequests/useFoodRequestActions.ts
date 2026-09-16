import { useCallback, useState } from 'react';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import {
  dbCancelFoodRequest, dbDecideFoodRequest, dbMarkFoodRequestMissed, dbMarkFoodRequestPickedUp, dbMarkFoodRequestReady,
  type DecisionLineInput,
} from '@/lib/foodRequestsDb';
import type { FoodRequest } from '@/lib/foodRequestTypes';

/**
 * Every kitchen transition, in one place: call the RPC, then show the new state immediately.
 *
 * The RPC is the authority (it raises on an illegal move); the patch only saves the card from
 * sitting in its old column until the realtime reload lands. On an error nothing is patched and
 * the message the database raised is shown as-is — they are written for people.
 */
export function useFoodRequestActions() {
  const patch = useCommissaryStore((s) => s.patchFoodRequest);
  const { currentUser } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = useCallback(async (id: string, fn: () => Promise<string | null>, onOk: Partial<FoodRequest>) => {
    setBusyId(id);
    const err = await fn();
    setBusyId(null);
    if (err) { alert(err); return false; }
    patch(id, { ...onOk, updatedAt: new Date().toISOString() });
    return true;
  }, [patch]);

  const now = () => new Date().toISOString();

  return {
    busyId,
    decide: (r: FoodRequest, decision: 'approve' | 'decline', lines: DecisionLineInput[], note: string | null) =>
      run(r.id, () => dbDecideFoodRequest(r.id, decision, lines, note), {
        status: decision === 'approve' ? 'approved' : 'declined', decidedAt: now(), decidedByName: currentUser.name, kitchenNote: note,
      }),
    ready: (r: FoodRequest) => run(r.id, () => dbMarkFoodRequestReady(r.id), { status: 'ready', readyAt: now() }),
    pickedUp: (r: FoodRequest, byName: string | null = null) =>
      run(r.id, () => dbMarkFoodRequestPickedUp(r.id, byName), { status: 'picked_up', pickedUpAt: now(), pickedUpByName: byName }),
    missed: (r: FoodRequest) => run(r.id, () => dbMarkFoodRequestMissed(r.id), { status: 'missed', missedAt: now() }),
    cancel: (r: FoodRequest) => run(r.id, () => dbCancelFoodRequest(r.id), { status: 'cancelled', cancelledAt: now() }),
  };
}
