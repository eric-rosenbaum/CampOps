import { create } from 'zustand';
import type {
  Building, BuildingRoom, BuildingComponent, BuildingCircuit, BuildingSeasonalTask,
  BuildingType, BuildingSystem, ComponentStatus, SeasonalPhase,
} from '@/lib/types';
import {
  dbAddBuilding, dbUpdateBuilding, dbDeleteBuilding,
  dbAddRoom, dbUpdateRoom, dbDeleteRoom,
  dbAddComponent, dbUpdateComponent, dbDeleteComponent,
  dbAddCircuit, dbUpdateCircuit, dbDeleteCircuit,
  dbAddBuildingSeasonalTask, dbUpdateBuildingSeasonalTask,
  dbToggleBuildingSeasonalTask, dbDeleteBuildingSeasonalTask,
} from '@/lib/db';

export type BuildingTab = 'buildings' | 'electrical' | 'plumbing' | 'seasonal';

// Discriminated modal state for the module. Components dispatch `openModal`; the
// page renders the matching modal. Keeps modal wiring out of prop-drilling.
export type BuildingModal =
  | { kind: 'building'; editId?: string }
  | { kind: 'room'; buildingId: string; editId?: string }
  | { kind: 'component'; buildingId: string; editId?: string; defaultRoomId?: string | null; defaultSystem?: BuildingSystem }
  | { kind: 'circuit'; panelId: string; editId?: string }
  | { kind: 'seasonal'; editId?: string; defaultPhase?: SeasonalPhase }
  | { kind: 'flag'; componentId: string };

// ─── Taxonomy / labels ──────────────────────────────────────────────────────

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  cabin: 'Cabin',
  bathhouse: 'Bathhouse',
  dining_hall: 'Dining Hall',
  kitchen: 'Kitchen',
  infirmary: 'Infirmary / Health',
  office: 'Office',
  activity: 'Activity Building',
  storage: 'Storage',
  utility: 'Utility / Mechanical',
  other: 'Other',
};

export const STATUS_LABELS: Record<ComponentStatus, string> = {
  operational: 'Operational',
  needs_attention: 'Needs attention',
  out_of_service: 'Out of service',
};

export interface ComponentTypeDef {
  value: string;
  label: string;
  system: BuildingSystem;
}

export const ELECTRICAL_TYPES: ComponentTypeDef[] = [
  { value: 'breaker_panel', label: 'Breaker panel', system: 'electrical' },
  { value: 'sub_panel', label: 'Sub-panel', system: 'electrical' },
  { value: 'outlet', label: 'Outlet', system: 'electrical' },
  { value: 'light_fixture', label: 'Light fixture', system: 'electrical' },
  { value: 'switch', label: 'Switch', system: 'electrical' },
  { value: 'exterior_light', label: 'Exterior light', system: 'electrical' },
  { value: 'generator', label: 'Generator', system: 'electrical' },
  { value: 'transfer_switch', label: 'Transfer switch', system: 'electrical' },
  { value: 'other_electrical', label: 'Other electrical', system: 'electrical' },
];

export const PLUMBING_TYPES: ComponentTypeDef[] = [
  { value: 'shutoff_valve', label: 'Shutoff valve', system: 'plumbing' },
  { value: 'water_heater', label: 'Water heater', system: 'plumbing' },
  { value: 'well_pump', label: 'Well pump', system: 'plumbing' },
  { value: 'backflow_preventer', label: 'Backflow preventer', system: 'plumbing' },
  { value: 'toilet', label: 'Toilet', system: 'plumbing' },
  { value: 'sink', label: 'Sink', system: 'plumbing' },
  { value: 'shower', label: 'Shower', system: 'plumbing' },
  { value: 'urinal', label: 'Urinal', system: 'plumbing' },
  { value: 'water_fountain', label: 'Water fountain', system: 'plumbing' },
  { value: 'hose_bib', label: 'Hose bib / spigot', system: 'plumbing' },
  { value: 'sump_pump', label: 'Sump pump', system: 'plumbing' },
  { value: 'septic', label: 'Septic', system: 'plumbing' },
  { value: 'other_plumbing', label: 'Other plumbing', system: 'plumbing' },
];

export const ALL_COMPONENT_TYPES = [...ELECTRICAL_TYPES, ...PLUMBING_TYPES];

export const COMPONENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_COMPONENT_TYPES.map((t) => [t.value, t.label]),
);

export function componentTypesFor(system: BuildingSystem): ComponentTypeDef[] {
  return system === 'electrical' ? ELECTRICAL_TYPES : PLUMBING_TYPES;
}

