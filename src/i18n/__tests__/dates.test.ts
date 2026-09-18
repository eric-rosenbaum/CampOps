// The date helpers in src/lib/utils.ts, said in each language. English must keep the exact
// strings it always produced; Spanish and Hebrew use the 24-hour clock and put the day first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n'; // what src/main.tsx does before anything renders
import { fmtClock, formatDate, formatDateTime, relativeDueDate, relativeTime } from '@/lib/utils';

afterEach(() => { vi.useRealTimers(); });

describe('fmtClock', () => {
  it('keeps 3pm in English', () => {
    expect(fmtClock('15:00', 'en')).toBe('3pm');
    expect(fmtClock('09:30:00', 'en')).toBe('9:30am');
  });
  it('uses the 24-hour clock in Spanish and Hebrew', () => {
    expect(fmtClock('15:00', 'es')).toBe('15:00');
    expect(fmtClock('9:05', 'he')).toBe('09:05');
  });
});

describe('relativeDueDate', () => {
  function at(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it('says overdue days in each language', () => {
    at('2026-09-18T10:00:00');
    expect(relativeDueDate('2026-09-15', null, 'en').label).toBe('Overdue 3 days');
    expect(relativeDueDate('2026-09-17', null, 'en').label).toBe('Overdue 1 day');
    expect(relativeDueDate('2026-09-15', null, 'es').label).toBe('Atrasada 3 días');
    expect(relativeDueDate('2026-09-16', null, 'he').label).toBe('באיחור של יומיים');
  });

  it('says today and tomorrow with the hour', () => {
    at('2026-09-18T10:00:00');
    expect(relativeDueDate('2026-09-18', '15:00', 'en').label).toBe('Due today by 3pm');
    expect(relativeDueDate('2026-09-18', '15:00', 'es').label).toBe('Vence hoy a las 15:00');
    expect(relativeDueDate('2026-09-19', '15:00', 'he').label).toBe('למחר עד 15:00');
    expect(relativeDueDate('2026-09-25', null, 'en').label).toBe('Due in 7 days');
  });

  it('is overdue past the hour on the day', () => {
    at('2026-09-18T17:00:00');
    const r = relativeDueDate('2026-09-18', '15:00', 'es');
    expect(r).toEqual({ label: 'Atrasada: vencía a las 15:00', overdue: true });
  });
});

describe('relativeTime', () => {
  it('counts minutes and hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00'));
    expect(relativeTime('2026-09-18T11:55:00', 'en')).toBe('5 mins ago');
    expect(relativeTime('2026-09-18T11:59:00', 'en')).toBe('1 min ago');
    expect(relativeTime('2026-09-18T09:00:00', 'es')).toBe('hace 3 h');
    expect(relativeTime('2026-09-18T10:00:00', 'he')).toBe('לפני שעתיים');
    expect(relativeTime('2026-09-17T10:00:00', 'es')).toBe('Ayer');
  });
});

describe('formatDate / formatDateTime', () => {
  it('keeps the English format exactly', () => {
    expect(formatDate('2026-09-18', 'en')).toBe('Sep 18, 2026');
    expect(formatDateTime('2026-09-18T15:05:00', 'en')).toBe('Sep 18, 2026 3:05 PM');
  });
  it('puts the day first in Spanish and Hebrew', () => {
    expect(formatDate('2026-09-18', 'es')).toMatch(/^18 sept?\.? 2026$/);
    expect(formatDate('2026-09-18', 'he')).toContain('18');
    expect(formatDateTime('2026-09-18T15:05:00', 'es')).toContain('15:05');
  });
});
