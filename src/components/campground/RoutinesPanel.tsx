import { useMemo, useState } from 'react';
import {
  Plus, RefreshCw, Repeat, MapPin, CalendarClock, AlertTriangle, PauseCircle,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { GroupHeader } from '@/components/shared/GroupHeader';
import { StatCard } from '@/components/shared/StatCard';
import { RoutineModal, nextDates } from './RoutineModal';
import {
  useCampgroundStore, routinesBehind, openOccurrence, routingFor,
} from '@/store/campgroundStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useAuth } from '@/lib/auth';
import { dbGenerateScheduledWork, dbRecordMeter } from '@/lib/campgroundDb';
import { describeCadence, describeMissed, TRADE_PILL } from '@/lib/workOrder';
import { formatDate } from '@/lib/utils';
import { TRADES, TRADE_LABELS } from '@/lib/types';
import type { Trade, WorkSchedule } from '@/lib/types';

/**
 * Routines — recurring work, done properly this time.
 *
 * This panel replaces a checkbox that generated nothing for its entire life. Two things have to
 * be legible here or the feature gets muted inside a month:
 *
 *  1. How far behind the camp actually is. That is the maintenance debt, and it is the number
 *     a director wants when they ask why the boiler was not serviced.
 *  2. WHY a behind routine has not raised another work order. Only one occurrence is open per
 *     routine at a time, deliberately — eleven identical rows is how a recurring-task system
 *     earns itself a mute. But a camp cannot infer that rule from an absence, so every behind
 *     routine says it in words.
 */

export function RoutinesPanel() {
  // Raw slices only. A selector that filters or maps allocates a new array every render, which
  // under React 19 + zustand v5 is the "getSnapshot should be cached" loop and a white screen.
  const schedules = useCampgroundStore((s) => s.schedules);
  const vendors = useCampgroundStore((s) => s.vendors);
  const templates = useCampgroundStore((s) => s.templates);
  const routing = useCampgroundStore((s) => s.routing);
  const issues = useIssuesStore((s) => s.issues);
  const members = useCampStore((s) => s.members);
  const staffGroups = useCampStore((s) => s.staffGroups);
  const season = useChecklistStore((s) => s.season);
  const { role } = useAuth();
  const canEdit = role !== 'viewer';

  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<number | null>(null);

  const behind = useMemo(() => routinesBehind(schedules), [schedules]);
  const active = useMemo(() => schedules.filter((s) => s.isActive), [schedules]);

  const byTrade = useMemo(() => {
    const groups = new Map<Trade, WorkSchedule[]>();
    for (const s of schedules) {
      const list = groups.get(s.trade) ?? [];
      list.push(s);
      groups.set(s.trade, list);
    }
    for (const list of groups.values()) {
      // Behind first — the debt leads its own trade — then paused last, then by title.
      list.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.missedCount !== b.missedCount) return b.missedCount - a.missedCount;
        return a.title.localeCompare(b.title);
      });
    }
    return TRADES.filter((t) => groups.has(t)).map((t) => ({ trade: t, items: groups.get(t)! }));
  }, [schedules]);

  /** Which routines already have their one open occurrence sitting in the queue. */
  const openByScheduleId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of schedules) {
      const occ = openOccurrence(issues, s.id);
      if (occ) map.set(s.id, occ.title);
    }
    return map;
  }, [schedules, issues]);

  const nameLookup = useMemo(() => ({
    member: (id: string | null) =>
      (id ? members.find((m) => m.userId === id) : undefined)?.fullName ?? null,
    group: (id: string | null) => (id ? staffGroups.find((g) => g.id === id) : undefined)?.name ?? null,
    vendor: (id: string | null) => (id ? vendors.find((v) => v.id === id) : undefined)?.name ?? null,
    template: (id: string | null) => (id ? templates.find((t) => t.id === id) : undefined)?.name ?? null,
  }), [members, staffGroups, vendors, templates]);

  function landsOn(s: WorkSchedule): string {
    if (s.vendorId) return nameLookup.vendor(s.vendorId) ?? 'A vendor';
    if (s.assigneeId) return nameLookup.member(s.assigneeId) ?? 'Someone who has left';
    if (s.staffGroupId) return nameLookup.group(s.staffGroupId) ?? 'A staff group';
    const r = routingFor(routing, s.trade);
    const fallback = nameLookup.member(r?.defaultAssigneeId ?? null)
      ?? nameLookup.group(r?.defaultStaffGroupId ?? null);
    return fallback ? `${fallback} — the ${TRADE_LABELS[s.trade].toLowerCase()} default` : 'Nobody yet';
  }

  async function generateNow() {
    setGenerating(true);
    setGenerated(null);
    const n = await dbGenerateScheduledWork();
    setGenerated(n);
    setGenerating(false);
  }

  return (
    <div>
      {/* ── Header band ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-1 mb-5">
        <div className="flex flex-wrap">
          <StatCard label="Routines" value={active.length} hint={
            schedules.length > active.length ? `${schedules.length - active.length} paused` : 'all running'
          } />
          <StatCard
            label="Behind" value={behind.length}
            variant={behind.length > 0 ? 'red' : 'green'}
            hint={behind.length === 0 ? 'nothing overdue' : 'cycles missed'}
          />
          <StatCard
            label="Open occurrences" value={openByScheduleId.size}
            hint="one per routine, by design"
          />
        </div>
        <div className="flex items-center gap-2 pb-4">
          <Button variant="ghost" onClick={generateNow} disabled={generating || !canEdit}>
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {generating ? 'Checking…' : 'Generate now'}
          </Button>
          {canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New routine
            </Button>
          )}
        </div>
      </div>

      {generated !== null && (
        <p
          role="status"
          className="mb-5 text-[12.5px] text-ink-soft bg-cream border border-border rounded-card px-4 py-2.5"
        >
          {generated === 0
            ? 'Nothing was due. Every routine has either already been raised or is not due yet.'
            : `Raised ${generated} work order${generated === 1 ? '' : 's'}. They are in the queue now.`}
        </p>
      )}

      {/* ── The debt ────────────────────────────────────────────────────────── */}
      {behind.length > 0 && (
        <div className="rounded-card border border-red/25 bg-red-bg px-5 py-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display text-[16px] font-bold text-red-text">
                {behind.length} routine{behind.length === 1 ? ' is' : 's are'} behind
              </p>
              <p className="text-[12.5px] text-red-text/85 leading-relaxed mt-1">
                A routine only ever holds one open work order at a time. When the last one is still
                open and the next comes due, we bump that one rather than stack a duplicate — so a
                routine that is four cycles behind is one row, not four.
              </p>
            </div>
          </div>
          <ul className="mt-3.5 space-y-2 pl-8">
            {behind.map((s) => {
              const openTitle = openByScheduleId.get(s.id);
              return (
                <li key={s.id} className="text-[12.5px]">
                  <button
                    type="button"
                    onClick={() => canEdit && setEditing(s)}
                    className="text-left font-semibold text-red-text underline underline-offset-2 cursor-pointer hover:text-red"
                  >
                    {s.title}
                  </button>
                  <span className="text-red-text/80"> · {describeMissed(s.missedCount)} · </span>
                  <span className="text-red-text/80">
                    {openTitle
                      ? 'the last one is still open, so we have not raised another'
                      : 'nothing is open — Generate now will raise the next one'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── The list ────────────────────────────────────────────────────────── */}
      {schedules.length === 0 ? (
        <div className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <Repeat className="w-6 h-6 text-sage mx-auto mb-3" aria-hidden="true" />
          <p className="font-display text-[16px] font-bold text-forest">No routines yet</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed max-w-md mx-auto mt-2">
            A routine is the work nobody reports because everybody assumes somebody else did it —
            the grease traps, the fire extinguisher walk, the pump house. Set the cadence once and
            it lands in the queue as a real work order somebody can be assigned and hold to.
          </p>
          {canEdit && (
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setCreating(true)}>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New routine
              </Button>
            </div>
          )}
        </div>
      ) : (
        byTrade.map(({ trade, items }) => (
          <section key={trade}>
            <GroupHeader label={TRADE_LABELS[trade]} count={items.length} />
            <ul className="space-y-2">
              {items.map((s) => (
                <RoutineRow
                  key={s.id}
                  schedule={s}
                  landsOn={landsOn(s)}
                  templateName={nameLookup.template(s.checklistTemplateId)}
                  openTitle={openByScheduleId.get(s.id) ?? null}
                  openingDate={season?.openingDate ?? null}
                  canRecord={canEdit}
                  onOpen={canEdit ? () => setEditing(s) : undefined}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {(creating || editing) && (
        <RoutineModal
          schedule={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── One routine ──────────────────────────────────────────────────────────────

function RoutineRow({
  schedule: s, landsOn, templateName, openTitle, openingDate, canRecord, onOpen,
}: {
  schedule: WorkSchedule;
  landsOn: string;
  templateName: string | null;
  openTitle: string | null;
  openingDate: string | null;
  canRecord: boolean;
  onOpen?: () => void;
}) {
  const missed = describeMissed(s.missedCount);
  const next = useMemo(
    () => nextDates(s, { count: 1, openingDate })[0] ?? null,
    [s, openingDate],
  );

  // A daily or weekly routine with no window will keep raising work in February. Flagged here
  // rather than only in the editor, because the person who set it up is rarely the person who
  // notices the queue has gone strange.
  const runsYearRound = s.isActive && !s.activeUntil
    && (s.cadence === 'daily' || s.cadence === 'weekly');

  const shellClass = `w-full text-left block rounded-card border border-border bg-white px-4 py-3.5 transition-colors ${
    onOpen ? 'cursor-pointer hover:border-sage' : ''
  } ${s.isActive ? '' : 'opacity-60'}`;

  // A viewer gets the same row without the button semantics — an unclickable button that
  // announces itself as clickable is worse than a paragraph.
  const body = (
    <>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <b className="text-[14px] font-semibold text-forest">{s.title}</b>
              <span className={`rounded-tag px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.1em] ${TRADE_PILL[s.trade]}`}>
                {TRADE_LABELS[s.trade]}
              </span>
              {!s.isActive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                  <PauseCircle className="w-3 h-3" aria-hidden="true" /> Paused
                </span>
              )}
            </div>

            <p className="text-[12.5px] text-ink-soft mt-1">
              {describeCadence(s)}
              {s.activeFrom || s.activeUntil ? (
                <span className="text-ink-faint">
                  {' · '}
                  {s.activeFrom ? formatDate(s.activeFrom) : 'any time'}
                  {' – '}
                  {s.activeUntil ? formatDate(s.activeUntil) : 'no end'}
                </span>
              ) : null}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11.5px] text-ink-soft">
              {s.locations.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-sage" aria-hidden="true" />
                  {s.locations.slice(0, 3).join(', ')}
                  {s.locations.length > 3 ? ` +${s.locations.length - 3}` : ''}
                </span>
              )}
              <span>Lands on <b className="font-semibold text-ink">{landsOn}</b></span>
              {templateName && <span>Checklist: {templateName}</span>}
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            {missed ? (
              <span className="inline-flex items-center gap-1 rounded-tag bg-red-bg px-2 py-0.5 text-[11px] font-bold text-red">
                {missed}
              </span>
            ) : null}
            <p className="text-[11.5px] text-ink-soft mt-1 inline-flex items-center gap-1 justify-end">
              <CalendarClock className="w-3 h-3 text-sage" aria-hidden="true" />
              {/* A meter routine has no next DATE — only a next reading, and the reading is
                  whatever somebody logs. Saying "every N hours" is the honest version. */}
              {s.cadence === 'meter'
                ? `Every ${s.meterInterval ?? '?'} ${s.meterKind === 'odometer' ? 'miles' : 'hours'}`
                : s.cadence === 'on_turnover'
                  ? 'Next turnover'
                  : next
                    ? `Next ${formatDate(next)}`
                    : 'Nothing scheduled'}
            </p>
          </div>
        </div>

        {/* The rule, where a camp actually meets it. */}
        {missed && (
          <p className="mt-2.5 border-t border-border pt-2.5 text-[11.5px] text-red-text leading-relaxed">
            {openTitle
              ? 'The last one is still open, so we have not raised another. Close it and the next occurrence appears.'
              : 'No occurrence is open. Generate now will raise the one that is due.'}
          </p>
        )}

        {runsYearRound && (
          <p className="mt-2.5 border-t border-border pt-2.5 text-[11.5px] text-amber-text leading-relaxed">
            No active window — this keeps raising work through the winter. Set one unless it really
            does run year-round.
          </p>
        )}
    </>
  );

  return (
    <li>
      {onOpen
        ? <button type="button" onClick={onOpen} className={shellClass}>{body}</button>
        : <div className={shellClass}>{body}</div>}
      {/* Sits outside the card's button rather than inside it: a form nested in a button is
          invalid, and the reading is the one thing on this row somebody types rather than opens. */}
      {s.cadence === 'meter' && s.assetId && canRecord && <MeterEntry schedule={s} />}
    </li>
  );
}

// ─── Meter readings ───────────────────────────────────────────────────────────

/**
 * A meter routine cannot come due on its own — something has to say the mower has run 212 hours.
 * Without somewhere to type that, the cadence exists and never fires, so the entry point lives
 * on the routine itself rather than three screens away in the asset record.
 */
function MeterEntry({ schedule: s }: { schedule: WorkSchedule }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const unit = s.meterKind === 'odometer' ? 'miles' : 'hours';

  async function submit() {
    const reading = Number(value);
    if (!s.assetId || !value.trim() || !Number.isFinite(reading)) return;
    setBusy(true);
    const result = await dbRecordMeter(s.assetId, reading, s.meterKind);
    setBusy(false);
    if (typeof result === 'string') {
      // The database refuses a reading lower than the last one rather than absorbing it —
      // absorbing it would make every meter routine come due at once.
      setMessage({ text: result, bad: true });
      return;
    }
    setValue('');
    setMessage({
      text: result > 0
        ? `Recorded. That raised ${result} work order${result === 1 ? '' : 's'}.`
        : 'Recorded. Nothing is due yet.',
      bad: false,
    });
  }

  return (
    <div className="mt-1.5 ml-4 flex flex-wrap items-center gap-2">
      <label className="text-[11.5px] text-ink-soft" htmlFor={`meter-${s.id}`}>
        {s.meterLastAt != null
          ? `Last counted at ${s.meterLastAt.toLocaleString()} ${unit}. New reading:`
          : `Current ${unit}:`}
      </label>
      <input
        id={`meter-${s.id}`}
        type="number"
        inputMode="decimal"
        className="w-28 text-[12.5px] bg-white border border-border rounded-btn px-2 py-1 focus:outline-none focus:border-sage"
        value={value}
        onChange={(e) => { setValue(e.target.value); setMessage(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
      />
      <Button variant="ghost" size="sm" onClick={submit} disabled={busy || !value.trim()}>
        {busy ? 'Recording…' : 'Record'}
      </Button>
      {message && (
        <span className={`text-[11.5px] ${message.bad ? 'text-red-text' : 'text-green-muted-text'}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
