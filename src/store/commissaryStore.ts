import { create } from 'zustand';
import type {
  CommissarySession, CommissaryVendor, InventoryItem, InventoryAdjustment,
  Recipe, RecipeIngredient, RecipeStep, MenuEntry, MealPeriod, AdjustmentReason,
  PurchaseOrder, PurchaseOrderLine, ProductionPlan, ProductionTask, ProductionPrepTask,
  ProductionIngredient, Camper, CamperRestriction, RestrictionSummaryRow,
  OrderSource, CommissaryExpense, MenuTemplate, MenuTemplateEntry, DietCount,
  MealEvent, CountSession, StorageMap, MenuCourse, MenuSubstitution, CommissaryFile,
  InventoryCategory, StorageLocation,
} from '@/lib/types';
import {
  dbAddSession, dbUpdateSession, dbDeleteSession,
  dbAddVendor, dbUpdateVendor, dbDeleteVendor,
  dbAddInventoryItem, dbUpdateInventoryItem, dbDeleteInventoryItem, dbAdjustInventory,
  dbAddRecipe, dbUpdateRecipe, dbDeleteRecipe, dbReplaceRecipeChildren,
  dbAddMenuEntry, dbDeleteMenuEntry, dbAddMenuEntries, dbDeleteMenuWeek,
  dbCreateOrder, dbUpdateOrderStatus, dbDeleteOrder, dbReceiveOrder,
  dbUpdateOrderLineQty, dbUpdateOrderTotals, dbAddOrderLine, dbDeleteOrderLine,
  dbSavePlan, dbToggleProductionTask, dbToggleProductionPrepTask,
  dbAddCamper, dbUpdateCamper, dbDeleteCamper, dbReplaceCamperRestrictions, dbImportCampers,
  dbAddExpense, dbDeleteExpense, dbSaveReceivingLine, dbSaveOrderInvoice,
  dbAddTemplate, dbUpdateTemplate, dbDeleteTemplate, dbAddTemplateEntry,
  dbDeleteTemplateEntry, dbAddTemplateEntries,
  dbUpsertDietCount, dbDeleteDietCount,
  dbAddMealEvent, dbUpdateMealEvent, dbDeleteMealEvent,
  dbAddCountSession, dbUpsertStorageMap,
  dbAddMenuCourse, dbUpdateMenuCourse, dbDeleteMenuCourse,
  dbAddSubstitution, dbUpdateSubstitution, dbDeleteSubstitution,
  dbUploadCommissaryFile, dbDeleteCommissaryFile,
} from '@/lib/db';
import {
  demandForEntries, stockStatus, targetPortions, weekCount, recipeAllergens,
  buildDraftOrders, parRequirements, menuSignature, menuConflicts,
  scaledIngredientLabel, formatInStockUnit, tidy, mealHeadCount, peopleDays, perDiem,
  menuForecastCost, dateForCell, ALLERGENS, MEAL_PERIOD_LABELS, PREP_SLOT_ORDER,
  type Allergen, type DemandRow, type StockStatus, type DraftOrder, type MenuConflict,
  type PerDiem, type PrepScheduleSlot, type PrepSlotKey,
} from '@/lib/commissaryUnits';
import { generateId } from '@/lib/utils';

/** Line actuals collected in the receiving screen. */
export interface ReceivingLineInput {
  lineId: string;
  receivedQty: number;
  receivedUnitPrice: number | null;
  receivedNote: string | null;
}

export type CommissaryTab = 'inventory' | 'menu' | 'recipes' | 'production' | 'allergy' | 'ordering' | 'cost';

/** Menu tab shows either concrete session menus or the reusable templates. */
export type MenuView = 'session' | 'templates';

// Discriminated modal state, matching the buildingStore pattern — components
// dispatch openModal, the page renders the match, nothing is prop-drilled.
export type CommissaryModal =
  | { kind: 'item'; editId?: string }
  | { kind: 'adjust'; itemId: string }
  | { kind: 'recipe'; editId?: string }
  | { kind: 'menuEntry'; weekNumber: number; dayIndex: number; mealPeriod: MealPeriod }
  | { kind: 'session'; editId?: string }
  | { kind: 'vendor'; editId?: string }
  | { kind: 'camper'; editId?: string }
  | { kind: 'importCampers' }
  | { kind: 'sendOrder'; orderId: string }
  | { kind: 'receiveOrder'; orderId: string }
  | { kind: 'expense' }
  | { kind: 'mealEvent'; editId?: string; date?: string }
  | { kind: 'template'; editId?: string }
  | { kind: 'applyTemplate' }
  | { kind: 'dietCounts' }
  | { kind: 'templateEntry'; templateId: string; weekNumber: number; dayIndex: number; mealPeriod: MealPeriod }
  | { kind: 'count' }
  | { kind: 'courses' }
  | { kind: 'substitution'; weekNumber: number; dayIndex: number; mealPeriod: MealPeriod; editId?: string };

interface CommissaryState {
  activeTab: CommissaryTab;
  modal: CommissaryModal | null;
  activeSessionId: string | null;
  activeWeek: number;
  inventoryFilter: string;   // category slug | 'all' | 'low'
  inventorySearch: string;
  recipeFilter: string;      // meal period | 'all'
  recipeSearch: string;
  expandedRecipeId: string | null;
  /** Production tab: which day of the active week is on screen. */
  activeDayIndex: number;
  /** Ordering tab: derive quantities from the week's menu, or top up to par. */
  orderSource: OrderSource;

