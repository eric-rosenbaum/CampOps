import { create } from 'zustand';
import {
  dbUpsertAsset, dbUpdateAssetStatus, dbDeleteAsset,
  dbAddCheckout, dbReturnAsset, dbUpdateCheckout, dbDeleteCheckout,
  dbAddAssetServiceRecord, dbDeleteAssetServiceRecord, dbUpdateAssetServiceRecord,
  dbUpsertMaintenanceTask, dbToggleMaintenanceTask, dbDeleteMaintenanceTask,
} from '@/lib/db';
import type {
  CampAsset, AssetCheckout, AssetServiceRecord, AssetMaintenanceTask,
  AssetCategory, AssetStatus, AssetMaintenancePhase, CheckoutCondition, FuelLevel,
} from '@/lib/types';

export type AssetPageTab = 'fleet' | 'checked_out' | 'maintenance_due' | 'log';
export type AssetDetailTab = 'overview' | 'checkouts' | 'service' | 'maintenance';

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  vehicle: 'Vehicle',
  golf_cart: 'Golf Cart',
  watercraft: 'Watercraft',
  large_equipment: 'Equipment',
  trailer: 'Trailer',
  technology: 'Technology',
  other: 'Other',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  available: 'Available',
  checked_out: 'Checked Out',
  in_service: 'In Service',
  retired: 'Retired',
};

export const FUEL_LEVEL_LABELS: Record<FuelLevel, string> = {
  empty: 'Empty',
  quarter: '¼ Tank',
  half: '½ Tank',
  three_quarter: '¾ Tank',
  full: 'Full',
};

export const CHECKOUT_CONDITION_LABELS: Record<CheckoutCondition, string> = {
  no_issues: 'No issues',
  minor_note: 'Minor note',
  needs_attention: 'Needs attention',
};

export const SUBTYPE_LABELS: Record<string, string> = {
  golf_cart: 'Golf Cart',
  utility_cart: 'Utility Cart',
  utv: 'UTV',
  atv: 'ATV',
  van_15_passenger: '15-Passenger Van',
  van_12_passenger: '12-Passenger Van',
  minivan: 'Minivan',
  pickup_truck: 'Pickup Truck',
  box_truck: 'Box Truck',
  bus: 'Bus',
  car: 'Car',
  other_vehicle: 'Other Vehicle',
  riding_mower: 'Riding Mower',
  walk_behind_mower: 'Walk-Behind Mower',
  tractor: 'Tractor',
  generator: 'Generator',
  pressure_washer: 'Pressure Washer',
  chainsaw: 'Chainsaw',
  leaf_blower: 'Leaf Blower',
  wood_chipper: 'Wood Chipper',
  skid_steer: 'Skid Steer',
  other_equipment: 'Other Equipment',
  motorboat: 'Motorboat',
  pontoon: 'Pontoon',
  canoe: 'Canoe',
  kayak: 'Kayak',
  paddleboat: 'Paddleboat',
  sailboat: 'Sailboat',
  rowboat: 'Rowboat',
  inflatable: 'Inflatable',
  other_watercraft: 'Other Watercraft',
  utility_trailer: 'Utility Trailer',
  horse_trailer: 'Horse Trailer',
  boat_trailer: 'Boat Trailer',
  enclosed_trailer: 'Enclosed Trailer',
  flatbed: 'Flatbed Trailer',
  other_trailer: 'Other Trailer',
  other: 'Other',
};

