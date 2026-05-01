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
  const due = new Date(dueDateStr);
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
  return crypto.randomUUID();
}