  sessions: CommissarySession[];
  vendors: CommissaryVendor[];
  items: InventoryItem[];
  adjustments: InventoryAdjustment[];
  recipes: Recipe[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  menuEntries: MenuEntry[];
  orders: PurchaseOrder[];
  orderLines: PurchaseOrderLine[];
  plans: ProductionPlan[];
  productionTasks: ProductionTask[];
  prepTasks: ProductionPrepTask[];
  campers: Camper[];
  restrictions: CamperRestriction[];
  /** Aggregate counts. Populated for every member, including those denied names. */
  restrictionSummary: RestrictionSummaryRow[];

  setActiveTab: (t: CommissaryTab) => void;
  openModal: (m: CommissaryModal) => void;
  closeModal: () => void;
  setActiveSession: (id: string | null) => void;
  setActiveWeek: (w: number) => void;
  setInventoryFilter: (f: string) => void;
  setInventorySearch: (q: string) => void;
  setRecipeFilter: (f: string) => void;
  setRecipeSearch: (q: string) => void;
  toggleExpandedRecipe: (id: string) => void;
  setActiveDayIndex: (i: number) => void;
  setOrderSource: (s: OrderSource) => void;

  setSessions: (rows: CommissarySession[]) => void;
  setVendors: (rows: CommissaryVendor[]) => void;
  setItems: (rows: InventoryItem[]) => void;
  setAdjustments: (rows: InventoryAdjustment[]) => void;
  setRecipes: (rows: Recipe[]) => void;
  setIngredients: (rows: RecipeIngredient[]) => void;
  setSteps: (rows: RecipeStep[]) => void;
  setMenuEntries: (rows: MenuEntry[]) => void;
  setOrders: (rows: PurchaseOrder[]) => void;
  setOrderLines: (rows: PurchaseOrderLine[]) => void;
  setPlans: (rows: ProductionPlan[]) => void;
  setProductionTasks: (rows: ProductionTask[]) => void;
  setPrepTasks: (rows: ProductionPrepTask[]) => void;
  setCampers: (rows: Camper[]) => void;
  setRestrictions: (rows: CamperRestriction[]) => void;
  setRestrictionSummary: (rows: RestrictionSummaryRow[]) => void;

  addSession: (s: CommissarySession) => void;
  updateSession: (s: CommissarySession) => void;
  deleteSession: (id: string) => void;

  addVendor: (v: CommissaryVendor) => void;
  updateVendor: (v: CommissaryVendor) => void;
  deleteVendor: (id: string) => void;

  addItem: (i: InventoryItem) => void;
  updateItem: (i: InventoryItem) => void;
  deleteItem: (id: string) => void;
  adjustItem: (itemId: string, deltaBase: number, reason: AdjustmentReason, notes: string | null, by: string | null) => Promise<void>;

  saveRecipe: (r: Recipe, ings: RecipeIngredient[], steps: RecipeStep[], isNew: boolean) => void;
  deleteRecipe: (id: string) => void;

  addMenuEntry: (m: MenuEntry) => void;
  deleteMenuEntry: (id: string) => void;
  copyWeek: (fromWeek: number, toWeek: number) => void;
  clearWeek: (week: number) => void;

  // Ordering
  createOrdersFromDrafts: (drafts: DraftOrder[], source: OrderSource, createdBy: string | null) => void;
  sendOrder: (orderId: string, deliveryInstructions: string | null) => void;
  receiveOrder: (orderId: string, receivedBy: string | null) => Promise<boolean>;
  cancelOrder: (orderId: string) => void;
  deleteOrder: (orderId: string) => void;
  updateOrderLineQty: (lineId: string, orderQty: number) => void;
  addOrderLine: (orderId: string, itemId: string, orderQty: number) => void;
  removeOrderLine: (lineId: string) => void;
  createBlankOrder: (vendorId: string | null, createdBy: string | null) => void;

  // Production
  generatePlan: (weekNumber: number, dayIndex: number, generatedBy: string | null) => void;
  /** Generate/regenerate every day of the week that has at least one recipe on the menu. */
  generateWeek: (weekNumber: number, generatedBy: string | null) => number;
  toggleProductionTask: (taskId: string, userName: string) => void;
  toggleProductionPrepTask: (taskId: string, userName: string) => void;
  /** Persisted, checkable prep tasks due on a given day (ahead-prep for upcoming meals). */
  prepTasksForDay: (week: number, dayIndex: number) => ProductionPrepTask[];

  // Allergy
  addCamper: (c: Camper, restrictions: CamperRestriction[]) => void;
  updateCamper: (c: Camper, restrictions: CamperRestriction[]) => void;
  deleteCamper: (id: string) => void;
  importCampers: (rows: { camper: Camper; restrictions: CamperRestriction[] }[]) => Promise<void>;

  // Selectors
  activeSession: () => CommissarySession | null;
  portions: () => number;
  weeksInSession: () => number;
  itemsById: () => Map<string, InventoryItem>;
  recipesById: () => Map<string, Recipe>;
  ingredientsByRecipe: () => Map<string, RecipeIngredient[]>;
  ingredientsFor: (recipeId: string) => RecipeIngredient[];
  stepsFor: (recipeId: string) => RecipeStep[];
  allergensFor: (recipeId: string) => Allergen[];
  filteredItems: () => InventoryItem[];
  filteredRecipes: () => Recipe[];
  stockCounts: () => Record<StockStatus, number>;
  adjustmentsFor: (itemId: string) => InventoryAdjustment[];
  entriesForCell: (week: number, dayIndex: number, meal: MealPeriod) => MenuEntry[];
  entriesForWeek: (week: number) => MenuEntry[];
  weekDemand: (week: number) => Map<string, DemandRow>;
  /** Items whose on-hand cannot cover this week's menu. The real version of the mock's fake banner. */
  weekShortfalls: (week: number) => { item: InventoryItem; neededBase: number }[];
  /** Menu chips with no recipe attached — invisible to demand and allergen math. */
  unlinkedEntryCount: (week: number) => number;

  // Ordering selectors
  summaryMap: () => Map<string, { camperCount: number; anaphylacticCount: number }>;
  draftOrdersFor: (source: OrderSource, week: number) => DraftOrder[];
  /** Items below the critical threshold, regardless of what's on the menu. */
  criticalItems: () => InventoryItem[];
  /** Draft orders (to reorder level) covering only the critically-low items. */
  criticalDraftOrders: () => DraftOrder[];
  linesForOrder: (orderId: string) => PurchaseOrderLine[];
  ordersByStatus: (status: PurchaseOrder['status']) => PurchaseOrder[];

  // Production selectors
  planFor: (week: number, dayIndex: number) => ProductionPlan | null;
  tasksForPlan: (planId: string) => ProductionTask[];
  /** True when the day's menu changed after the plan was generated. Never auto-fixes. */
  isPlanStale: (week: number, dayIndex: number) => boolean;
  entriesForDay: (week: number, dayIndex: number) => MenuEntry[];

  // Allergy selectors
  /**
   * Which of a recipe's allergens actually collide with a camper here. Driven by the
   * aggregate, so it works for a kitchen user who cannot see camper names.
   */
  conflictsForRecipe: (recipeId: string) => MenuConflict[];
  restrictionsFor: (camperId: string) => CamperRestriction[];
  anaphylacticCampers: () => Camper[];
  totalCampersWithRestrictions: () => number;

  // ── Phase 3: cost, templates, dietary, events, count, compliance ──
  menuView: MenuView;
  activeTemplateId: string | null;
  activeTemplateWeek: number;

  expenses: CommissaryExpense[];
  templates: MenuTemplate[];
  templateEntries: MenuTemplateEntry[];
  dietCounts: DietCount[];
  mealEvents: MealEvent[];
  countSessions: CountSession[];
  storageMap: StorageMap[];

  setMenuView: (v: MenuView) => void;
  setActiveTemplate: (id: string | null) => void;
  setActiveTemplateWeek: (w: number) => void;
  setExpenses: (rows: CommissaryExpense[]) => void;
  setTemplates: (rows: MenuTemplate[]) => void;
  setTemplateEntries: (rows: MenuTemplateEntry[]) => void;
  setDietCounts: (rows: DietCount[]) => void;
  setMealEvents: (rows: MealEvent[]) => void;
  setCountSessions: (rows: CountSession[]) => void;
  setStorageMap: (rows: StorageMap[]) => void;

  addExpense: (date: string, category: InventoryCategory, description: string | null, amount: number, by: string | null) => void;
  deleteExpense: (id: string) => void;

  // Books received (not ordered) quantities + invoice atomically via the RPC.
  receiveOrderWithActuals: (orderId: string, lines: ReceivingLineInput[], invoiceTotal: number | null, invoiceNumber: string | null, by: string | null) => Promise<boolean>;

  createTemplate: (name: string, lengthWeeks: number, notes: string | null) => string;
  updateTemplate: (t: MenuTemplate) => void;
  deleteTemplate: (id: string) => void;
  addTemplateEntry: (templateId: string, weekNumber: number, dayIndex: number, meal: MealPeriod, recipeId: string | null, label: string) => void;
  deleteTemplateEntry: (id: string) => void;
  saveSessionWeeksAsTemplate: (name: string, weekNumbers: number[]) => void;
  applyTemplate: (templateId: string, startWeek: number) => void;

  upsertDietCount: (restriction: string, count: number) => void;
  removeDietCount: (id: string) => void;

  addMealEvent: (e: MealEvent) => void;
  updateMealEvent: (e: MealEvent) => void;
  deleteMealEvent: (id: string) => void;

  recordCount: (counts: { itemId: string; countedStock: number }[], by: string | null) => Promise<void>;
  setStorageMapping: (location: StorageLocation, safetyItemId: string | null) => void;

  activeExpenses: () => CommissaryExpense[];
  eventsForSession: () => MealEvent[];
  eventsForCell: (dateStr: string, meal: MealPeriod) => MealEvent[];
  bagLunchesForDay: (dateStr: string) => MealEvent[];
  mealCount: (dateStr: string, meal: MealPeriod) => number;
  sessionPerDiem: () => PerDiem | null;
  forecastCost: () => number;
  dietCountsForSession: () => DietCount[];
  templateById: (id: string) => MenuTemplate | null;
  templateCellEntries: (templateId: string, week: number, dayIndex: number, meal: MealPeriod) => MenuTemplateEntry[];
  templateEntriesForWeek: (templateId: string, week: number) => MenuTemplateEntry[];
  thawListForDay: (week: number, dayIndex: number) => { item: InventoryItem; neededBase: number }[];
  storageMapFor: (location: StorageLocation) => string | null;

  // ── #2/#3 menu items + courses, #11 substitutions, #9 files ──
  courses: MenuCourse[];
  substitutions: MenuSubstitution[];
  files: CommissaryFile[];
  setCourses: (rows: MenuCourse[]) => void;
  setSubstitutions: (rows: MenuSubstitution[]) => void;
  setFiles: (rows: CommissaryFile[]) => void;

  addCourse: (name: string) => void;
  renameCourse: (id: string, name: string) => void;
  deleteCourse: (id: string) => void;
  /** Seed a first-time camp with the common buckets, once. */
  seedDefaultCourses: () => void;
  coursesSorted: () => MenuCourse[];

  addSubstitution: (s: MenuSubstitution) => void;
  updateSubstitution: (s: MenuSubstitution) => void;
  deleteSubstitution: (id: string) => void;
  substitutionsForCell: (week: number, dayIndex: number, meal: MealPeriod) => MenuSubstitution[];
  substitutionsForDay: (week: number, dayIndex: number) => MenuSubstitution[];
  substitutionsForSession: () => MenuSubstitution[];

  uploadFile: (file: File, sessionId: string | null, by: string | null) => Promise<CommissaryFile | null>;
  deleteFile: (f: CommissaryFile) => Promise<void>;

  /** Allergens for any chip — recipe union, single item's allergens, or none. */
  entryAllergens: (entry: MenuEntry) => Allergen[];
  /** Camper conflicts for any chip (recipe or item), driven by the aggregate summary. */
  conflictsForEntry: (entry: MenuEntry) => MenuConflict[];

  /**
   * #7 — the forward-looking prep calendar. Every timing-tagged recipe step for the
   * week's meals, resolved to the date+slot it must be done (serviceDate − leadDays).
   * Hybrid source: portions come from a generated plan when present (frozen), else the
   * live per-meal head count.
   */
  prepScheduleForWeek: (week: number) => PrepScheduleSlot[];
}

export const useCommissaryStore = create<CommissaryState>((set, get) => ({
  activeTab: 'inventory',
  modal: null,
  activeSessionId: null,
  activeWeek: 1,
  inventoryFilter: 'all',
  inventorySearch: '',
  recipeFilter: 'all',
  recipeSearch: '',
  expandedRecipeId: null,
  activeDayIndex: 0,
  orderSource: 'menu',

  sessions: [],
  vendors: [],
  items: [],
  adjustments: [],
  recipes: [],
  ingredients: [],
  steps: [],
  menuEntries: [],
  orders: [],
  orderLines: [],
  plans: [],
  productionTasks: [],
  prepTasks: [],
  campers: [],
  restrictions: [],
  restrictionSummary: [],

  setActiveTab: (t) => set({ activeTab: t }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),
  setActiveSession: (id) => set({ activeSessionId: id, activeWeek: 1 }),
  setActiveWeek: (w) => set({ activeWeek: w }),
  setInventoryFilter: (f) => set({ inventoryFilter: f }),
  setInventorySearch: (q) => set({ inventorySearch: q }),
  setRecipeFilter: (f) => set({ recipeFilter: f }),
  setRecipeSearch: (q) => set({ recipeSearch: q }),
  toggleExpandedRecipe: (id) => set((s) => ({ expandedRecipeId: s.expandedRecipeId === id ? null : id })),
  setActiveDayIndex: (i) => set({ activeDayIndex: i }),
  setOrderSource: (s) => set({ orderSource: s }),

  setSessions: (rows) => set((s) => ({
    sessions: rows,
    // Default to the active session once data arrives, without stomping a manual pick.
    activeSessionId: s.activeSessionId && rows.some((r) => r.id === s.activeSessionId)
      ? s.activeSessionId
      : (rows.find((r) => r.isActive)?.id ?? rows[0]?.id ?? null),
  })),
  setVendors: (rows) => set({ vendors: rows }),
  setItems: (rows) => set({ items: rows }),
  setAdjustments: (rows) => set({ adjustments: rows }),
  setRecipes: (rows) => set({ recipes: rows }),
  setIngredients: (rows) => set({ ingredients: rows }),
  setSteps: (rows) => set({ steps: rows }),
  setMenuEntries: (rows) => set({ menuEntries: rows }),
  setOrders: (rows) => set({ orders: rows }),
  setOrderLines: (rows) => set({ orderLines: rows }),
  setPlans: (rows) => set({ plans: rows }),
  setProductionTasks: (rows) => set({ productionTasks: rows }),
  setPrepTasks: (rows) => set({ prepTasks: rows }),
  setCampers: (rows) => set({ campers: rows }),
  setRestrictions: (rows) => set({ restrictions: rows }),
  setRestrictionSummary: (rows) => set({ restrictionSummary: rows }),

  addSession: (s) => { set((st) => ({ sessions: [...st.sessions, s], activeSessionId: s.id })); dbAddSession(s); },
  updateSession: (s) => { set((st) => ({ sessions: st.sessions.map((x) => x.id === s.id ? s : x) })); dbUpdateSession(s); },
  deleteSession: (id) => {
    set((st) => ({
      sessions: st.sessions.filter((x) => x.id !== id),
      menuEntries: st.menuEntries.filter((m) => m.sessionId !== id),
      activeSessionId: st.activeSessionId === id ? null : st.activeSessionId,
    }));
    dbDeleteSession(id);
  },

  addVendor: (v) => { set((s) => ({ vendors: [...s.vendors, v] })); dbAddVendor(v); },
  updateVendor: (v) => { set((s) => ({ vendors: s.vendors.map((x) => x.id === v.id ? v : x) })); dbUpdateVendor(v); },
  deleteVendor: (id) => { set((s) => ({ vendors: s.vendors.filter((v) => v.id !== id) })); dbDeleteVendor(id); },

  addItem: (i) => { set((s) => ({ items: [...s.items, i] })); dbAddInventoryItem(i); },
  updateItem: (i) => { set((s) => ({ items: s.items.map((x) => x.id === i.id ? i : x) })); dbUpdateInventoryItem(i); },
  deleteItem: (id) => {
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      // Ingredients survive with itemId nulled (FK is ON DELETE SET NULL); they keep
      // their label so the recipe stays readable, but stop contributing demand.
      ingredients: s.ingredients.map((g) => g.itemId === id ? { ...g, itemId: null, qtyInBase: null } : g),
    }));
    dbDeleteInventoryItem(id);
  },

