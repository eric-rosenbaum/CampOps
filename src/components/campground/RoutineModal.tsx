/* eslint-disable react-refresh/only-export-components -- `nextDates` is the cadence arithmetic
   and it belongs beside the form that edits those fields: the preview in this modal and the
   "next due" line in RoutinesPanel must agree exactly, and two copies of this maths would
   eventually disagree. The rule this disables only affects dev fast refresh, not correctness. */
import { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, CalendarRange } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { LocationPicker } from '@/components/shared/LocationPicker';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useLocationStore } from '@/store/locationStore';
import { useAssetStore } from '@/store/assetStore';
import { describeCadence } from '@/lib/workOrder';
import { generateId, todayStr, toDateStr, parseDateStr, formatDate } from '@/lib/utils';
import { CADENCE_LABELS, TRADE_LABELS, TRADES } from '@/lib/types';
import type { Cadence, Priority, WorkSchedule } from '@/lib/types';

// ─── The preview maths ────────────────────────────────────────────────────────
// The server generator owns what actually gets raised. This is a *preview*, and it exists
// because a camp typing "every 2 weeks on Mon, Thu, from June 14th" has no way to check that
// it means what they intended until three wrong work orders have already appeared. Showing the
// next five dates before they save turns a silent mistake into an obvious one.

/** The fields a cadence is made of. Kept narrow so the panel can call this with a draft. */
export type CadenceShape = Pick<WorkSchedule,
  'cadence' | 'intervalCount' | 'byWeekday' | 'byMonthday' | 'anchorDate'
  | 'daysRelativeToOpening' | 'activeFrom' | 'activeUntil'>;

// Just over five years of days. Enough for an annual routine to produce five previews, and
// small enough that scanning day-by-day (which is the only way to get "every 2nd Monday and
// Thursday" right without a rules engine) stays free.
const SCAN_DAYS = 1900;

const DAY_MS = 86_400_000;

function inWindow(s: Pick<CadenceShape, 'activeFrom' | 'activeUntil'>, day: string): boolean {
  if (s.activeFrom && day < s.activeFrom) return false;
  if (s.activeUntil && day > s.activeUntil) return false;
  return true;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Whole weeks between two local midnights, rounded so a DST hour cannot shift a week. */
function weekIndex(anchor: Date, d: Date): number {
  const weekStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate() - x.getDay()).getTime();
  return Math.round((weekStart(d) - weekStart(anchor)) / (7 * DAY_MS));
}

function matches(s: CadenceShape, d: Date, anchor: Date, interval: number): boolean {
  switch (s.cadence) {
    case 'daily': {
      const gap = Math.round((d.getTime() - anchor.getTime()) / DAY_MS);
      return gap >= 0 && gap % interval === 0;
    }
    case 'weekly': {
      const days = s.byWeekday && s.byWeekday.length > 0 ? s.byWeekday : [anchor.getDay()];
      if (!days.includes(d.getDay())) return false;
      const w = weekIndex(anchor, d);
      return w >= 0 && w % interval === 0;
    }
    case 'monthly': {
      // A "31st" routine in a 30-day month lands on the 30th rather than being skipped: a
      // monthly inspection that silently misses February is worse than one that runs a day early.
      const wanted = s.byMonthday ?? anchor.getDate();
      if (d.getDate() !== Math.min(wanted, daysInMonth(d))) return false;
      const months = (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth());
      return months >= 0 && months % interval === 0;
    }
    case 'annually': {
      // A Feb 29 anchor genuinely only recurs on leap years. Preview says so by showing them.
      if (d.getMonth() !== anchor.getMonth() || d.getDate() !== anchor.getDate()) return false;
      const years = d.getFullYear() - anchor.getFullYear();
      return years >= 0 && years % interval === 0;
    }
    default:
      return false;
  }
}

/**
 * The next dates this routine would produce, computed in the browser.
 *
 * Returns an empty array for the two cadences that have no date to predict — `meter` waits on a
 * reading and `on_turnover` waits on a departure. The callers say so in words rather than
 * showing an empty list, because an empty list reads as "broken".
 */