export const SUBTYPES_BY_CATEGORY: Record<AssetCategory, { value: string; label: string }[]> = {
  golf_cart: [
    { value: 'golf_cart', label: 'Golf Cart' },
    { value: 'utility_cart', label: 'Utility Cart' },
    { value: 'utv', label: 'UTV' },
    { value: 'atv', label: 'ATV' },
  ],
  vehicle: [
    { value: 'van_15_passenger', label: '15-Passenger Van' },
    { value: 'van_12_passenger', label: '12-Passenger Van' },
    { value: 'minivan', label: 'Minivan' },
    { value: 'pickup_truck', label: 'Pickup Truck' },
    { value: 'box_truck', label: 'Box Truck' },
    { value: 'bus', label: 'Bus' },
    { value: 'car', label: 'Car' },
    { value: 'other_vehicle', label: 'Other Vehicle' },
  ],
  watercraft: [
    { value: 'motorboat', label: 'Motorboat' },
    { value: 'pontoon', label: 'Pontoon' },
    { value: 'canoe', label: 'Canoe' },
    { value: 'kayak', label: 'Kayak' },
    { value: 'paddleboat', label: 'Paddleboat' },
    { value: 'sailboat', label: 'Sailboat' },
    { value: 'rowboat', label: 'Rowboat' },
    { value: 'inflatable', label: 'Inflatable' },
    { value: 'other_watercraft', label: 'Other Watercraft' },
  ],
  large_equipment: [
    { value: 'riding_mower', label: 'Riding Mower' },
    { value: 'walk_behind_mower', label: 'Walk-Behind Mower' },
    { value: 'tractor', label: 'Tractor' },
    { value: 'generator', label: 'Generator' },
    { value: 'pressure_washer', label: 'Pressure Washer' },
    { value: 'chainsaw', label: 'Chainsaw' },
    { value: 'leaf_blower', label: 'Leaf Blower' },
    { value: 'wood_chipper', label: 'Wood Chipper' },
    { value: 'skid_steer', label: 'Skid Steer' },
    { value: 'other_equipment', label: 'Other Equipment' },
  ],
  trailer: [
    { value: 'utility_trailer', label: 'Utility Trailer' },
    { value: 'horse_trailer', label: 'Horse Trailer' },
    { value: 'boat_trailer', label: 'Boat Trailer' },
    { value: 'enclosed_trailer', label: 'Enclosed Trailer' },
    { value: 'flatbed', label: 'Flatbed Trailer' },
    { value: 'other_trailer', label: 'Other Trailer' },
  ],
  technology: [
    { value: 'laptop', label: 'Laptop' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'camera', label: 'Camera' },
    { value: 'projector', label: 'Projector' },
    { value: 'walkie_talkie', label: 'Walkie-Talkie' },
    { value: 'speaker', label: 'Speaker / PA System' },
    { value: 'other_tech', label: 'Other Tech' },
  ],
  other: [{ value: 'other', label: 'Other' }],
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  tire_replacement: 'Tire Replacement',
  brake_service: 'Brake Service',
  battery: 'Battery',
  belt_replacement: 'Belt Replacement',
  fluid_top_off: 'Fluid Top-off',
  filter_replacement: 'Filter Replacement',
  state_inspection: 'State Inspection',
  dot_inspection: 'DOT Inspection',
  annual_inspection: 'Annual Inspection',
  hull_inspection: 'Hull Inspection',
  engine_service: 'Engine Service',
  blade_sharpening: 'Blade Sharpening',
  cleaning: 'Cleaning',
  repair: 'Repair',
  other: 'Other',
};

const INSPECTION_SERVICE_TYPES = new Set([
  'state_inspection', 'dot_inspection', 'annual_inspection', 'hull_inspection',
]);

export function isInspectionType(serviceType: string): boolean {
  return INSPECTION_SERVICE_TYPES.has(serviceType);
}

interface AssetStore {
  assets: CampAsset[];
  checkouts: AssetCheckout[];
  serviceRecords: AssetServiceRecord[];
  maintenanceTasks: AssetMaintenanceTask[];
  activeAssetId: string | null;
  activePageTab: AssetPageTab;
  activeDetailTab: AssetDetailTab;
  activeCategoryFilter: AssetCategory | 'all';

  // Setters
  setAssets: (a: CampAsset[]) => void;
  setCheckouts: (c: AssetCheckout[]) => void;
  setServiceRecords: (r: AssetServiceRecord[]) => void;
  setMaintenanceTasks: (t: AssetMaintenanceTask[]) => void;
  setActiveAsset: (id: string | null) => void;
  setPageTab: (tab: AssetPageTab) => void;
  setDetailTab: (tab: AssetDetailTab) => void;
  setCategoryFilter: (cat: AssetCategory | 'all') => void;

