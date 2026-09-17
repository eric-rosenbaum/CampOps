import { useEffect, useMemo, useState } from 'react';
import { Inbox, Printer, Settings2, XCircle } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import { formatPickup, hoursOverdue, inboxOrder, pickupDays, pullListHtml, type RequestsView } from '@/lib/foodRequests';
import { addDaysStr } from '@/lib/commissaryUnits';
import { RequestCard, UnlinkedLegend } from './RequestCard';
import { DecisionModal } from './DecisionModal';
import { RequestDetailModal } from './RequestDetailModal';
import { useFoodRequestActions } from './useFoodRequestActions';
import { useCampClock } from './useCampClock';


const SEEN_KEY = (campId: string) => `campcommand-food-cancel-seen:${campId}`;
function readSeen(campId: string | undefined): Set<string> {
  if (!campId) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY(campId)) ?? '[]') as string[]); } catch { return new Set(); }
}

/**
 * Kitchen Manager › Requests. Three questions, three views:
 *   Inbox   — what has been asked for that nobody has answered?
 *   Pickups — what am I handing over, and when? And what did nobody come for?
 *   History — what did we give each program?
 *
 * The view can be chosen by link: /commissary?tab=requests&view=pickups (or inbox, history).
 */
export function RequestsTab({ openRequestId, onOpenRequest, view: viewParam, onViewChange, onOpenPrograms }: {
  /** A request opened by deep link (?request=) or by the caller. */
  openRequestId: string | null;
  onOpenRequest: (id: string | null) => void;
  /** ?view= from the URL, when it names a view. */
  view?: RequestsView | null;
  onViewChange?: (v: RequestsView) => void;
  onOpenPrograms: () => void;
}) {
  const requests = useCommissaryStore((s) => s.foodRequests);
  const lines = useCommissaryStore((s) => s.foodRequestLines);
  const programs = useCommissaryStore((s) => s.foodPrograms);
  const settings = useCommissaryStore((s) => s.foodRequestSettings);
  const items = useCommissaryStore((s) => s.items);
  const camp = useCampStore((s) => s.currentCamp);
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const { timeZone, now, today } = useCampClock();
  const actions = useFoodRequestActions(timeZone);

  const [view, setViewState] = useState<RequestsView>(() => {
    if (viewParam) return viewParam;
    const target = openRequestId ? requests.find((r) => r.id === openRequestId) : null;
    if (target && (target.status === 'approved' || target.status === 'ready')) return 'pickups';
    if (target && target.status !== 'submitted') return 'history';
    return 'inbox';
  });
  // A second link with a different ?view= while the tab is open still lands on that view.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL chose a view
    if (viewParam) setViewState(viewParam);
  }, [viewParam]);
  function setView(v: RequestsView) { setViewState(v); onViewChange?.(v); }

  const [programFilter, setProgramFilter] = useState<string>('all');
  const [decision, setDecision] = useState<{ id: string; mode: 'approve' | 'decline' } | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(camp?.id));

  const linesByRequest = useMemo(() => {
    const m = new Map<string, FoodRequestLine[]>();
    for (const l of lines) {
      const arr = m.get(l.requestId);
      if (arr) arr.push(l); else m.set(l.requestId, [l]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [lines]);
  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);

  const tomorrow = addDaysStr(today, 1);
  const inbox = useMemo(() => inboxOrder(requests), [requests]);
  const days = useMemo(() => pickupDays(requests, today, tomorrow), [requests, today, tomorrow]);
  const pickupCount = days.reduce((n, d) => n + d.requests.length, 0);
  const overdueById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) { const h = hoursOverdue(r, now, timeZone); if (h != null) m.set(r.id, h); }
    return m;
  }, [requests, now, timeZone]);
  const history = useMemo(() => requests
    .filter((r) => ['picked_up', 'declined', 'missed', 'cancelled'].includes(r.status))
    .filter((r) => programFilter === 'all' || (programFilter === 'none' ? !r.programId : r.programId === programFilter))
    .sort((a, b) => (b.pickupDate + b.pickupTime).localeCompare(a.pickupDate + a.pickupTime)), [requests, programFilter]);

  // Requests the requester called off, for pickups not yet past, that this browser has not
  // acknowledged. They used to vanish from Pickups with nothing on screen to say why.
  const cancelledByRequester = useMemo(() => requests
    .filter((r) => r.status === 'cancelled' && r.cancelledBy === 'requester' && r.pickupDate >= addDaysStr(today, -1) && !seen.has(r.id))
    .sort((a, b) => (b.cancelledAt ?? '').localeCompare(a.cancelledAt ?? '')), [requests, today, seen]);
  function acknowledge(ids: string[]) {
    const next = new Set([...seen, ...ids]);
    setSeen(next);
    if (camp?.id) { try { localStorage.setItem(SEEN_KEY(camp.id), JSON.stringify([...next].slice(-200))); } catch { /* storage blocked */ } }
  }

  const open = openRequestId ? requests.find((r) => r.id === openRequestId) : undefined;
  const deciding = decision ? requests.find((r) => r.id === decision.id) : undefined;
  const itemNames = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const hasUnlinked = (rs: FoodRequest[]) => rs.some((r) => (linesByRequest.get(r.id) ?? []).some((l) => !l.itemId && l.lineState !== 'unavailable'));

  function card(r: FoodRequest, actionsNode?: React.ReactNode) {
    return (
      <RequestCard key={r.id} request={r} lines={linesByRequest.get(r.id) ?? []} program={r.programId ? programById.get(r.programId) : undefined}
        overdueHours={overdueById.get(r.id) ?? null}
        onOpen={() => onOpenRequest(r.id)} actions={canManage ? actionsNode : undefined} />
    );
  }

  function printDay(label: string, rs: FoodRequest[]) {
    const html = pullListHtml({
      campName: camp?.name ?? '', dayLabel: label, requests: rs, itemNames,
      lines: rs.flatMap((r) => linesByRequest.get(r.id) ?? []), programs, pickupLocation: settings?.pickupLocation ?? null,
    });
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print the pull list.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  const busy = (r: FoodRequest) => actions.busyId === r.id;
  const whoOf = (r: FoodRequest) => (r.programId && programById.get(r.programId)?.name) || r.requesterName;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-x-1 border-b border-border sm:gap-x-2">
          <ViewTab label="Inbox" active={view === 'inbox'} onClick={() => setView('inbox')} count={inbox.length} />
          <ViewTab label="Pickups" active={view === 'pickups'} onClick={() => setView('pickups')} count={pickupCount}
            alert={overdueById.size} alertLabel={`${overdueById.size} not picked up on time`} />
          <ViewTab label="History" active={view === 'history'} onClick={() => setView('history')} />
          <span className="flex-1" />
          {canManage && (
            <button type="button" onClick={onOpenPrograms}
              aria-label="Programs and links" title="Programs and links"
              className="mb-1.5 inline-flex items-center gap-1.5 rounded-btn px-2 py-1 text-[12px] font-semibold text-ink-soft hover:text-forest">
              <Settings2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Programs &amp; links</span>
            </button>
          )}
        </div>

        {cancelledByRequester.length > 0 && (
          <div role="status" data-testid="requester-cancelled" className="mb-4 rounded-card border border-red/25 bg-red-bg px-4 py-3">
            <div className="flex items-start gap-2.5">
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red" />
              <div className="min-w-0 flex-1 text-[13px] text-red-text">
                <p className="font-semibold">
                  {cancelledByRequester.length === 1 ? 'A request was cancelled by the person who asked' : `${cancelledByRequester.length} requests were cancelled by the people who asked`}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {cancelledByRequester.slice(0, 4).map((r) => (
                    <li key={r.id}>
                      <button type="button" className="text-left underline underline-offset-2" onClick={() => onOpenRequest(r.id)}>
                        {whoOf(r)} · {formatPickup(r.pickupDate, r.pickupTime)}
                      </button>
                      <span> · {r.requesterName}{r.decidedAt ? '. Anything set aside can go back on the shelf.' : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="sm" variant="ghost" onClick={() => acknowledge(cancelledByRequester.map((r) => r.id))}>Got it</Button>
            </div>
          </div>
        )}

        {view === 'inbox' && (
          inbox.length === 0 ? (
            <Empty
              title="No requests waiting"
              body={programs.length === 0
                ? 'Programs ask for food through their own link, no account needed. Add a program in Settings to get its link and QR code.'
                : 'New requests from program links and from staff land here the moment they are sent.'}
              action={canManage && programs.length === 0 ? <Button size="sm" onClick={onOpenPrograms}>Add a program</Button> : undefined}
            />
          ) : (
            <div className="space-y-3" data-testid="food-inbox">
              {hasUnlinked(inbox) && <UnlinkedLegend />}
              {inbox.map((r) => card(r, (
                <>
                  <Button size="sm" variant="ghost" disabled={busy(r)} onClick={() => setDecision({ id: r.id, mode: 'decline' })}>Decline</Button>
                  <Button size="sm" variant="ghost" disabled={busy(r)} onClick={() => setDecision({ id: r.id, mode: 'approve' })}>Edit &amp; approve</Button>
                  <Button size="sm" disabled={busy(r)} onClick={() => actions.decide(r, 'approve', [], null)}>Approve</Button>
                </>
              )))}
            </div>
          )
        )}

        {view === 'pickups' && (
          <div className="space-y-6" data-testid="food-pickups">
            {hasUnlinked(days.flatMap((d) => d.requests)) && <UnlinkedLegend />}
            {days.map((d) => (
              <section key={d.key}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className={`text-[13px] font-bold uppercase tracking-[0.08em] ${d.key === 'past_due' ? 'text-red-text' : 'text-forest'}`}>{d.label}</h2>
                  <span className="text-[12px] text-ink-soft">{d.requests.length} pickup{d.requests.length === 1 ? '' : 's'}</span>
                  <span className="flex-1" />
                  {d.requests.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => printDay(d.label, d.requests)}>
                      <Printer className="h-3.5 w-3.5" /> Pull list
                    </Button>
                  )}
                </div>
                {d.requests.length === 0 ? (
                  <p className="rounded-card border border-dashed border-border px-4 py-3 text-[13px] text-ink-soft">Nothing to hand over today.</p>
                ) : (
                  <div className="space-y-3">
                    {d.requests.map((r) => {
                      const overdue = overdueById.has(r.id);
                      return card(r, (
                        <>
                          {overdue && (
                            <span className="mr-auto text-[12px] text-red-text">Did nobody come? Mark it missed so the kitchen can use the food.</span>
                          )}
                          {overdue && (
                            <Button size="sm" variant="danger" disabled={busy(r)} onClick={() => actions.missed(r)}>Missed</Button>
                          )}
                          {r.status === 'approved' && <Button size="sm" variant={overdue ? 'ghost' : 'primary'} disabled={busy(r)} onClick={() => actions.ready(r)}>Mark ready</Button>}
                          {r.status === 'ready' && <Button size="sm" variant={overdue ? 'ghost' : 'primary'} disabled={busy(r)} onClick={() => actions.pickedUp(r)}>Picked up</Button>}
                        </>
                      ));
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {view === 'history' && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <label htmlFor="food-history-program" className="text-[12px] text-ink-soft">Program</label>
              <select id="food-history-program" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}
                className="rounded-btn border border-border bg-white px-2 py-1.5 text-[12.5px] focus:border-sage focus:outline-none">
                <option value="all">All programs</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="none">No program</option>
              </select>
            </div>
            {history.length === 0
              ? <Empty title="Nothing here yet" body="Requests show up here once they are picked up, declined, missed or cancelled." />
              : <div className="space-y-3">{hasUnlinked(history) && <UnlinkedLegend />}{history.map((r) => card(r))}</div>}
          </div>
        )}
      </div>

      {open && !decision && (
        <RequestDetailModal request={open} lines={linesByRequest.get(open.id) ?? []} program={open.programId ? programById.get(open.programId) : undefined}
          onClose={() => onOpenRequest(null)}
          onDecide={(mode) => setDecision({ id: open.id, mode })} />
      )}
      {deciding && decision && (
        <DecisionModal request={deciding} lines={linesByRequest.get(deciding.id) ?? []} mode={decision.mode}
          program={deciding.programId ? programById.get(deciding.programId) : undefined}
          onClose={() => setDecision(null)} />
      )}
      {actions.dialog}
    </div>
  );
}

function ViewTab({ label, active, onClick, count, alert = 0, alertLabel }: {
  label: string; active: boolean; onClick: () => void; count?: number; alert?: number; alertLabel?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${
        active ? 'border-red text-forest' : 'border-transparent text-ink-soft hover:text-forest'}`}>
      {label}
      {count !== undefined && <span className="text-[11px] font-medium tabular-nums opacity-75">{count}</span>}
      {alert > 0 && (
        <span data-testid="overdue-badge" title={alertLabel} aria-label={alertLabel}
          className="inline-grid min-w-[18px] place-items-center rounded-pill bg-red px-1 text-[10.5px] font-bold leading-[18px] text-paper">{alert}</span>
      )}
    </button>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-cream-dark"><Inbox className="h-7 w-7 text-ink-faint" /></div>
      <h3 className="mb-1.5 text-[15px] font-semibold text-forest">{title}</h3>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-soft">{body}</p>
      {action}
    </div>
  );
}
