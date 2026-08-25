import { isYesterday, isThisWeek, format } from 'date-fns';

export function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEEE');
  return format(date, 'MMM d');
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

export function formatDate(isoString: string): string {
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight, which shifts to the
  // previous day in negative-offset timezones. Append T00:00:00 to force local midnight.
  const d = isoString.length === 10 ? new Date(isoString + 'T00:00:00') : new Date(isoString);
  return format(d, 'MMM d, yyyy');
}

export function formatDateTime(isoString: string): string {
  return format(new Date(isoString), 'MMM d, yyyy h:mm a');
}

export function formatCost(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function relativeDueDate(dueDateStr: string): { label: string; overdue: boolean } {
  const due = new Date(dueDateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: `Overdue ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`, overdue: true };
  if (diffDays === 0) return { label: 'Due today', overdue: false };
  if (diffDays === 1) return { label: 'Due tomorrow', overdue: false };
  return { label: `Due in ${diffDays} days`, overdue: false };
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