  // Mutations
  addAsset: (asset: CampAsset) => void;
  updateAsset: (asset: CampAsset) => void;
  deleteAsset: (id: string) => void;
  checkOutAsset: (checkout: AssetCheckout) => void;
  returnAsset: (checkoutId: string, assetId: string, fields: {
    returnedAt: string;
    endOdometer: number | null;
    endHours: number | null;
    fuelLevelIn: AssetCheckout['fuelLevelIn'];
    returnNotes: string | null;
    returnCondition: CheckoutCondition;
    createdIssueId: string | null;
  }) => void;
  addServiceRecord: (record: AssetServiceRecord) => void;
  updateServiceRecord: (record: AssetServiceRecord) => void;
  deleteServiceRecord: (id: string) => void;
  updateCheckout: (checkout: AssetCheckout) => void;
  deleteCheckout: (checkoutId: string, assetId: string) => void;
  toggleMaintenanceTask: (id: string, assetId: string, done: boolean, completedBy: string) => void;
  addMaintenanceTask: (task: AssetMaintenanceTask) => void;
  updateMaintenanceTask: (task: AssetMaintenanceTask) => void;
  deleteMaintenanceTask: (id: string) => void;

  // Selectors
  activeAsset: () => CampAsset | null;
  filteredAssets: () => CampAsset[];
  currentCheckoutForAsset: (assetId: string) => AssetCheckout | null;
  checkoutHistoryForAsset: (assetId: string) => AssetCheckout[];
  serviceHistoryForAsset: (assetId: string) => AssetServiceRecord[];
  maintenanceTasksForAsset: (assetId: string, phase?: AssetMaintenancePhase) => AssetMaintenanceTask[];
  maintenanceProgressForAsset: (assetId: string, phase: AssetMaintenancePhase) => { total: number; done: number };
  currentlyCheckedOut: () => { asset: CampAsset; checkout: AssetCheckout }[];
  overdueCheckouts: () => { asset: CampAsset; checkout: AssetCheckout }[];
  maintenanceOverdue: () => { asset: CampAsset; record: AssetServiceRecord }[];
  maintenanceDueSoon: (days?: number) => { asset: CampAsset; record: AssetServiceRecord }[];
  maintenanceScheduled: () => { asset: CampAsset; record: AssetServiceRecord }[];
  fleetStats: () => { total: number; available: number; checkedOut: number; inService: number; retired: number; maintenanceOverdue: number };
  recentCheckoutNames: () => string[];
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: [],
  checkouts: [],
  serviceRecords: [],
  maintenanceTasks: [],
  activeAssetId: null,
  activePageTab: 'fleet',
  activeDetailTab: 'overview',
  activeCategoryFilter: 'all',

  setAssets: (assets) => set({ assets }),
  setCheckouts: (checkouts) => set({ checkouts }),
  setServiceRecords: (serviceRecords) => set({ serviceRecords }),
  setMaintenanceTasks: (maintenanceTasks) => set({ maintenanceTasks }),
  setActiveAsset: (id) => set({ activeAssetId: id, activeDetailTab: 'overview' }),
  setPageTab: (tab) => set({ activePageTab: tab }),
  setDetailTab: (tab) => set({ activeDetailTab: tab }),
  setCategoryFilter: (cat) => set({ activeCategoryFilter: cat }),

  addAsset: (asset) => {
    set((s) => ({ assets: [...s.assets, asset] }));
    dbUpsertAsset(asset);
  },

  updateAsset: (asset) => {
    set((s) => ({ assets: s.assets.map((a) => a.id === asset.id ? asset : a) }));
    dbUpsertAsset(asset);
  },

  deleteAsset: (id) => {
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
    dbDeleteAsset(id);
  },

  checkOutAsset: (checkout) => {
    set((s) => ({
      checkouts: [checkout, ...s.checkouts],
      assets: s.assets.map((a) =>
        a.id === checkout.assetId
          ? { ...a, status: 'checked_out' as AssetStatus, currentHours: checkout.startHours ?? a.currentHours, currentOdometer: checkout.startOdometer ?? a.currentOdometer }
          : a
      ),
    }));
    dbAddCheckout(checkout);
    dbUpdateAssetStatus(checkout.assetId, 'checked_out', {
      currentOdometer: checkout.startOdometer,
      currentHours: checkout.startHours,
    });
  },

  returnAsset: (checkoutId, assetId, fields) => {
    const newStatus: AssetStatus = fields.returnCondition === 'needs_attention' ? 'in_service' : 'available';
    set((s) => ({
      checkouts: s.checkouts.map((c) =>
        c.id === checkoutId
          ? { ...c, returnedAt: fields.returnedAt, endOdometer: fields.endOdometer, endHours: fields.endHours, fuelLevelIn: fields.fuelLevelIn, returnNotes: fields.returnNotes, returnCondition: fields.returnCondition, createdIssueId: fields.createdIssueId }
          : c
      ),
      assets: s.assets.map((a) =>
        a.id === assetId
          ? { ...a, status: newStatus, currentOdometer: fields.endOdometer ?? a.currentOdometer, currentHours: fields.endHours ?? a.currentHours }
          : a
      ),
    }));
    dbReturnAsset(checkoutId, fields);
    dbUpdateAssetStatus(assetId, newStatus, {
      currentOdometer: fields.endOdometer,
      currentHours: fields.endHours,
    });
  },

