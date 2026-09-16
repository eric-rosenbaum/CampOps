import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ShoppingBasket } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { WeekBoard, type BoardLookups } from '@/components/trips/WeekBoard';
import { TripDrawer } from '@/components/trips/TripDrawer';
import { PlanTripSheet } from '@/components/trips/PlanTripSheet';
import { ErrandSheet } from '@/components/trips/ErrandSheet';
import { ShoppingListTab } from '@/components/trips/ShoppingListTab';
import { RideRequestsTab } from '@/components/trips/RideRequestsTab';
import { ToastView, type Toast } from '@/components/trips/tripUi';
import { useCampClock } from '@/components/trips/tripStyle';
import { useTripsStore } from '@/store/tripsStore';
import { useCampStore } from '@/store/campStore';
import { useAssetStore } from '@/store/assetStore';
import { useAuth } from '@/lib/auth';
import { useModules } from '@/lib/modules';
import {
  seatUsage, strandedRiders, layoutWeek, leavingNext, weekStartOf, addDays, isDateStr, shoppingList, canManageTrip, weekRangeLabel,
  type SeatUsage,
} from '@/lib/trips';
import type { Trip, SeatStatus } from '@/lib/tripTypes';

type Tab = 'board' | 'shopping' | 'rides';
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Week board' },
  { id: 'shopping', label: 'Shopping list' },
  { id: 'rides', label: 'Ride requests' },
];

/**
 * Town Trips.
 *
 * Deep-linkable, because the Demo Guide and the reminder emails send people to a specific place:
 *   /trips?week=2026-09-14            that week (any date in it works)
 *   /trips?trip=<id>                  that trip open, on its own week
 *   /trips?tab=shopping | tab=rides   the other two tabs
 */