  // Unlike the other writers, this awaits: the RPC returns the authoritative
  // on-hand after an atomic increment, which may differ from a naive local
  // `onHand + delta` if someone else adjusted concurrently or stock clamped at 0.
  adjustItem: async (itemId, deltaBase, reason, notes, by) => {
    const newOnHand = await dbAdjustInventory(itemId, deltaBase, reason, notes, by);
    if (newOnHand == null) return;
    set((s) => ({
      items: s.items.map((i) => i.id === itemId ? { ...i, onHandBase: newOnHand } : i),
    }));
  },

  saveRecipe: (r, ings, stps, isNew) => {
    set((s) => ({
      recipes: isNew ? [...s.recipes, r] : s.recipes.map((x) => x.id === r.id ? r : x),
      ingredients: [...s.ingredients.filter((g) => g.recipeId !== r.id), ...ings],
      steps: [...s.steps.filter((x) => x.recipeId !== r.id), ...stps],
    }));
    if (isNew) dbAddRecipe(r); else dbUpdateRecipe(r);
    dbReplaceRecipeChildren(r.id, ings, stps);
  },

  deleteRecipe: (id) => {
    set((s) => ({
      recipes: s.recipes.filter((r) => r.id !== id),
      ingredients: s.ingredients.filter((g) => g.recipeId !== id),
      steps: s.steps.filter((x) => x.recipeId !== id),
      // Menu chips survive as free text (FK is ON DELETE SET NULL) so a deleted
      // recipe does not silently blank out a published week.
      menuEntries: s.menuEntries.map((m) => m.recipeId === id
        ? { ...m, recipeId: null, label: m.label ?? s.recipes.find((r) => r.id === id)?.name ?? 'Removed recipe' }
        : m),
      expandedRecipeId: s.expandedRecipeId === id ? null : s.expandedRecipeId,
    }));
    dbDeleteRecipe(id);
  },

  addMenuEntry: (m) => { set((s) => ({ menuEntries: [...s.menuEntries, m] })); dbAddMenuEntry(m); },
  deleteMenuEntry: (id) => { set((s) => ({ menuEntries: s.menuEntries.filter((m) => m.id !== id) })); dbDeleteMenuEntry(id); },

  copyWeek: (fromWeek, toWeek) => {
    const { menuEntries, activeSessionId } = get();
    if (!activeSessionId) return;
    const now = new Date().toISOString();
    const source = menuEntries.filter((m) => m.sessionId === activeSessionId && m.weekNumber === fromWeek);
    const copies: MenuEntry[] = source.map((m) => ({
      ...m, id: generateId(), weekNumber: toWeek, createdAt: now, updatedAt: now,
    }));
    if (!copies.length) return;
    set((s) => ({ menuEntries: [...s.menuEntries, ...copies] }));
    dbAddMenuEntries(copies);
  },