  addServiceRecord: (record) => {
    set((s) => ({ serviceRecords: [record, ...s.serviceRecords] }));
    dbAddAssetServiceRecord(record);
    // Update asset odometer/hours if provided
    const { assets } = get();
    const asset = assets.find((a) => a.id === record.assetId);
    if (asset) {
      const patch: { currentOdometer?: number | null; currentHours?: number | null } = {};
      if (record.odometerAtService !== null) patch.currentOdometer = record.odometerAtService;
      if (record.hoursAtService !== null) patch.currentHours = record.hoursAtService;
      if (Object.keys(patch).length > 0) {
        set((s) => ({ assets: s.assets.map((a) => a.id === asset.id ? { ...a, ...patch } : a) }));
        dbUpdateAssetStatus(asset.id, asset.status, patch);
      }
    }
  },

  updateServiceRecord: (record) => {
    set((s) => ({ serviceRecords: s.serviceRecords.map((r) => r.id === record.id ? record : r) }));
    dbUpdateAssetServiceRecord(record);
  },

  deleteServiceRecord: (id) => {
    set((s) => ({ serviceRecords: s.serviceRecords.filter((r) => r.id !== id) }));
    dbDeleteAssetServiceRecord(id);
  },

  updateCheckout: (checkout) => {
    set((s) => ({ checkouts: s.checkouts.map((c) => c.id === checkout.id ? checkout : c) }));
    dbUpdateCheckout(checkout);
  },

  deleteCheckout: (checkoutId, assetId) => {
    const { checkouts, assets } = get();
    const checkout = checkouts.find((c) => c.id === checkoutId);
    set((s) => ({ checkouts: s.checkouts.filter((c) => c.id !== checkoutId) }));
    // If this was an active checkout, restore asset to available
    if (checkout && !checkout.returnedAt) {
      const asset = assets.find((a) => a.id === assetId);
      if (asset) {
        set((s) => ({ assets: s.assets.map((a) => a.id === assetId ? { ...a, status: 'available' as AssetStatus } : a) }));
        dbUpdateAssetStatus(assetId, 'available');
      }
    }
    dbDeleteCheckout(checkoutId);
  },

  toggleMaintenanceTask: (id, _assetId, done, completedBy) => {
    const now = new Date().toISOString().split('T')[0];
    set((s) => ({
      maintenanceTasks: s.maintenanceTasks.map((t) =>
        t.id === id
          ? { ...t, isComplete: done, completedBy: done ? completedBy : null, completedDate: done ? now : null, updatedAt: new Date().toISOString() }
          : t
      ),
    }));
    dbToggleMaintenanceTask(id, done, done ? completedBy : null, done ? now : null);
  },

  addMaintenanceTask: (task) => {
    set((s) => ({ maintenanceTasks: [...s.maintenanceTasks, task] }));
    dbUpsertMaintenanceTask(task);
  },

  updateMaintenanceTask: (task) => {
    set((s) => ({ maintenanceTasks: s.maintenanceTasks.map((t) => t.id === task.id ? task : t) }));
    dbUpsertMaintenanceTask(task);
  },

  deleteMaintenanceTask: (id) => {
    set((s) => ({ maintenanceTasks: s.maintenanceTasks.filter((t) => t.id !== id) }));
    dbDeleteMaintenanceTask(id);
  },

  // ─── Selectors ──────────────────────────────────────────────────────────────

  activeAsset: () => {
    const { assets, activeAssetId } = get();
    return assets.find((a) => a.id === activeAssetId) ?? null;
  },

  filteredAssets: () => {
    const { assets, activeCategoryFilter } = get();
    const active = assets.filter((a) => a.isActive);
    if (activeCategoryFilter === 'all') return active;
    return active.filter((a) => a.category === activeCategoryFilter);
  },

  currentCheckoutForAsset: (assetId) => {
    return get().checkouts.find((c) => c.assetId === assetId && c.returnedAt === null) ?? null;
  },

