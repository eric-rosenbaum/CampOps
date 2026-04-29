import { create } from 'zustand';
import type {
  CampPool,
  ChemicalReading,
  PoolEquipment,
  ServiceLogEntry,
  PoolInspection,
  InspectionLogEntry,
  SeasonalTask,
  SeasonalPhase,
  PoolType,
} from '@/lib/types';
import {
  dbAddPool,
  dbUpdatePool,
  dbDeletePool,
  dbAddChemicalReading,
  dbUpdateChemicalReading,
  dbDeleteChemicalReading,
  dbAddEquipment,
  dbUpdateEquipment,
  dbDeleteEquipment,
  dbAddServiceLog,
  dbUpdateServiceLog,
  dbDeleteServiceLog,
  dbUpdateInspection,
  dbAddInspectionLog,
  dbUpdateInspectionLog,
  dbDeleteInspectionLog,
  dbToggleSeasonalTask,
  dbAddSeasonalTask,
  dbUpdateSeasonalTask,
  dbDeleteSeasonalTask,
} from '@/lib/db';

export type PoolTab = 'chemical' | 'equipment' | 'inspections' | 'seasonal';

// ─── Chemical range definitions ───────────────────────────────────────────────

export const CHEMICAL_RANGES = {
  freeChlorine: { min: 1.0, max: 3.0, unit: 'ppm', label: 'Free chlorine' },
  ph: { min: 7.2, max: 7.8, unit: '', label: 'pH' },
  alkalinity: { min: 80, max: 120, unit: 'ppm', label: 'Total alkalinity' },
  cyanuricAcid: { min: 30, max: 50, unit: 'ppm', label: 'Cyanuric acid' },
  waterTemp: { min: 68, max: 82, unit: '°F', label: 'Water temp' },
} as const;

export type ChemicalField = keyof typeof CHEMICAL_RANGES;

export function getChemicalStatus(field: ChemicalField, value: number): 'ok' | 'warn' | 'alert' {
  switch (field) {
    case 'freeChlorine':
      if (value < 1.0) return 'alert';
      if (value > 3.0) return 'warn';
      return 'ok';
    case 'ph':
      if (value < 7.0 || value > 8.2) return 'alert';
      if (value < 7.2 || value > 7.8) return 'warn';
      return 'ok';
    case 'alkalinity':
      if (value < 60 || value > 140) return 'alert';
      if (value < 90 || value > 110) return 'warn';
      return 'ok';
    case 'cyanuricAcid':
      if (value < 20 || value > 60) return 'alert';
      if (value < 32 || value > 48) return 'warn';
      return 'ok';
    case 'waterTemp':
      if (value < 60 || value > 90) return 'alert';
      if (value < 68 || value > 82) return 'warn';
      return 'ok';
  }
}

// ─── Pool type helpers ────────────────────────────────────────────────────────

const WATERFRONT_TYPES: PoolType[] = ['waterfront'];

export function isWaterfrontType(type: PoolType): boolean {
  return WATERFRONT_TYPES.includes(type);
}

export const POOL_TYPE_LABELS: Record<PoolType, string> = {
  pool: 'Swimming pool',
  waterfront: 'Waterfront',
  other: 'Other (chemical)',
};

// ─── Store interface ──────────────────────────────────────────────────────────

interface PoolStore {
  activeTab: PoolTab;
  activePoolId: string | null;
  pools: CampPool[];
  chemicalReadings: ChemicalReading[];
  equipment: PoolEquipment[];
  serviceLog: ServiceLogEntry[];
  inspections: PoolInspection[];
  inspectionLog: InspectionLogEntry[];
  seasonalTasks: SeasonalTask[];

  setActiveTab: (tab: PoolTab) => void;
  setActivePool: (id: string | null) => void;

  // Data setters (called from AppInit when Supabase loads)
  setPools: (rows: CampPool[]) => void;
  setChemicalReadings: (rows: ChemicalReading[]) => void;
  setEquipment: (rows: PoolEquipment[]) => void;
  setServiceLog: (rows: ServiceLogEntry[]) => void;
  setInspections: (rows: PoolInspection[]) => void;
  setInspectionLog: (rows: InspectionLogEntry[]) => void;
  setSeasonalTasks: (rows: SeasonalTask[]) => void;

  // Pool CRUD
  addPool: (pool: CampPool) => void;
  updatePool: (pool: CampPool) => void;
  deletePool: (id: string) => void;