export function nextDates(
  s: CadenceShape,
  opts: { count?: number; from?: string; openingDate?: string | null } = {},
): string[] {
  const { count = 5, from = todayStr(), openingDate = null } = opts;
  if (s.cadence === 'meter' || s.cadence === 'on_turnover') return [];

  if (s.cadence === 'season_relative') {
    if (!openingDate) return [];
    const d = new Date(parseDateStr(openingDate));
    d.setDate(d.getDate() + (s.daysRelativeToOpening ?? 0));
    const day = toDateStr(d);
    return inWindow(s, day) && day >= from ? [day] : [];
  }

  const interval = Math.max(1, s.intervalCount || 1);
  const anchorStr = s.anchorDate ?? s.activeFrom ?? from;
  const anchor = parseDateStr(anchorStr);
  // Never propose a date before the anchor: "starting from June 14" means what it says.
  const startStr = from > anchorStr ? from : anchorStr;
  const cursor = parseDateStr(startStr);

  const out: string[] = [];
  for (let i = 0; i < SCAN_DAYS && out.length < count; i++) {
    const day = toDateStr(cursor);
    if (s.activeUntil && day > s.activeUntil) break;
    if (inWindow(s, day) && matches(s, cursor, anchor, interval)) out.push(day);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ─── The editor ───────────────────────────────────────────────────────────────

const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-widest text-ink-soft mb-1';
const hintClass = 'text-[11.5px] text-ink-soft leading-relaxed mt-1.5';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRIORITIES: Priority[] = ['normal', 'high', 'urgent'];
const CADENCE_ORDER: Cadence[] = [
  'daily', 'weekly', 'monthly', 'annually', 'season_relative', 'on_turnover', 'meter',
];

function blankSchedule(): WorkSchedule {
  const now = new Date().toISOString();
  const today = todayStr();
  return {
    id: generateId(), campId: '',
    title: '', description: null,
    trade: 'maintenance', priority: 'normal',
    locationIds: [], locations: [],
    assetId: null, assigneeId: null, staffGroupId: null, vendorId: null,
    checklistTemplateId: null,
    cadence: 'weekly', intervalCount: 1,
    byWeekday: [parseDateStr(today).getDay()], byMonthday: null,
    anchorDate: today, daysRelativeToOpening: null,
    meterInterval: null, meterLastAt: null, meterKind: 'hours',
    activeFrom: null, activeUntil: null,
    generateAheadDays: 14, rescheduleFrom: 'due_date',
    lastGeneratedOn: null, missedCount: 0, isActive: true,
    createdAt: now, updatedAt: now,
  };
}

interface Props {
  /** The routine being edited, or null/undefined for a new one. */
  schedule?: WorkSchedule | null;
  onClose?: () => void;
}

export function RoutineModal({ schedule = null, onClose = () => {} }: Props) {
  const [draft, setDraft] = useState<WorkSchedule>(() => schedule ?? blankSchedule());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addSchedule = useCampgroundStore((s) => s.addSchedule);
  const updateSchedule = useCampgroundStore((s) => s.updateSchedule);
  const deleteSchedule = useCampgroundStore((s) => s.deleteSchedule);
  const vendors = useCampgroundStore((s) => s.vendors);
  const templates = useCampgroundStore((s) => s.templates);
  const members = useCampStore((s) => s.members);
  const staffGroups = useCampStore((s) => s.staffGroups);
  const season = useChecklistStore((s) => s.season);
  const locations = useLocationStore((s) => s.locations);
  const assets = useAssetStore((s) => s.assets);

  const isNew = schedule == null;
  const set = (patch: Partial<WorkSchedule>) => setDraft((d) => ({ ...d, ...patch }));

  // Derived with useMemo, never inside a selector: a selector that filters allocates a new
  // array every render, which under React 19 + zustand v5 is an infinite loop.
  const activeVendors = useMemo(() => vendors.filter((v) => v.isActive), [vendors]);
  const activeTemplates = useMemo(
    () => templates.filter((t) => t.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [templates],
  );
  const meterAssets = useMemo(
    () => assets.filter((a) => a.isActive && (draft.meterKind === 'odometer' ? a.tracksOdometer : a.tracksHours)),
    [assets, draft.meterKind],
  );
  const assignableMembers = useMemo(
    () => members.filter((m) => m.isActive && m.role !== 'viewer'),
    [members],
  );

  const preview = useMemo(
    () => nextDates(draft, { count: 5, openingDate: season?.openingDate ?? null }),
    [draft, season?.openingDate],
  );

  const needsAsset = draft.cadence === 'meter';
  const usesInterval = draft.cadence === 'daily' || draft.cadence === 'weekly'
    || draft.cadence === 'monthly' || draft.cadence === 'annually';

  const problems: string[] = [];
  if (!draft.title.trim()) problems.push('Give the routine a title — it becomes the work order title.');
  if (draft.cadence === 'weekly' && (draft.byWeekday?.length ?? 0) === 0) {
    problems.push('Pick at least one weekday.');
  }
  if (needsAsset && !draft.assetId) problems.push('A meter routine has to count against a specific asset.');
  if (needsAsset && !draft.meterInterval) problems.push('Set how many hours or miles between occurrences.');
  if (draft.cadence === 'season_relative' && !season) {
    problems.push('There is no season yet, so "relative to opening day" has no day to count from.');
  }
  if (draft.activeFrom && draft.activeUntil && draft.activeFrom > draft.activeUntil) {
    problems.push('The active window ends before it starts.');
  }

  function toggleWeekday(day: number) {
    const cur = draft.byWeekday ?? [];
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b);
    set({ byWeekday: next });
  }

  function changeCadence(c: Cadence) {
    const anchor = draft.anchorDate ?? todayStr();
    set({
      cadence: c,
      // Each cadence reads a different set of fields, so seed the one it is about to use rather
      // than leaving it null and having describeCadence render half a sentence.
      byWeekday: c === 'weekly'
        ? (draft.byWeekday?.length ? draft.byWeekday : [parseDateStr(anchor).getDay()])
        : draft.byWeekday,
      byMonthday: c === 'monthly' ? (draft.byMonthday ?? parseDateStr(anchor).getDate()) : draft.byMonthday,
      daysRelativeToOpening: c === 'season_relative' ? (draft.daysRelativeToOpening ?? 0) : draft.daysRelativeToOpening,
      meterInterval: c === 'meter' ? (draft.meterInterval ?? 100) : draft.meterInterval,
    });
  }

  function save() {
    if (problems.length > 0) return;
    const nameById = new Map(locations.map((l) => [l.id, l.name]));
    const row: WorkSchedule = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description?.trim() ? draft.description.trim() : null,
      // Denormalised name snapshot, the same contract as an issue's `locations`.
      locations: draft.locationIds.map((id) => nameById.get(id) ?? '').filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
    if (isNew) addSchedule(row); else updateSchedule(row);
    onClose();
  }

  return (
    <Modal
      title={isNew ? 'New routine' : 'Edit routine'}
      onClose={onClose}
      width="min(660px, 94vw)"
    >
      <div className="space-y-5">
        {/* ── What ─────────────────────────────────────────────────────────── */}
        <div>
          <label className={labelClass} htmlFor="routine-title">Title</label>
          <input
            id="routine-title"
            className={inputClass}
            value={draft.title}
            placeholder="Flush the hot water tank"
            onChange={(e) => set({ title: e.target.value })}
          />
          <p className={hintClass}>
            Write it as the job, not the schedule.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="routine-desc">What it involves</label>
          <textarea
            id="routine-desc"
            className={`${inputClass} min-h-[64px]`}
            value={draft.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="routine-trade">Trade</label>
            <select
              id="routine-trade" className={inputClass} value={draft.trade}
              onChange={(e) => set({ trade: e.target.value as WorkSchedule['trade'] })}
            >
              {TRADES.map((t) => <option key={t} value={t}>{TRADE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="routine-priority">Priority</label>
            <select
              id="routine-priority" className={inputClass} value={draft.priority}
              onChange={(e) => set({ priority: e.target.value as Priority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Where</label>
          <LocationPicker
            value={draft.locationIds}
            onChange={(ids) => set({ locationIds: ids })}
            placeholder="Anywhere in camp"
          />
        </div>

        {/* ── How often ────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[14px] font-bold text-forest mb-3">How often</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="routine-cadence">Cadence</label>
              <select
                id="routine-cadence" className={inputClass} value={draft.cadence}
                onChange={(e) => changeCadence(e.target.value as Cadence)}
              >
                {CADENCE_ORDER.map((c) => (
                  <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
                ))}
              </select>
            </div>
            {usesInterval && (
              <div>
                <label className={labelClass} htmlFor="routine-interval">Every</label>
                <div className="flex items-center gap-2">
                  <input
                    id="routine-interval" type="number" min={1} max={52}
                    className={`${inputClass} w-24`}
                    value={draft.intervalCount}
                    onChange={(e) => set({ intervalCount: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <span className="text-body text-ink-soft">
                    {draft.cadence === 'daily' ? 'day(s)'
                      : draft.cadence === 'weekly' ? 'week(s)'
                        : draft.cadence === 'monthly' ? 'month(s)' : 'year(s)'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {draft.cadence === 'weekly' && (
            <div className="mt-4">
              <label className={labelClass}>On these days</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, day) => {
                  const on = (draft.byWeekday ?? []).includes(day);
                  return (
                    <button
                      key={label} type="button" aria-pressed={on}
                      onClick={() => toggleWeekday(day)}
                      className={`px-3 py-1.5 rounded-btn text-[12px] font-bold border transition-colors cursor-pointer ${
                        on ? 'bg-forest text-paper border-forest' : 'bg-white text-ink-soft border-border hover:border-sage'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {draft.cadence === 'monthly' && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="routine-monthday">Day of the month</label>
              <input
                id="routine-monthday" type="number" min={1} max={31}
                className={`${inputClass} w-24`}
                value={draft.byMonthday ?? ''}
                onChange={(e) => set({ byMonthday: Number(e.target.value) || null })}
              />
              <p className={hintClass}>
                A 31st routine lands on the last day of a shorter month rather than skipping it.
              </p>
            </div>
          )}

          {draft.cadence === 'season_relative' && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="routine-relative">Days relative to opening day</label>
              <input
                id="routine-relative" type="number"
                className={`${inputClass} w-28`}
                value={draft.daysRelativeToOpening ?? 0}
                onChange={(e) => set({ daysRelativeToOpening: Number(e.target.value) || 0 })}
              />
              <p className={hintClass}>
                Negative counts backwards — <b>-14</b> means two weeks before opening day.
                {season
                  ? ` This season opens ${formatDate(season.openingDate)}.`
                  : ' No season is set yet, so there is nothing to count from.'}
              </p>
            </div>
          )}

          {draft.cadence === 'on_turnover' && (
            <p className={hintClass}>
              Raised whenever a session or rental group departs.
            </p>
          )}

          {needsAsset && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass} htmlFor="routine-meter-kind">Counting</label>
                <select
                  id="routine-meter-kind" className={inputClass} value={draft.meterKind}
                  onChange={(e) => set({ meterKind: e.target.value as WorkSchedule['meterKind'], assetId: null })}
                >
                  <option value="hours">Engine hours</option>
                  <option value="odometer">Miles</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="routine-meter-interval">Every</label>
                <input
                  id="routine-meter-interval" type="number" min={1}
                  className={inputClass}
                  value={draft.meterInterval ?? ''}
                  onChange={(e) => set({ meterInterval: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="routine-asset">Asset</label>
                <select
                  id="routine-asset" className={inputClass} value={draft.assetId ?? ''}
                  onChange={(e) => set({ assetId: e.target.value || null })}
                >
                  <option value="">Choose one…</option>
                  {meterAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {meterAssets.length === 0 && (
                <p className={`${hintClass} sm:col-span-3`}>
                  No asset is tracking {draft.meterKind === 'odometer' ? 'miles' : 'hours'} yet. Turn
                  that on for the machine in Assets &amp; Vehicles first — this routine has nothing
                  to count against until you do.
                </p>
              )}
            </div>
          )}

          {usesInterval && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="routine-anchor">Starting from</label>
              <input
                id="routine-anchor" type="date" className={`${inputClass} sm:w-56`}
                value={draft.anchorDate ?? ''}
                onChange={(e) => set({ anchorDate: e.target.value || null })}
              />
              <p className={hintClass}>
                The date the count runs from.
              </p>
            </div>
          )}
        </div>

        {/* ── Active window ────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[14px] font-bold text-forest mb-1">Active window</h3>
          <p className="text-[12.5px] text-ink-soft leading-relaxed mb-3">
            Without a window, this keeps raising work all year.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="routine-from">Runs from</label>
              <input
                id="routine-from" type="date" className={inputClass}
                value={draft.activeFrom ?? ''}
                onChange={(e) => set({ activeFrom: e.target.value || null })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-until">Runs until</label>
              <input
                id="routine-until" type="date" className={inputClass}
                value={draft.activeUntil ?? ''}
                onChange={(e) => set({ activeUntil: e.target.value || null })}
              />
            </div>
          </div>
          {season && !draft.activeFrom && !draft.activeUntil && (
            <button
              type="button"
              onClick={() => set({ activeFrom: season.openingDate, activeUntil: season.closingDate })}
              className="mt-2 text-[12px] font-semibold text-forest underline underline-offset-2 cursor-pointer hover:text-forest-mid"
            >
              Use this season ({formatDate(season.openingDate)} – {formatDate(season.closingDate)})
            </button>
          )}
        </div>

        {/* ── Who ──────────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[14px] font-bold text-forest mb-3">Who it lands on</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="routine-assignee">Assignee</label>
              <select
                id="routine-assignee" className={inputClass} value={draft.assigneeId ?? ''}
                onChange={(e) => set({ assigneeId: e.target.value || null })}
              >
                <option value="">Use the trade's default routing</option>
                {assignableMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName ?? m.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-group">Staff group</label>
              <select
                id="routine-group" className={inputClass} value={draft.staffGroupId ?? ''}
                onChange={(e) => set({ staffGroupId: e.target.value || null })}
              >
                <option value="">None</option>
                {staffGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-vendor">Dispatch to a vendor</label>
              <select
                id="routine-vendor" className={inputClass} value={draft.vendorId ?? ''}
                onChange={(e) => set({ vendorId: e.target.value || null })}
              >
                <option value="">Nobody — we do this ourselves</option>
                {activeVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-template">Checklist</label>
              <select
                id="routine-template" className={inputClass} value={draft.checklistTemplateId ?? ''}
                onChange={(e) => set({ checklistTemplateId: e.target.value || null })}
              >
                <option value="">No checklist</option>
                {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Generation ───────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="routine-ahead">Raise it this many days ahead</label>
            <input
              id="routine-ahead" type="number" min={0} max={90}
              className={`${inputClass} w-24`}
              value={draft.generateAheadDays}
              onChange={(e) => set({ generateAheadDays: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="routine-reschedule">Count the next one from</label>
            <select
              id="routine-reschedule" className={inputClass} value={draft.rescheduleFrom}
              onChange={(e) => set({ rescheduleFrom: e.target.value as WorkSchedule['rescheduleFrom'] })}
            >
              <option value="due_date">The date it was due</option>
              <option value="completed_at">The date it was finished</option>
            </select>
            <p className={hintClass}>
              "Finished" suits jobs measured from the last service — an oil change three weeks
              late should push the next one back, not stay on the old grid.
            </p>
          </div>
        </div>

        {/* ── Preview ──────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <div className="bg-cream rounded-card border border-border px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <CalendarRange className="w-4 h-4 text-forest" aria-hidden="true" />
              <b className="text-[13px] text-forest">{describeCadence(draft) || 'Not set yet'}</b>
            </div>
            {draft.cadence === 'meter' ? (
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                Comes due on a reading, not a date.
              </p>
            ) : draft.cadence === 'on_turnover' ? (
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                Raised on every departure.
              </p>
            ) : preview.length > 0 ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">
                  Next {preview.length === 1 ? 'occurrence' : `${preview.length} occurrences`}
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {preview.map((d) => (
                    <li key={d} className="text-[12.5px] text-ink tabular-nums">{formatDate(d)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[12.5px] text-red-text leading-relaxed">
                Nothing comes due in the next five years. Check the window and start date.
              </p>
            )}
          </div>
        </div>

        {/* ── Paused ───────────────────────────────────────────────────────── */}
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox" className="mt-0.5 accent-forest"
            checked={!draft.isActive}
            onChange={(e) => set({ isActive: !e.target.checked })}
          />
          <span className="text-body text-ink">
            Pause this routine
            <span className="block text-[11.5px] text-ink-soft">
              Stops new occurrences. Anything already raised stays in the queue.
            </span>
          </span>
        </label>

        {problems.length > 0 && (
          <div className="flex gap-2.5 rounded-card border border-amber/30 bg-amber-bg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-text flex-shrink-0 mt-0.5" aria-hidden="true" />
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p} className="text-[12.5px] text-amber-text leading-relaxed">{p}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={save} disabled={problems.length > 0}>
            {isNew ? 'Create routine' : 'Save changes'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!isNew && (
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft">Delete it?</span>
                  <Button
                    variant="danger" size="sm"
                    onClick={() => { deleteSchedule(draft.id); onClose(); }}
                  >
                    Yes, delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint hover:text-red transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
