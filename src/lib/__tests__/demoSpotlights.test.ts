import { describe, it, expect } from 'vitest';
import { fillHref, resolveSpotlights, defaultBriefSpotlights, SPOTLIGHTS, SEEDABLE } from '@/lib/demoSpotlights';

const allOn = () => true;

describe('resolveSpotlights', () => {
  it('shows nothing without a brief', () => {
    expect(resolveSpotlights(null, allOn)).toEqual([]);
  });

  it('keeps the brief order and drops disabled entries', () => {
    const out = resolveSpotlights({ spotlights: [
      { key: 'receipts', enabled: true },
      { key: 'food_requests', enabled: false },
      { key: 'town_trips', enabled: true },
    ] }, allOn);
    expect(out.map((s) => s.key)).toEqual(['receipts', 'town_trips']);
  });

  it('hides a spotlight whose module the camp does not have, instead of linking to a redirect', () => {
    const out = resolveSpotlights({ spotlights: defaultBriefSpotlights(['food_requests', 'town_trips']) },
      (k) => k !== 'trips');
    expect(out.map((s) => s.key)).toEqual(['food_requests']);
  });

  it('uses brief copy where written and the default where blank', () => {
    const [s] = resolveSpotlights({ spotlights: [
      { key: 'food_requests', enabled: true, you_told_us: '  Cooking club forgets pickups.  ', what_we_built: '   ' },
    ] }, allOn);
    expect(s.youToldUs).toBe('Cooking club forgets pickups.');
    expect(s.whatWeBuilt).toBe(SPOTLIGHTS.find((t) => t.key === 'food_requests')!.whatWeBuilt);
  });

  it('ignores unknown keys and duplicates from an older brief', () => {
    const out = resolveSpotlights({ spotlights: [
      // @ts-expect-error a key this build no longer knows
      { key: 'pool_scan', enabled: true },
      { key: 'receipts', enabled: true },
      { key: 'receipts', enabled: true },
    ] }, allOn);
    expect(out.map((s) => s.key)).toEqual(['receipts']);
  });
});

describe('fillHref', () => {
  it('fills placeholders', () => {
    expect(fillHref('{foodLink}', { foodLink: 'https://x/food/abc' })).toBe('https://x/food/abc');
  });
  it('returns null when a placeholder is missing, so no broken button renders', () => {
    expect(fillHref('{foodLink}', {})).toBeNull();
    expect(fillHref(undefined, {})).toBeNull();
  });
  it('passes plain routes through', () => {
    expect(fillHref('/commissary?tab=requests', {})).toBe('/commissary?tab=requests');
  });
});

describe('templates', () => {
  it('every step has a check and every seedable spotlight exists', () => {
    for (const t of SPOTLIGHTS) for (const st of t.steps) expect(st.check).toBeTruthy();
    for (const k of SEEDABLE) expect(SPOTLIGHTS.some((t) => t.key === k)).toBe(true);
  });
});
