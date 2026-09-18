/* eslint-disable react-refresh/only-export-components -- `nextDates` is the cadence arithmetic
   and it belongs beside the form that edits those fields: the preview in this modal and the
   "next due" line in RoutinesPanel must agree exactly, and two copies of this maths would
   eventually disagree. The rule this disables only affects dev fast refresh, not correctness. */
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2, CalendarRange, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { LocationPicker } from '@/components/shared/LocationPicker';
import { useCampgroundStore } from '@/store/campgroundStore';
import { useCampStore } from '@/store/campStore';
import { useChecklistStore } from '@/store/checklistStore';
import { useLocationStore } from '@/store/locationStore';
import { useAssetStore } from '@/store/assetStore';
import { generateId, todayStr, toDateStr, parseDateStr, formatDate, fmtClock } from '@/lib/utils';
import { CADENCE_LABELS } from '@/lib/types';
import { seedCrewName, useTradeKeys, useTradeLabel } from '@/lib/useTrades';
import type { Cadence, Priority, WorkSchedule } from '@/lib/types';
import { currentLang } from '@/i18n';

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

// ─── Saying it in the reader's language ───────────────────────────────────────
// describeCadence/describeMissed in lib/workOrder.ts build English sentences out of fragments,
// which cannot be translated -- "Every 2 weeks on Mon, Thu" is one sentence per language, with
// its own plural and its own word order. These are the whole-sentence versions the routine
// screens use; the preview here and the row in RoutinesPanel read the same one.

/** The first column of a week, as the reader's calendar has it: Monday in Spanish. */
export function weekStartsOn(): number {
  return currentLang() === 'es' ? 1 : 0;
}

/** Weekday indexes (0 = Sunday) in the order the reader's week runs. */
export function weekdayOrder(): number[] {
  const first = weekStartsOn();
  return Array.from({ length: 7 }, (_, i) => (first + i) % 7);
}

/**
 * Short weekday names in the reader's language, indexed 0 = Sunday. Hebrew takes the narrow form
 * ("א׳") because its short form is "יום א׳", which is two words on a button one letter wide.
 */
export function weekdayNames(): string[] {
  const lang = currentLang();
  const fmt = new Intl.DateTimeFormat(lang, { weekday: lang === 'he' ? 'narrow' : 'short' });
  // 2026-01-04 was a Sunday. Built from local parts, so no timezone can shift it a day.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 4 + i)));
}

type CadenceText = Pick<WorkSchedule,
  'cadence' | 'intervalCount' | 'byWeekday' | 'byMonthday' | 'anchorDate'
  | 'daysRelativeToOpening' | 'meterInterval' | 'meterKind'>;

/** `describeCadence` and `describeMissed`, as whole translated sentences. */
export function useCadenceText() {
  const { t } = useTranslation('campgroundAdmin');
  return useMemo(() => {
    const describe = (s: CadenceText): string => {
      const count = Math.max(1, s.intervalCount || 1);
      switch (s.cadence) {
        case 'daily':
          return t('cadenceText.daily', { count });
        case 'weekly': {
          const names = weekdayNames();
          const order = weekdayOrder();
          const days = order.filter((d) => (s.byWeekday ?? []).includes(d)).map((d) => names[d]);
          return days.length
            ? t('cadenceText.weeklyOn', { count, days: days.join(t('cadenceText.listSeparator')) })
            : t('cadenceText.weekly', { count });
        }
        case 'monthly':
          return s.byMonthday
            ? t('cadenceText.monthlyOn', { count, day: s.byMonthday })
            : t('cadenceText.monthly', { count });
        case 'annually':
          return t('cadenceText.annually', { count });
        case 'season_relative': {
          const d = s.daysRelativeToOpening ?? 0;
          if (d === 0) return t('cadenceText.openingDay');
          return d < 0
            ? t('cadenceText.beforeOpening', { count: Math.abs(d) })
            : t('cadenceText.afterOpening', { count: d });
        }
        case 'on_turnover':
          return t('cadenceText.turnover');
        case 'meter':
          if (!s.meterInterval) return t('cadenceText.byMeter');
          return s.meterKind === 'odometer'
            ? t('cadenceText.meterMiles', { count: s.meterInterval })
            : t('cadenceText.meterHours', { count: s.meterInterval });
        default:
          return '';
      }
    };
    const missed = (n: number): string | null => (n > 0 ? t('cadenceText.missed', { count: n }) : null);
    return { describe, missed };
  }, [t]);
}

