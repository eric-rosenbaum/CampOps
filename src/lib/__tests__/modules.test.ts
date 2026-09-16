import { describe, it, expect, vi } from 'vitest';

// modules.ts exports a hook that reads the camp store; the store pulls in the Supabase client,
// which needs a browser. The pure functions under test never touch it.
vi.mock('@/store/campStore', () => ({ useCampStore: () => null }));
import { readSwitch, platformAllows, campWants, moduleEnabled, moduleForPath, MODULES } from '@/lib/modules';

const camp = (platformModules: Record<string, boolean>, modules: Record<string, boolean> = {}) =>
  ({ platformModules, modules });

describe('module switches', () => {
  it('reads an absent key as on for the original modules', () => {
    expect(platformAllows(camp({}), 'commissary')).toBe(true);
    expect(platformAllows(camp({}), 'retreats')).toBe(true);
  });

  it('reads an absent key as OFF for opt-in modules, so a deploy never switches them on everywhere', () => {
    expect(platformAllows(camp({}), 'trips')).toBe(false);
    expect(platformAllows(camp({}), 'receipts')).toBe(false);
    expect(moduleEnabled(camp({}), 'trips')).toBe(false);
  });

  it('sells an opt-in module only when explicitly true', () => {
    expect(moduleEnabled(camp({ trips: true }), 'trips')).toBe(true);
    expect(moduleEnabled(camp({ trips: true }, { trips: false }), 'trips')).toBe(false);
  });

  it('once sold, the camp switch still reads absent as on', () => {
    expect(campWants(camp({ receipts: true }, {}), 'receipts')).toBe(true);
  });

  it('still honours old alias keys', () => {
    expect(readSwitch({ kitchen: false }, 'commissary')).toBe(false);
    expect(readSwitch({ building_systems: false }, 'building')).toBe(false);
  });

  it('null objects fall back to the module default', () => {
    expect(platformAllows(null, 'trips')).toBe(false);
    expect(platformAllows(null, 'pool')).toBe(true);
  });

  it('routes belong to their module', () => {
    expect(moduleForPath('/trips')).toBe('trips');
    expect(moduleForPath('/receipts/reconcile')).toBe('receipts');
    expect(MODULES.filter((m) => !m.defaultOn).map((m) => m.key).sort()).toEqual(['receipts', 'trips']);
  });
});
