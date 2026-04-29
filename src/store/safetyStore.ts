import { create } from 'zustand';
import type {
  SafetyItem, SafetyInspectionLog, EmergencyDrill,
  SafetyStaff, StaffCertification, SafetyTempLog, SafetyLicense,
  SafetyCategory, CertType,
} from '@/lib/types';
import {
  dbAddSafetyItem, dbUpdateSafetyItem, dbDeleteSafetyItem,
  dbAddSafetyInspectionLog, dbUpdateSafetyInspectionLog, dbDeleteSafetyInspectionLog,
  dbAddSafetyDrill, dbUpdateSafetyDrill, dbDeleteSafetyDrill,
  dbAddSafetyStaff, dbUpdateSafetyStaff, dbDeleteSafetyStaff,
  dbAddStaffCert, dbUpdateStaffCert, dbDeleteStaffCert,
  dbAddSafetyTempLog, dbUpdateSafetyTempLog, dbDeleteSafetyTempLog,
  dbAddSafetyLicense, dbUpdateSafetyLicense, dbDeleteSafetyLicense,
} from '@/lib/db';

export type SafetyTab = 'overview' | 'fire' | 'kitchen' | 'drills' | 'staff';

export const FREQUENCY_DAYS: Record<SafetyItem['frequency'], number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

export const DRILL_TYPE_LABELS: Record<EmergencyDrill['drillType'], string> = {
  fire_evacuation: 'Full camp fire evacuation',
  nighttime_cabin: 'Cabin fire drill — nighttime',
  missing_swimmer: 'Waterfront missing swimmer',
  severe_weather: 'Severe weather / shelter-in-place',
  medical_emergency: 'Medical emergency response',
  active_shooter: 'Active shooter / lockdown',
  missing_camper: 'Missing camper',
  other: 'Other',
};

export const CERT_TYPE_LABELS: Record<CertType, string> = {
  cpr_aed: 'CPR / AED',
  mandatory_reporter: 'Mandatory reporter',
  lifeguard: 'Lifeguard certification',
  first_aid: 'First aid',
  wsi: 'WSI',
  other: 'Other',
};

export function safetyItemStatus(item: SafetyItem): 'ok' | 'warn' | 'alert' {
  if (!item.nextDue) return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.nextDue + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'alert';
  if (diffDays <= 7) return 'warn';
  return 'ok';
}

export function certExpiryStatus(expiryDate: string | null): 'ok' | 'expiring' | 'expired' {
  if (!expiryDate) return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + 'T00:00:00');
  const diffDays = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'ok';
}

interface SafetyStore {
  activeTab: SafetyTab;
  items: SafetyItem[];
  inspectionLog: SafetyInspectionLog[];
  drills: EmergencyDrill[];
  staff: SafetyStaff[];
  certifications: StaffCertification[];
  tempLogs: SafetyTempLog[];
  licenses: SafetyLicense[];

  setActiveTab: (tab: SafetyTab) => void;
  setItems: (items: SafetyItem[]) => void;
  setInspectionLog: (log: SafetyInspectionLog[]) => void;
  setDrills: (drills: EmergencyDrill[]) => void;
  setStaff: (staff: SafetyStaff[]) => void;
  setCertifications: (certs: StaffCertification[]) => void;
  setTempLogs: (logs: SafetyTempLog[]) => void;
  setLicenses: (licenses: SafetyLicense[]) => void;

  // Items
  addItem: (item: SafetyItem) => void;
  updateItem: (id: string, patch: Partial<SafetyItem>) => void;
  deleteItem: (id: string) => void;

  // Inspection log
  addInspectionLog: (entry: SafetyInspectionLog, updatedItem?: SafetyItem) => void;
  updateInspectionLog: (id: string, patch: Partial<SafetyInspectionLog>) => void;
  deleteInspectionLog: (id: string) => void;

  // Drills
  addDrill: (drill: EmergencyDrill) => void;
  updateDrill: (id: string, patch: Partial<EmergencyDrill>) => void;
  deleteDrill: (id: string) => void;

  // Staff
  addStaff: (staff: SafetyStaff) => void;
  updateStaff: (id: string, patch: Partial<SafetyStaff>) => void;
  deleteStaff: (id: string) => void;

  // Certifications
  addCert: (cert: StaffCertification) => void;
  updateCert: (id: string, patch: Partial<StaffCertification>) => void;
  deleteCert: (id: string) => void;

  // Temp logs
  addTempLog: (log: SafetyTempLog) => void;
  updateTempLog: (id: string, patch: Partial<SafetyTempLog>) => void;
  deleteTempLog: (id: string) => void;

