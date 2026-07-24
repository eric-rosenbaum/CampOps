import { create } from 'zustand';
import type {
  Retreat, RetreatStatus, RetreatSpace, RetreatHousing, RetreatHousingVersion, RetreatDocument,
  RetreatDocType, RetreatMeal, RetreatChangeRequest, RetreatRequestStatus, RetreatCost, RetreatCharge,
  RetreatPayment, RetreatIssue, RetreatChecklistItem, RetreatChecklistPhase, RetreatScheduleItem,
  RetreatFeedback, RetreatReminder, MealPeriod,
} from '@/lib/types';
import {
  dbAddRetreat, dbUpdateRetreat, dbDeleteRetreat,
  dbAddSpace, dbUpdateSpace, dbDeleteSpace,
  dbAddHousing, dbUpdateHousing, dbDeleteHousing, dbSetHousingLock, dbAddHousingVersion,
  dbAddDocument, dbUpdateDocument, dbDeleteDocument, dbUploadRetreatDocument,
  dbAddMeal, dbUpdateMeal, dbDeleteMeal,
  dbAddChangeRequest, dbUpdateChangeRequest,
  dbAddCost, dbUpdateCost, dbDeleteCost,
  dbAddCharge, dbUpdateCharge, dbDeleteCharge,
  dbAddPayment, dbDeletePayment,
  dbAddIssue, dbUpdateIssue, dbDeleteIssue,
  dbAddChecklistItem, dbUpdateChecklistItem, dbDeleteChecklistItem,
  dbAddScheduleItem, dbUpdateScheduleItem, dbDeleteScheduleItem,
  dbAddFeedback, dbDeleteFeedback, dbAddReminder,
  dbRegeneratePortalToken,
} from '@/lib/retreatsDb';
import { generateId } from '@/lib/utils';

export type RetreatTab = 'overview' | 'active' | 'documents' | 'housing' | 'menu' | 'requests' | 'costs' | 'portal' | 'feedback';

/** The 5-phase readiness tracker shown on the overview cards. */
export type PhaseState = 'done' | 'active' | 'locked';
export interface PhaseProgress { contract: PhaseState; coi: PhaseState; housing: PhaseState; menu: PhaseState; setup: PhaseState }

export type RetreatModal =
  | { kind: 'newRetreat' }
  | { kind: 'editRetreat'; retreatId: string }
  | { kind: 'respondRequest'; requestId: string }
  | { kind: 'sendReminder'; retreatId: string; reminderType?: string }
  | { kind: 'uploadDoc'; retreatId: string; docType?: RetreatDocType }
  | { kind: 'editDoc'; retreatId: string; docId?: string }
  | { kind: 'addMeal'; retreatId: string; mealId?: string; dayDate?: string; mealPeriod?: MealPeriod }
  | { kind: 'logIssue'; retreatId: string; issueId?: string }
  | { kind: 'invoice'; retreatId: string }
  | { kind: 'housingHistory'; retreatId: string }
  | { kind: 'spaces' }
  | { kind: 'housingAssign'; retreatId: string; housingId?: string }
  | { kind: 'checklist'; retreatId: string; phase?: RetreatChecklistPhase }
  | { kind: 'scheduleItem'; retreatId: string; itemId?: string }
  | { kind: 'cost'; retreatId: string; costId?: string }
  | { kind: 'charge'; retreatId: string; chargeId?: string }
  | { kind: 'payment'; retreatId: string }
  | { kind: 'feedback'; retreatId: string };

export interface Balance { totalCharges: number; totalPaid: number; balance: number }

interface RetreatState {
  activeTab: RetreatTab;
  activeRetreatId: string | null;
  modal: RetreatModal | null;