// One-line spec summary derived from a component's metadata, for compact rows.
export function componentSummary(c: { type: string; metadata: Record<string, unknown> }): string {
  const m = c.metadata ?? {};
  const parts: string[] = [];
  switch (c.type) {
    case 'outlet':
      if (m.isGfci) parts.push('GFCI');
      if (m.voltage) parts.push(`${m.voltage}V`);
      if (m.count) parts.push(`${m.count}×`);
      break;
    case 'light_fixture':
    case 'exterior_light':
      if (m.bulbType) parts.push(String(m.bulbType));
      if (m.bulbCount) parts.push(`${m.bulbCount} bulb${Number(m.bulbCount) === 1 ? '' : 's'}`);
      if (m.isMotionSensor) parts.push('motion');
      break;
    case 'breaker_panel':
    case 'sub_panel':
      if (m.amperageRating) parts.push(`${m.amperageRating}A`);
      if (m.breakerCount) parts.push(`${m.breakerCount} breakers`);
      break;
    case 'generator':
      if (m.wattage) parts.push(`${m.wattage}W`);
      if (m.fuelType) parts.push(String(m.fuelType));
      break;
    case 'shutoff_valve':
      if (m.valveType) parts.push(`${m.valveType} valve`);
      if (m.serves) parts.push(`serves ${m.serves}`);
      break;
    case 'water_heater':
      if (m.gallons) parts.push(`${m.gallons} gal`);
      if (m.fuelType) parts.push(String(m.fuelType));
      break;
    case 'well_pump':
    case 'sump_pump':
      if (m.horsepower) parts.push(`${m.horsepower} HP`);
      break;
    case 'toilet':
    case 'sink':
    case 'shower':
    case 'urinal':
      if (m.count) parts.push(`${m.count}×`);
      break;
  }
  return parts.join(' · ');
}

// Type-specific spec fields, rendered dynamically in the add/edit component form
// and stored on `component.metadata`. Types not listed here get no extra fields.
export interface SpecField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'bool' | 'select';
  options?: { value: string; label: string }[];
}

export const COMPONENT_SPECS: Record<string, SpecField[]> = {
  outlet: [
    { key: 'isGfci', label: 'GFCI protected', kind: 'bool' },
    { key: 'voltage', label: 'Voltage', kind: 'select', options: [
      { value: '120', label: '120V' }, { value: '240', label: '240V' }] },
    { key: 'count', label: 'Number of outlets', kind: 'number' },
  ],
  light_fixture: [
    { key: 'bulbType', label: 'Bulb type', kind: 'text' },
    { key: 'bulbCount', label: 'Bulb count', kind: 'number' },
  ],
  exterior_light: [
    { key: 'bulbType', label: 'Bulb type', kind: 'text' },
    { key: 'isMotionSensor', label: 'Motion sensor', kind: 'bool' },
  ],
  breaker_panel: [
    { key: 'amperageRating', label: 'Panel rating (A)', kind: 'number' },
    { key: 'breakerCount', label: 'Number of breakers', kind: 'number' },
  ],
  sub_panel: [
    { key: 'amperageRating', label: 'Panel rating (A)', kind: 'number' },
    { key: 'fedFrom', label: 'Fed from', kind: 'text' },
  ],
  generator: [
    { key: 'fuelType', label: 'Fuel type', kind: 'select', options: [
      { value: 'propane', label: 'Propane' }, { value: 'diesel', label: 'Diesel' },
      { value: 'gasoline', label: 'Gasoline' }, { value: 'natural_gas', label: 'Natural gas' }] },
    { key: 'wattage', label: 'Output (watts)', kind: 'number' },
  ],
  transfer_switch: [
    { key: 'isAutomatic', label: 'Automatic', kind: 'bool' },
  ],
  shutoff_valve: [
    { key: 'valveType', label: 'Valve type', kind: 'select', options: [
      { value: 'gate', label: 'Gate' }, { value: 'ball', label: 'Ball' },
      { value: 'other', label: 'Other' }] },
    { key: 'serves', label: 'What it serves', kind: 'text' },
  ],
  water_heater: [
    { key: 'gallons', label: 'Capacity (gal)', kind: 'number' },
    { key: 'fuelType', label: 'Fuel type', kind: 'select', options: [
      { value: 'electric', label: 'Electric' }, { value: 'propane', label: 'Propane' },
      { value: 'natural_gas', label: 'Natural gas' }, { value: 'oil', label: 'Oil' }] },
    { key: 'brand', label: 'Brand', kind: 'text' },
  ],
  well_pump: [
    { key: 'horsepower', label: 'Horsepower', kind: 'number' },
    { key: 'depth', label: 'Well depth', kind: 'text' },
  ],
  backflow_preventer: [
    { key: 'deviceType', label: 'Device type', kind: 'text' },
  ],
  sump_pump: [
    { key: 'horsepower', label: 'Horsepower', kind: 'number' },
  ],
  septic: [
    { key: 'capacityGallons', label: 'Tank capacity (gal)', kind: 'number' },
    { key: 'lastPumped', label: 'Last pumped', kind: 'text' },
  ],
  toilet: [{ key: 'count', label: 'Count', kind: 'number' }],
  sink: [{ key: 'count', label: 'Count', kind: 'number' }],
  shower: [{ key: 'count', label: 'Count', kind: 'number' }],
  urinal: [{ key: 'count', label: 'Count', kind: 'number' }],
};

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_RANK: Record<ComponentStatus, number> = {
  operational: 0, needs_attention: 1, out_of_service: 2,
};

