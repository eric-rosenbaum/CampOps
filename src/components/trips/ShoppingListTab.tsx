import { useMemo, useState } from 'react';
import { Plus, Store, Car, Check, X, ChevronDown } from 'lucide-react';
import type { Trip, TripErrand } from '@/lib/tripTypes';
import {
  shoppingList, neededByState, tripsTakingErrands, dayLabel, clock, shortDow, monthDay, canManageTrip, type LocalNow, type StoreGroup,
} from '@/lib/trips';
import { dbAttachErrands, dbSetErrandStatus, dbDetachErrand } from '@/lib/tripsDb';
import type { CampRole } from '@/store/campStore';
import { KIND_STYLE, fieldClass } from './tripStyle';

interface Props {
  trips: Trip[];
  errands: TripErrand[];
  now: LocalNow;
  userId: string;
  role: CampRole;
  onAddErrand: () => void;
  onOpenTrip: (id: string) => void;
  notify: (text: string, tone?: 'ok' | 'warn' | 'error') => void;
}

/**
 * Every open errand in one place, grouped by store and split by whether anyone is going for it.
 *
 * This is the fix for "six people phone whoever they heard was going": you add it here without
 * knowing who drives, and the driver loads the list into their car.
 */
export function ShoppingListTab({ trips, errands, now, userId, role, onAddErrand, onOpenTrip, notify }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const list = useMemo(() => shoppingList(errands, trips), [errands, trips]);
  const takers = useMemo(() => tripsTakingErrands(trips, now), [trips, now]);
  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  const done = useMemo(
    () => errands.filter((e) => e.status === 'bought' || e.status === 'unavailable')
      .sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt)).slice(0, 30),
    [errands],
  );
  const canWrite = role !== 'viewer';

  async function act(key: string, fn: () => Promise<{ ok: boolean; error: string | null }>, ok: string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    notify(r.ok ? ok : (r.error ?? 'That did not save.'), r.ok ? 'ok' : 'error');
  }

  const row = (e: TripErrand, onTrip: boolean) => {
    const nb = neededByState(e.neededBy, now.date);
    const trip = e.tripId ? tripById.get(e.tripId) : undefined;
    const mine = e.requestedBy === userId;
    // Attach choices: your own errand onto any trip still taking errands; somebody else's only
    // onto a trip you manage.
    const choices = takers.filter((t) => mine || canManageTrip(t, userId, role));
    return (
      <li key={e.id} data-testid="shopping-row" data-errand-id={e.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-snug text-ink">
            {e.item}{e.quantity && <span className="font-normal text-ink-soft"> · {e.quantity}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-soft">
            <span>{e.requesterName}{mine ? ' (you)' : ''}</span>
            {e.forActivity && <span>· {e.forActivity}</span>}
            {e.neededBy && (
              <span className={`rounded-pill px-1.5 font-bold ${nb === 'overdue' ? 'bg-red text-paper' : nb === 'soon' ? 'bg-amber-bg text-amber-text' : 'bg-cream-dark text-ink-soft'}`}>
                {nb === 'overdue' ? 'Overdue · ' : 'Needed '}{e.neededBy === now.date ? 'today' : `${shortDow(e.neededBy)} ${monthDay(e.neededBy)}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onTrip && trip && (
            <button
              type="button"
              onClick={() => onOpenTrip(trip.id)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3 text-[12px] font-bold sm:min-h-8"
              style={{ borderColor: KIND_STYLE[trip.kind].color, color: KIND_STYLE[trip.kind].ink, background: KIND_STYLE[trip.kind].wash }}
            >
              <Car className="h-3.5 w-3.5" /> {shortDow(trip.departDate)} {clock(trip.departTime)} · {trip.title}
            </button>
          )}
          {!onTrip && canWrite && choices.length > 0 && (
            <select
              aria-label={`Put ${e.item} on a trip`}
              value=""
              disabled={busy !== null}
              onChange={(ev) => {
                const id = ev.target.value;
                const t = tripById.get(id);
                if (id) void act(`attach-${e.id}`, () => dbAttachErrands(id, [e.id]), `On ${t?.title ?? 'the trip'}.`);
              }}
              className={`${fieldClass} min-h-11 max-w-[15rem] font-semibold text-forest sm:min-h-0`}
            >
              <option value="">Put on a trip…</option>
              {choices.map((t) => <option key={t.id} value={t.id}>{dayLabel(t.departDate)} {clock(t.departTime)} · {t.title}</option>)}
            </select>
          )}
          {onTrip && mine && (
            <button type="button" disabled={busy !== null} onClick={() => act(`detach-${e.id}`, () => dbDetachErrand(e.id), 'Back on the shared list.')}
              className="min-h-11 rounded-btn px-2 text-[12px] font-bold text-ink-soft hover:bg-cream hover:text-forest sm:min-h-8">
              Take off trip
            </button>
          )}
          {(mine || role === 'admin') && (
            <button type="button" disabled={busy !== null} aria-label={`Remove ${e.item}`}
              onClick={() => act(`cancel-${e.id}`, () => dbSetErrandStatus(e.id, 'cancelled'), `Removed ${e.item}.`)}
              className="grid h-11 w-11 place-items-center rounded-btn text-ink-faint hover:bg-red-bg hover:text-red-text sm:h-8 sm:w-8">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </li>
    );
  };

  const groups = (gs: StoreGroup[], onTrip: boolean) => (
    <div className="space-y-3">
      {gs.map((g) => (
        <div key={g.store} className="overflow-hidden rounded-card border border-border bg-white">
          <p className="flex items-center gap-2 border-b border-border bg-paper-raised px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-forest">
            <Store className="h-3.5 w-3.5 text-ink-faint" /> {g.store}
            <span className="font-semibold normal-case tracking-normal text-ink-soft">· {g.errands.length}</span>
          </p>
          <ul className="divide-y divide-border">{g.errands.map((e) => row(e, onTrip))}</ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-7">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[13.5px] text-ink-soft">
          Need something from town? Add it here — you don’t need to know who’s driving. Drivers load the list into their trip.
        </p>
        {canWrite && (
          <button type="button" onClick={onAddErrand} data-testid="add-errand"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-btn bg-forest px-4 text-[13.5px] font-bold text-paper hover:bg-forest-mid">
            <Plus className="h-4 w-4" /> Add errand
          </button>
        )}
      </div>

      <section className="mb-7" data-testid="needs-trip">
        <h2 className="mb-2 flex items-baseline gap-2 font-display text-[18px] font-bold text-forest">
          Needs a trip <span className="font-sans text-[13px] font-semibold text-ink-soft">{list.needsTripCount}</span>
        </h2>
        {list.needsTripCount === 0
          ? <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-[13px] text-ink-soft">Nothing waiting. Everything on the list has a ride.</p>
          : groups(list.needsTrip, false)}
        {list.needsTripCount > 0 && takers.length === 0 && (
          <p className="mt-2 text-[12.5px] text-amber-text">No trip is taking errands right now — plan one from the week board.</p>
        )}
      </section>

      <section className="mb-7" data-testid="on-a-trip">
        <h2 className="mb-2 flex items-baseline gap-2 font-display text-[18px] font-bold text-forest">
          On a trip <span className="font-sans text-[13px] font-semibold text-ink-soft">{list.onTripCount}</span>
        </h2>
        {list.onTripCount === 0
          ? <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-[13px] text-ink-soft">No errands riding along yet.</p>
          : groups(list.onTrip, true)}
      </section>

      {done.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
            <ChevronDown className={`h-4 w-4 transition-transform ${showDone ? 'rotate-180' : ''}`} /> Done lately ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-border rounded-card border border-border bg-white">
              {done.map((e) => (
                <li key={e.id} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px]">
                  {e.status === 'bought' ? <Check className="h-4 w-4 text-green-muted-text" /> : <X className="h-4 w-4 text-red-text" />}
                  <span className={`min-w-0 flex-1 truncate ${e.status === 'bought' ? 'text-ink-soft line-through decoration-ink-faint' : 'text-ink'}`}>{e.item}</span>
                  <span className="flex-none text-[12px] text-ink-soft">{e.requesterName}{e.driverNote ? ` · “${e.driverNote}”` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
