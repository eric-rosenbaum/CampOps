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
  logInspectionForId: string | null;
  editingInspectionLogEntryId: string | null;
  editingSeasonalTaskId: string | null;

  openLogIssueModal: () => void;
  openEditIssueModal: (id: string) => void;
  openLogTaskModal: () => void;
  openSeasonModal: () => void;
  // Pool modal openers
  openLogReadingModal: () => void;
  openLogServiceModal: (equipmentId?: string) => void;
  openLogInspectionModal: (inspectionId?: string) => void;
  openAddEquipmentModal: () => void;
  openSeasonalTaskModal: (taskId?: string) => void;
  openEditInspectionLogModal: (entryId: string) => void;
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
  logInspectionForId: null,
  editingInspectionLogEntryId: null,
  editingSeasonalTaskId: null,

  openLogIssueModal: () =>
    set({ isLogIssueModalOpen: true, editingIssueId: null }),

  openEditIssueModal: (id: string) =>
    set({ isLogIssueModalOpen: true, editingIssueId: id }),

  openLogTaskModal: () => set({ isLogTaskModalOpen: true }),

  openSeasonModal: () => set({ isSeasonModalOpen: true }),

  openLogReadingModal: () => set({ isLogReadingModalOpen: true }),

  openLogServiceModal: (equipmentId) =>
    set({ isLogServiceModalOpen: true, logServiceForEquipmentId: equipmentId ?? null }),

  openLogInspectionModal: (inspectionId) =>
    set({ isLogInspectionModalOpen: true, logInspectionForId: inspectionId ?? null, editingInspectionLogEntryId: null }),

  openEditInspectionLogModal: (entryId) =>
    set({ isLogInspectionModalOpen: true, editingInspectionLogEntryId: entryId, logInspectionForId: null }),

  openAddEquipmentModal: () => set({ isAddEquipmentModalOpen: true }),

  openSeasonalTaskModal: (taskId) =>
    set({ isSeasonalTaskModalOpen: true, editingSeasonalTaskId: taskId ?? null }),

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
      logInspectionForId: null,
      editingInspectionLogEntryId: null,
      editingSeasonalTaskId: null,
    }),

  setCurrentUser: (id: string) => set({ currentUserId: id }),
}));
