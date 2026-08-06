// Data layer for the unified locations tree (the single camp-wide inventory of physical
// places). Realtime over locations + location_categories + building_details.
import { supabase } from './supabase';
import { campLog, campError } from './campLog';
import { getCampId } from './db';
import { loadAndApply, debounce, WAL_DEBOUNCE_MS } from './syncGuard';
import type { CampLocation, LocationCategory, BuildingDetail } from './types';

type Row = Record<string, unknown>;

export function rowToLocation(r: Row): CampLocation {
  return {
    id: r.id as string, campId: r.camp_id as string, parentId: (r.parent_id as string) ?? null,
    name: r.name as string, categoryId: (r.category_id as string) ?? null,
    isDorm: Boolean(r.is_dorm), retreatAvailable: Boolean(r.retreat_available),
    bedCapacity: r.bed_capacity == null ? null : Number(r.bed_capacity),
    accessible: Boolean(r.accessible), sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active), notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}
export function rowToCategory(r: Row): LocationCategory {
  return { id: r.id as string, campId: r.camp_id as string, name: r.name as string, sortOrder: Number(r.sort_order ?? 0), isPreset: Boolean(r.is_preset) };
}
export function rowToBuildingDetail(r: Row): BuildingDetail {
  return {
    locationId: r.location_id as string, campId: r.camp_id as string, buildingType: (r.building_type as string) ?? null,
    mainWaterShutoff: (r.main_water_shutoff as string) ?? null, mainElectricalPanel: (r.main_electrical_panel as string) ?? null,
    mainGasShutoff: (r.main_gas_shutoff as string) ?? null, yearBuilt: r.year_built == null ? null : Number(r.year_built),
  };
}

function locationToRow(l: CampLocation): Row {
  return {
    id: l.id, camp_id: getCampId(), parent_id: l.parentId, name: l.name, category_id: l.categoryId,
    is_dorm: l.isDorm, retreat_available: l.retreatAvailable, bed_capacity: l.bedCapacity,
    accessible: l.accessible, sort_order: l.sortOrder, is_active: l.isActive, notes: l.notes,
  };
}

export interface LocationData { locations: CampLocation[]; categories: LocationCategory[]; buildingDetails: BuildingDetail[]; }

async function loadInner(campId: string): Promise<LocationData> {
  const [locs, cats, bds] = await Promise.all([
    supabase.from('locations').select('*').eq('camp_id', campId).order('sort_order'),
    supabase.from('location_categories').select('*').eq('camp_id', campId).order('sort_order'),
    supabase.from('building_details').select('*').eq('camp_id', campId),
  ]);
  return {
    locations: (locs.data ?? []).map((r) => rowToLocation(r as Row)),
    categories: (cats.data ?? []).map((r) => rowToCategory(r as Row)),
    buildingDetails: (bds.data ?? []).map((r) => rowToBuildingDetail(r as Row)),
  };
}
export const loadLocations = loadInner;

const LOCATION_TABLES = ['locations', 'location_categories', 'building_details'] as const;
let locChannelCount = 0;
export function subscribeToLocations(campId: string, onUpdate: (d: LocationData) => void): () => void {
  const reload = () => loadAndApply('locations', () => loadInner(campId), onUpdate);
  const onWal = debounce(reload, WAL_DEBOUNCE_MS);
  let channel = supabase.channel(`locations-${++locChannelCount}`);
  for (const table of LOCATION_TABLES) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `camp_id=eq.${campId}` }, onWal);
  }
  let everSubscribed = false;
  channel.subscribe((status) => {
    campLog(`[CampOps] locations status:`, status);
    if (status === 'SUBSCRIBED') {
      if (everSubscribed) { setTimeout(() => reload(), 10000); } else everSubscribed = true;
    }
  });
  return () => { supabase.removeChannel(channel); };
}

// ─── Writers (optimistic in store; fire-and-forget here) ────────────────────────
export async function dbAddLocation(l: CampLocation) { const { error } = await supabase.from('locations').insert(locationToRow(l)); if (error) campError('add location', error.message); }
export async function dbUpdateLocation(l: CampLocation) { const { error } = await supabase.from('locations').update(locationToRow(l)).eq('id', l.id); if (error) campError('update location', error.message); }
export async function dbDeleteLocation(id: string) { const { error } = await supabase.from('locations').delete().eq('id', id); if (error) campError('delete location', error.message); }
export async function dbBulkAddLocations(rows: CampLocation[]) { if (!rows.length) return; const { error } = await supabase.from('locations').insert(rows.map(locationToRow)); if (error) campError('bulk add locations', error.message); }

export async function dbAddCategory(c: LocationCategory) { const { error } = await supabase.from('location_categories').insert({ id: c.id, camp_id: getCampId(), name: c.name, sort_order: c.sortOrder, is_preset: false }); if (error) campError('add category', error.message); }
export async function dbDeleteCategory(id: string) { const { error } = await supabase.from('location_categories').delete().eq('id', id); if (error) campError('delete category', error.message); }

// White-glove hand-off: a camp drops their raw location list and the CampCommand team
// sets it up manually. File lands in the private `location-imports` bucket under the
// camp's folder. Returns true on success.
export async function dbUploadLocationImport(file: File): Promise<boolean> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${getCampId()}/${new Date().toISOString().replace(/[:.]/g, '-')}-${safe}`;
  const { error } = await supabase.storage.from('location-imports').upload(path, file, { upsert: false });
  if (error) { campError('upload location import', error.message); return false; }
  return true;
}

export async function dbUpsertBuildingDetail(bd: BuildingDetail) {
  const { error } = await supabase.from('building_details').upsert({
    location_id: bd.locationId, camp_id: getCampId(), building_type: bd.buildingType,
    main_water_shutoff: bd.mainWaterShutoff, main_electrical_panel: bd.mainElectricalPanel,
    main_gas_shutoff: bd.mainGasShutoff, year_built: bd.yearBuilt,
  }, { onConflict: 'location_id' });
  if (error) campError('save building detail', error.message);
}