// ─── The editor ───────────────────────────────────────────────────────────────

const inputClass =
  'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-widest text-ink-soft mb-1';
const hintClass = 'text-[11.5px] text-ink-soft leading-relaxed mt-1.5';

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
    anchorDate: today, dueTime: null, daysRelativeToOpening: null,
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
  const { t } = useTranslation(['campgroundAdmin', 'common']);
  const cadenceText = useCadenceText();
  const weekdays = useMemo(() => weekdayNames(), []);
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
  const [draft, setDraft] = useState<WorkSchedule>(() => schedule ?? blankSchedule());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
  if (!draft.title.trim()) problems.push(t('routineModal.problems.title'));
  if (draft.cadence === 'weekly' && (draft.byWeekday?.length ?? 0) === 0) {
    problems.push(t('routineModal.problems.weekday'));
  }
  if (needsAsset && !draft.assetId) problems.push(t('routineModal.problems.meterAsset'));
  if (needsAsset && !draft.meterInterval) problems.push(t('routineModal.problems.meterInterval'));
  if (draft.cadence === 'season_relative' && !season) {
    problems.push(t('routineModal.problems.noSeason'));
  }
  if (draft.activeFrom && draft.activeUntil && draft.activeFrom > draft.activeUntil) {
    problems.push(t('routineModal.problems.windowBackwards'));
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
      title={isNew ? t('routineModal.titleNew') : t('routineModal.titleEdit')}
      onClose={onClose}
      width="min(660px, 94vw)"
    >
      <div className="space-y-5">
        {/* ── What ─────────────────────────────────────────────────────────── */}
        <div>
          <label className={labelClass} htmlFor="routine-title">{t('routineModal.title')}</label>
          <input
            id="routine-title"
            className={inputClass}
            value={draft.title}
            placeholder={t('routineModal.titlePlaceholder')}
            onChange={(e) => set({ title: e.target.value })}
          />
          <p className={hintClass}>
            {t('routineModal.titleHint')}
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="routine-desc">{t('routineModal.description')}</label>
          <textarea
            id="routine-desc"
            className={`${inputClass} min-h-[64px]`}
            value={draft.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="routine-trade">{t('shared.crew')}</label>
            <select
              id="routine-trade" className={inputClass} value={draft.trade}
              onChange={(e) => set({ trade: e.target.value as WorkSchedule['trade'] })}
            >
              {tradeKeys.map((t) => <option key={t} value={t}>{labelOf(t)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="routine-priority">{t('shared.priority')}</label>
            <select
              id="routine-priority" className={inputClass} value={draft.priority}
              onChange={(e) => set({ priority: e.target.value as Priority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`common:priority.${p}`)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('routineModal.where')}</label>
          <LocationPicker
            value={draft.locationIds}
            onChange={(ids) => set({ locationIds: ids })}
            placeholder={t('routineModal.wherePlaceholder')}
          />
        </div>

        {/* ── How often ────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[14px] font-bold text-forest mb-3">{t('routineModal.howOften')}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="routine-cadence">{t('routineModal.cadence')}</label>
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
                <label className={labelClass} htmlFor="routine-interval">{t('routineModal.every')}</label>
                <div className="flex items-center gap-2">
                  <input
                    id="routine-interval" type="number" min={1} max={52}
                    className={`${inputClass} w-24`}
                    value={draft.intervalCount}
                    onChange={(e) => set({ intervalCount: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <span className="text-body text-ink-soft">
                    {draft.cadence === 'daily' ? t('routineModal.unitDay', { count: draft.intervalCount })
                      : draft.cadence === 'weekly' ? t('routineModal.unitWeek', { count: draft.intervalCount })
                        : draft.cadence === 'monthly'
                          ? t('routineModal.unitMonth', { count: draft.intervalCount })
                          : t('routineModal.unitYear', { count: draft.intervalCount })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {draft.cadence === 'weekly' && (
            <div className="mt-4">
              <label className={labelClass}>{t('routineModal.onTheseDays')}</label>
              <div className="flex flex-wrap gap-1.5">
                {weekdayOrder().map((day) => {
                  const label = weekdays[day];
                  const on = (draft.byWeekday ?? []).includes(day);
                  return (
                    <button
                      key={day} type="button" aria-pressed={on}
                      onClick={() => toggleWeekday(day)}
                      className={`px-3 py-1.5 rounded-btn text-[12px] font-bold capitalize border transition-colors cursor-pointer ${
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
              <label className={labelClass} htmlFor="routine-monthday">{t('routineModal.dayOfMonth')}</label>
              <input
                id="routine-monthday" type="number" min={1} max={31}
                className={`${inputClass} w-24`}
                value={draft.byMonthday ?? ''}
                onChange={(e) => set({ byMonthday: Number(e.target.value) || null })}
              />
              <p className={hintClass}>
                {t('routineModal.dayOfMonthHint')}
              </p>
            </div>
          )}

          {draft.cadence === 'season_relative' && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="routine-relative">{t('routineModal.daysRelative')}</label>
              <input
                id="routine-relative" type="number"
                className={`${inputClass} w-28`}
                value={draft.daysRelativeToOpening ?? 0}
                onChange={(e) => set({ daysRelativeToOpening: Number(e.target.value) || 0 })}
              />
              <p className={hintClass}>
                <Trans
                  t={t} i18nKey="routineModal.relativeHint"
                  components={{ b: <b dir="ltr" /> }}
                />
                {' '}
                {season
                  ? t('routineModal.seasonOpens', { date: formatDate(season.openingDate) })
                  : t('routineModal.noSeasonToCount')}
              </p>
            </div>
          )}

          {draft.cadence === 'on_turnover' && (
            <p className={hintClass}>
              {t('routineModal.onTurnoverHint')}
            </p>
          )}

          {needsAsset && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass} htmlFor="routine-meter-kind">{t('routineModal.counting')}</label>
                <select
                  id="routine-meter-kind" className={inputClass} value={draft.meterKind}
                  onChange={(e) => set({ meterKind: e.target.value as WorkSchedule['meterKind'], assetId: null })}
                >
                  <option value="hours">{t('routineModal.engineHours')}</option>
                  <option value="odometer">{t('routineModal.miles')}</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="routine-meter-interval">{t('routineModal.every')}</label>
                <input
                  id="routine-meter-interval" type="number" min={1}
                  className={inputClass}
                  value={draft.meterInterval ?? ''}
                  onChange={(e) => set({ meterInterval: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="routine-asset">{t('routineModal.asset')}</label>
                <select
                  id="routine-asset" className={inputClass} value={draft.assetId ?? ''}
                  onChange={(e) => set({ assetId: e.target.value || null })}
                >
                  <option value="">{t('routineModal.chooseOne')}</option>
                  {meterAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {meterAssets.length === 0 && (
                <p className={`${hintClass} sm:col-span-3`}>
                  {draft.meterKind === 'odometer'
                    ? t('routineModal.noAssetTracksMiles')
                    : t('routineModal.noAssetTracksHours')}
                </p>
              )}
            </div>
          )}

          {/* "Mopped by 3pm every Friday." Without this a routine can only say which day, and at a
              camp the hour is usually the point -- the hall has to be clear before the group walks
              into it. Copied onto every occurrence the generator raises. */}
          <div className="mt-4">
            <label className={labelClass} htmlFor="routine-due-time">{t('routineModal.dueBy')}</label>
            <input
              id="routine-due-time" type="time" className={`${inputClass} sm:w-40`}
              value={draft.dueTime?.slice(0, 5) ?? ''}
              onChange={(e) => set({ dueTime: e.target.value || null })}
            />
            <p className={hintClass}>
              {draft.dueTime
                ? t('routineModal.dueByHint', { time: fmtClock(draft.dueTime) })
                : t('routineModal.dueAnyTime')}
            </p>
          </div>

          {usesInterval && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="routine-anchor">{t('routineModal.startingFrom')}</label>
              <input
                id="routine-anchor" type="date" className={`${inputClass} sm:w-56`}
                value={draft.anchorDate ?? ''}
                onChange={(e) => set({ anchorDate: e.target.value || null })}
              />
              <p className={hintClass}>
                {t('routineModal.startingFromHint')}
              </p>
            </div>
          )}
        </div>

        {/* ── Who ──────────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[14px] font-bold text-forest mb-3">{t('routineModal.whoHeading')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="routine-assignee">{t('routineModal.assignee')}</label>
              <select
                id="routine-assignee" className={inputClass} value={draft.assigneeId ?? ''}
                onChange={(e) => set({ assigneeId: e.target.value || null })}
              >
                <option value="">{t('routineModal.defaultRouting')}</option>
                {assignableMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName ?? m.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-group">{t('shared.crew')}</label>
              <select
                id="routine-group" className={inputClass} value={draft.staffGroupId ?? ''}
                onChange={(e) => set({ staffGroupId: e.target.value || null })}
              >
                <option value="">{t('common:actions.none')}</option>
                {staffGroups.map((g) => <option key={g.id} value={g.id}>{seedCrewName(g.key, g.name)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-vendor">{t('routineModal.vendor')}</label>
              <select
                id="routine-vendor" className={inputClass} value={draft.vendorId ?? ''}
                onChange={(e) => set({ vendorId: e.target.value || null })}
              >
                <option value="">{t('routineModal.vendorNobody')}</option>
                {activeVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-template">{t('routineModal.checklist')}</label>
              <select
                id="routine-template" className={inputClass} value={draft.checklistTemplateId ?? ''}
                onChange={(e) => set({ checklistTemplateId: e.target.value || null })}
              >
                <option value="">{t('routineModal.noChecklist')}</option>
                {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Preview ──────────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <div className="bg-cream rounded-card border border-border px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <CalendarRange className="w-4 h-4 text-forest" aria-hidden="true" />
              <b className="text-[13px] text-forest">{cadenceText.describe(draft) || t('routineModal.notSetYet')}</b>
            </div>
            {draft.cadence === 'meter' ? (
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                {t('routineModal.meterPreview')}
              </p>
            ) : draft.cadence === 'on_turnover' ? (
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                {t('routineModal.turnoverPreview')}
              </p>
            ) : preview.length > 0 ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">
                  {t('routineModal.nextOccurrences', { count: preview.length })}
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {preview.map((d) => (
                    <li key={d} className="text-[12.5px] text-ink tabular-nums">{formatDate(d)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[12.5px] text-red-text leading-relaxed">
                {t('routineModal.nothingDue')}
              </p>
            )}
          </div>
        </div>

        {/* ── Everything else, folded away ─────────────────────────────────── */}
        {/* Most routines take the defaults here. A form that shows every knob at once
            makes a weekly bathhouse clean look like a configuration exercise. */}
        <div className="border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-forest transition-colors"
          >
            {/* Flipped only while closed: open it points down, and a flip composed with the
                rotation would point it up instead. */}
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : 'rtl:-scale-x-100'}`}
              aria-hidden="true"
            />
            {t('routineModal.moreSettings')}
          </button>

          {showAdvanced && (
            <div className="space-y-5 pt-4">
        {/* ── Active window ────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[14px] font-bold text-forest mb-1">{t('routineModal.activeWindow')}</h3>
          <p className="text-[12.5px] text-ink-soft leading-relaxed mb-3">
            {t('routineModal.activeWindowHint')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="routine-from">{t('routineModal.runsFrom')}</label>
              <input
                id="routine-from" type="date" className={inputClass}
                value={draft.activeFrom ?? ''}
                onChange={(e) => set({ activeFrom: e.target.value || null })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="routine-until">{t('routineModal.runsUntil')}</label>
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
              {t('routineModal.useSeason', {
                from: formatDate(season.openingDate), to: formatDate(season.closingDate),
              })}
            </button>
          )}
        </div>

        {/* ── Generation ───────────────────────────────────────────────────── */}
        <div className="border-t border-border pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="routine-ahead">{t('routineModal.raiseAhead')}</label>
            <input
              id="routine-ahead" type="number" min={0} max={90}
              className={`${inputClass} w-24`}
              value={draft.generateAheadDays}
              onChange={(e) => set({ generateAheadDays: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="routine-reschedule">{t('routineModal.countFrom')}</label>
            <select
              id="routine-reschedule" className={inputClass} value={draft.rescheduleFrom}
              onChange={(e) => set({ rescheduleFrom: e.target.value as WorkSchedule['rescheduleFrom'] })}
            >
              <option value="due_date">{t('routineModal.fromDue')}</option>
              <option value="completed_at">{t('routineModal.fromDone')}</option>
            </select>
            <p className={hintClass}>
              {t('routineModal.countFromHint')}
            </p>
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
            {t('routineModal.pause')}
            <span className="block text-[11.5px] text-ink-soft">
              {t('routineModal.pauseHint')}
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

            </div>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={save} disabled={problems.length > 0}>
            {isNew ? t('routineModal.create') : t('shared.saveChanges')}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
          {!isNew && (
            <div className="ms-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft">{t('shared.deleteIt')}</span>
                  <Button
                    variant="danger" size="sm"
                    onClick={() => { deleteSchedule(draft.id); onClose(); }}
                  >
                    {t('shared.yesDelete')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>{t('common:actions.no')}</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-faint hover:text-red transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t('common:actions.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
