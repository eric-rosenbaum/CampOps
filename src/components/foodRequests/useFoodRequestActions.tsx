import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useAuth } from '@/lib/auth';
import {
  dbCancelFoodRequest, dbDecideFoodRequest, dbMarkFoodRequestMissed, dbMarkFoodRequestPickedUp, dbMarkFoodRequestReady,
  dbReopenFoodRequest, dbUndoFoodRequestMissed,
  type DecisionLineInput,
} from '@/lib/foodRequestsDb';
import type { FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import { formatDay, formatPickup, isBeforePickupDay, todayInZone } from '@/lib/foodRequests';
import { ConfirmDialog } from './ConfirmDialog';
import { FoodToast, type FoodToastState } from './foodUi';

type Pending = { kind: 'ready' | 'picked_up' | 'cancel' | 'missed'; request: FoodRequest; who: string };

/**
 * Every kitchen transition, in one place: call the RPC, then show the new state immediately.
 *
 * The RPC is the authority (it raises on an illegal move); the patch only saves the card from
 * sitting in its old column until the realtime reload lands. On an error nothing is patched and
 * the message the database raised is shown as-is — they are written for people.
 *
 * Some moves ask first, in the page rather than with the browser's confirm(): cancelling, Missed
 * (it went through on one tap, and a reviewer read the shelf figure dropping as food vanishing),
 * and marking ready or picked up before the pickup day, which in the demo was a tap on the wrong card.
 *
 * Approve, Decline and Missed then say what happened in a toast with Undo. Undo is offered only
 * where it is safe: a decision whose email has not gone out yet (the database refuses once it has),
 * and a missed pickup, which never touched stock. Picked up writes to the shelf count, so it has
 * no Undo.
 *
 * Render `dialog` and `toast` wherever the hook is used.
 */
export function useFoodRequestActions(timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const patch = useCommissaryStore((s) => s.patchFoodRequest);
  const programs = useCommissaryStore((s) => s.foodPrograms);
  const { currentUser } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<FoodToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = useCallback((t: FoodToastState) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.undo ? 10_000 : 5_000);
  }, []);

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
  const dayOf = (r: FoodRequest) => formatDay(r.pickupDate).replace(',', '');

  const doReady = (r: FoodRequest) => run(r.id, () => dbMarkFoodRequestReady(r.id), { status: 'ready', readyAt: now() });
  const doPickedUp = (r: FoodRequest, byName: string | null = null) =>
    run(r.id, () => dbMarkFoodRequestPickedUp(r.id, byName), { status: 'picked_up', pickedUpAt: now(), pickedUpByName: byName });
  const doCancel = (r: FoodRequest) => run(r.id, () => dbCancelFoodRequest(r.id), { status: 'cancelled', cancelledAt: now(), cancelledBy: 'kitchen' });

  async function undoDecision(r: FoodRequest) {
    setToast(null);
    const ok = await run(r.id, () => dbReopenFoodRequest(r.id), {
      status: 'submitted', decidedAt: null, decidedByName: null, kitchenNote: null, changedByKitchen: false,
    });
    if (!ok) return;
    // The lines' decisions are cleared in the database; clear them here too so the card and the
    // shelf math do not keep the approved amounts until the reload lands.
    useCommissaryStore.setState((s) => ({
      foodRequestLines: s.foodRequestLines.map((l): FoodRequestLine => (l.requestId === r.id
        ? { ...l, qtyApproved: null, approvedUnitLabel: null, qtyApprovedBase: null, lineState: 'ok', kitchenReason: null }
        : l)),
    }));
    showToast({ message: `${whoOf(r)} (${dayOf(r)}) is back in the inbox. Nothing was sent.` });
  }

  async function doMissed(r: FoodRequest) {
    const ok = await run(r.id, () => dbMarkFoodRequestMissed(r.id), { status: 'missed', missedAt: now() });
    if (!ok) return false;
    showToast({
      message: `${whoOf(r)} (${dayOf(r)}) marked not picked up. What was set aside is back on the shelf.`,
      undo: async () => {
        setToast(null);
        setBusyId(r.id);
        const { error, status } = await dbUndoFoodRequestMissed(r.id);
        setBusyId(null);
        if (error || !status) { alert(error ?? 'That could not be undone.'); return; }
        patch(r.id, { status, missedAt: null, updatedAt: now() });
        showToast({ message: `${whoOf(r)} (${dayOf(r)}) is back on the pickup list.` });
      },
    });
    return true;
  }

  const early = (r: FoodRequest) => isBeforePickupDay(r, todayInZone(timeZone));

  const dialog = pending ? (
    <ConfirmDialog
      busy={busyId === pending.request.id}
      tone={pending.kind === 'cancel' ? 'danger' : 'primary'}
      title={pending.kind === 'cancel' ? `Cancel ${pending.who}’s request?`
        : pending.kind === 'missed' ? `Nobody came for ${pending.who}’s food?`
          : pending.kind === 'ready' ? `Ready already? Pickup is ${formatDay(pending.request.pickupDate)}`
            : `Picked up already? Pickup is ${formatDay(pending.request.pickupDate)}`}
      body={pending.kind === 'cancel'
        ? <>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}. {pending.request.requesterName} sees it was cancelled by the kitchen, and anything set aside goes back on the shelf.</>
        : pending.kind === 'missed'
          ? <>Pickup was <strong>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}</strong>. Marking it not picked up releases what was set aside for the kitchen to use. Nothing comes off the shelf count, and you can undo it.</>
          : pending.kind === 'ready'
            ? <>This is booked for <strong>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}</strong>. Marking it ready now tells {pending.request.requesterName} they can come and get it today.</>
            : <>This is booked for <strong>{formatPickup(pending.request.pickupDate, pending.request.pickupTime)}</strong>. Marking it picked up takes the food off the shelf count now.</>}
      confirmLabel={pending.kind === 'cancel' ? 'Cancel request' : pending.kind === 'missed' ? 'Mark not picked up' : pending.kind === 'ready' ? 'Mark ready now' : 'Mark picked up now'}
      cancelLabel={pending.kind === 'cancel' ? 'Keep it' : pending.kind === 'missed' ? 'Keep waiting' : 'Not yet'}
      onCancel={() => setPending(null)}
      onConfirm={async () => {
        const p = pending;
        const ok = p.kind === 'cancel' ? await doCancel(p.request)
          : p.kind === 'missed' ? await doMissed(p.request)
            : p.kind === 'ready' ? await doReady(p.request) : await doPickedUp(p.request);
        if (ok) setPending(null);
      }}
    />
  ) : null;

  return {
    busyId,
    dialog,
    toast: <FoodToast toast={toast} onClose={() => setToast(null)} />,
    decide: async (r: FoodRequest, decision: 'approve' | 'decline', lines: DecisionLineInput[], note: string | null) => {
      const ok = await run(r.id, () => dbDecideFoodRequest(r.id, decision, lines, note), {
        status: decision === 'approve' ? 'approved' : 'declined', decidedAt: now(), decidedByName: currentUser.name, kitchenNote: note,
      });
      if (ok) {
        showToast({
          message: `${decision === 'approve' ? 'Approved' : 'Declined'} ${whoOf(r)} (${dayOf(r)}). ${r.requesterName.split(' ')[0]} is emailed within 15 minutes.`,
          undo: () => undoDecision(r),
        });
      }
      return ok;
    },
    ready: (r: FoodRequest) => (early(r) ? setPending({ kind: 'ready', request: r, who: whoOf(r) }) : void doReady(r)),
    pickedUp: (r: FoodRequest) => (early(r) ? setPending({ kind: 'picked_up', request: r, who: whoOf(r) }) : void doPickedUp(r)),
    missed: (r: FoodRequest) => setPending({ kind: 'missed', request: r, who: whoOf(r) }),
    cancel: (r: FoodRequest) => setPending({ kind: 'cancel', request: r, who: whoOf(r) }),
  };
}
