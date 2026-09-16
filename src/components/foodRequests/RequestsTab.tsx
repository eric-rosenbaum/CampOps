import { useMemo, useState } from 'react';
import { Inbox, Printer, Settings2 } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { FilterPill } from '@/components/shared/FilterPill';
import { useCommissaryStore } from '@/store/commissaryStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import type { FoodRequest, FoodRequestLine } from '@/lib/foodRequestTypes';
import { inboxOrder, isPastDue, pickupDays, pullListHtml } from '@/lib/foodRequests';
import { addDaysStr } from '@/lib/commissaryUnits';
import { todayStr } from '@/lib/utils';
import { RequestCard } from './RequestCard';
import { DecisionModal } from './DecisionModal';
import { RequestDetailModal } from './RequestDetailModal';
import { useFoodRequestActions } from './useFoodRequestActions';

type View = 'inbox' | 'pickups' | 'history';

/**
 * Kitchen Manager › Requests. Three questions, three views:
 *   Inbox   — what has been asked for that nobody has answered?
 *   Pickups — what am I handing over, and when?
 *   History — what did we give each program?
 */
export function RequestsTab({ openRequestId, onOpenRequest }: {
  /** A request opened by deep link (?request=) or by the caller. */
  openRequestId: string | null;
  onOpenRequest: (id: string | null) => void;
}) {
  const requests = useCommissaryStore((s) => s.foodRequests);
  const lines = useCommissaryStore((s) => s.foodRequestLines);
  const programs = useCommissaryStore((s) => s.foodPrograms);
  const settings = useCommissaryStore((s) => s.foodRequestSettings);
  const setActiveTab = useCommissaryStore((s) => s.setActiveTab);
  const camp = useCampStore((s) => s.currentCamp);
  const { can } = useAuth();
  const canManage = can('manageCommissary');
  const actions = useFoodRequestActions();

  const [view, setView] = useState<View>(() => {
    const target = openRequestId ? requests.find((r) => r.id === openRequestId) : null;
    if (target && (target.status === 'approved' || target.status === 'ready')) return 'pickups';
    if (target && target.status !== 'submitted') return 'history';
    return 'inbox';
  });
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [decision, setDecision] = useState<{ id: string; mode: 'approve' | 'decline' } | null>(null);

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

  const today = todayStr();
  const tomorrow = addDaysStr(today, 1);
  const inbox = useMemo(() => inboxOrder(requests), [requests]);
  const days = useMemo(() => pickupDays(requests, today, tomorrow), [requests, today, tomorrow]);
  const pickupCount = days.reduce((n, d) => n + d.requests.length, 0);
  const history = useMemo(() => requests
    .filter((r) => ['picked_up', 'declined', 'missed', 'cancelled'].includes(r.status))
    .filter((r) => programFilter === 'all' || (programFilter === 'none' ? !r.programId : r.programId === programFilter))
    .sort((a, b) => (b.pickupDate + b.pickupTime).localeCompare(a.pickupDate + a.pickupTime)), [requests, programFilter]);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const open = openRequestId ? requests.find((r) => r.id === openRequestId) : undefined;
  const deciding = decision ? requests.find((r) => r.id === decision.id) : undefined;

  function card(r: FoodRequest, actionsNode?: React.ReactNode) {
    return (
      <RequestCard key={r.id} request={r} lines={linesByRequest.get(r.id) ?? []} program={r.programId ? programById.get(r.programId) : undefined}
        onOpen={() => onOpenRequest(r.id)} actions={canManage ? actionsNode : undefined} />
    );
  }

  function printDay(label: string, rs: FoodRequest[]) {
    const html = pullListHtml({
      campName: camp?.name ?? '', dayLabel: label, requests: rs,
      lines: rs.flatMap((r) => linesByRequest.get(r.id) ?? []), programs, pickupLocation: settings?.pickupLocation ?? null,
    });
    const w = window.open('', '_blank');
    if (!w) { alert('Enable pop-ups to print the pull list.'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  const busy = (r: FoodRequest) => actions.busyId === r.id;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-x-1 border-b border-border sm:gap-x-2">
          <FilterPill label="Inbox" active={view === 'inbox'} onClick={() => setView('inbox')} count={inbox.length} />
          <FilterPill label="Pickups" active={view === 'pickups'} onClick={() => setView('pickups')} count={pickupCount} />
          <FilterPill label="History" active={view === 'history'} onClick={() => setView('history')} />
          <span className="flex-1" />
          {canManage && (
            <button type="button" onClick={() => setActiveTab('settings')}
              aria-label="Programs and links" title="Programs and links"
              className="mb-1.5 inline-flex items-center gap-1.5 rounded-btn px-2 py-1 text-[12px] font-semibold text-ink-soft hover:text-forest">
              <Settings2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Programs &amp; links</span>
            </button>
          )}
        </div>

        {view === 'inbox' && (
          inbox.length === 0 ? (
            <Empty
              title="No requests waiting"
              body={programs.length === 0
                ? 'Programs ask for food through their own link, no account needed. Add a program in Settings to get its link and QR code.'
                : 'New requests from program links and from staff land here the moment they are sent.'}
              action={canManage && programs.length === 0 ? <Button size="sm" onClick={() => setActiveTab('settings')}>Add a program</Button> : undefined}
            />
          ) : (
            <div className="space-y-3" data-testid="food-inbox">
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
                    {d.requests.map((r) => card(r, (
                      <>
                        {isPastDue(r, new Date(), timeZone) && (
                          <Button size="sm" variant="ghost" disabled={busy(r)} onClick={() => actions.missed(r)}>Missed</Button>
                        )}
                        {r.status === 'approved' && <Button size="sm" disabled={busy(r)} onClick={() => actions.ready(r)}>Mark ready</Button>}
                        {r.status === 'ready' && <Button size="sm" disabled={busy(r)} onClick={() => actions.pickedUp(r)}>Picked up</Button>}
                      </>
                    )))}
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
              : <div className="space-y-3">{history.map((r) => card(r))}</div>}
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
    </div>
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