  retreats: Retreat[];
  spaces: RetreatSpace[];
  housing: RetreatHousing[];
  housingVersions: RetreatHousingVersion[];
  documents: RetreatDocument[];
  meals: RetreatMeal[];
  changeRequests: RetreatChangeRequest[];
  costs: RetreatCost[];
  charges: RetreatCharge[];
  payments: RetreatPayment[];
  issues: RetreatIssue[];
  checklist: RetreatChecklistItem[];
  scheduleItems: RetreatScheduleItem[];
  feedback: RetreatFeedback[];
  reminders: RetreatReminder[];

  setActiveTab: (t: RetreatTab) => void;
  setActiveRetreat: (id: string | null) => void;
  openModal: (m: RetreatModal) => void;
  closeModal: () => void;

  setRetreats: (r: Retreat[]) => void;
  setSpaces: (r: RetreatSpace[]) => void;
  setHousing: (r: RetreatHousing[]) => void;
  setHousingVersions: (r: RetreatHousingVersion[]) => void;
  setDocuments: (r: RetreatDocument[]) => void;
  setMeals: (r: RetreatMeal[]) => void;
  setChangeRequests: (r: RetreatChangeRequest[]) => void;
  setCosts: (r: RetreatCost[]) => void;
  setCharges: (r: RetreatCharge[]) => void;
  setPayments: (r: RetreatPayment[]) => void;
  setIssues: (r: RetreatIssue[]) => void;
  setChecklist: (r: RetreatChecklistItem[]) => void;
  setScheduleItems: (r: RetreatScheduleItem[]) => void;
  setFeedback: (r: RetreatFeedback[]) => void;
  setReminders: (r: RetreatReminder[]) => void;

  // Retreats
  addRetreat: (r: Retreat) => void;
  updateRetreat: (r: Retreat) => void;
  deleteRetreat: (id: string) => void;
  regeneratePortalToken: (retreatId: string) => Promise<string | null>;

  // Spaces
  addSpace: (name: string, bedCapacity: number, accessible: boolean, notes: string | null) => void;
  updateSpace: (x: RetreatSpace) => void;
  deleteSpace: (id: string) => void;

  // Housing
  addHousing: (x: RetreatHousing) => void;
  updateHousing: (x: RetreatHousing) => void;
  deleteHousing: (id: string) => void;
  setHousingLocked: (retreatId: string, locked: boolean) => void;
  saveHousingVersion: (retreatId: string, label: string, summary: string, by: string | null) => void;

  // Documents
  addDocument: (x: RetreatDocument) => void;
  updateDocument: (x: RetreatDocument) => void;
  deleteDocument: (id: string) => void;
  uploadDocument: (file: File, retreatId: string, docType: RetreatDocType, name: string, meta: Record<string, unknown> | null, dueDate: string | null) => Promise<void>;

  // Meals
  addMeal: (x: RetreatMeal) => void;
  updateMeal: (x: RetreatMeal) => void;
  deleteMeal: (id: string) => void;

  // Change requests
  addChangeRequest: (x: RetreatChangeRequest) => void;
  respondToRequest: (id: string, status: RetreatRequestStatus, responseMessage: string | null, internalNote: string | null, by: string | null) => void;

  // Costs / charges / payments
  addCost: (x: RetreatCost) => void;
  updateCost: (x: RetreatCost) => void;
  deleteCost: (id: string) => void;
  addCharge: (x: RetreatCharge) => void;
  updateCharge: (x: RetreatCharge) => void;
  deleteCharge: (id: string) => void;
  addPayment: (x: RetreatPayment) => void;
  deletePayment: (id: string) => void;

  // Issues
  addIssue: (x: RetreatIssue) => void;
  updateIssue: (x: RetreatIssue) => void;
  deleteIssue: (id: string) => void;

  // Checklist
  addChecklistItem: (x: RetreatChecklistItem) => void;
  updateChecklistItem: (x: RetreatChecklistItem) => void;
  deleteChecklistItem: (id: string) => void;
  toggleChecklistItem: (id: string) => void;

