import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Users, AlertTriangle, ListChecks, ChevronDown } from 'lucide-react';
import type { Trip, SeatStatus } from '@/lib/tripTypes';
import {
  phoneDayOrder, weekRangeLabel, shortDow, monthDay, minutesUntil, countdownLabel, clock,
  errandListOpen, seatSummary, routeLabel, overdueBack, type BoardDay, type SeatUsage, type LocalNow,
} from '@/lib/trips';
import { TripCard } from './TripCard';
import { SeatDots } from './tripUi';
import { kindStyle } from './tripStyle';

export interface BoardLookups {
  usage: (tripId: string) => SeatUsage;
  errandCount: (tripId: string) => number;
  mySeat: (tripId: string) => SeatStatus | null;
  iDrive: (trip: Trip) => boolean;
  strandedOn: (tripId: string) => number;
}

interface Props {
  days: BoardDay[];
  weekStart: string;
  isCurrentWeek: boolean;
  leaving: Trip[];
  now: LocalNow;
  lookups: BoardLookups;
  canWrite: boolean;
  onWeek: (dir: -1 | 1 | 0) => void;
  onOpenTrip: (id: string) => void;
  onPlan: (date: string) => void;
  /** The "N no ride back" chip: who, and what can be done. */
  onStranded: (date: string) => void;
  /** Cancelled trips are hidden unless this is on. */
  showCancelled: boolean;
  onToggleCancelled: () => void;
}

function DayChips({ day, onStranded, compact = false }: { day: BoardDay; onStranded: (date: string) => void; compact?: boolean }) {
  if (day.rideDemand.length === 0 && day.stranded.length === 0) return null;
  const strandedNames = day.stranded.map((s) => s.seat.riderName).join(', ');
  return (
    <div className="flex flex-wrap gap-1">
      {day.rideDemand.length > 0 && (
        <span
          data-testid="demand-chip"
          title={day.rideDemand.map((r) => r.requesterName).join(', ')}
          className="inline-flex items-center gap-1 rounded-pill bg-blue-bg px-2 py-0.5 text-[11px] font-bold text-blue-text"
        >
          <Users className="h-3 w-3" />
          {day.rideDemand.length} want{day.rideDemand.length === 1 ? 's' : ''} {compact ? 'rides' : 'a ride'}
        </span>
      )}
      {day.stranded.length > 0 && (
        <button
          type="button"
          data-testid="stranded-chip"
          onClick={() => onStranded(day.date)}
          title={`No ride back yet: ${strandedNames}`}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1 rounded-pill bg-red px-2 py-0.5 text-[11px] font-bold text-paper hover:bg-red-text"
        >
          <AlertTriangle className="h-3 w-3" />
          {/* The column is ~120px wide on a laptop; the full sentence is in the title. */}
          {day.stranded.length} {compact ? 'no ride back' : 'with no ride back'}
        </button>
      )}
    </div>
  );
}

/**
 * The two trips leaving soonest, big: a countdown, how full, and when the errand list closes.
 * The question people actually walk up with is "is anyone going soon", not "what is on Thursday".
 */
