import { describe, it, expect, beforeEach } from 'vitest';
import { deviceRequestsFor, forgetDeviceRequest, rememberDeviceRequest } from '@/lib/foodDeviceRequests';
import { formatPackQty, pluralizeUnit } from '@/lib/commissaryUnits';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe('requests remembered on this phone', () => {
  beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = memoryStorage(); });

  it('lists this program link’s requests, newest first, once each', () => {
    rememberDeviceRequest('club', 's1', new Date('2026-07-10T10:00:00Z'));
    rememberDeviceRequest('canoe', 's2', new Date('2026-07-11T10:00:00Z'));
    rememberDeviceRequest('club', 's3', new Date('2026-07-12T10:00:00Z'));
    rememberDeviceRequest('club', 's1', new Date('2026-07-13T10:00:00Z'));
    expect(deviceRequestsFor('club').map((r) => r.statusToken)).toEqual(['s1', 's3']);
    forgetDeviceRequest('s1');
    expect(deviceRequestsFor('club').map((r) => r.statusToken)).toEqual(['s3']);
  });

  it('works without storage, and survives junk in it', () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => rememberDeviceRequest('club', 's1')).not.toThrow();
    expect(deviceRequestsFor('club')).toEqual([]);
    const s = memoryStorage();
    s.setItem('campcommand-food-requests-v1', '{"not":"a list"}');
    (globalThis as { localStorage?: unknown }).localStorage = s;
    expect(deviceRequestsFor('club')).toEqual([]);
  });
});

describe('packs and units read like a person wrote them', () => {
  it('never prints two numbers side by side', () => {
    expect(formatPackQty(1, '50 lb bag')).toBe('1 × 50 lb bag');
    expect(formatPackQty(2, '50 lb bag')).toBe('2 × 50 lb bags');
    expect(formatPackQty(3, 'case')).toBe('3 cases');
    expect(pluralizeUnit('case of 12', 2)).toBe('cases of 12');
    expect(pluralizeUnit('dozen', 10)).toBe('dozen');
  });
});
