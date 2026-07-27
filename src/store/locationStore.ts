import { create } from 'zustand';
import type { CampLocation, LocationCategory, BuildingDetail } from '@/lib/types';
import {
  dbAddLocation, dbUpdateLocation, dbDeleteLocation, dbBulkAddLocations,
  dbAddCategory, dbDeleteCategory, dbUpsertBuildingDetail,
} from '@/lib/locationsDb';
import { generateId } from '@/lib/utils';

type NewLocation = Partial<CampLocation> & { name: string };

interface LocationState {
  locations: CampLocation[];
  categories: LocationCategory[];
  buildingDetails: BuildingDetail[];
  setLocations: (l: CampLocation[]) => void;
  setCategories: (c: LocationCategory[]) => void;
  setBuildingDetails: (b: BuildingDetail[]) => void;

  // selectors
  locationById: (id: string) => CampLocation | undefined;
  namesFor: (ids: string[]) => string[];
  childrenOf: (parentId: string | null) => CampLocation[];
  topLevel: () => CampLocation[];
  retreatDorms: () => CampLocation[];
  categoryById: (id: string | null) => LocationCategory | undefined;
  buildingDetailFor: (locationId: string) => BuildingDetail | undefined;
  /** Full "Parent › Child" display name for a node. */
  pathName: (id: string) => string;

  // actions
  addLocation: (partial: NewLocation) => CampLocation;
  updateLocation: (l: CampLocation) => void;
  deleteLocation: (id: string) => void;
  bulkAdd: (rows: NewLocation[]) => void;
  addCategory: (name: string) => LocationCategory;
  deleteCategory: (id: string) => void;
  upsertBuildingDetail: (bd: BuildingDetail) => void;
}

const now = () => new Date().toISOString();

function build(partial: NewLocation, sortOrder: number): CampLocation {
  return {
    id: generateId(), campId: '', parentId: partial.parentId ?? null, name: partial.name,
    categoryId: partial.categoryId ?? null, isDorm: partial.isDorm ?? false,
    retreatAvailable: partial.retreatAvailable ?? false, bedCapacity: partial.bedCapacity ?? null,
    accessible: partial.accessible ?? false, sortOrder: partial.sortOrder ?? sortOrder,
    isActive: partial.isActive ?? true, notes: partial.notes ?? null, createdAt: now(), updatedAt: now(),
  };
}

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: [], categories: [], buildingDetails: [],
  setLocations: (l) => set({ locations: l }),
  setCategories: (c) => set({ categories: c }),
  setBuildingDetails: (b) => set({ buildingDetails: b }),

  locationById: (id) => get().locations.find((l) => l.id === id),
  namesFor: (ids) => ids.map((id) => get().locations.find((l) => l.id === id)?.name).filter(Boolean) as string[],
  childrenOf: (parentId) => get().locations.filter((l) => l.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder),
  topLevel: () => get().locations.filter((l) => l.parentId == null).sort((a, b) => a.sortOrder - b.sortOrder),
  retreatDorms: () => get().locations.filter((l) => l.isDorm && l.retreatAvailable && l.isActive).sort((a, b) => a.name.localeCompare(b.name)),
  categoryById: (id) => (id == null ? undefined : get().categories.find((c) => c.id === id)),
  buildingDetailFor: (locationId) => get().buildingDetails.find((b) => b.locationId === locationId),
  pathName: (id) => {
    const byId = get().locations;
    const parts: string[] = [];
    let cur = byId.find((l) => l.id === id);
    let guard = 0;
    while (cur && guard++ < 20) { parts.unshift(cur.name); cur = cur.parentId ? byId.find((l) => l.id === cur!.parentId) : undefined; }
    return parts.join(' › ');
  },

  addLocation: (partial) => {
    const l = build(partial, get().locations.length);
    set((s) => ({ locations: [...s.locations, l] })); dbAddLocation(l); return l;
  },
  updateLocation: (l) => { const updated = { ...l, updatedAt: now() }; set((s) => ({ locations: s.locations.map((x) => x.id === l.id ? updated : x) })); dbUpdateLocation(updated); },
  deleteLocation: (id) => {
    const all = get().locations; const remove = new Set<string>([id]);
    let changed = true;
    while (changed) { changed = false; for (const l of all) { if (l.parentId && remove.has(l.parentId) && !remove.has(l.id)) { remove.add(l.id); changed = true; } } }
    set((s) => ({ locations: s.locations.filter((l) => !remove.has(l.id)) })); dbDeleteLocation(id);
  },
  bulkAdd: (rows) => {
    const base = get().locations.length;
    const created = rows.map((r, i) => build(r, base + i));
    set((s) => ({ locations: [...s.locations, ...created] })); dbBulkAddLocations(created);
  },
  addCategory: (name) => { const c: LocationCategory = { id: generateId(), campId: '', name, sortOrder: get().categories.length, isPreset: false }; set((s) => ({ categories: [...s.categories, c] })); dbAddCategory(c); return c; },
  deleteCategory: (id) => { set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })); dbDeleteCategory(id); },
  upsertBuildingDetail: (bd) => { set((s) => ({ buildingDetails: [...s.buildingDetails.filter((b) => b.locationId !== bd.locationId), bd] })); dbUpsertBuildingDetail(bd); },
}));