  // Mutations
  addChemicalReading: (reading: ChemicalReading) => void;
  updateChemicalReading: (id: string, patch: Partial<ChemicalReading>) => void;
  deleteChemicalReading: (id: string) => void;
  addEquipment: (equip: PoolEquipment) => void;
  updateEquipment: (equip: PoolEquipment) => void;
  deleteEquipment: (id: string) => void;
  addServiceLog: (entry: ServiceLogEntry) => void;
  updateServiceLog: (id: string, patch: Partial<ServiceLogEntry>) => void;
  deleteServiceLog: (id: string) => void;
  addInspectionLog: (entry: InspectionLogEntry, updatedInspection: PoolInspection | null) => void;
  updateInspectionLog: (id: string, patch: Partial<InspectionLogEntry>) => void;
  deleteInspectionLog: (id: string) => void;
  toggleSeasonalTask: (id: string, userName: string) => void;
  addSeasonalTask: (task: SeasonalTask) => void;
  updateSeasonalTask: (id: string, patch: Partial<SeasonalTask>) => void;
  deleteSeasonalTask: (id: string) => void;

  // Selectors (scoped to activePoolId)
  activePool: () => CampPool | null;
  activeReadings: () => ChemicalReading[];
  activeEquipment: () => PoolEquipment[];
  activeInspections: () => PoolInspection[];
  activeInspectionLog: () => InspectionLogEntry[];
  activeSeasonalTasks: () => SeasonalTask[];
  latestReading: () => ChemicalReading | null;
  outOfRangeAlerts: () => string[];
  seasonalProgress: () => { total: number; done: number };
  seasonalProgressByPhase: (phase: SeasonalPhase) => { total: number; done: number };
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const usePoolStore = create<PoolStore>((set, get) => ({
  activeTab: 'chemical',
  activePoolId: null,
  pools: [],
  chemicalReadings: [],
  equipment: [],
  serviceLog: [],
  inspections: [],
  inspectionLog: [],
  seasonalTasks: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActivePool: (id) => set({ activePoolId: id }),

  setPools: (rows) => set({ pools: rows }),
  setChemicalReadings: (rows) => set({ chemicalReadings: rows }),
  setEquipment: (rows) => set({ equipment: rows }),
  setServiceLog: (rows) => set({ serviceLog: rows }),
  setInspections: (rows) => set({ inspections: rows }),
  setInspectionLog: (rows) => set({ inspectionLog: rows }),
  setSeasonalTasks: (rows) => set({ seasonalTasks: rows }),

  addPool: (pool) => {
    set((s) => ({ pools: [...s.pools, pool] }));
    dbAddPool(pool);
  },

  updatePool: (pool) => {
    set((s) => ({ pools: s.pools.map((p) => p.id === pool.id ? pool : p) }));
    dbUpdatePool(pool);
  },

  deletePool: (id) => {
    set((s) => ({
      pools: s.pools.filter((p) => p.id !== id),
      activePoolId: s.activePoolId === id ? null : s.activePoolId,
      chemicalReadings: s.chemicalReadings.filter((r) => r.poolId !== id),
      equipment: s.equipment.filter((e) => e.poolId !== id),
      serviceLog: s.serviceLog.filter((sl) => sl.poolId !== id),
      inspections: s.inspections.filter((i) => i.poolId !== id),
      inspectionLog: s.inspectionLog.filter((e) => e.poolId !== id),
      seasonalTasks: s.seasonalTasks.filter((t) => t.poolId !== id),
    }));
    dbDeletePool(id);
  },

  addChemicalReading: (reading) => {
    set((s) => ({ chemicalReadings: [reading, ...s.chemicalReadings] }));
    dbAddChemicalReading(reading);
  },

  updateChemicalReading: (id, patch) => {
    set((s) => ({
      chemicalReadings: s.chemicalReadings.map((r) => r.id === id ? { ...r, ...patch } : r),
    }));
    dbUpdateChemicalReading(id, patch);
  },

  deleteChemicalReading: (id) => {
    set((s) => ({ chemicalReadings: s.chemicalReadings.filter((r) => r.id !== id) }));
    dbDeleteChemicalReading(id);
  },

  addEquipment: (equip) => {
    set((s) => ({ equipment: [...s.equipment, equip] }));
    dbAddEquipment(equip);
  },

  updateEquipment: (equip) => {
    set((s) => ({ equipment: s.equipment.map((e) => e.id === equip.id ? equip : e) }));
    dbUpdateEquipment(equip);
  },

  deleteEquipment: (id) => {
    set((s) => ({ equipment: s.equipment.filter((e) => e.id !== id) }));
    dbDeleteEquipment(id);
  },

  addServiceLog: (entry) => {
    const now = new Date().toISOString();
    set((s) => {
      const updatedEquipment = entry.equipmentId
        ? s.equipment.map((e) => {
            if (e.id !== entry.equipmentId) return e;
            return {
              ...e,
              lastServiced: entry.datePerformed,
              nextServiceDue: entry.nextServiceDue ?? e.nextServiceDue,
              updatedAt: now,
            };
          })
        : s.equipment;
      return { serviceLog: [entry, ...s.serviceLog], equipment: updatedEquipment };
    });
    dbAddServiceLog(entry);
    if (entry.equipmentId) {
      const equip = get().equipment.find((e) => e.id === entry.equipmentId);
      if (equip) dbUpdateEquipment(equip);
    }
  },

  updateServiceLog: (id, patch) => {
    set((s) => ({
      serviceLog: s.serviceLog.map((e) => e.id === id ? { ...e, ...patch } : e),
    }));
    dbUpdateServiceLog(id, patch);
  },

  deleteServiceLog: (id) => {
    set((s) => ({ serviceLog: s.serviceLog.filter((e) => e.id !== id) }));
    dbDeleteServiceLog(id);
  },

  addInspectionLog: (entry, updatedInspection) => {
    set((s) => ({
      inspectionLog: [entry, ...s.inspectionLog],
      inspections: updatedInspection
        ? s.inspections.map((i) => i.id === updatedInspection.id ? updatedInspection : i)
        : s.inspections,
    }));
    const knownIds = get().inspections.map((i) => i.id);
    dbAddInspectionLog(entry, knownIds);
    if (updatedInspection) dbUpdateInspection(updatedInspection);
  },

  updateInspectionLog: (id, patch) => {
    set((s) => ({
      inspectionLog: s.inspectionLog.map((e) => e.id === id ? { ...e, ...patch } : e),
    }));
    dbUpdateInspectionLog(id, patch);
  },

  deleteInspectionLog: (id) => {
    set((s) => ({ inspectionLog: s.inspectionLog.filter((e) => e.id !== id) }));
    dbDeleteInspectionLog(id);
  },

  addSeasonalTask: (task) => {
    set((s) => ({ seasonalTasks: [...s.seasonalTasks, task] }));
    dbAddSeasonalTask(task);
  },

  updateSeasonalTask: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      seasonalTasks: s.seasonalTasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: now } : t
      ),
    }));
    dbUpdateSeasonalTask(id, { ...patch, updatedAt: now });
  },

  deleteSeasonalTask: (id) => {
    set((s) => ({ seasonalTasks: s.seasonalTasks.filter((t) => t.id !== id) }));
    dbDeleteSeasonalTask(id);
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
    if (task) dbToggleSeasonalTask(task.id, task.isComplete, task.completedBy, task.completedDate);
  },

  // ─── Scoped selectors ───────────────────────────────────────────────────────

  activePool: () => {
    const { pools, activePoolId } = get();
    return pools.find((p) => p.id === activePoolId) ?? null;
  },

  activeReadings: () => {
    const { chemicalReadings, activePoolId } = get();
    if (!activePoolId) return chemicalReadings;
    return chemicalReadings.filter((r) => r.poolId === activePoolId);
  },

  activeEquipment: () => {
    const { equipment, activePoolId } = get();
    if (!activePoolId) return equipment;
    return equipment.filter((e) => e.poolId === activePoolId);
  },

  activeInspections: () => {
    const { inspections, activePoolId } = get();
    if (!activePoolId) return inspections;
    return inspections.filter((i) => i.poolId === activePoolId);
  },

  activeInspectionLog: () => {
    const { inspectionLog, activePoolId } = get();
    if (!activePoolId) return inspectionLog;
    return inspectionLog.filter((e) => e.poolId === activePoolId);
  },

  activeSeasonalTasks: () => {
    const { seasonalTasks, activePoolId } = get();
    if (!activePoolId) return seasonalTasks;
    return seasonalTasks.filter((t) => t.poolId === activePoolId);
  },

  latestReading: () => {
    const readings = get().activeReadings();
    if (readings.length === 0) return null;
    return [...readings].sort(
      (a, b) => new Date(b.readingTime).getTime() - new Date(a.readingTime).getTime()
    )[0];
  },

  outOfRangeAlerts: () => {
    const reading = get().latestReading();
    if (!reading) return [];
    const alerts: string[] = [];
    if (getChemicalStatus('freeChlorine', reading.freeChlorine) === 'alert')
      alerts.push(`Free chlorine reading of ${reading.freeChlorine} ppm is below the required minimum of 1.0 ppm. Pool should not be opened for campers until chlorine is adjusted and re-tested.`);
    if (getChemicalStatus('ph', reading.ph) === 'alert')
      alerts.push(`pH reading of ${reading.ph} is outside safe range (7.2–7.8). Corrective action required.`);
    if (getChemicalStatus('alkalinity', reading.alkalinity) === 'alert')
      alerts.push(`Total alkalinity of ${reading.alkalinity} ppm is outside acceptable range. Test and adjust.`);
    return alerts;
  },

  seasonalProgress: () => {
    const tasks = get().activeSeasonalTasks();
    return { total: tasks.length, done: tasks.filter((t) => t.isComplete).length };
  },

  seasonalProgressByPhase: (phase) => {
    const tasks = get().activeSeasonalTasks().filter((t) => t.phase === phase);
    return { total: tasks.length, done: tasks.filter((t) => t.isComplete).length };
  },
}));
