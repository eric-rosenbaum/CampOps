import { useCallback, useState } from 'react';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import {
  dbCancelFoodRequest, dbDecideFoodRequest, dbMarkFoodRequestMissed, dbMarkFoodRequestPickedUp, dbMarkFoodRequestReady,
  type DecisionLineInput,
} from '@/lib/foodRequestsDb';
import type { FoodRequest } from '@/lib/foodRequestTypes';
import { formatDay, formatPickup, isBeforePickupDay, todayInZone } from '@/lib/foodRequests';
import { ConfirmDialog } from './ConfirmDialog';

type Pending = { kind: 'ready' | 'picked_up' | 'cancel'; request: FoodRequest; who: string };

/**
 * Every kitchen transition, in one place: call the RPC, then show the new state immediately.
 *
 * The RPC is the authority (it raises on an illegal move); the patch only saves the card from
 * sitting in its old column until the realtime reload lands. On an error nothing is patched and
 * the message the database raised is shown as-is — they are written for people.
 *
 * Three moves ask first, in the page rather than with the browser's confirm(): cancelling, and
 * marking ready or picked up before the pickup day, which in the demo was a tap on the wrong card.
 * Render `dialog` wherever the hook is used.
 */
export function useFoodRequestActions(timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const patch = useCommissaryStore((s) => s.patchFoodRequest);
  const programs = useCommissaryStore((s) => s.foodPrograms);
  const { currentUser } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const run = useCallback(async (id: string, fn: () => Promise<string | null>, onOk: Partial<FoodRequest>) => {
    setBusyId(id);
    const err = await fn();
    setBusyId(null);
    if (err) { alert(err); return false; }
    patch(id, { ...onOk, updatedAt: new Date().toISOString() });
    return true;
  }, [patch]);

  const now = () => new Date().toISOString();
  const whoOf = (r: FoodRequest) => programs.find((p) => p.id === r.programId)?.name ?? r.requesterName;

  const doReady = (r: FoodRequest) => run(r.id, () => dbMarkFoodRequestReady(r.id), { status: 'ready', readyAt: now() });
  const doPickedUp = (r: FoodRequest, byName: string | null = null) =>
    run(r.id, () => dbMarkFoodRequestPickedUp(r.id, byName), { status: 'picked_up', pickedUpAt: now(), pickedUpByName: byName });
  const doCancel = (r: FoodRequest) => run(r.id, () => dbCancelFoodRequest(r.id), { status: 'cancelled', cancelledAt: now(), cancelledBy: 'kitchen' });

  const early = (r: FoodRequest) => isBeforePickupDay(r, todayInZone(timeZone));

  const dialog = pending ? (
    <ConfirmDialog
      busy={busyId === pending.request.id}
      tone={pending.kind === 'cancel' ? 'danger' : 'primary'}
      title={pending.kind === 'cancel' ? `Cancel ${pending.who}’s request?`
        : pending.kind === 'ready' ? `Ready already? Pickup is ${formatDay(pending.request.pickupDate)}`
          : `Picked up already? Pickup is ${formatDay(pending.request.pickupDate)}`}
      body={pending.kind === 'cancel'
        ? <>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}. {pending.request.requesterName} sees it was cancelled by the kitchen, and anything set aside goes back on the shelf.</>
        : pending.kind === 'ready'
          ? <>This is booked for <strong>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}</strong>. Marking it ready now tells {pending.request.requesterName} they can come and get it today.</>
          : <>This is booked for <strong>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}</strong>. Marking it picked up takes the food off the shelf count now.</>}
      confirmLabel={pending.kind === 'cancel' ? 'Cancel request' : pending.kind === 'ready' ? 'Mark ready now' : 'Mark picked up now'}
      cancelLabel={pending.kind === 'cancel' ? 'Keep it' : 'Not yet'}
      onCancel={() => setPending(null)}
      onConfirm={async () => {
        const p = pending;
        const ok = p.kind === 'cancel' ? await doCancel(p.request) : p.kind === 'ready' ? await doReady(p.request) : await doPickedUp(p.request);
        if (ok) setPending(null);
      }}
    />
  ) : null;

  return {
    busyId,
    dialog,
    decide: (r: FoodRequest, decision: 'approve' | 'decline', lines: DecisionLineInput[], note: string | null) =>
      run(r.id, () => dbDecideFoodRequest(r.id, decision, lines, note), {
        status: decision === 'approve' ? 'approved' : 'declined', decidedAt: now(), decidedByName: currentUser.name, kitchenNote: note,
      }),
    ready: (r: FoodRequest) => (early(r) ? setPending({ kind: 'ready', request: r, who: whoOf(r) }) : void doReady(r)),
    pickedUp: (r: FoodRequest) => (early(r) ? setPending({ kind: 'picked_up', request: r, who: whoOf(r) }) : void doPickedUp(r)),
    missed: (r: FoodRequest) => run(r.id, () => dbMarkFoodRequestMissed(r.id), { status: 'missed', missedAt: now() }),
    cancel: (r: FoodRequest) => setPending({ kind: 'cancel', request: r, who: whoOf(r) }),
  };
}