  clearWeek: (week) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    set((s) => ({
      menuEntries: s.menuEntries.filter((m) => !(m.sessionId === activeSessionId && m.weekNumber === week)),
    }));
    dbDeleteMenuWeek(activeSessionId, week);
  },

  // ─── Ordering ──────────────────────────────────────────────────────────────

  createOrdersFromDrafts: (drafts, source, createdBy) => {
    const { activeSessionId, activeWeek } = get();
    const now = new Date().toISOString();

    for (const draft of drafts) {
      const orderId = generateId();
      const order: PurchaseOrder = {
        id: orderId,
        vendorId: draft.vendorId,
        vendorName: draft.vendorName,
        status: 'draft',
        source,
        sessionId: source === 'menu' ? activeSessionId : null,
        weekNumber: source === 'menu' ? activeWeek : null,
        subtotal: draft.subtotal,
        deliveryFee: draft.deliveryFee,
        total: draft.total,
        deliveryInstructions: null,
        createdBy,
        sentAt: null,
        receivedAt: null,
        invoiceTotal: null,
        invoiceNumber: null,
        createdAt: now,
        updatedAt: now,
      };
      // Every line freezes the item's name, pack factor, on-hand and price as of now.
      const lines: PurchaseOrderLine[] = draft.lines.map((l, idx) => ({
        id: generateId(), orderId, itemId: l.itemId, itemName: l.itemName,
        stockUnit: l.stockUnit, purchaseUnit: l.purchaseUnit,
        purchaseUnitInBase: l.purchaseUnitInBase, onHandBase: l.onHandBase,
        neededBase: l.neededBase, orderQty: l.orderQty, unitPrice: l.unitPrice,
        lineTotal: l.lineTotal, receivedQty: null, receivedUnitPrice: null, receivedNote: null,
        sortOrder: idx, createdAt: now, updatedAt: now,
      }));

      set((s) => ({ orders: [order, ...s.orders], orderLines: [...s.orderLines, ...lines] }));
      dbCreateOrder(order, lines);
    }
  },

  sendOrder: (orderId, deliveryInstructions) => {
    const now = new Date().toISOString();
    set((s) => ({
      orders: s.orders.map((o) => o.id === orderId
        ? { ...o, status: 'sent' as const, sentAt: now, deliveryInstructions }
        : o),
    }));
    dbUpdateOrderStatus(orderId, 'sent', deliveryInstructions);
  },

  // Awaits: the RPC books every line into stock atomically and only it knows the
  // resulting on-hand values. Applying an optimistic stock bump here would double-count
  // once the inventory subscription delivers the real numbers.
  receiveOrder: async (orderId, receivedBy) => {
    const ok = await dbReceiveOrder(orderId, receivedBy);
    if (!ok) return false;
    set((s) => ({
      orders: s.orders.map((o) => o.id === orderId
        ? { ...o, status: 'received' as const, receivedAt: new Date().toISOString() }
        : o),
    }));
    return true;
  },

  cancelOrder: (orderId) => {
    set((s) => ({ orders: s.orders.map((o) => o.id === orderId ? { ...o, status: 'cancelled' as const } : o) }));
    dbUpdateOrderStatus(orderId, 'cancelled');
  },

  deleteOrder: (orderId) => {
    set((s) => ({
      orders: s.orders.filter((o) => o.id !== orderId),
      orderLines: s.orderLines.filter((l) => l.orderId !== orderId),
    }));
    dbDeleteOrder(orderId);
  },

  updateOrderLineQty: (lineId, orderQty) => {
    const { orderLines, orders } = get();
    const line = orderLines.find((l) => l.id === lineId);
    if (!line) return;
    const newTotal = tidy((line.unitPrice ?? 0) * orderQty);

    set((s) => ({
      orderLines: s.orderLines.map((l) => l.id === lineId ? { ...l, orderQty, lineTotal: newTotal } : l),
    }));
    dbUpdateOrderLineQty(lineId, orderQty, newTotal);

    // Re-total the parent order from its lines rather than patching a delta, so a
    // sequence of edits can never drift away from the sum.
    const order = orders.find((o) => o.id === line.orderId);
    if (!order) return;
    const subtotal = tidy(
      get().orderLines
        .filter((l) => l.orderId === order.id)
        .reduce((sum, l) => sum + (l.id === lineId ? newTotal : l.lineTotal), 0),
    );
    const total = tidy(subtotal + order.deliveryFee);
    set((s) => ({ orders: s.orders.map((o) => o.id === order.id ? { ...o, subtotal, total } : o) }));
    dbUpdateOrderTotals(order.id, subtotal, total);
  },

  // Add any inventory item to a draft — not just ones flagged short. Adding an item
  // already on the order bumps its quantity rather than creating a duplicate line.
  addOrderLine: (orderId, itemId, qty) => {
    const { items, orderLines, orders } = get();
    const item = items.find((i) => i.id === itemId);
    const order = orders.find((o) => o.id === orderId);
    if (!item || !order || qty <= 0) return;

    const dup = orderLines.find((l) => l.orderId === orderId && l.itemId === itemId);
    if (dup) { get().updateOrderLineQty(dup.id, dup.orderQty + qty); return; }

    const now = new Date().toISOString();
    const line: PurchaseOrderLine = {
      id: generateId(), orderId, itemId: item.id, itemName: item.name,
      stockUnit: item.stockUnit, purchaseUnit: item.purchaseUnit,
      purchaseUnitInBase: item.purchaseUnitInBase, onHandBase: item.onHandBase,
      // neededBase 0 = manually added, not demand-driven. UI shows "—".
      neededBase: 0, orderQty: qty, unitPrice: item.unitPrice,
      lineTotal: tidy((item.unitPrice ?? 0) * qty),
      receivedQty: null, receivedUnitPrice: null, receivedNote: null,
      sortOrder: orderLines.filter((l) => l.orderId === orderId).length,
      createdAt: now, updatedAt: now,
    };
    set((s) => ({ orderLines: [...s.orderLines, line] }));
    dbAddOrderLine(orderId, line);

    const subtotal = tidy(get().orderLines.filter((l) => l.orderId === orderId).reduce((sum, l) => sum + l.lineTotal, 0));
    const total = tidy(subtotal + order.deliveryFee);
    set((s) => ({ orders: s.orders.map((o) => o.id === orderId ? { ...o, subtotal, total } : o) }));
    dbUpdateOrderTotals(orderId, subtotal, total);
  },

  removeOrderLine: (lineId) => {
    const { orderLines, orders } = get();
    const line = orderLines.find((l) => l.id === lineId);
    if (!line) return;
    const order = orders.find((o) => o.id === line.orderId);
    set((s) => ({ orderLines: s.orderLines.filter((l) => l.id !== lineId) }));
    dbDeleteOrderLine(lineId);
    if (!order) return;
    const subtotal = tidy(get().orderLines.filter((l) => l.orderId === order.id).reduce((sum, l) => sum + l.lineTotal, 0));
    const total = tidy(subtotal + order.deliveryFee);
    set((s) => ({ orders: s.orders.map((o) => o.id === order.id ? { ...o, subtotal, total } : o) }));
    dbUpdateOrderTotals(order.id, subtotal, total);
  },

  // A blank draft for one vendor, to build an order by hand rather than from a
  // suggestion. `source: 'par'` just marks it as not-menu-derived.
  createBlankOrder: (vendorId, createdBy) => {
    const vendor = vendorId ? get().vendors.find((v) => v.id === vendorId) : undefined;
    const now = new Date().toISOString();
    const fee = vendor?.deliveryFee ?? 0;
    const order: PurchaseOrder = {
      id: generateId(), vendorId: vendor?.id ?? null, vendorName: vendor?.name ?? 'No vendor assigned',
      status: 'draft', source: 'par', sessionId: null, weekNumber: null,
      subtotal: 0, deliveryFee: fee, total: fee,
      invoiceTotal: null, invoiceNumber: null,
      deliveryInstructions: null, createdBy, sentAt: null, receivedAt: null,
      createdAt: now, updatedAt: now,
    };
    set((s) => ({ orders: [order, ...s.orders] }));
    dbCreateOrder(order, []);
  },

  // ─── Production ────────────────────────────────────────────────────────────

  // Explicit, never automatic. Regenerating discards the day's completion state, which
  // is why the UI confirms first and why nothing calls this on a menu edit.
  generatePlan: (weekNumber, dayIndex, generatedBy) => {
    const state = get();
    const session = state.activeSession();
    if (!session) return;

    const sessionPortions = state.portions();
    const entries = state.entriesForDay(weekNumber, dayIndex);
    const recipesById = state.recipesById();
    const byId = state.itemsById();
    const now = new Date().toISOString();
    const planId = generateId();
    const dateStr = dateForCell(session.startDate, weekNumber, dayIndex).toISOString().slice(0, 10);

    const plan: ProductionPlan = {
      id: planId,
      sessionId: session.id,
      weekNumber,
      dayIndex,
      portions: sessionPortions,
      menuSignature: menuSignature(entries),
      generatedBy,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Free-text chips produce no task: there is no recipe, so there is nothing to prep
    // against. They stay visible on the menu, and the UI says how many were skipped.
    // Each meal scales to its OWN head count, so a visiting-day lunch or off-site
    // dinner produces the right quantities.
    const tasks: ProductionTask[] = [];
    let sort = 0;
    for (const entry of entries) {
      const mealPortions = state.mealCount(dateStr, entry.mealPeriod);

      if (entry.recipeId) {
        const recipe = recipesById.get(entry.recipeId);
        if (!recipe) continue;
        const ings = state.ingredientsFor(recipe.id);
        const snapshot: ProductionIngredient[] = ings.map((ing) => {
          const item = ing.itemId ? byId.get(ing.itemId) : undefined;
          return {
            label: ing.label,
            qty: scaledIngredientLabel(ing, recipe, mealPortions, item),
            linked: Boolean(item),
          };
        });
        tasks.push({
          id: generateId(), planId, recipeId: recipe.id, mealPeriod: entry.mealPeriod,
          title: recipe.name, portions: mealPortions, ingredients: snapshot,
          allergens: state.allergensFor(recipe.id),
          prepTime: recipe.prepTime, cookTime: recipe.cookTime, notes: null,
          isComplete: false, completedBy: null, completedAt: null,
          sortOrder: sort++, createdAt: now, updatedAt: now,
        });
      } else if (entry.itemId && entry.itemQtyBase != null) {
        // A single-item chip: no recipe to prep, just a quantity to portion/serve.
        const item = byId.get(entry.itemId);
        const base = entry.itemQtyBase * mealPortions;
        tasks.push({
          id: generateId(), planId, recipeId: null, mealPeriod: entry.mealPeriod,
          title: entry.label ?? item?.name ?? 'Item', portions: mealPortions,
          ingredients: item ? [{ label: item.name, qty: formatInStockUnit(item, base), linked: true }] : [],
          allergens: item ? ALLERGENS.filter((a) => item.allergens.includes(a)) : [],
          prepTime: null, cookTime: null, notes: 'Serve — no prep needed.',
          isComplete: false, completedBy: null, completedAt: null,
          sortOrder: sort++, createdAt: now, updatedAt: now,
        });
      }
    }

    // Bag lunches for trips are their own tasks at their own count.
    for (const bag of state.bagLunchesForDay(dateStr)) {
      tasks.push({
        id: generateId(), planId, recipeId: null,
        mealPeriod: bag.mealPeriod ?? 'lunch',
        title: bag.label, portions: bag.count,
        ingredients: [], allergens: [],
        prepTime: null, cookTime: null,
        notes: bag.notes ?? 'Bag lunch — pack separately for off-site.',
        isComplete: false, completedBy: null, completedAt: null,
        sortOrder: 900 + sort++, createdAt: now, updatedAt: now,
      });
    }

    // ── Prep tasks: time-phased steps + auto freezer pulls ──────────────────────
    const serviceDateObj = dateForCell(session.startDate, weekNumber, dayIndex);
    const prepTasks: ProductionPrepTask[] = [];
    let psort = 0;

    // A recipe with its own ahead-of-time steps handles its own thawing, so we don't
    // also auto-generate a freezer pull for its frozen ingredients (that was the salmon
    // double-entry). Collect those "covered" freezer items first.
    const coveredFreezer = new Set<string>();
    for (const entry of entries) {
      if (!entry.recipeId) continue;
      const recipe = recipesById.get(entry.recipeId);
      if (!recipe) continue;
      const steps = state.stepsFor(recipe.id);
      if (steps.some((s) => (s.leadDays ?? 0) > 0)) {
        for (const ing of state.ingredientsFor(recipe.id)) {
          const it = ing.itemId ? byId.get(ing.itemId) : undefined;
          if (it && it.storageLocation === 'walk_in_freezer') coveredFreezer.add(it.id);
        }
      }
      // A step becomes a scheduled prep task only when it carries a WHEN (lead time or
      // slot); a plain day-of step is just cooking, already covered by the dish task.
      const mealPortions = state.mealCount(dateStr, entry.mealPeriod);
      for (const s of steps) {
        if ((s.leadDays ?? 0) === 0 && !s.timeSlot) continue;
        const prep = new Date(serviceDateObj);
        prep.setDate(prep.getDate() - (s.leadDays ?? 0));
        prepTasks.push({
          id: generateId(), planId, recipeId: recipe.id,
          prepDate: prep.toISOString().slice(0, 10), timeSlot: s.timeSlot,
          mealPeriod: entry.mealPeriod, serviceDate: dateStr,
          title: recipe.name, instruction: s.instruction, portions: mealPortions,
          isComplete: false, completedBy: null, completedAt: null,
          sortOrder: psort++, createdAt: now, updatedAt: now,
        });
      }
    }

    // Auto freezer pulls the night before, for frozen ingredients whose recipe has no
    // ahead-prep step of its own. Replaces the old service-day "thaw list".
    const dayDemand = demandForEntries(entries, recipesById, state.ingredientsByRecipe(),
      (e) => state.mealCount(dateStr, e.mealPeriod));
    const nightBefore = new Date(serviceDateObj);
    nightBefore.setDate(nightBefore.getDate() - 1);
    const nightBeforeStr = nightBefore.toISOString().slice(0, 10);
    for (const row of dayDemand.values()) {
      const item = byId.get(row.itemId);
      if (!item || item.storageLocation !== 'walk_in_freezer' || coveredFreezer.has(item.id)) continue;
      prepTasks.push({
        id: generateId(), planId, recipeId: null,
        prepDate: nightBeforeStr, timeSlot: 'evening', mealPeriod: 'dinner',
        serviceDate: dateStr, title: 'Freezer pull',
        instruction: `Pull ${item.name} from freezer — ${formatInStockUnit(item, row.neededBase)}`,
        portions: 0, isComplete: false, completedBy: null, completedAt: null,
        sortOrder: 800 + psort++, createdAt: now, updatedAt: now,
      });
    }

    set((s) => {
      const isThisCell = (planId2: string) => {
        const old = s.plans.find((p) => p.id === planId2);
        return Boolean(old && old.sessionId === session.id && old.weekNumber === weekNumber && old.dayIndex === dayIndex);
      };
      return {
        plans: [...s.plans.filter((p) => !(p.sessionId === session.id && p.weekNumber === weekNumber && p.dayIndex === dayIndex)), plan],
        productionTasks: [...s.productionTasks.filter((t) => !isThisCell(t.planId)), ...tasks],
        prepTasks: [...s.prepTasks.filter((t) => !isThisCell(t.planId)), ...prepTasks],
      };
    });
    dbSavePlan(plan, tasks, prepTasks);
  },

  // Regenerate the whole week in one action. Skips days with no linked recipe so we
  // don't create empty plans. Returns how many days were generated.
  generateWeek: (weekNumber, generatedBy) => {
    let count = 0;
    for (let d = 0; d < 7; d++) {
      if (get().entriesForDay(weekNumber, d).some((e) => e.recipeId)) {
        get().generatePlan(weekNumber, d, generatedBy);
        count++;
      }
    }
    return count;
  },

  toggleProductionTask: (taskId, userName) => {
    const task = get().productionTasks.find((t) => t.id === taskId);
    if (!task) return;
    const next = !task.isComplete;
    set((s) => ({
      productionTasks: s.productionTasks.map((t) => t.id === taskId
        ? { ...t, isComplete: next, completedBy: next ? userName : null, completedAt: next ? new Date().toISOString() : null }
        : t),
    }));
    dbToggleProductionTask(taskId, next, next ? userName : null);
  },

  toggleProductionPrepTask: (taskId, userName) => {
    const task = get().prepTasks.find((t) => t.id === taskId);
    if (!task) return;
    const next = !task.isComplete;
    set((s) => ({
      prepTasks: s.prepTasks.map((t) => t.id === taskId
        ? { ...t, isComplete: next, completedBy: next ? userName : null, completedAt: next ? new Date().toISOString() : null }
        : t),
    }));
    dbToggleProductionPrepTask(taskId, next, next ? userName : null);
  },

  prepTasksForDay: (week, dayIndex) => {
    const { prepTasks, plans, activeSessionId } = get();
    const session = get().activeSession();
    if (!session) return [];
    const dateStr = dateForCell(session.startDate, week, dayIndex).toISOString().slice(0, 10);
    const sessionPlanIds = new Set(plans.filter((p) => p.sessionId === activeSessionId).map((p) => p.id));
    return prepTasks
      .filter((t) => sessionPlanIds.has(t.planId) && t.prepDate === dateStr)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  // ─── Allergy ───────────────────────────────────────────────────────────────
  // These writes will be rejected by RLS for anyone without camper health access. The
  // UI never renders the controls in that case, so a rejection here means a bug, not a
  // permission check.

  addCamper: (c, restrictions) => {
    set((s) => ({ campers: [...s.campers, c], restrictions: [...s.restrictions, ...restrictions] }));
    dbAddCamper(c, restrictions);
  },

  updateCamper: (c, restrictions) => {
    set((s) => ({
      campers: s.campers.map((x) => x.id === c.id ? c : x),
      restrictions: [...s.restrictions.filter((r) => r.camperId !== c.id), ...restrictions],
    }));
    dbUpdateCamper(c);
    dbReplaceCamperRestrictions(c.id, restrictions);
  },

  deleteCamper: (id) => {
    set((s) => ({
      campers: s.campers.filter((c) => c.id !== id),
      restrictions: s.restrictions.filter((r) => r.camperId !== id),
    }));
    dbDeleteCamper(id);
  },

  importCampers: async (rows) => {
    set((s) => ({
      campers: [...s.campers, ...rows.map((r) => r.camper)],
      restrictions: [...s.restrictions, ...rows.flatMap((r) => r.restrictions)],
    }));
    await dbImportCampers(rows);
  },

  // ─── Selectors ─────────────────────────────────────────────────────────────

  activeSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId) ?? null;
  },

  portions: () => {
    const s = get().activeSession();
    return s ? targetPortions(s.camperCount, s.staffCount) : 0;
  },

  weeksInSession: () => {
    const s = get().activeSession();
    return s ? weekCount(s.startDate, s.endDate) : 1;
  },

  itemsById: () => new Map(get().items.map((i) => [i.id, i])),
  recipesById: () => new Map(get().recipes.map((r) => [r.id, r])),

  ingredientsByRecipe: () => {
    const map = new Map<string, RecipeIngredient[]>();
    for (const g of get().ingredients) {
      const arr = map.get(g.recipeId);
      if (arr) arr.push(g); else map.set(g.recipeId, [g]);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  },

  ingredientsFor: (recipeId) =>
    get().ingredients.filter((g) => g.recipeId === recipeId).sort((a, b) => a.sortOrder - b.sortOrder),

  stepsFor: (recipeId) =>
    get().steps.filter((s) => s.recipeId === recipeId).sort((a, b) => a.stepNumber - b.stepNumber),

  allergensFor: (recipeId) =>
    recipeAllergens(get().ingredientsFor(recipeId), get().itemsById()),

  filteredItems: () => {
    const { items, inventoryFilter, inventorySearch } = get();
    const q = inventorySearch.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (inventoryFilter === 'all') return true;
      if (inventoryFilter === 'low') return stockStatus(i) !== 'ok';
      return i.category === inventoryFilter;
    });
  },

  filteredRecipes: () => {
    const { recipes, recipeFilter, recipeSearch } = get();
    const q = recipeSearch.trim().toLowerCase();
    return recipes.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (recipeFilter === 'all') return true;
      return r.mealPeriod === recipeFilter;
    });
  },

  stockCounts: () => {
    const counts: Record<StockStatus, number> = { ok: 0, low: 0, critical: 0 };
    for (const i of get().items) counts[stockStatus(i)] += 1;
    return counts;
  },

  adjustmentsFor: (itemId) => get().adjustments.filter((a) => a.itemId === itemId),

  entriesForCell: (week, dayIndex, meal) => {
    const { menuEntries, activeSessionId } = get();
    return menuEntries
      .filter((m) => m.sessionId === activeSessionId && m.weekNumber === week
        && m.dayIndex === dayIndex && m.mealPeriod === meal)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  entriesForWeek: (week) => {
    const { menuEntries, activeSessionId } = get();
    return menuEntries.filter((m) => m.sessionId === activeSessionId && m.weekNumber === week);
  },

  weekDemand: (week) => {
    const state = get();
    const session = state.activeSession();
    // Scale each entry by its OWN meal's head count (per-meal session counts + events),
    // not the flat session total — otherwise ordering over-orders for smaller meals.
    const portionsFor = session
      ? (e: MenuEntry) => state.mealCount(dateForCell(session.startDate, e.weekNumber, e.dayIndex).toISOString().slice(0, 10), e.mealPeriod)
      : state.portions();
    return demandForEntries(state.entriesForWeek(week), state.recipesById(), state.ingredientsByRecipe(), portionsFor);
  },

  weekShortfalls: (week) => {
    const demand = get().weekDemand(week);
    const byId = get().itemsById();
    const out: { item: InventoryItem; neededBase: number }[] = [];
    for (const row of demand.values()) {
      const item = byId.get(row.itemId);
      if (item && item.onHandBase < row.neededBase) out.push({ item, neededBase: row.neededBase });
    }
    return out.sort((a, b) => (b.neededBase - b.item.onHandBase) - (a.neededBase - a.item.onHandBase));
  },

  unlinkedEntryCount: (week) => get().entriesForWeek(week).filter((m) => !m.recipeId).length,

  // ─── Ordering selectors ────────────────────────────────────────────────────

  summaryMap: () => new Map(
    get().restrictionSummary.map((r) => [r.restriction, {
      camperCount: r.camperCount,
      anaphylacticCount: r.anaphylacticCount,
    }]),
  ),

  draftOrdersFor: (source, week) => {
    const state = get();
    const vendorsById = new Map(state.vendors.map((v) => [v.id, {
      id: v.id, name: v.name, deliveryFee: v.deliveryFee,
    }]));

    if (source === 'par') {
      return buildDraftOrders(state.items, parRequirements(state.items), vendorsById);
    }
    // Menu-driven: what the week's recipes actually consume.
    const demand = state.weekDemand(week);
    const needed = new Map<string, number>();
    for (const row of demand.values()) needed.set(row.itemId, row.neededBase);
    return buildDraftOrders(state.items, needed, vendorsById);
  },

  criticalItems: () => get().items.filter((i) => stockStatus(i) === 'critical'),

  criticalDraftOrders: () => {
    const state = get();
    const vendorsById = new Map(state.vendors.map((v) => [v.id, { id: v.id, name: v.name, deliveryFee: v.deliveryFee }]));
    const critical = state.criticalItems();
    const needed = new Map<string, number>();
    // Reorder-level requirement, but only for the critically-low items.
    for (const i of critical) if (i.parLevelBase > 0) needed.set(i.id, i.parLevelBase);
    return buildDraftOrders(critical, needed, vendorsById);
  },

  linesForOrder: (orderId) =>
    get().orderLines.filter((l) => l.orderId === orderId).sort((a, b) => a.sortOrder - b.sortOrder),

  ordersByStatus: (status) => get().orders.filter((o) => o.status === status),

  // ─── Production selectors ──────────────────────────────────────────────────

  entriesForDay: (week, dayIndex) => {
    const { menuEntries, activeSessionId } = get();
    return menuEntries
      .filter((m) => m.sessionId === activeSessionId && m.weekNumber === week && m.dayIndex === dayIndex)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  planFor: (week, dayIndex) => {
    const { plans, activeSessionId } = get();
    return plans.find((p) => p.sessionId === activeSessionId && p.weekNumber === week && p.dayIndex === dayIndex) ?? null;
  },

  tasksForPlan: (planId) =>
    get().productionTasks.filter((t) => t.planId === planId).sort((a, b) => a.sortOrder - b.sortOrder),

  isPlanStale: (week, dayIndex) => {
    const plan = get().planFor(week, dayIndex);
    if (!plan) return false;
    return plan.menuSignature !== menuSignature(get().entriesForDay(week, dayIndex));
  },

  // ─── Allergy selectors ─────────────────────────────────────────────────────

  conflictsForRecipe: (recipeId) => menuConflicts(get().allergensFor(recipeId), get().summaryMap()),

  restrictionsFor: (camperId) => get().restrictions.filter((r) => r.camperId === camperId),

  anaphylacticCampers: () => {
    const ids = new Set(get().restrictions.filter((r) => r.severity === 'anaphylactic').map((r) => r.camperId));
    return get().campers.filter((c) => ids.has(c.id));
  },

  totalCampersWithRestrictions: () => new Set(get().restrictions.map((r) => r.camperId)).size,

  // ─── Phase 3 state ─────────────────────────────────────────────────────────
  menuView: 'session',
  activeTemplateId: null,
  activeTemplateWeek: 1,
  expenses: [],
  templates: [],
  templateEntries: [],
  dietCounts: [],
  mealEvents: [],
  countSessions: [],
  storageMap: [],
  courses: [],
  substitutions: [],
  files: [],

  setCourses: (rows) => set({ courses: rows }),
  setSubstitutions: (rows) => set({ substitutions: rows }),
  setFiles: (rows) => set({ files: rows }),

  setMenuView: (v) => set({ menuView: v }),
  setActiveTemplate: (id) => set({ activeTemplateId: id, activeTemplateWeek: 1 }),
  setActiveTemplateWeek: (w) => set({ activeTemplateWeek: w }),
  setExpenses: (rows) => set({ expenses: rows }),
  setTemplates: (rows) => set({ templates: rows }),
  setTemplateEntries: (rows) => set({ templateEntries: rows }),
  setDietCounts: (rows) => set({ dietCounts: rows }),
  setMealEvents: (rows) => set({ mealEvents: rows }),
  setCountSessions: (rows) => set({ countSessions: rows }),
  setStorageMap: (rows) => set({ storageMap: rows }),

  // ── Cost ──
  addExpense: (date, category, description, amount, by) => {
    const now = new Date().toISOString();
    const e: CommissaryExpense = {
      id: generateId(), sessionId: get().activeSessionId, date, category,
      description, amount, createdBy: by, createdAt: now, updatedAt: now,
    };
    set((s) => ({ expenses: [e, ...s.expenses] }));
    dbAddExpense(e);
  },
  deleteExpense: (id) => { set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })); dbDeleteExpense(id); },

  // ── Receiving actuals ──
  // Persist per-line received quantities + the invoice, THEN book via the RPC, which
  // reads received_qty and books that (falling back to ordered). Awaits so the writes
  // land before the RPC runs.
  receiveOrderWithActuals: async (orderId, lines, invoiceTotal, invoiceNumber, by) => {
    await Promise.all(lines.map((l) => dbSaveReceivingLine(l.lineId, l.receivedQty, l.receivedUnitPrice, l.receivedNote)));
    await dbSaveOrderInvoice(orderId, invoiceTotal, invoiceNumber);
    const ok = await dbReceiveOrder(orderId, by);
    if (!ok) return false;
    set((s) => ({
      orders: s.orders.map((o) => o.id === orderId
        ? { ...o, status: 'received' as const, receivedAt: new Date().toISOString(), invoiceTotal, invoiceNumber }
        : o),
      orderLines: s.orderLines.map((l) => {
        const inp = lines.find((x) => x.lineId === l.id);
        return inp ? { ...l, receivedQty: inp.receivedQty, receivedUnitPrice: inp.receivedUnitPrice, receivedNote: inp.receivedNote } : l;
      }),
    }));
    return true;
  },

  // ── Templates ──
  createTemplate: (name, lengthWeeks, notes) => {
    const now = new Date().toISOString();
    const t: MenuTemplate = { id: generateId(), name, lengthWeeks, notes, createdAt: now, updatedAt: now };
    set((s) => ({ templates: [...s.templates, t], activeTemplateId: t.id, activeTemplateWeek: 1 }));
    dbAddTemplate(t);
    return t.id;
  },
  updateTemplate: (t) => { set((s) => ({ templates: s.templates.map((x) => x.id === t.id ? t : x) })); dbUpdateTemplate(t); },
  deleteTemplate: (id) => {
    set((s) => ({
      templates: s.templates.filter((t) => t.id !== id),
      templateEntries: s.templateEntries.filter((e) => e.templateId !== id),
      activeTemplateId: s.activeTemplateId === id ? null : s.activeTemplateId,
    }));
    dbDeleteTemplate(id);
  },
  addTemplateEntry: (templateId, weekNumber, dayIndex, meal, recipeId, label) => {
    const now = new Date().toISOString();
    const e: MenuTemplateEntry = {
      id: generateId(), templateId, weekNumber, dayIndex, mealPeriod: meal,
      recipeId, itemId: null, itemQtyBase: null, course: null, label: label || null,
      sortOrder: get().templateEntries.filter((x) => x.templateId === templateId && x.weekNumber === weekNumber && x.dayIndex === dayIndex && x.mealPeriod === meal).length,
      createdAt: now, updatedAt: now,
    };
    set((s) => ({ templateEntries: [...s.templateEntries, e] }));
    dbAddTemplateEntry(e);
  },
  deleteTemplateEntry: (id) => { set((s) => ({ templateEntries: s.templateEntries.filter((e) => e.id !== id) })); dbDeleteTemplateEntry(id); },

  // Capture the active session's chosen weeks into a new reusable template.
  saveSessionWeeksAsTemplate: (name, weekNumbers) => {
    const { activeSessionId, menuEntries } = get();
    if (!activeSessionId) return;
    const now = new Date().toISOString();
    const templateId = generateId();
    const t: MenuTemplate = { id: templateId, name, lengthWeeks: weekNumbers.length, notes: null, createdAt: now, updatedAt: now };
    const entries: MenuTemplateEntry[] = [];
    weekNumbers.forEach((srcWeek, idx) => {
      const tWeek = idx + 1;
      menuEntries.filter((m) => m.sessionId === activeSessionId && m.weekNumber === srcWeek).forEach((m) => {
        entries.push({
          id: generateId(), templateId, weekNumber: tWeek, dayIndex: m.dayIndex,
          mealPeriod: m.mealPeriod, recipeId: m.recipeId, itemId: m.itemId,
          itemQtyBase: m.itemQtyBase, course: m.course, label: m.label,
          sortOrder: m.sortOrder, createdAt: now, updatedAt: now,
        });
      });
    });
    set((s) => ({ templates: [...s.templates, t], templateEntries: [...s.templateEntries, ...entries], activeTemplateId: templateId }));
    dbAddTemplate(t);
    dbAddTemplateEntries(entries);
  },

  // Fill the active session's weeks from a template, repeating its cycle. Replaces
  // every menu entry from startWeek onward — confirm-gated in the UI.
  applyTemplate: (templateId, startWeek) => {
    const { activeSessionId, templates, templateEntries } = get();
    if (!activeSessionId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const totalWeeks = get().weeksInSession();
    const now = new Date().toISOString();
    const newEntries: MenuEntry[] = [];
    for (let w = startWeek; w <= totalWeeks; w++) {
      const cycleWeek = ((w - startWeek) % template.lengthWeeks) + 1;
      templateEntries.filter((e) => e.templateId === templateId && e.weekNumber === cycleWeek).forEach((e) => {
        newEntries.push({
          id: generateId(), sessionId: activeSessionId, weekNumber: w, dayIndex: e.dayIndex,
          mealPeriod: e.mealPeriod, recipeId: e.recipeId, itemId: e.itemId,
          itemQtyBase: e.itemQtyBase, course: e.course, label: e.label,
          sortOrder: e.sortOrder, createdAt: now, updatedAt: now,
        });
      });
    }
    set((s) => ({
      menuEntries: [
        ...s.menuEntries.filter((m) => !(m.sessionId === activeSessionId && m.weekNumber >= startWeek)),
        ...newEntries,
      ],
    }));
    for (let w = startWeek; w <= totalWeeks; w++) dbDeleteMenuWeek(activeSessionId, w);
    dbAddMenuEntries(newEntries);
  },

  // ── Diet counts ──
  upsertDietCount: (restriction, count) => {
    const { activeSessionId, dietCounts } = get();
    if (!activeSessionId) return;
    const now = new Date().toISOString();
    const existing = dietCounts.find((d) => d.sessionId === activeSessionId && d.restriction === restriction);
    const row: DietCount = existing
      ? { ...existing, count, updatedAt: now }
      : { id: generateId(), sessionId: activeSessionId, restriction, count, createdAt: now, updatedAt: now };
    set((s) => ({ dietCounts: existing ? s.dietCounts.map((d) => d.id === existing.id ? row : d) : [...s.dietCounts, row] }));
    dbUpsertDietCount(row);
  },
  removeDietCount: (id) => { set((s) => ({ dietCounts: s.dietCounts.filter((d) => d.id !== id) })); dbDeleteDietCount(id); },

  // ── Meal events ──
  addMealEvent: (e) => { set((s) => ({ mealEvents: [...s.mealEvents, e] })); dbAddMealEvent(e); },
  updateMealEvent: (e) => { set((s) => ({ mealEvents: s.mealEvents.map((x) => x.id === e.id ? e : x) })); dbUpdateMealEvent(e); },
  deleteMealEvent: (id) => { set((s) => ({ mealEvents: s.mealEvents.filter((e) => e.id !== id) })); dbDeleteMealEvent(id); },

  // ── Physical count ──
  // Each changed item posts a count_correction adjustment (through the atomic RPC) to
  // reconcile on-hand to the counted amount; a count_session row records the event.
  recordCount: async (counts, by) => {
    const items = get().items;
    const now = new Date().toISOString();
    let changed = 0;
    for (const c of counts) {
      const item = items.find((i) => i.id === c.itemId);
      if (!item) continue;
      const countedBase = c.countedStock * item.stockUnitInBase;
      const delta = tidy(countedBase - item.onHandBase, 4);
      if (delta === 0) continue;
      changed++;
      const newOnHand = await dbAdjustInventory(item.id, delta, 'count_correction', 'Physical count', by);
      if (newOnHand != null) set((s) => ({ items: s.items.map((i) => i.id === item.id ? { ...i, onHandBase: newOnHand } : i) }));
    }
    if (changed > 0) {
      const cs: CountSession = { id: generateId(), date: now.slice(0, 10), countedBy: by, note: null, itemCount: changed, createdAt: now };
      set((s) => ({ countSessions: [cs, ...s.countSessions] }));
      dbAddCountSession(cs);
    }
  },

  // ── Storage → safety-temp map ──
  setStorageMapping: (location, safetyItemId) => {
    const now = new Date().toISOString();
    const existing = get().storageMap.find((m) => m.storageLocation === location);
    const row: StorageMap = existing
      ? { ...existing, safetyItemId, updatedAt: now }
      : { id: generateId(), storageLocation: location, safetyItemId, createdAt: now, updatedAt: now };
    set((s) => ({ storageMap: existing ? s.storageMap.map((m) => m.id === existing.id ? row : m) : [...s.storageMap, row] }));
    dbUpsertStorageMap(row);
  },

  // ─── Phase 3 selectors ─────────────────────────────────────────────────────
  activeExpenses: () => {
    const { expenses, activeSessionId } = get();
    return expenses.filter((e) => !e.sessionId || e.sessionId === activeSessionId);
  },

  eventsForSession: () => {
    const { mealEvents, activeSessionId } = get();
    return mealEvents.filter((e) => e.sessionId === activeSessionId);
  },

  eventsForCell: (dateStr, meal) =>
    get().eventsForSession().filter((e) => e.date === dateStr && e.kind !== 'bag_lunch' && (e.mealPeriod === null || e.mealPeriod === meal)),

  bagLunchesForDay: (dateStr) =>
    get().eventsForSession().filter((e) => e.date === dateStr && e.kind === 'bag_lunch'),

  mealCount: (dateStr, meal) => {
    const session = get().activeSession();
    if (!session) return 0;
    return mealHeadCount(session, get().eventsForSession(), dateStr, meal);
  },

  // Actual per-diem: (received-PO invoice/total + expenses) in [start, min(end, today)]
  // divided by people-days over the same window.
  sessionPerDiem: () => {
    const session = get().activeSession();
    if (!session) return null;
    const today = new Date().toISOString().slice(0, 10);
    const start = session.startDate;
    const endBound = today < session.endDate ? today : session.endDate;
    if (endBound < start) return perDiem(0, 0, session.budgetPerPersonPerDay);

    const pDays = peopleDays(session, get().eventsForSession(), start, endBound);
    let spend = 0;
    for (const o of get().orders) {
      if (o.status !== 'received' || !o.receivedAt) continue;
      const d = o.receivedAt.slice(0, 10);
      if (d >= start && d <= endBound) spend += o.invoiceTotal ?? o.total;
    }
    for (const e of get().expenses) {
      if (e.date >= start && e.date <= endBound && (!e.sessionId || e.sessionId === session.id)) spend += e.amount;
    }
    return perDiem(spend, pDays, session.budgetPerPersonPerDay);
  },

  forecastCost: () => {
    const session = get().activeSession();
    if (!session) return 0;
    const entries = get().menuEntries.filter((m) => m.sessionId === session.id);
    return menuForecastCost(entries, get().recipesById(), get().ingredientsByRecipe(), get().itemsById(), get().portions());
  },

  dietCountsForSession: () => {
    const { dietCounts, activeSessionId } = get();
    return dietCounts.filter((d) => d.sessionId === activeSessionId);
  },

  templateById: (id) => get().templates.find((t) => t.id === id) ?? null,

  templateEntriesForWeek: (templateId, week) =>
    get().templateEntries.filter((e) => e.templateId === templateId && e.weekNumber === week).sort((a, b) => a.sortOrder - b.sortOrder),

  templateCellEntries: (templateId, week, dayIndex, meal) =>
    get().templateEntries
      .filter((e) => e.templateId === templateId && e.weekNumber === week && e.dayIndex === dayIndex && e.mealPeriod === meal)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  // Freezer-stored items needed for a day's menu — the overnight pull list.
  thawListForDay: (week, dayIndex) => {
    const state = get();
    const session = state.activeSession();
    const entries = state.entriesForDay(week, dayIndex);
    const portionsFor = session
      ? (e: MenuEntry) => state.mealCount(dateForCell(session.startDate, e.weekNumber, e.dayIndex).toISOString().slice(0, 10), e.mealPeriod)
      : state.portions();
    const demand = demandForEntries(entries, state.recipesById(), state.ingredientsByRecipe(), portionsFor);
    const byId = get().itemsById();
    const out: { item: InventoryItem; neededBase: number }[] = [];
    for (const row of demand.values()) {
      const item = byId.get(row.itemId);
      if (item && item.storageLocation === 'walk_in_freezer') out.push({ item, neededBase: row.neededBase });
    }
    return out.sort((a, b) => a.item.name.localeCompare(b.item.name));
  },

  storageMapFor: (location) => get().storageMap.find((m) => m.storageLocation === location)?.safetyItemId ?? null,

  // ── #3 Menu courses (per-camp bucket list) ──
  coursesSorted: () => [...get().courses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),

  addCourse: (name) => {
    const trimmed = name.trim();
    if (!trimmed || get().courses.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return;
    const now = new Date().toISOString();
    const c: MenuCourse = { id: generateId(), name: trimmed, sortOrder: get().courses.length, createdAt: now, updatedAt: now };
    set((s) => ({ courses: [...s.courses, c] }));
    dbAddMenuCourse(c);
  },
  renameCourse: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    let updated: MenuCourse | undefined;
    set((s) => ({ courses: s.courses.map((c) => c.id === id ? (updated = { ...c, name: trimmed, updatedAt: now }) : c) }));
    if (updated) dbUpdateMenuCourse(updated);
  },
  deleteCourse: (id) => { set((s) => ({ courses: s.courses.filter((c) => c.id !== id) })); dbDeleteMenuCourse(id); },

  seedDefaultCourses: () => {
    if (get().courses.length > 0) return;
    ['Protein', 'Carb', 'Vegetable', 'Side', 'Dessert'].forEach((name) => get().addCourse(name));
  },

  // ── #11 Substitutions (replacement meals) ──
  addSubstitution: (sub) => { set((s) => ({ substitutions: [...s.substitutions, sub] })); dbAddSubstitution(sub); },
  updateSubstitution: (sub) => { set((s) => ({ substitutions: s.substitutions.map((x) => x.id === sub.id ? sub : x) })); dbUpdateSubstitution(sub); },
  deleteSubstitution: (id) => { set((s) => ({ substitutions: s.substitutions.filter((x) => x.id !== id) })); dbDeleteSubstitution(id); },

  substitutionsForSession: () => {
    const { substitutions, activeSessionId } = get();
    return substitutions.filter((x) => x.sessionId === activeSessionId);
  },
  substitutionsForCell: (week, dayIndex, meal) =>
    get().substitutionsForSession().filter((x) => x.weekNumber === week && x.dayIndex === dayIndex && x.mealPeriod === meal),
  substitutionsForDay: (week, dayIndex) =>
    get().substitutionsForSession().filter((x) => x.weekNumber === week && x.dayIndex === dayIndex),

  // ── #9 Files (allergy source-document locker) ──
  uploadFile: async (file, sessionId, by) => {
    const row = await dbUploadCommissaryFile(file, sessionId, by);
    if (row) set((s) => ({ files: [row, ...s.files] }));
    return row;
  },
  deleteFile: async (f) => {
    set((s) => ({ files: s.files.filter((x) => x.id !== f.id) }));
    await dbDeleteCommissaryFile(f);
  },

  // ── #2 Entry-level allergens/conflicts (recipe OR item chip) ──
  entryAllergens: (entry) => {
    if (entry.recipeId) return get().allergensFor(entry.recipeId);
    if (entry.itemId) {
      const item = get().itemsById().get(entry.itemId);
      return item ? ALLERGENS.filter((a) => item.allergens.includes(a)) : [];
    }
    return [];
  },
  conflictsForEntry: (entry) => menuConflicts(get().entryAllergens(entry), get().summaryMap()),

  // ── #7 Prep calendar ──
  prepScheduleForWeek: (week) => {
    const state = get();
    const session = state.activeSession();
    if (!session) return [];
    const recipesById = state.recipesById();
    const buckets = new Map<string, PrepScheduleSlot>();

    for (const e of state.entriesForWeek(week)) {
      if (!e.recipeId) continue;
      const recipe = recipesById.get(e.recipeId);
      if (!recipe) continue;
      const serviceDate = dateForCell(session.startDate, e.weekNumber, e.dayIndex);
      const serviceDateStr = serviceDate.toISOString().slice(0, 10);

      // Prefer frozen plan quantities when the service day has been generated (hybrid).
      let portions = state.mealCount(serviceDateStr, e.mealPeriod);
      const plan = state.planFor(e.weekNumber, e.dayIndex);
      if (plan) {
        const t = state.tasksForPlan(plan.id).find((x) => x.recipeId === recipe.id && x.mealPeriod === e.mealPeriod);
        if (t) portions = t.portions;
      }

      for (const s of state.stepsFor(recipe.id)) {
        const prepDate = new Date(serviceDate);
        prepDate.setDate(prepDate.getDate() - (s.leadDays ?? 0));
        const prepDateStr = prepDate.toISOString().slice(0, 10);
        const slot: PrepSlotKey = s.timeSlot ?? 'any';
        const key = `${prepDateStr}|${slot}`;
        let bucket = buckets.get(key);
        if (!bucket) { bucket = { dateStr: prepDateStr, slot, items: [] }; buckets.set(key, bucket); }
        bucket.items.push({
          recipeName: recipe.name, mealLabel: MEAL_PERIOD_LABELS[e.mealPeriod],
          portions, instruction: s.instruction, serviceDateStr, leadDays: s.leadDays ?? 0,
        });
      }
    }

    return [...buckets.values()].sort((a, b) =>
      a.dateStr.localeCompare(b.dateStr) || PREP_SLOT_ORDER[a.slot] - PREP_SLOT_ORDER[b.slot]);
  },
}));
