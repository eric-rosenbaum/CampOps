import { create } from 'zustand';
import type {
  ChemicalReading,
  PoolEquipment,
  ServiceLogEntry,
  PoolInspection,
  InspectionLogEntry,
  SeasonalTask,
  SeasonalPhase,
} from '@/lib/types';
import {
  dbAddChemicalReading,
  dbAddEquipment,
  dbAddServiceLog,
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

// ─── Store interface ──────────────────────────────────────────────────────────

interface PoolStore {
  activeTab: PoolTab;
  chemicalReadings: ChemicalReading[];
  equipment: PoolEquipment[];
  serviceLog: ServiceLogEntry[];
  inspections: PoolInspection[];
  inspectionLog: InspectionLogEntry[];
  seasonalTasks: SeasonalTask[];

  setActiveTab: (tab: PoolTab) => void;

  // Data setters (called from AppInit when Supabase loads)
  setChemicalReadings: (rows: ChemicalReading[]) => void;
  setEquipment: (rows: PoolEquipment[]) => void;
  setServiceLog: (rows: ServiceLogEntry[]) => void;
  setInspections: (rows: PoolInspection[]) => void;
  setInspectionLog: (rows: InspectionLogEntry[]) => void;
  setSeasonalTasks: (rows: SeasonalTask[]) => void;

  // Mutations
  addChemicalReading: (reading: ChemicalReading) => void;
  addEquipment: (equip: PoolEquipment) => void;
  addServiceLog: (entry: ServiceLogEntry) => void;
  addInspectionLog: (entry: InspectionLogEntry, updatedInspection: PoolInspection | null) => void;
  updateInspectionLog: (id: string, patch: Partial<InspectionLogEntry>) => void;
  deleteInspectionLog: (id: string) => void;
  toggleSeasonalTask: (id: string, userName: string) => void;
  addSeasonalTask: (task: SeasonalTask) => void;
  updateSeasonalTask: (id: string, patch: Partial<SeasonalTask>) => void;
  deleteSeasonalTask: (id: string) => void;

  // Selectors
  latestReading: () => ChemicalReading | null;
  outOfRangeAlerts: () => string[];
  seasonalProgress: () => { total: number; done: number };
  seasonalProgressByPhase: (phase: SeasonalPhase) => { total: number; done: number };
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const usePoolStore = create<PoolStore>((set, get) => ({
  activeTab: 'chemical',
  chemicalReadings: [],
  equipment: [],
  serviceLog: [],
  inspections: [],
  inspectionLog: [],
  seasonalTasks: [],

  setActiveTab: (tab) => set({ activeTab: tab }),

  setChemicalReadings: (rows) => set({ chemicalReadings: rows }),
  setEquipment: (rows) => set({ equipment: rows }),
  setServiceLog: (rows) => set({ serviceLog: rows }),
  setInspections: (rows) => set({ inspections: rows }),
  setInspectionLog: (rows) => set({ inspectionLog: rows }),
  setSeasonalTasks: (rows) => set({ seasonalTasks: rows }),

  addChemicalReading: (reading) => {
    set((s) => ({
      chemicalReadings: [reading, ...s.chemicalReadings],
    }));
    dbAddChemicalReading(reading);
  },

  addEquipment: (equip) => {
    set((s) => ({ equipment: [...s.equipment, equip] }));
    dbAddEquipment(equip);
  },

  addServiceLog: (entry) => {
    set((s) => ({ serviceLog: [entry, ...s.serviceLog] }));
    dbAddServiceLog(entry);
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

  latestReading: () => {
    const { chemicalReadings } = get();
    if (chemicalReadings.length === 0) return null;
    return [...chemicalReadings].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
    const { seasonalTasks } = get();
    return { total: seasonalTasks.length, done: seasonalTasks.filter((t) => t.isComplete).length };
  },

  seasonalProgressByPhase: (phase) => {
    const tasks = get().seasonalTasks.filter((t) => t.phase === phase);
    return { total: tasks.length, done: tasks.filter((t) => t.isComplete).length };
  },
}));