  checkoutHistoryForAsset: (assetId) => {
    return get().checkouts
      .filter((c) => c.assetId === assetId && c.returnedAt !== null)
      .sort((a, b) => b.checkedOutAt.localeCompare(a.checkedOutAt));
  },

  serviceHistoryForAsset: (assetId) => {
    return get().serviceRecords
      .filter((r) => r.assetId === assetId)
      .sort((a, b) => b.datePerformed.localeCompare(a.datePerformed));
  },

  maintenanceTasksForAsset: (assetId, phase) => {
    const tasks = get().maintenanceTasks.filter((t) => t.assetId === assetId);
    return phase ? tasks.filter((t) => t.phase === phase) : tasks;
  },

  maintenanceProgressForAsset: (assetId, phase) => {
    const tasks = get().maintenanceTasks.filter((t) => t.assetId === assetId && t.phase === phase);
    return { total: tasks.length, done: tasks.filter((t) => t.isComplete).length };
  },

  currentlyCheckedOut: () => {
    const { assets, checkouts } = get();
    return checkouts
      .filter((c) => c.returnedAt === null)
      .flatMap((c) => {
        const asset = assets.find((a) => a.id === c.assetId);
        return asset ? [{ asset, checkout: c }] : [];
      });
  },

  overdueCheckouts: () => {
    const now = new Date();
    return get().currentlyCheckedOut().filter(({ checkout }) => new Date(checkout.expectedReturnAt) < now);
  },

  maintenanceOverdue: () => {
    const today = new Date().toISOString().split('T')[0];
    const { assets, serviceRecords } = get();
    const result: { asset: CampAsset; record: AssetServiceRecord }[] = [];
    for (const record of serviceRecords) {
      if (!record.nextServiceDate) continue;
      if (record.nextServiceDate >= today) continue;
      const asset = assets.find((a) => a.id === record.assetId && a.isActive && a.status !== 'retired');
      if (!asset) continue;
      // Only one entry per asset (most overdue record)
      if (!result.find((r) => r.asset.id === asset.id)) {
        result.push({ asset, record });
      }
    }
    return result.sort((a, b) => a.record.nextServiceDate!.localeCompare(b.record.nextServiceDate!));
  },

  maintenanceDueSoon: (days = 14) => {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date();
    future.setDate(future.getDate() + days);
    const futureStr = future.toISOString().split('T')[0];
    const { assets, serviceRecords } = get();
    const result: { asset: CampAsset; record: AssetServiceRecord }[] = [];
    for (const record of serviceRecords) {
      if (!record.nextServiceDate) continue;
      if (record.nextServiceDate <= today || record.nextServiceDate > futureStr) continue;
      const asset = assets.find((a) => a.id === record.assetId && a.isActive && a.status !== 'retired');
      if (!asset) continue;
      if (!result.find((r) => r.asset.id === asset.id)) {
        result.push({ asset, record });
      }
    }
    return result.sort((a, b) => a.record.nextServiceDate!.localeCompare(b.record.nextServiceDate!));
  },

  maintenanceScheduled: () => {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date();
    future.setDate(future.getDate() + 14);
    const futureStr = future.toISOString().split('T')[0];
    const { assets, serviceRecords } = get();
    const result: { asset: CampAsset; record: AssetServiceRecord }[] = [];
    for (const record of serviceRecords) {
      if (!record.nextServiceDate) continue;
      if (record.nextServiceDate <= futureStr) continue;
      const asset = assets.find((a) => a.id === record.assetId && a.isActive && a.status !== 'retired');
      if (!asset) continue;
      if (!result.find((r) => r.asset.id === asset.id)) {
        result.push({ asset, record });
      }
    }
    return result.sort((a, b) => a.record.nextServiceDate!.localeCompare(b.record.nextServiceDate!));
  },

  fleetStats: () => {
    const { assets } = get();
    const active = assets.filter((a) => a.isActive);
    return {
      total: active.length,
      available: active.filter((a) => a.status === 'available').length,
      checkedOut: active.filter((a) => a.status === 'checked_out').length,
      inService: active.filter((a) => a.status === 'in_service').length,
      retired: active.filter((a) => a.status === 'retired').length,
      maintenanceOverdue: get().maintenanceOverdue().length,
    };
  },

  recentCheckoutNames: () => {
    const names = get().checkouts.map((c) => c.checkedOutBy);
    return [...new Set(names)].slice(0, 20);
  },
}));