export function Trips() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: Tab = TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : 'board';

  const trips = useTripsStore((s) => s.trips);
  const seats = useTripsStore((s) => s.seats);
  const errands = useTripsStore((s) => s.errands);
  const rideRequests = useTripsStore((s) => s.rideRequests);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const members = useCampStore((s) => s.members);
  const assets = useAssetStore((s) => s.assets);
  const { currentUser, role } = useAuth();
  const modules = useModules();
  const now = useCampClock();
  const canWrite = role !== 'viewer';

  const [planning, setPlanning] = useState<{ date: string | null; editing: Trip | null } | null>(null);
  const [errandFor, setErrandFor] = useState<{ tripId: string | null } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => setToast({ id: Date.now(), text, tone }), []);
  const clearToast = useCallback(() => setToast(null), []);

  const openTripId = params.get('trip');
  const openTrip = openTripId ? trips.find((t) => t.id === openTripId) ?? null : null;

  // The week in the URL wins; otherwise the open trip's week; otherwise this week.
  const rawWeek = params.get('week');
  const weekStart = isDateStr(rawWeek) ? weekStartOf(rawWeek) : openTrip ? weekStartOf(openTrip.departDate) : weekStartOf(now.date);
  const thisWeek = weekStartOf(now.date);

  const update = useCallback((mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    // replace: flipping weeks or opening a card should not make Back walk through every step.
    setParams(next, { replace: true });
  }, [params, setParams]);

  const setTab = (t: Tab) => update((p) => { if (t === 'board') p.delete('tab'); else p.set('tab', t); });
  const openTripById = useCallback((id: string) => update((p) => p.set('trip', id)), [update]);
  const closeTrip = useCallback(() => update((p) => p.delete('trip')), [update]);
  const moveWeek = (dir: -1 | 1 | 0) => update((p) => {
    const target = dir === 0 ? thisWeek : addDays(weekStart, dir * 7);
    if (target === thisWeek) p.delete('week'); else p.set('week', target);
  });

  // ── Derived, once per data change ──────────────────────────────────────────
  const usageByTrip = useMemo(() => {
    const m = new Map<string, SeatUsage>();
    for (const t of trips) m.set(t.id, seatUsage(t, seats));
    return m;
  }, [trips, seats]);
  const errandCountByTrip = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of errands) if (e.tripId && e.status !== 'cancelled') m.set(e.tripId, (m.get(e.tripId) ?? 0) + 1);
    return m;
  }, [errands]);
  const mySeatByTrip = useMemo(() => {
    const m = new Map<string, SeatStatus>();
    for (const s of seats) if (s.riderUserId === currentUser.id && s.status !== 'cancelled') m.set(s.tripId, s.status);
    return m;
  }, [seats, currentUser.id]);
  const strandedCountByTrip = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of strandedRiders(trips, seats)) m.set(r.trip.id, (m.get(r.trip.id) ?? 0) + 1);
    return m;
  }, [trips, seats]);

  const lookups: BoardLookups = useMemo(() => {
    const empty = seatUsage({ id: '', passengerSeats: 0 }, []);
    return {
      usage: (id) => usageByTrip.get(id) ?? empty,
      errandCount: (id) => errandCountByTrip.get(id) ?? 0,
      mySeat: (id) => mySeatByTrip.get(id) ?? null,
      iDrive: (t) => t.driverUserId === currentUser.id,
      strandedOn: (id) => strandedCountByTrip.get(id) ?? 0,
    };
  }, [usageByTrip, errandCountByTrip, mySeatByTrip, strandedCountByTrip, currentUser.id]);

  const days = useMemo(() => layoutWeek(weekStart, now.date, trips, seats, rideRequests), [weekStart, now.date, trips, seats, rideRequests]);
  const leaving = useMemo(() => leavingNext(trips, now), [trips, now]);
  const list = useMemo(() => shoppingList(errands, trips), [errands, trips]);
  const openRequests = useMemo(() => rideRequests.filter((r) => r.status === 'open' && r.wantedDate >= now.date).length, [rideRequests, now.date]);
  const managedTripIds = useMemo(
    () => new Set(trips.filter((t) => canManageTrip(t, currentUser.id, role)).map((t) => t.id)),
    [trips, currentUser.id, role],
  );
  const vehicles = useMemo(
    () => (modules.enabled('assets') ? assets.filter((a) => a.isActive && (a.category === 'vehicle' || a.category === 'golf_cart')) : null),
    [modules, assets],
  );

  const weekTripCount = days.reduce((n, d) => n + d.trips.filter((t) => t.status !== 'cancelled').length, 0);
  const subtitle = `${weekTripCount} trip${weekTripCount === 1 ? '' : 's'} ${weekStart === thisWeek ? 'this week' : `week of ${weekRangeLabel(weekStart)}`} · ${list.needsTripCount} errand${list.needsTripCount === 1 ? '' : 's'} need${list.needsTripCount === 1 ? 's' : ''} a trip`;

  if (!currentCamp) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar
        flush
        title="Town Trips"
        subtitle={subtitle}
        actions={canWrite ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setErrandFor({ tripId: null })}
              className="hidden min-h-9 items-center gap-1.5 rounded-btn border border-border bg-white px-3 text-[12.5px] font-bold text-forest hover:border-sage sm:inline-flex"
            >
              <ShoppingBasket className="h-3.5 w-3.5" /> Add errand
            </button>
            <button
              type="button"
              onClick={() => setPlanning({ date: null, editing: null })}
              data-testid="plan-trip-button"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-btn bg-forest px-3.5 text-[13px] font-bold text-paper hover:bg-forest-mid sm:min-h-9"
            >
              <Plus className="h-4 w-4" /> Plan a trip
            </button>
          </div>
        ) : undefined}
      />

      <div className="flex-shrink-0 overflow-x-auto border-b border-border bg-paper-raised px-4 no-scrollbar sm:px-7">
        <div className="flex" role="tablist">
          {TABS.map((t) => {
            const badge = t.id === 'shopping' ? list.needsTripCount : t.id === 'rides' ? openRequests : 0;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 pb-2.5 pt-3 text-[13px] font-semibold transition-colors sm:px-4
                  ${tab === t.id ? 'border-red text-forest' : 'border-transparent text-ink-soft hover:text-forest'}`}
              >
                {t.label}
                {badge > 0 && (
                  <span className={`rounded-pill px-1.5 text-[10.5px] font-bold leading-[17px] ${t.id === 'shopping' ? 'bg-amber-bg text-amber-text' : 'bg-blue-bg text-blue-text'}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'board' && (
          <WeekBoard
            days={days}
            weekStart={weekStart}
            isCurrentWeek={weekStart === thisWeek}
            leaving={leaving}
            now={now}
            lookups={lookups}
            canWrite={canWrite}
            onWeek={moveWeek}
            onOpenTrip={openTripById}
            onPlan={(date) => setPlanning({ date, editing: null })}
          />
        )}
        {tab === 'shopping' && (
          <ShoppingListTab
            trips={trips} errands={errands} now={now} userId={currentUser.id} role={role}
            onAddErrand={() => setErrandFor({ tripId: null })} onOpenTrip={openTripById} notify={notify}
          />
        )}
        {tab === 'rides' && (
          <RideRequestsTab
            campId={currentCamp.id} trips={trips} seats={seats} requests={rideRequests} now={now}
            userId={currentUser.id} role={role} onOpenTrip={openTripById} notify={notify}
          />
        )}
      </div>

      {openTrip && (
        <TripDrawer
          key={openTrip.id}
          trip={openTrip}
          trips={trips}
          seats={seats}
          errands={errands}
          userId={currentUser.id}
          role={role}
          now={now}
          onClose={closeTrip}
          onEdit={(t) => setPlanning({ date: null, editing: t })}
          onAddErrand={(tripId) => setErrandFor({ tripId })}
          onOpenTrip={openTripById}
          onAskForRide={() => update((p) => { p.delete('trip'); p.set('tab', 'rides'); })}
          notify={notify}
        />
      )}
      {planning && (
        <PlanTripSheet
          campId={currentCamp.id}
          userId={currentUser.id}
          now={now}
          initialDate={planning.date}
          editing={planning.editing}
          members={members}
          vehicles={vehicles}
          onClose={() => setPlanning(null)}
          onSaved={(id) => {
            setPlanning(null);
            const t = useTripsStore.getState().trips.find((x) => x.id === id);
            update((p) => {
              p.set('trip', id);
              if (t) { const w = weekStartOf(t.departDate); if (w === thisWeek) p.delete('week'); else p.set('week', w); }
              p.delete('tab');
            });
          }}
          notify={notify}
        />
      )}
      {errandFor && (
        <ErrandSheet
          campId={currentCamp.id}
          trips={trips}
          now={now}
          tripId={errandFor.tripId}
          managedTripIds={managedTripIds}
          onClose={() => setErrandFor(null)}
          notify={notify}
        />
      )}
      <ToastView toast={toast} onDone={clearToast} />
    </div>
  );
}
