import { create } from 'zustand';

interface UIStore {
  currentUserId: string;
  isLogIssueModalOpen: boolean;
  isLogTaskModalOpen: boolean;
  isSeasonModalOpen: boolean;
  editingIssueId: string | null;
  openLogIssueModal: () => void;
  openEditIssueModal: (id: string) => void;
  openLogTaskModal: () => void;
  openSeasonModal: () => void;
  closeAllModals: () => void;
  setCurrentUser: (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentUserId: 'u1',
  isLogIssueModalOpen: false,
  isLogTaskModalOpen: false,
  isSeasonModalOpen: false,
  editingIssueId: null,

  openLogIssueModal: () =>
    set({ isLogIssueModalOpen: true, editingIssueId: null }),

  openEditIssueModal: (id: string) =>
    set({ isLogIssueModalOpen: true, editingIssueId: id }),

  openLogTaskModal: () => set({ isLogTaskModalOpen: true }),

  openSeasonModal: () => set({ isSeasonModalOpen: true }),

  closeAllModals: () =>
    set({
      isLogIssueModalOpen: false,
      isLogTaskModalOpen: false,
      isSeasonModalOpen: false,
      editingIssueId: null,
    }),

  setCurrentUser: (id: string) => set({ currentUserId: id }),
}));
