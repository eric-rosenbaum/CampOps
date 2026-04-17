import { create } from 'zustand';

interface UIStore {
  currentUserId: string;
  isLogIssueModalOpen: boolean;
  isLogTaskModalOpen: boolean;
  isSeasonModalOpen: boolean;
  editingIssueId: string | null;
  // Pool modals
  isLogReadingModalOpen: boolean;
  isLogServiceModalOpen: boolean;
  isLogInspectionModalOpen: boolean;
  isAddEquipmentModalOpen: boolean;
  isSeasonalTaskModalOpen: boolean;
  logServiceForEquipmentId: string | null;
  editingServiceLogId: string | null;
  logInspectionForId: string | null;
  editingInspectionLogEntryId: string | null;
  editingSeasonalTaskId: string | null;
  // Safety modals
  isSafetyLogInspectionModalOpen: boolean;
  logInspectionForSafetyItemId: string | null;
  editingInspectionLogId: string | null;
  isSafetyAddItemModalOpen: boolean;
  addItemModalDefaultType: string | null;
  editingSafetyItemId: string | null;
  isLogDrillModalOpen: boolean;
  drillModalMode: 'schedule' | 'complete';
  editingDrillId: string | null;
  isLogTempModalOpen: boolean;
  logTempForItemId: string | null;
  editingTempLogId: string | null;
  isSafetyAddStaffModalOpen: boolean;
  editingSafetyStaffId: string | null;
  isStaffCertModalOpen: boolean;
  editingStaffCertId: string | null;
  staffCertForStaffId: string | null;
  isAddLicenseModalOpen: boolean;
  editingLicenseId: string | null;
  // Pool admin modals
  isAddEditPoolModalOpen: boolean;
  editingPoolId: string | null;
  isFlagIssueModalOpen: boolean;
  flagIssueEquipmentId: string | null;
  isEquipmentHistoryModalOpen: boolean;
  historyEquipmentId: string | null;

