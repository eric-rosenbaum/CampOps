import { isYesterday, isThisWeek, format } from 'date-fns';
// The i18next singleton, not '@/i18n'. This file is also loaded by Playwright under plain Node
// (e2e → foodRequests → commissaryUnits → here), where importing src/i18n drags in the locale
// JSON, which Node's ESM loader refuses without an import attribute — every e2e spec failed to
// load. src/main.tsx initialises this same instance before anything renders; under Node nothing
// here that needs a string is called.
import i18n from 'i18next';
import type { Lang } from '../i18n';

function currentLang(): Lang {
  const l = i18n.language;
  return l === 'es' || l === 'he' ? l : 'en';
}

// ─── Language-aware formatting ───────────────────────────────────────────────
// Dates and times are said in the reader's language. English keeps the exact output it always
// had ("Sep 18", "3pm", "Overdue 3 days"), because tests and screenshots are written against
// it; Spanish and Hebrew use Intl, which knows that "18 sept" and "18 בספט׳" put the day first
// and that neither language says "3pm". Every helper takes an optional `lang` so a screen that
// stays English on purpose (the untranslated modules) can ask for English.

const INTL_TAG: Record<Lang, string> = { en: 'en-US', es: 'es', he: 'he-IL' };

function tr(lang: Lang) {
  return i18n.getFixedT(lang, 'shell');
}

export function relativeTime(isoString: string, lang: Lang = currentLang()): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const t = tr(lang);

  if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
  if (isYesterday(date)) return t('time.yesterday');
  if (lang === 'en') {
    if (isThisWeek(date)) return format(date, 'EEEE');
    return format(date, 'MMM d');
  }
  if (isThisWeek(date)) return new Intl.DateTimeFormat(INTL_TAG[lang], { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat(INTL_TAG[lang], { month: 'short', day: 'numeric' }).format(date);
}

// ─── Calendar-day helpers ────────────────────────────────────────────────────
// A YYYY-MM-DD in this app always means a CALENDAR day at the camp, never an instant.
// Serialising a Date through toISOString() and slicing the first ten characters is
// therefore wrong: it returns the UTC day, so from 8pm Eastern onwards it reports
// tomorrow. That is what put inventory run-out dates, default form dates and the menu a
// day out of step with each other. Use these helpers instead.

/** The local calendar day of a Date, as YYYY-MM-DD. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's local calendar day, as YYYY-MM-DD. */
export function todayStr(): string {
  return toDateStr(new Date());
}

/** Parse a YYYY-MM-DD as local midnight (not UTC midnight, which shifts the day). */
export function parseDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function formatDate(isoString: string, lang: Lang = currentLang()): string {
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight, which shifts to the
  // previous day in negative-offset timezones. Append T00:00:00 to force local midnight.
  const d = isoString.length === 10 ? new Date(isoString + 'T00:00:00') : new Date(isoString);
  if (lang === 'en') return format(d, 'MMM d, yyyy');
  return new Intl.DateTimeFormat(INTL_TAG[lang], { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function formatDateTime(isoString: string, lang: Lang = currentLang()): string {
  const d = new Date(isoString);
  if (lang === 'en') return format(d, 'MMM d, yyyy h:mm a');
  return new Intl.DateTimeFormat(INTL_TAG[lang], {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d);
}

export function formatCost(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function relativeDueDate(
  dueDateStr: string,
  dueTime?: string | null,
  lang: Lang = currentLang(),
): { label: string; overdue: boolean } {
  const due = new Date(dueDateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const t = tr(lang);

  // The hour only matters near the deadline. "Due in 9 days by 3pm" is noise; "Due today by 3pm"
  // is the difference between the hall being ready and the group standing in it.
  const time = dueTime ? fmtClock(dueTime, lang) : '';

  if (diffDays < 0) return { label: t('due.overdueDays', { count: Math.abs(diffDays) }), overdue: true };
  if (diffDays === 0) {
    // Past the hour, on the day it was due, is overdue -- a 3pm job at 5pm is late, and calling
    // that "Due today" is the reading that lets it slip.
    if (dueTime) {
      const now = new Date();
      const [h, m] = dueTime.split(':').map(Number);
      if (Number.isFinite(h) && (now.getHours() > h || (now.getHours() === h && now.getMinutes() > (m || 0)))) {
        return { label: t('due.overdueWasDue', { time }), overdue: true };
      }
    }
    return { label: time ? t('due.todayBy', { time }) : t('due.today'), overdue: false };
  }
  if (diffDays === 1) return { label: time ? t('due.tomorrowBy', { time }) : t('due.tomorrow'), overdue: false };
  return { label: t('due.inDays', { count: diffDays }), overdue: false };
}

export function generateId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for iOS < 15.4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Format a pool chemistry reading for display.
 *
 * Values are entered through `<input type="number" step="0.1">` on web and a `Stepper` with
 * a 0.1 step on iOS. Both do repeated binary float addition, so a perfectly ordinary reading
 * arrives as 6.900000000000002. Rounding to the field's real precision is the difference
 * between "pH 6.9" and a number that makes the app look broken.
 *
 * `Number()` drops trailing zeros, so 7.0 renders as "7" and 7.25 as "7.3" at 1 decimal.
 */
export function formatChemValue(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '-';
  return String(Number(value.toFixed(decimals)));
}

/** Round a chemistry reading to its real precision before storing it. */
export function roundChemValue(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

/**
 * First letter of the first and last word, "Marcus Tate" → MT, "Dana" → D.
 * Filters empty parts because names arrive with trailing whitespace ("Prakash ").
 */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A stored clock time as people say it: "15:00" -> "3pm", "15:30" -> "3:30pm" in English, and
 * "15:00" in Spanish and Hebrew, where the 24-hour clock is what a crew reads on every sign.
 *
 * These are camp-local wall-clock times, not instants — `due_time` is a bare `time` column
 * precisely so it is not reinterpreted against a timezone. So this formats the string rather than
 * routing it through Date, which would attach today's date and a UTC offset to something that has
 * neither.
 */
export function fmtClock(t: string | null | undefined, lang: Lang = currentLang()): string {
  if (!t) return '';
  const [hRaw, mRaw] = t.split(':');
  const h = Number(hRaw);
  if (!Number.isFinite(h)) return t;
  const m = Number(mRaw ?? '0');
  if (lang !== 'en') return `${String(h).padStart(2, '0')}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')}`;
  const suffix = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`;
}