export function worstStatus(statuses: ComponentStatus[]): ComponentStatus {
  return statuses.reduce<ComponentStatus>(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    'operational',
  );
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface BuildingState {
  activeTab: BuildingTab;
  activeBuildingId: string | null;
  activeComponentId: string | null;
  modal: BuildingModal | null;

  buildings: Building[];
  rooms: BuildingRoom[];
  components: BuildingComponent[];
  circuits: BuildingCircuit[];
  seasonalTasks: BuildingSeasonalTask[];

  setActiveTab: (tab: BuildingTab) => void;
  setActiveBuilding: (id: string | null) => void;
  setActiveComponent: (id: string | null) => void;
  openModal: (m: BuildingModal) => void;
  closeModal: () => void;

  setBuildings: (rows: Building[]) => void;
  setRooms: (rows: BuildingRoom[]) => void;
  setComponents: (rows: BuildingComponent[]) => void;
  setCircuits: (rows: BuildingCircuit[]) => void;
  setSeasonalTasks: (rows: BuildingSeasonalTask[]) => void;

  addBuilding: (b: Building) => void;
  updateBuilding: (b: Building) => void;
  deleteBuilding: (id: string) => void;

  addRoom: (r: BuildingRoom) => void;
  updateRoom: (r: BuildingRoom) => void;
  deleteRoom: (id: string) => void;

  addComponent: (c: BuildingComponent) => void;
  updateComponent: (c: BuildingComponent) => void;
  deleteComponent: (id: string) => void;

  addCircuit: (c: BuildingCircuit) => void;
  updateCircuit: (c: BuildingCircuit) => void;
  deleteCircuit: (id: string) => void;

  addSeasonalTask: (t: BuildingSeasonalTask) => void;
  updateSeasonalTask: (id: string, patch: Partial<BuildingSeasonalTask>) => void;
  toggleSeasonalTask: (id: string, userName: string) => void;
  deleteSeasonalTask: (id: string) => void;

  // Selectors
  activeBuilding: () => Building | null;
  activeComponent: () => BuildingComponent | null;
  roomsForBuilding: (buildingId: string) => BuildingRoom[];
  componentsForBuilding: (buildingId: string) => BuildingComponent[];
  componentsForRoom: (roomId: string | null, buildingId: string) => BuildingComponent[];
  circuitsForPanel: (panelId: string) => BuildingCircuit[];
  buildingStatus: (buildingId: string) => ComponentStatus;
  panels: () => BuildingComponent[];
  shutoffValves: () => BuildingComponent[];
  seasonalProgressByPhase: (phase: SeasonalPhase) => { total: number; done: number };
}

export const useBuildingStore = create<BuildingState>((set, get) => ({
  activeTab: 'buildings',
  activeBuildingId: null,
  activeComponentId: null,
  modal: null,

  buildings: [],
  rooms: [],
  components: [],
  circuits: [],
  seasonalTasks: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveBuilding: (id) => set({ activeBuildingId: id, activeComponentId: null }),
  setActiveComponent: (id) => set({ activeComponentId: id }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),

  setBuildings: (rows) => set({ buildings: rows }),
  setRooms: (rows) => set({ rooms: rows }),
  setComponents: (rows) => set({ components: rows }),
  setCircuits: (rows) => set({ circuits: rows }),
  setSeasonalTasks: (rows) => set({ seasonalTasks: rows }),

  addBuilding: (b) => {
    set((s) => ({ buildings: [...s.buildings, b] }));
    dbAddBuilding(b);
  },
  updateBuilding: (b) => {
    set((s) => ({ buildings: s.buildings.map((x) => x.id === b.id ? b : x) }));
    dbUpdateBuilding(b);
  },
  deleteBuilding: (id) => {
    set((s) => ({
      buildings: s.buildings.filter((b) => b.id !== id),
      rooms: s.rooms.filter((r) => r.buildingId !== id),
      components: s.components.filter((c) => c.buildingId !== id),
      seasonalTasks: s.seasonalTasks.filter((t) => t.buildingId !== id),
      activeBuildingId: s.activeBuildingId === id ? null : s.activeBuildingId,
    }));
    dbDeleteBuilding(id);
  },

  addRoom: (r) => {
    set((s) => ({ rooms: [...s.rooms, r] }));
    dbAddRoom(r);
  },
  updateRoom: (r) => {
    set((s) => ({ rooms: s.rooms.map((x) => x.id === r.id ? r : x) }));
    dbUpdateRoom(r);
  },
  deleteRoom: (id) => {
    set((s) => ({
      rooms: s.rooms.filter((r) => r.id !== id),
      // Components in a deleted room fall back to "unassigned" (room_id set null in DB).
      components: s.components.map((c) => c.roomId === id ? { ...c, roomId: null } : c),
    }));
    dbDeleteRoom(id);
  },

  addComponent: (c) => {
    set((s) => ({ components: [...s.components, c] }));
    dbAddComponent(c);
  },
  updateComponent: (c) => {
    set((s) => ({ components: s.components.map((x) => x.id === c.id ? c : x) }));
    dbUpdateComponent(c);
  },
  deleteComponent: (id) => {
    set((s) => ({
      components: s.components.filter((c) => c.id !== id),
      circuits: s.circuits.filter((ci) => ci.panelId !== id),
      activeComponentId: s.activeComponentId === id ? null : s.activeComponentId,
    }));
    dbDeleteComponent(id);
  },

  addCircuit: (c) => {
    set((s) => ({ circuits: [...s.circuits, c] }));
    dbAddCircuit(c);
  },
  updateCircuit: (c) => {
    set((s) => ({ circuits: s.circuits.map((x) => x.id === c.id ? c : x) }));
    dbUpdateCircuit(c);
  },
  deleteCircuit: (id) => {
    set((s) => ({ circuits: s.circuits.filter((c) => c.id !== id) }));
    dbDeleteCircuit(id);
  },

  addSeasonalTask: (t) => {
    set((s) => ({ seasonalTasks: [...s.seasonalTasks, t] }));
    dbAddBuildingSeasonalTask(t);
  },
  updateSeasonalTask: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      seasonalTasks: s.seasonalTasks.map((t) => t.id === id ? { ...t, ...patch, updatedAt: now } : t),
    }));
    dbUpdateBuildingSeasonalTask(id, patch);
  },
  toggleSeasonalTask: (id, userName) => {
    const now = new Date().toISOString();
    const nowDate = now.slice(0, 10);
    set((s) => ({
      seasonalTasks: s.seasonalTasks.map((t) => {
        if (t.id !== id) return t;
        const nowComplete = !t.isComplete;
        return {
          ...t,
          isComplete: nowComplete,
          completedBy: nowComplete ? userName : null,
          completedDate: nowComplete ? nowDate : null,
          updatedAt: now,
        };
      }),
    }));
    const task = get().seasonalTasks.find((t) => t.id === id);
    if (task) dbToggleBuildingSeasonalTask(task.id, task.isComplete, task.completedBy, task.completedDate);
  },
  deleteSeasonalTask: (id) => {
    set((s) => ({ seasonalTasks: s.seasonalTasks.filter((t) => t.id !== id) }));
    dbDeleteBuildingSeasonalTask(id);
  },

  // ─── Selectors ──────────────────────────────────────────────────────────────

  activeBuilding: () => {
    const { buildings, activeBuildingId } = get();
    return buildings.find((b) => b.id === activeBuildingId) ?? null;
  },
  activeComponent: () => {
    const { components, activeComponentId } = get();
    return components.find((c) => c.id === activeComponentId) ?? null;
  },
  roomsForBuilding: (buildingId) =>
    get().rooms.filter((r) => r.buildingId === buildingId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  componentsForBuilding: (buildingId) =>
    get().components.filter((c) => c.buildingId === buildingId),
  componentsForRoom: (roomId, buildingId) =>
    get().components.filter((c) => c.buildingId === buildingId && c.roomId === roomId),
  circuitsForPanel: (panelId) =>
    get().circuits.filter((c) => c.panelId === panelId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  buildingStatus: (buildingId) =>
    worstStatus(get().components.filter((c) => c.buildingId === buildingId).map((c) => c.status)),
  panels: () =>
    get().components.filter((c) => c.type === 'breaker_panel' || c.type === 'sub_panel'),
  shutoffValves: () =>
    get().components.filter((c) => c.type === 'shutoff_valve'),
  seasonalProgressByPhase: (phase) => {
    const tasks = get().seasonalTasks.filter((t) => t.phase === phase);
    return { total: tasks.length, done: tasks.filter((t) => t.isComplete).length };
  },
}));