  openLogIssueModal: () => void;
  openEditIssueModal: (id: string) => void;
  openLogTaskModal: () => void;
  openSeasonModal: () => void;
  // Pool modal openers
  openLogReadingModal: () => void;
  openLogServiceModal: (equipmentId?: string) => void;
  openEditServiceLogModal: (logId: string) => void;
  openLogInspectionModal: (inspectionId?: string) => void;
  openAddEquipmentModal: () => void;
  openSeasonalTaskModal: (taskId?: string) => void;
  openEditPoolInspectionLogModal: (entryId: string) => void;
  // Safety modal openers
  openSafetyLogInspectionModal: (itemId?: string) => void;
  openEditInspectionLogModal: (logId: string) => void;
  openSafetyAddItemModal: (opts?: { type?: string; itemId?: string }) => void;
  openScheduleDrillModal: () => void;
  openLogDrillModal: (drillId?: string) => void;
  openLogTempModal: (itemId?: string) => void;
  openEditTempLogModal: (logId: string) => void;
  openSafetyAddStaffModal: (staffId?: string) => void;
  openStaffCertModal: (opts?: { certId?: string; staffId?: string }) => void;
  openAddLicenseModal: (licenseId?: string) => void;
  openAddEditPoolModal: (poolId?: string) => void;
  openFlagIssueModal: (equipmentId: string) => void;
  openEquipmentHistoryModal: (equipmentId: string) => void;
  closeAllModals: () => void;
  setCurrentUser: (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentUserId: '10000000-0000-0000-0000-000000000001',
  isLogIssueModalOpen: false,
  isLogTaskModalOpen: false,
  isSeasonModalOpen: false,
  editingIssueId: null,
  isLogReadingModalOpen: false,
  isLogServiceModalOpen: false,
  isLogInspectionModalOpen: false,
  isAddEquipmentModalOpen: false,
  isSeasonalTaskModalOpen: false,
  logServiceForEquipmentId: null,
  editingServiceLogId: null,
  logInspectionForId: null,
  editingInspectionLogEntryId: null,
  editingSeasonalTaskId: null,
  // Safety modals
  isSafetyLogInspectionModalOpen: false,
  logInspectionForSafetyItemId: null,
  editingInspectionLogId: null,
  isSafetyAddItemModalOpen: false,
  addItemModalDefaultType: null,
  editingSafetyItemId: null,
  isLogDrillModalOpen: false,
  drillModalMode: 'complete',
  editingDrillId: null,
  isLogTempModalOpen: false,
  logTempForItemId: null,
  editingTempLogId: null,
  isSafetyAddStaffModalOpen: false,
  editingSafetyStaffId: null,
  isStaffCertModalOpen: false,
  editingStaffCertId: null,
  staffCertForStaffId: null,
  isAddLicenseModalOpen: false,
  editingLicenseId: null,
  isAddEditPoolModalOpen: false,
  editingPoolId: null,
  isFlagIssueModalOpen: false,
  flagIssueEquipmentId: null,
  isEquipmentHistoryModalOpen: false,
  historyEquipmentId: null,

  openLogIssueModal: () =>
    set({ isLogIssueModalOpen: true, editingIssueId: null }),

  openEditIssueModal: (id: string) =>
    set({ isLogIssueModalOpen: true, editingIssueId: id }),

  openLogTaskModal: () => set({ isLogTaskModalOpen: true }),

  openSeasonModal: () => set({ isSeasonModalOpen: true }),

  openLogReadingModal: () => set({ isLogReadingModalOpen: true }),

  openLogServiceModal: (equipmentId) =>
    set({ isLogServiceModalOpen: true, logServiceForEquipmentId: equipmentId ?? null, editingServiceLogId: null }),

  openEditServiceLogModal: (logId) =>
    set({ isLogServiceModalOpen: true, editingServiceLogId: logId, logServiceForEquipmentId: null }),

  openLogInspectionModal: (inspectionId) =>
    set({ isLogInspectionModalOpen: true, logInspectionForId: inspectionId ?? null, editingInspectionLogEntryId: null }),

  openEditPoolInspectionLogModal: (entryId) =>
    set({ isLogInspectionModalOpen: true, editingInspectionLogEntryId: entryId, logInspectionForId: null }),

  openAddEquipmentModal: () => set({ isAddEquipmentModalOpen: true }),

  openSeasonalTaskModal: (taskId) =>
    set({ isSeasonalTaskModalOpen: true, editingSeasonalTaskId: taskId ?? null }),

  // Safety modal openers
  openSafetyLogInspectionModal: (itemId) =>
    set({ isSafetyLogInspectionModalOpen: true, logInspectionForSafetyItemId: itemId ?? null, editingInspectionLogId: null }),

  openEditInspectionLogModal: (logId) =>
    set({ isSafetyLogInspectionModalOpen: true, editingInspectionLogId: logId, logInspectionForSafetyItemId: null }),

  openSafetyAddItemModal: (opts) =>
    set({
      isSafetyAddItemModalOpen: true,
      addItemModalDefaultType: opts?.type ?? null,
      editingSafetyItemId: opts?.itemId ?? null,
    }),

  openScheduleDrillModal: () =>
    set({ isLogDrillModalOpen: true, drillModalMode: 'schedule', editingDrillId: null }),

  openLogDrillModal: (drillId) =>
    set({ isLogDrillModalOpen: true, drillModalMode: 'complete', editingDrillId: drillId ?? null }),

  openLogTempModal: (itemId) =>
    set({ isLogTempModalOpen: true, logTempForItemId: itemId ?? null, editingTempLogId: null }),

  openEditTempLogModal: (logId) =>
    set({ isLogTempModalOpen: true, editingTempLogId: logId, logTempForItemId: null }),

  openSafetyAddStaffModal: (staffId) =>
    set({ isSafetyAddStaffModalOpen: true, editingSafetyStaffId: staffId ?? null }),

  openStaffCertModal: (opts) =>
    set({
      isStaffCertModalOpen: true,
      editingStaffCertId: opts?.certId ?? null,
      staffCertForStaffId: opts?.staffId ?? null,
    }),

  openAddLicenseModal: (licenseId) =>
    set({ isAddLicenseModalOpen: true, editingLicenseId: licenseId ?? null }),

  openAddEditPoolModal: (poolId) =>
    set({ isAddEditPoolModalOpen: true, editingPoolId: poolId ?? null }),

  openFlagIssueModal: (equipmentId) =>
    set({ isFlagIssueModalOpen: true, flagIssueEquipmentId: equipmentId }),

  openEquipmentHistoryModal: (equipmentId) =>
    set({ isEquipmentHistoryModalOpen: true, historyEquipmentId: equipmentId }),

  closeAllModals: () =>
    set({
      isLogIssueModalOpen: false,
      isLogTaskModalOpen: false,
      isSeasonModalOpen: false,
      editingIssueId: null,
      isLogReadingModalOpen: false,
      isLogServiceModalOpen: false,
      isLogInspectionModalOpen: false,
      isAddEquipmentModalOpen: false,
      isSeasonalTaskModalOpen: false,
      logServiceForEquipmentId: null,
      editingServiceLogId: null,
      logInspectionForId: null,
      editingInspectionLogEntryId: null,
      editingSeasonalTaskId: null,
      // Safety modals
      isSafetyLogInspectionModalOpen: false,
      logInspectionForSafetyItemId: null,
      editingInspectionLogId: null,
      isSafetyAddItemModalOpen: false,
      addItemModalDefaultType: null,
      editingSafetyItemId: null,
      isLogDrillModalOpen: false,
      editingDrillId: null,
      isLogTempModalOpen: false,
      logTempForItemId: null,
      editingTempLogId: null,
      isSafetyAddStaffModalOpen: false,
      editingSafetyStaffId: null,
      isStaffCertModalOpen: false,
      editingStaffCertId: null,
      staffCertForStaffId: null,
      isAddLicenseModalOpen: false,
      editingLicenseId: null,
      isAddEditPoolModalOpen: false,
      editingPoolId: null,
      isFlagIssueModalOpen: false,
      flagIssueEquipmentId: null,
      isEquipmentHistoryModalOpen: false,
      historyEquipmentId: null,
    }),

  setCurrentUser: (id: string) => set({ currentUserId: id }),
}));
