import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ShoppingBasket } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { RequestForm } from '@/components/foodRequests/RequestForm';
import { FoodStatusChip, LateChip, ProgramDot, foodStatusUrl } from '@/components/foodRequests/foodUi';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { FOOD_STATUS_LABELS, draftToPayload, formatLineQty, formatPickup, lineChangeSummary } from '@/lib/foodRequests';
import { dbCancelFoodRequest, dbSubmitFoodRequest, loadCampTimeZone } from '@/lib/foodRequestsDb';
import type { FoodRequestLine } from '@/lib/foodRequestTypes';

/**
 * /food-requests — for anyone at camp who needs something from the kitchen.
 *
 * Deliberately not a tab inside Kitchen Manager: the person asking is a program lead, not the
 * kitchen, and should not have to walk through inventory and ordering to find a form. Their own
 * requests update live on the same channel the kitchen's inbox does.
 */
export function FoodRequests() {
  const requests = useCommissaryStore((s) => s.foodRequests);
  const lines = useCommissaryStore((s) => s.foodRequestLines);
  const programs = useCommissaryStore((s) => s.foodPrograms);
  const settings = useCommissaryStore((s) => s.foodRequestSettings);
  const items = useCommissaryStore((s) => s.items);
  const patch = useCommissaryStore((s) => s.patchFoodRequest);
  const camp = useCampStore((s) => s.currentCamp);
  const { currentUser, role } = useAuth();
  const canAsk = role === 'admin' || role === 'staff';

  const [composing, setComposing] = useState(false);
  const [sent, setSent] = useState(false);
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    if (!camp) return;
    let live = true;
    loadCampTimeZone(camp.id).then((tz) => { if (live) setTimeZone(tz); });
    return () => { live = false; };
  }, [camp]);

  const mine = useMemo(() => requests
    .filter((r) => r.requestedBy === currentUser.id)
    .sort((a, b) => (b.pickupDate + b.pickupTime).localeCompare(a.pickupDate + a.pickupTime)), [requests, currentUser.id]);
  const linesByRequest = useMemo(() => {
    const m = new Map<string, FoodRequestLine[]>();
    for (const l of lines) {
      const arr = m.get(l.requestId);
      if (arr) arr.push(l); else m.set(l.requestId, [l]);
    }
    return m;
  }, [lines]);
  const formItems = useMemo(() => items.map((i) => ({ id: i.id, name: i.name, unit: i.stockUnit, category: i.category }))
    .sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const activePrograms = useMemo(() => programs.filter((p) => p.active), [programs]);
  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar title="Food requests" subtitle="Ask the kitchen for food for a program or activity"
        actions={canAsk && !composing ? <Button size="sm" onClick={() => { setComposing(true); setSent(false); }}>+ New request</Button> : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
        <div className="mx-auto max-w-2xl">
          {sent && (
            <p className="mb-4 flex items-center gap-2 rounded-card border border-sage/40 bg-green-muted-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-muted-text">
              <CheckCircle2 className="h-4 w-4" /> Sent to the kitchen. You&rsquo;ll get an email when they decide.
            </p>
          )}

          {composing && camp && (
            <div className="mb-8 rounded-card border border-border bg-paper-raised px-4 py-5 sm:px-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-[18px] font-bold text-forest">New request</h2>
                <button type="button" onClick={() => setComposing(false)} className="text-[13px] font-semibold text-ink-soft hover:text-forest">Cancel</button>
              </div>
              {timeZone ? (
                <RequestForm
                  items={formItems}
                  timeZone={timeZone}
                  cutoffHours={settings?.cutoffHours ?? 72}
                  pickupLocation={settings?.pickupLocation ?? null}
                  programs={activePrograms.map((p) => ({ id: p.id, name: p.name }))}
                  askContact={false}
                  onSubmit={async (draft) => {
                    const payload = draftToPayload({ ...draft, requesterName: '', requesterEmail: '' });
                    const { error } = await dbSubmitFoodRequest(camp.id, payload);
                    if (error) return error;
                    setComposing(false);
                    setSent(true);
                    return null;
                  }}
                />
              ) : <p className="text-[13px] text-ink-soft">Loading…</p>}
            </div>
          )}

          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">My requests</h2>
          {mine.length === 0 ? (
            <div className="flex flex-col items-center rounded-card border border-border bg-white px-6 py-10 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-cream-dark"><ShoppingBasket className="h-6 w-6 text-ink-faint" /></div>
              <p className="text-[14px] font-semibold text-forest">You haven&rsquo;t asked the kitchen for anything yet</p>
              <p className="mt-1 max-w-sm text-[13px] text-ink-soft">
                {canAsk
                  ? `Need supplies for an activity? Send a request and the kitchen will approve it, set it aside and tell you when it's ready.`
                  : 'Viewers can see requests but not send them. Ask your camp admin, or use your program’s request link.'}
              </p>
              {canAsk && !composing && <Button size="sm" className="mt-4" onClick={() => setComposing(true)}>+ New request</Button>}
            </div>
          ) : (
            <ul className="space-y-3" data-testid="my-food-requests">
              {mine.map((r) => {
                const program = r.programId ? programById.get(r.programId) : undefined;
                const ls = [...(linesByRequest.get(r.id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
                return (
                  <li key={r.id} className="rounded-card border border-border bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProgramDot color={program?.color ?? null} />
                      <span className="text-[14px] font-semibold text-forest">{formatPickup(r.pickupDate, r.pickupTime)}</span>
                      <span className="text-[12px] text-ink-soft">{program?.name ?? 'No program'}</span>
                      <span className="flex-1" />
                      {r.isLate && r.status === 'submitted' && <LateChip hours={r.noticeHours} />}
                      <FoodStatusChip status={r.status} label={FOOD_STATUS_LABELS[r.status]} />
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {ls.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3 text-[13px]">
                          <span className={l.lineState === 'unavailable' ? 'text-ink-faint' : 'text-ink'}>{l.label}</span>
                          <span className="text-right font-mono text-[12px] text-ink-soft">
                            {lineChangeSummary(l) ?? formatLineQty(l.qtyApproved ?? l.qtyRequested, l.qtyApproved != null ? l.approvedUnitLabel : l.unitLabel)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {r.kitchenNote && <p className="mt-2 text-[12.5px] text-ink">Kitchen: <em>{r.kitchenNote}</em></p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                      <Link to={`/food/status/${r.statusToken}`} className="font-semibold text-forest underline underline-offset-2" title={foodStatusUrl(r.statusToken)}>
                        Status page
                      </Link>
                      {(r.status === 'submitted' || r.status === 'approved') && (
                        <button type="button" className="font-semibold text-red-text"
                          onClick={async () => {
                            if (!confirm('Cancel this request?')) return;
                            const err = await dbCancelFoodRequest(r.id);
                            if (err) alert(err); else patch(r.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
                          }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