  // Licenses
  addLicense: (lic: SafetyLicense) => void;
  updateLicense: (id: string, patch: Partial<SafetyLicense>) => void;
  deleteLicense: (id: string) => void;

  // Selectors
  itemsByCategory: (category: SafetyCategory) => SafetyItem[];
  itemsByType: (type: SafetyItem['type']) => SafetyItem[];
  categoryStats: (category: SafetyCategory) => { ok: number; warn: number; alert: number; total: number };
  allStats: () => { overdue: number; dueSoon: number; compliant: number };
  overdueItems: () => SafetyItem[];
  dueSoonItems: () => SafetyItem[];
  recentLogsForItem: (itemId: string, limit?: number) => SafetyInspectionLog[];
  staffWithCerts: () => Array<{ staff: SafetyStaff; certs: StaffCertification[] }>;
  certSummary: (certType: CertType) => { total: number; current: number; expiring: number; expired: number; uncertified: number };
  tempLogsForItem: (itemId: string, date?: string) => { am: SafetyTempLog | null; pm: SafetyTempLog | null };
  nextScheduledDrill: () => EmergencyDrill | null;
  completedDrillCount: (drillType?: EmergencyDrill['drillType']) => number;
  failedLastInspectionItems: () => SafetyItem[];
}

export const useSafetyStore = create<SafetyStore>((set, get) => ({
  activeTab: 'overview',
  items: [],
  inspectionLog: [],
  drills: [],
  staff: [],
  certifications: [],
  tempLogs: [],
  licenses: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setItems: (items) => set({ items }),
  setInspectionLog: (log) => set({ inspectionLog: log }),
  setDrills: (drills) => set({ drills }),
  setStaff: (staff) => set({ staff }),
  setCertifications: (certs) => set({ certifications: certs }),
  setTempLogs: (logs) => set({ tempLogs: logs }),
  setLicenses: (licenses) => set({ licenses }),

  addItem: (item) => {
    set((s) => ({ items: [...s.items, item] }));
    dbAddSafetyItem(item);
  },

  updateItem: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      items: s.items.map((i) => i.id === id ? { ...i, ...patch, updatedAt: now } : i),
    }));
    dbUpdateSafetyItem(id, patch);
  },

  deleteItem: (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    dbDeleteSafetyItem(id);
  },

  addInspectionLog: (entry, updatedItem) => {
    set((s) => ({
      inspectionLog: [entry, ...s.inspectionLog],
      items: updatedItem
        ? s.items.map((i) => i.id === updatedItem.id ? updatedItem : i)
        : s.items,
    }));
    dbAddSafetyInspectionLog(entry);
    if (updatedItem) dbUpdateSafetyItem(updatedItem.id, {
      lastInspected: updatedItem.lastInspected,
      nextDue: updatedItem.nextDue,
    });
  },

  updateInspectionLog: (id, patch) => {
    set((s) => ({
      inspectionLog: s.inspectionLog.map((l) => l.id === id ? { ...l, ...patch } : l),
    }));
    dbUpdateSafetyInspectionLog(id, patch);
  },

  deleteInspectionLog: (id) => {
    set((s) => ({ inspectionLog: s.inspectionLog.filter((l) => l.id !== id) }));
    dbDeleteSafetyInspectionLog(id);
  },

  addDrill: (drill) => {
    set((s) => ({ drills: [...s.drills, drill] }));
    dbAddSafetyDrill(drill);
  },

  updateDrill: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      drills: s.drills.map((d) => d.id === id ? { ...d, ...patch, updatedAt: now } : d),
    }));
    dbUpdateSafetyDrill(id, patch);
  },

  deleteDrill: (id) => {
    set((s) => ({ drills: s.drills.filter((d) => d.id !== id) }));
    dbDeleteSafetyDrill(id);
  },

  addStaff: (staff) => {
    set((s) => ({ staff: [...s.staff, staff].sort((a, b) => a.name.localeCompare(b.name)) }));
    dbAddSafetyStaff(staff);
  },

  updateStaff: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      staff: s.staff.map((m) => m.id === id ? { ...m, ...patch, updatedAt: now } : m),
    }));
    dbUpdateSafetyStaff(id, patch);
  },

  deleteStaff: (id) => {
    set((s) => ({
      staff: s.staff.filter((m) => m.id !== id),
      certifications: s.certifications.filter((c) => c.staffId !== id),
    }));
    dbDeleteSafetyStaff(id);
  },

  addCert: (cert) => {
    set((s) => ({ certifications: [cert, ...s.certifications] }));
    dbAddStaffCert(cert);
  },

  updateCert: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      certifications: s.certifications.map((c) => c.id === id ? { ...c, ...patch, updatedAt: now } : c),
    }));
    dbUpdateStaffCert(id, patch);
  },

  deleteCert: (id) => {
    set((s) => ({ certifications: s.certifications.filter((c) => c.id !== id) }));
    dbDeleteStaffCert(id);
  },

  addTempLog: (log) => {
    set((s) => ({ tempLogs: [log, ...s.tempLogs] }));
    dbAddSafetyTempLog(log);
  },

  updateTempLog: (id, patch) => {
    set((s) => ({ tempLogs: s.tempLogs.map((l) => l.id === id ? { ...l, ...patch } : l) }));
    dbUpdateSafetyTempLog(id, patch);
  },

  deleteTempLog: (id) => {
    set((s) => ({ tempLogs: s.tempLogs.filter((l) => l.id !== id) }));
    dbDeleteSafetyTempLog(id);
  },

  addLicense: (lic) => {
    set((s) => ({ licenses: [...s.licenses, lic].sort((a, b) => a.name.localeCompare(b.name)) }));
    dbAddSafetyLicense(lic);
  },

  updateLicense: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      licenses: s.licenses.map((l) => l.id === id ? { ...l, ...patch, updatedAt: now } : l),
    }));
    dbUpdateSafetyLicense(id, patch);
  },

  deleteLicense: (id) => {
    set((s) => ({ licenses: s.licenses.filter((l) => l.id !== id) }));
    dbDeleteSafetyLicense(id);
  },

  // Selectors
  itemsByCategory: (category) => get().items.filter((i) => i.category === category),

  itemsByType: (type) => get().items.filter((i) => i.type === type),

  categoryStats: (category) => {
    const items = get().items.filter((i) => i.category === category);
    const stats = { ok: 0, warn: 0, alert: 0, total: items.length };
    for (const item of items) {
      stats[safetyItemStatus(item)]++;
    }
    return stats;
  },

  allStats: () => {
    const { items } = get();
    let overdue = 0, dueSoon = 0, compliant = 0;
    for (const item of items) {
      const s = safetyItemStatus(item);
      if (s === 'alert') overdue++;
      else if (s === 'warn') dueSoon++;
      else compliant++;
    }
    return { overdue, dueSoon, compliant };
  },

  overdueItems: () => get().items.filter((i) => safetyItemStatus(i) === 'alert'),

  dueSoonItems: () => get().items.filter((i) => safetyItemStatus(i) === 'warn'),

  recentLogsForItem: (itemId, limit = 7) =>
    get().inspectionLog
      .filter((l) => l.itemId === itemId)
      .slice(0, limit),

  staffWithCerts: () => {
    const { staff, certifications } = get();
    return staff.map((s) => ({
      staff: s,
      certs: certifications.filter((c) => c.staffId === s.id),
    }));
  },

  certSummary: (certType) => {
    const { staff, certifications } = get();
    const active = staff.filter((s) => s.isActive);
    const total = active.length;
    let current = 0, expiring = 0, expired = 0;

    for (const s of active) {
      const cert = certifications
        .filter((c) => c.staffId === s.id && c.certType === certType)
        .sort((a, b) => (b.expiryDate ?? '').localeCompare(a.expiryDate ?? ''))
        [0];
      if (!cert) continue;
      const status = certExpiryStatus(cert.expiryDate);
      if (status === 'ok') current++;
      else if (status === 'expiring') { current++; expiring++; }
      else expired++;
    }

    const certified = current + expired;
    return { total, current, expiring, expired, uncertified: total - certified };
  },

  tempLogsForItem: (itemId, date) => {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const logs = get().tempLogs.filter((l) => l.itemId === itemId && l.logDate === d);
    return {
      am: logs.find((l) => l.session === 'am') ?? null,
      pm: logs.find((l) => l.session === 'pm') ?? null,
    };
  },

  nextScheduledDrill: () => {
    const scheduled = get().drills.filter((d) => d.status === 'scheduled');
    if (!scheduled.length) return null;
    return scheduled.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
  },

  completedDrillCount: (drillType) => {
    const drills = get().drills.filter((d) => d.status === 'completed');
    if (!drillType) return drills.length;
    return drills.filter((d) => d.drillType === drillType).length;
  },

  failedLastInspectionItems: () => {
    const { items, inspectionLog } = get();
    return items.filter((item) => {
      const logs = inspectionLog
        .filter((l) => l.itemId === item.id)
        .sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate));
      return logs.length > 0 && logs[0].result === 'failed';
    });
  },
}));