  // Schedule
  addScheduleItem: (x: RetreatScheduleItem) => void;
  updateScheduleItem: (x: RetreatScheduleItem) => void;
  deleteScheduleItem: (id: string) => void;

  // Feedback / reminders
  addFeedback: (x: RetreatFeedback) => void;
  deleteFeedback: (id: string) => void;
  sendReminder: (retreatId: string, reminderType: string, message: string, by: string | null) => void;

  // Selectors
  retreatById: (id: string) => Retreat | null;
  selectedRetreat: () => Retreat | null;
  activeRetreat: () => Retreat | null;
  retreatsByStatus: () => Record<RetreatStatus, Retreat[]>;
  docsFor: (retreatId: string) => RetreatDocument[];
  housingFor: (retreatId: string) => RetreatHousing[];
  versionsFor: (retreatId: string) => RetreatHousingVersion[];
  mealsFor: (retreatId: string) => RetreatMeal[];
  requestsFor: (retreatId: string) => RetreatChangeRequest[];
  costsFor: (retreatId: string) => RetreatCost[];
  chargesFor: (retreatId: string) => RetreatCharge[];
  paymentsFor: (retreatId: string) => RetreatPayment[];
  issuesFor: (retreatId: string) => RetreatIssue[];
  checklistFor: (retreatId: string, phase?: RetreatChecklistPhase) => RetreatChecklistItem[];
  scheduleFor: (retreatId: string) => RetreatScheduleItem[];
  feedbackFor: (retreatId: string) => RetreatFeedback[];
  remindersFor: (retreatId: string) => RetreatReminder[];
  balanceFor: (retreatId: string) => Balance;
  phaseProgress: (retreatId: string) => PhaseProgress;
  pendingRequestCount: () => number;
  portalUrl: (r: Retreat) => string;
}

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