function LeavingNext({ leaving, now, lookups, onOpenTrip }: Pick<Props, 'leaving' | 'now' | 'lookups' | 'onOpenTrip'>) {
  if (leaving.length === 0) return null;
  return (
    <section aria-label="Leaving next" className="border-b border-border bg-paper-raised px-4 py-3.5 sm:px-7">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Leaving next</p>
      {/* minmax(0,1fr): an implicit column grew to the long nowrap title and pushed the card 8px off a phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
        {leaving.map((t) => {
          const k = kindStyle(t.kind);
          const sum = seatSummary(t, lookups.usage(t.id));
          const route = routeLabel(t);
          const Icon = k.icon;
          const mins = minutesUntil(now, t.departDate, t.departTime);
          const usage = lookups.usage(t.id);
          const listOpen = errandListOpen(t, now);
          const errands = lookups.errandCount(t.id);
          const mine = lookups.mySeat(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenTrip(t.id)}
              data-testid="leaving-next"
              className="flex min-w-0 items-center gap-3 rounded-card border border-border bg-white p-3 text-left transition-colors hover:border-sage"
            >
              <span className="grid h-12 w-12 flex-none place-items-center rounded-card" style={{ background: k.wash }}>
                <Icon className="h-6 w-6" style={{ color: k.color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-[18px] font-bold leading-none text-forest">
                    {countdownLabel(mins, now, t.departDate)}
                  </span>
                  <span className="truncate text-[12px] text-ink-soft">
                    {t.departDate === now.date ? '' : `${shortDow(t.departDate)} `}{clock(t.departTime)}
                  </span>
                </span>
                <span className="mt-1 block truncate text-[13.5px] font-semibold text-ink">
                  {t.title}{route ? (t.direction === 'pickup' ? ` · ${route}` : ` ${route}`) : ''}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-soft">
                  <SeatDots usage={usage} color={k.color} size={10} direction={t.direction} />
                  <span className={sum.tone === 'full' ? 'font-bold text-red-text' : sum.tone === 'partial' ? 'font-semibold text-amber-text' : 'font-semibold'}>
                    {sum.text}
                  </span>
                  {t.errandsCloseTime && listOpen && (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-text">
                      <ListChecks className="h-3.5 w-3.5" /> List closes {clock(t.errandsCloseTime)}
                    </span>
                  )}
                  {!listOpen && errands > 0 && <span>{errands} errand{errands === 1 ? '' : 's'}</span>}
                  {mine && <span className="font-bold text-green-muted-text">{mine === 'waitlist' ? 'You’re waiting' : 'You’re in'}</span>}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 flex-none text-ink-faint" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EmptyDay({ day, canWrite, onPlan }: { day: BoardDay; canWrite: boolean; onPlan: (d: string) => void }) {
  if (!canWrite || day.isPast) return <p className="px-1 py-2 text-[12px] italic text-ink-faint">No trips</p>;
  return (
    <button
      type="button"
      onClick={() => onPlan(day.date)}
      className="flex w-full items-center justify-center gap-1 rounded-card border border-dashed border-border py-3 text-[12px]
                 font-semibold text-ink-faint transition-colors hover:border-sage hover:text-forest"
    >
      <Plus className="h-3.5 w-3.5" /> Plan a trip
    </button>
  );
}

export function WeekBoard({ days, weekStart, isCurrentWeek, leaving, now, lookups, canWrite, onWeek, onOpenTrip, onPlan, onStranded, showCancelled, onToggleCancelled }: Props) {
  const [showPast, setShowPast] = useState(false);
  const weekTrips = days.reduce((n, d) => n + d.trips.filter((t) => t.status !== 'cancelled').length, 0);
  const weekCancelled = days.reduce((n, d) => n + d.cancelled.length, 0);
  const phoneDays = phoneDayOrder(days);
  const past = isCurrentWeek ? phoneDays.filter((d) => d.isPast) : [];
  const ahead = isCurrentWeek ? phoneDays.filter((d) => !d.isPast) : phoneDays;

  const card = (t: Trip, variant: 'row' | 'column') => (
    <TripCard
      key={t.id}
      trip={t}
      variant={variant}
      usage={lookups.usage(t.id)}
      errandCount={lookups.errandCount(t.id)}
      mine={lookups.mySeat(t.id)}
      iDrive={lookups.iDrive(t)}
      strandedCount={lookups.strandedOn(t.id)}
      departed={minutesUntil(now, t.departDate, t.departTime) <= 0}
      overdue={overdueBack(t, now)}
      onOpen={() => onOpenTrip(t.id)}
    />
  );

  const phoneDay = (day: BoardDay) => (
    <section key={day.date} data-testid="board-day" data-date={day.date} className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className={`font-display text-[15px] font-bold ${day.isToday ? 'text-red-text' : 'text-forest'}`}>
          {day.isToday ? 'Today' : shortDow(day.date)}
          <span className="ml-1.5 font-sans text-[12.5px] font-semibold text-ink-soft">{monthDay(day.date)}</span>
        </h3>
        {canWrite && !day.isPast && day.trips.length > 0 && (
          <button
            type="button"
            onClick={() => onPlan(day.date)}
            aria-label={`Plan a trip on ${monthDay(day.date)}`}
            className="ml-auto grid h-11 w-11 place-items-center rounded-btn text-ink-soft hover:bg-cream hover:text-forest"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mb-2 empty:hidden"><DayChips day={day} onStranded={onStranded} /></div>
      <div className="space-y-2">
        {day.trips.length === 0 ? <EmptyDay day={day} canWrite={canWrite} onPlan={onPlan} /> : day.trips.map((t) => card(t, 'row'))}
      </div>
    </section>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="board-pane">
      <LeavingNext leaving={leaving} now={now} lookups={lookups} onOpenTrip={onOpenTrip} />

      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3.5 sm:px-7">
        <div className="flex items-center gap-1">
          <button
            type="button" onClick={() => onWeek(-1)} aria-label="Previous week"
            className="grid h-11 w-11 place-items-center rounded-btn border border-border bg-white text-forest hover:border-sage sm:h-9 sm:w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button" onClick={() => onWeek(1)} aria-label="Next week"
            className="grid h-11 w-11 place-items-center rounded-btn border border-border bg-white text-forest hover:border-sage sm:h-9 sm:w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="font-display text-[17px] font-bold text-forest" data-testid="week-label">{weekRangeLabel(weekStart)}</h2>
        {!isCurrentWeek && (
          <button type="button" onClick={() => onWeek(0)} className="rounded-pill border border-border bg-white px-3 py-1 text-[12px] font-bold text-forest hover:border-sage">
            This week
          </button>
        )}
        <span className="text-[12px] text-ink-soft">{weekTrips} trip{weekTrips === 1 ? '' : 's'}</span>
        {weekCancelled > 0 && (
          <button
            type="button"
            onClick={onToggleCancelled}
            aria-pressed={showCancelled}
            data-testid="toggle-cancelled"
            className="min-h-9 rounded-pill border border-border bg-white px-2.5 text-[12px] font-semibold text-ink-soft hover:border-sage hover:text-forest"
          >
            {showCancelled ? 'Hide cancelled' : `${weekCancelled} cancelled`}
          </button>
        )}
        {/* The seat-dot legend, on phones too: half dots mean nothing until somebody says so. */}
        <span className="flex w-full items-center gap-3 text-[11px] text-ink-soft md:ml-auto md:w-auto" data-testid="dot-legend">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-forest-light" /> taken</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,#5E7A61 50%,transparent 50%)', boxShadow: 'inset 0 0 0 1.5px #5E7A61' }} /> taken one way
          </span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px #5E7A61' }} /> free</span>
        </span>
      </div>

      {/* Laptop: seven columns. Scrolls sideways rather than squeezing a card below legibility. */}
      <div className="hidden overflow-x-auto px-4 pb-8 sm:px-7 lg:block">
        <div className="grid min-w-[880px] grid-cols-7 gap-2">
          {days.map((day) => (
            <section
              key={day.date}
              data-testid="board-day"
              data-date={day.date}
              className={`flex min-h-[340px] flex-col rounded-card border p-1.5
                ${day.isToday ? 'border-forest/40 bg-white shadow-[inset_0_3px_0_#B4552F]' : 'border-border bg-paper-raised'}
                ${day.isPast ? 'opacity-75' : ''}`}
            >
              <div className="flex items-baseline justify-between px-1 pb-1.5 pt-1">
                <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${day.isToday ? 'text-red-text' : 'text-ink-soft'}`}>
                  {day.isToday ? 'Today' : shortDow(day.date)}
                </span>
                <span className={`font-display text-[18px] font-bold leading-none ${day.isToday ? 'text-red-text' : 'text-forest'}`}>
                  {Number(day.date.slice(8))}
                </span>
              </div>
              <div className="mb-1.5 px-0.5 empty:hidden"><DayChips day={day} onStranded={onStranded} compact /></div>
              <div className="flex flex-1 flex-col gap-1.5">
                {day.trips.map((t) => card(t, 'column'))}
                {day.trips.length === 0 && <EmptyDay day={day} canWrite={canWrite} onPlan={onPlan} />}
                {day.trips.length > 0 && canWrite && !day.isPast && (
                  <button
                    type="button"
                    onClick={() => onPlan(day.date)}
                    aria-label={`Plan another trip on ${monthDay(day.date)}`}
                    className="mt-auto flex items-center justify-center rounded-btn py-1 text-ink-faint opacity-0 transition-opacity
                               hover:text-forest focus:opacity-100 group-hover:opacity-100 [section:hover_&]:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Phone and tablet: days stacked, today first. */}
      <div className="lg:hidden">
        {ahead.map(phoneDay)}
        {past.length > 0 && (
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              className="flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-ink-soft"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showPast ? 'rotate-180' : ''}`} />
              Earlier this week ({past.reduce((n, d) => n + d.trips.length, 0)} trips)
            </button>
          </div>
        )}
        {showPast && past.map(phoneDay)}
      </div>
    </div>
  );
}