export const useRetreatStore = create<RetreatState>((set, get) => ({
  activeTab: 'overview',
  activeRetreatId: null,
  modal: null,

  retreats: [], spaces: [], housing: [], housingVersions: [], documents: [], meals: [],
  changeRequests: [], costs: [], charges: [], payments: [], issues: [], checklist: [],
  scheduleItems: [], feedback: [], reminders: [],

  setActiveTab: (t) => set({ activeTab: t }),
  setActiveRetreat: (id) => set({ activeRetreatId: id }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),

  setRetreats: (rows) => set((st) => ({
    retreats: rows,
    activeRetreatId: st.activeRetreatId && rows.some((r) => r.id === st.activeRetreatId)
      ? st.activeRetreatId
      : (rows.find((r) => r.status === 'active')?.id ?? rows[0]?.id ?? null),
  })),
  setSpaces: (rows) => set({ spaces: rows }),
  setHousing: (rows) => set({ housing: rows }),
  setHousingVersions: (rows) => set({ housingVersions: rows }),
  setDocuments: (rows) => set({ documents: rows }),
  setMeals: (rows) => set({ meals: rows }),
  setChangeRequests: (rows) => set({ changeRequests: rows }),
  setCosts: (rows) => set({ costs: rows }),
  setCharges: (rows) => set({ charges: rows }),
  setPayments: (rows) => set({ payments: rows }),
  setIssues: (rows) => set({ issues: rows }),
  setChecklist: (rows) => set({ checklist: rows }),
  setScheduleItems: (rows) => set({ scheduleItems: rows }),
  setFeedback: (rows) => set({ feedback: rows }),
  setReminders: (rows) => set({ reminders: rows }),

  addRetreat: (r) => { set((s) => ({ retreats: [...s.retreats, r], activeRetreatId: r.id })); dbAddRetreat(r); },
  updateRetreat: (r) => { set((s) => ({ retreats: s.retreats.map((x) => x.id === r.id ? r : x) })); dbUpdateRetreat(r); },
  regeneratePortalToken: async (retreatId) => {
    const token = await dbRegeneratePortalToken(retreatId);
    if (token) set((s) => ({ retreats: s.retreats.map((x) => x.id === retreatId ? { ...x, portalToken: token } : x) }));
    return token;
  },
  deleteRetreat: (id) => {
    set((s) => ({ retreats: s.retreats.filter((r) => r.id !== id), activeRetreatId: s.activeRetreatId === id ? null : s.activeRetreatId }));
    dbDeleteRetreat(id);
  },

  addSpace: (name, bedCapacity, accessible, notes) => {
    const x: RetreatSpace = { id: generateId(), campId: '', name, bedCapacity, accessible, notes, sortOrder: get().spaces.length, createdAt: now(), updatedAt: now() };
    set((s) => ({ spaces: [...s.spaces, x] })); dbAddSpace(x);
  },
  updateSpace: (x) => { set((s) => ({ spaces: s.spaces.map((y) => y.id === x.id ? x : y) })); dbUpdateSpace(x); },
  deleteSpace: (id) => { set((s) => ({ spaces: s.spaces.filter((y) => y.id !== id) })); dbDeleteSpace(id); },

  addHousing: (x) => { set((s) => ({ housing: [...s.housing, x] })); dbAddHousing(x); },
  updateHousing: (x) => { set((s) => ({ housing: s.housing.map((y) => y.id === x.id ? x : y) })); dbUpdateHousing(x); },
  deleteHousing: (id) => { set((s) => ({ housing: s.housing.filter((y) => y.id !== id) })); dbDeleteHousing(id); },
  setHousingLocked: (retreatId, locked) => {
    set((s) => ({ housing: s.housing.map((h) => h.retreatId === retreatId ? { ...h, locked } : h) }));
    dbSetHousingLock(retreatId, locked);
  },
  saveHousingVersion: (retreatId, label, summary, by) => {
    const version = Math.max(0, ...get().housingVersions.filter((v) => v.retreatId === retreatId).map((v) => v.version)) + 1;
    const x: RetreatHousingVersion = { id: generateId(), campId: '', retreatId, version, label, summary, createdBy: by, createdAt: now() };
    set((s) => ({ housingVersions: [x, ...s.housingVersions] })); dbAddHousingVersion(x);
  },

  addDocument: (x) => { set((s) => ({ documents: [...s.documents, x] })); dbAddDocument(x); },
  updateDocument: (x) => { set((s) => ({ documents: s.documents.map((y) => y.id === x.id ? x : y) })); dbUpdateDocument(x); },
  deleteDocument: (id) => { set((s) => ({ documents: s.documents.filter((y) => y.id !== id) })); dbDeleteDocument(id); },
  uploadDocument: async (file, retreatId, docType, name, meta, dueDate) => {
    const path = await dbUploadRetreatDocument(file, retreatId);
    const x: RetreatDocument = {
      id: generateId(), campId: '', retreatId, docType, name, status: docType === 'coi' ? 'received' : 'received',
      filePath: path, signedBy: null, signedAt: null, dueDate, meta,
      sortOrder: get().documents.filter((d) => d.retreatId === retreatId).length, createdAt: now(), updatedAt: now(),
    };
    set((s) => ({ documents: [...s.documents, x] })); dbAddDocument(x);
  },

  addMeal: (x) => { set((s) => ({ meals: [...s.meals, x] })); dbAddMeal(x); },
  updateMeal: (x) => { set((s) => ({ meals: s.meals.map((y) => y.id === x.id ? x : y) })); dbUpdateMeal(x); },
  deleteMeal: (id) => { set((s) => ({ meals: s.meals.filter((y) => y.id !== id) })); dbDeleteMeal(id); },

  addChangeRequest: (x) => { set((s) => ({ changeRequests: [x, ...s.changeRequests] })); dbAddChangeRequest(x); },
  respondToRequest: (id, status, responseMessage, internalNote, by) => {
    let updated: RetreatChangeRequest | undefined;
    set((s) => ({ changeRequests: s.changeRequests.map((r) => r.id === id ? (updated = { ...r, status, responseMessage, internalNote, respondedBy: by, respondedAt: now() }) : r) }));
    if (updated) dbUpdateChangeRequest(updated);
  },

  addCost: (x) => { set((s) => ({ costs: [...s.costs, x] })); dbAddCost(x); },
  updateCost: (x) => { set((s) => ({ costs: s.costs.map((y) => y.id === x.id ? x : y) })); dbUpdateCost(x); },
  deleteCost: (id) => { set((s) => ({ costs: s.costs.filter((y) => y.id !== id) })); dbDeleteCost(id); },
  addCharge: (x) => { set((s) => ({ charges: [...s.charges, x] })); dbAddCharge(x); },
  updateCharge: (x) => { set((s) => ({ charges: s.charges.map((y) => y.id === x.id ? x : y) })); dbUpdateCharge(x); },
  deleteCharge: (id) => { set((s) => ({ charges: s.charges.filter((y) => y.id !== id) })); dbDeleteCharge(id); },
  addPayment: (x) => { set((s) => ({ payments: [x, ...s.payments] })); dbAddPayment(x); },
  deletePayment: (id) => { set((s) => ({ payments: s.payments.filter((y) => y.id !== id) })); dbDeletePayment(id); },

  addIssue: (x) => { set((s) => ({ issues: [x, ...s.issues] })); dbAddIssue(x); },
  updateIssue: (x) => { set((s) => ({ issues: s.issues.map((y) => y.id === x.id ? x : y) })); dbUpdateIssue(x); },
  deleteIssue: (id) => { set((s) => ({ issues: s.issues.filter((y) => y.id !== id) })); dbDeleteIssue(id); },

  addChecklistItem: (x) => { set((s) => ({ checklist: [...s.checklist, x] })); dbAddChecklistItem(x); },
  updateChecklistItem: (x) => { set((s) => ({ checklist: s.checklist.map((y) => y.id === x.id ? x : y) })); dbUpdateChecklistItem(x); },
  deleteChecklistItem: (id) => { set((s) => ({ checklist: s.checklist.filter((y) => y.id !== id) })); dbDeleteChecklistItem(id); },
  toggleChecklistItem: (id) => {
    let updated: RetreatChecklistItem | undefined;
    set((s) => ({ checklist: s.checklist.map((c) => c.id === id ? (updated = { ...c, isDone: !c.isDone }) : c) }));
    if (updated) dbUpdateChecklistItem(updated);
  },

  addScheduleItem: (x) => { set((s) => ({ scheduleItems: [...s.scheduleItems, x] })); dbAddScheduleItem(x); },
  updateScheduleItem: (x) => { set((s) => ({ scheduleItems: s.scheduleItems.map((y) => y.id === x.id ? x : y) })); dbUpdateScheduleItem(x); },
  deleteScheduleItem: (id) => { set((s) => ({ scheduleItems: s.scheduleItems.filter((y) => y.id !== id) })); dbDeleteScheduleItem(id); },

  addFeedback: (x) => { set((s) => ({ feedback: [x, ...s.feedback] })); dbAddFeedback(x); },
  deleteFeedback: (id) => { set((s) => ({ feedback: s.feedback.filter((y) => y.id !== id) })); dbDeleteFeedback(id); },
  sendReminder: (retreatId, reminderType, message, by) => {
    const x: RetreatReminder = { id: generateId(), campId: '', retreatId, reminderType, message, sentBy: by, sentAt: now() };
    set((s) => ({ reminders: [x, ...s.reminders] })); dbAddReminder(x);
  },

  // ─── Selectors ─────────────────────────────────────────────────────────────
  retreatById: (id) => get().retreats.find((r) => r.id === id) ?? null,
  selectedRetreat: () => { const s = get(); return s.retreats.find((r) => r.id === s.activeRetreatId) ?? s.retreats[0] ?? null; },
  activeRetreat: () => {
    const t = today();
    return get().retreats.find((r) => r.status === 'active')
      ?? get().retreats.find((r) => r.arrivalDate <= t && r.departureDate >= t)
      ?? null;
  },
  retreatsByStatus: () => {
    const out: Record<RetreatStatus, Retreat[]> = { inquiry: [], confirmed: [], ready: [], active: [], complete: [], cancelled: [] };
    for (const r of get().retreats) out[r.status].push(r);
    return out;
  },
  docsFor: (id) => get().documents.filter((d) => d.retreatId === id).sort((a, b) => a.sortOrder - b.sortOrder),
  housingFor: (id) => get().housing.filter((h) => h.retreatId === id).sort((a, b) => a.sortOrder - b.sortOrder),
  versionsFor: (id) => get().housingVersions.filter((v) => v.retreatId === id).sort((a, b) => b.version - a.version),
  mealsFor: (id) => get().meals.filter((m) => m.retreatId === id).sort((a, b) => a.dayDate.localeCompare(b.dayDate) || a.sortOrder - b.sortOrder),
  requestsFor: (id) => get().changeRequests.filter((r) => r.retreatId === id),
  costsFor: (id) => get().costs.filter((c) => c.retreatId === id).sort((a, b) => a.sortOrder - b.sortOrder),
  chargesFor: (id) => get().charges.filter((c) => c.retreatId === id).sort((a, b) => a.sortOrder - b.sortOrder),
  paymentsFor: (id) => get().payments.filter((p) => p.retreatId === id),
  issuesFor: (id) => get().issues.filter((i) => i.retreatId === id),
  checklistFor: (id, phase) => get().checklist.filter((c) => c.retreatId === id && (!phase || c.phase === phase)).sort((a, b) => a.sortOrder - b.sortOrder),
  scheduleFor: (id) => get().scheduleItems.filter((s) => s.retreatId === id).sort((a, b) => a.sortOrder - b.sortOrder),
  feedbackFor: (id) => get().feedback.filter((f) => f.retreatId === id),
  remindersFor: (id) => get().reminders.filter((r) => r.retreatId === id),

  balanceFor: (id) => {
    const totalCharges = get().charges.filter((c) => c.retreatId === id).reduce((s, c) => s + c.amount, 0);
    const totalPaid = get().payments.filter((p) => p.retreatId === id).reduce((s, p) => s + p.amount, 0);
    return { totalCharges, totalPaid, balance: totalCharges - totalPaid };
  },

  phaseProgress: (id) => {
    const r = get().retreatById(id);
    const docs = get().docsFor(id);
    const housing = get().housingFor(id);
    const meals = get().mealsFor(id);
    const doc = (type: RetreatDocType) => docs.find((d) => d.docType === type);
    const agreement = doc('agreement');
    const coi = doc('coi');
    // Each phase reflects ONLY its own state — no sequential gating between phases.
    // done = complete, active = started/pending, locked = nothing entered yet.
    const contract: PhaseState = agreement && ['signed', 'approved'].includes(agreement.status)
      ? 'done' : agreement ? 'active' : 'locked';
    const coiState: PhaseState = coi && ['received', 'signed', 'approved'].includes(coi.status)
      ? 'done' : coi ? 'active' : 'locked';
    const housingState: PhaseState = housing.length > 0 && housing.every((h) => h.locked)
      ? 'done' : housing.length > 0 ? 'active' : 'locked';
    const menuState: PhaseState = r?.menuPublished && meals.length > 0
      ? 'done' : meals.length > 0 ? 'active' : 'locked';
    const setupState: PhaseState = r?.status === 'complete'
      ? 'done' : r?.status === 'active' ? 'active' : 'locked';
    return { contract, coi: coiState, housing: housingState, menu: menuState, setup: setupState };
  },

  pendingRequestCount: () => get().changeRequests.filter((r) => r.status === 'pending').length,
  portalUrl: (r) => `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${r.portalToken}`,
}));
