export type Role = 'doe' | 'facilities_manager' | 'maintenance_staff';

export interface User {
  id: string;
  name: string;
  role: Role;
  initials: string;
}

export type Priority = 'urgent' | 'high' | 'normal';

export type IssueStatus = 'unassigned' | 'assigned' | 'in_progress' | 'resolved';

export type ChecklistStatus = 'pending' | 'in_progress' | 'complete';

export type Location = string;

export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'annually';

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  locations: Location[];
  priority: Priority;
  status: IssueStatus;
  assigneeId: string | null;
  reportedById: string | null;
  estimatedCostDisplay: string | null;
  estimatedCostValue: number | null;
  actualCost: number | null;
  photoUrl: string | null;
  dueDate: string | null;
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
  isPublicReport: boolean;
  reporterName: string | null;
  reporterContact: string | null;
  createdAt: string;
  updatedAt: string;
  activityLog: ActivityEntry[];
}

export interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  locations: Location[];
  priority: Priority;
  status: ChecklistStatus;
  assigneeId: string | null;
  phase: 'pre' | 'post';
  daysRelativeToOpening: number | null;
  dueDate: string | null;
  isRecurring: true;
  moduleTag?: string | null;
  activityLog: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  name: string;
  openingDate: string;
  closingDate: string;
  acaInspectionDate: string | null;
}

// ─── Pool Management ──────────────────────────────────────────────────────────

export type PoolType = 'pool' | 'waterfront' | 'other';

export interface CampPool {
  id: string;
  name: string;
  type: PoolType;
  isActive: boolean;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChemicalReading {
  id: string;
  poolId: string;
  freeChlorine: number;
  ph: number;
  alkalinity: number;
  cyanuricAcid: number;
  waterTemp: number;
  calciumHardness: number | null;
  readingTime: string;
  loggedById: string;
  loggedByName: string;
  correctiveAction: string | null;
  poolStatus: 'open_all_clear' | 'open_monitoring' | 'closed_corrective' | 'closed_retest';
  createdAt: string;
}

export type EquipmentStatus = 'ok' | 'warn' | 'alert';
export type EquipmentType = 'pump' | 'filter' | 'heater' | 'chlorinator' | 'safety' | 'other';
export type ServiceType = 'routine_maintenance' | 'repair' | 'inspection' | 'part_replacement' | 'vendor_service';

export interface PoolEquipment {
  id: string;
  poolId: string;
  name: string;
  type: EquipmentType;
  status: EquipmentStatus;
  statusDetail: string;
  lastServiced: string | null;
  nextServiceDue: string | null;
  vendor: string | null;
  specs: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLogEntry {
  id: string;
  poolId: string;
  equipmentId: string;
  serviceType: ServiceType;
  datePerformed: string;
  performedBy: string;
  notes: string | null;
  cost: number | null;
  nextServiceDue: string | null;
  createdAt: string;
}

export type InspectionStatus = 'ok' | 'due' | 'overdue';
export type InspectionResult = 'passed' | 'passed_with_notes' | 'conditional' | 'failed';

export interface PoolInspection {
  id: string;
  poolId: string;
  name: string;
  frequency: string;
  authority: string;
  standard: string | null;
  status: InspectionStatus;
  lastCompleted: string | null;
  nextDue: string | null;
  history: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectionLogEntry {
  id: string;
  poolId: string;
  inspectionId: string;
  inspectionDate: string;
  conductedBy: string;
  result: InspectionResult;
  notes: string | null;
  nextDue: string | null;
  createdAt: string;
}

export type SeasonalPhase = 'opening' | 'in_season' | 'closing';

// ─── Safety & Compliance ──────────────────────────────────────────────────────

export type SafetyCategory = 'fire' | 'water' | 'kitchen';

export type LicenseType =
  | 'health_permit'
  | 'state_camping'
  | 'food_service'
  | 'boating'
  | 'aca_accreditation'
  | 'other';

export interface SafetyLicense {
  id: string;
  name: string;
  licenseType: LicenseType;
  issuingAuthority: string | null;
  licenseNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SafetyItemType =
  | 'extinguisher'
  | 'smoke_alarm'
  | 'co_alarm'
  | 'hood_fan'
  | 'refrigeration'
  | 'health_inspection'
  | 'waterfront_check'
  | 'life_ring'
  | 'rescue_tube'
  | 'rescue_board';

export type SafetyFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface SafetyItem {
  id: string;
  name: string;
  category: SafetyCategory;
  type: SafetyItemType;
  location: string;
  unitCount: number;
  frequency: SafetyFrequency;
  frequencyDays: number;
  lastInspected: string | null;
  nextDue: string | null;
  vendor: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type SafetyInspectionResult = 'passed' | 'passed_with_notes' | 'action_taken' | 'failed';

export interface SafetyInspectionLog {
  id: string;
  itemId: string | null;
  category: SafetyCategory;
  locationNote: string;
  inspectionDate: string;
  completedBy: string;
  result: SafetyInspectionResult;
  notes: string | null;
  cost: number | null;
  nextDue: string | null;
  createdAt: string;
}

export type DrillType =
  | 'fire_evacuation'
  | 'nighttime_cabin'
  | 'missing_swimmer'
  | 'severe_weather'
  | 'medical_emergency'
  | 'active_shooter'
  | 'missing_camper'
  | 'other';

export type DrillStatus = 'scheduled' | 'completed' | 'cancelled';

export interface EmergencyDrill {
  id: string;
  drillType: DrillType;
  drillName: string | null;
  status: DrillStatus;
  scheduledDate: string;
  completedDate: string | null;
  lead: string;
  participantCount: number | null;
  responseTime: string | null;
  allAccounted: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyStaff {
  id: string;
  name: string;
  title: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CertType = 'cpr_aed' | 'mandatory_reporter' | 'lifeguard' | 'first_aid' | 'wsi' | 'other';

export interface StaffCertification {
  id: string;
  staffId: string;
  certType: CertType;
  certName: string;
  issuedDate: string | null;
  expiryDate: string | null;
  provider: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyTempLog {
  id: string;
  itemId: string;
  logDate: string;
  session: 'am' | 'pm';
  temperature: number;
  inRange: boolean;
  loggedBy: string;
  notes: string | null;
  createdAt: string;
}

export interface SeasonalTask {
  id: string;
  poolId: string;
  title: string;
  detail: string | null;
  phase: SeasonalPhase;
  isComplete: boolean;
  completedBy: string | null;
  completedDate: string | null;
  assignees: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Assets & Vehicles ────────────────────────────────────────────────────────

export type AssetCategory = 'vehicle' | 'golf_cart' | 'watercraft' | 'large_equipment' | 'trailer' | 'technology' | 'other';

export type AssetStatus = 'available' | 'checked_out' | 'in_service' | 'retired';

export type AssetServiceType =
  | 'oil_change' | 'tire_rotation' | 'tire_replacement'
  | 'brake_service' | 'battery' | 'belt_replacement'
  | 'fluid_top_off' | 'filter_replacement'
  | 'state_inspection' | 'dot_inspection' | 'annual_inspection'
  | 'hull_inspection' | 'engine_service' | 'blade_sharpening'
  | 'cleaning' | 'repair' | 'other';

export type AssetMaintenancePhase = 'pre_season' | 'in_season' | 'post_season';

export type FuelLevel = 'empty' | 'quarter' | 'half' | 'three_quarter' | 'full';

export type CheckoutCondition = 'no_issues' | 'minor_note' | 'needs_attention';

export interface CampAsset {
  id: string;
  name: string;
  category: AssetCategory;
  subtype: string;
  make: string | null;
  model: string | null;
  year: number | null;
  serialNumber: string | null;
  licensePlate: string | null;
  registrationExpiry: string | null;
  storageLocation: string;
  status: AssetStatus;
  currentOdometer: number | null;
  currentHours: number | null;
  tracksOdometer: boolean;
  tracksHours: boolean;
  notes: string | null;
  isActive: boolean;
  // Watercraft-specific
  hullId: string | null;
  uscgRegistration: string | null;
  uscgRegistrationExpiry: string | null;
  capacity: number | null;
  motorType: string | null;
  hasLifejackets: boolean | null;
  lifejacketCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetCheckout {
  id: string;
  assetId: string;
  checkedOutBy: string;
  purpose: string;
  checkedOutAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  startHours: number | null;
  endHours: number | null;
  fuelLevelOut: FuelLevel | null;
  fuelLevelIn: FuelLevel | null;
  checkoutNotes: string | null;
  returnNotes: string | null;
  returnCondition: CheckoutCondition | null;
  createdIssueId: string | null;
  loggedBy: string;
  createdAt: string;
}

export interface AssetServiceRecord {
  id: string;
  assetId: string;
  serviceType: AssetServiceType;
  datePerformed: string;
  performedBy: string;
  vendor: string | null;
  description: string | null;
  odometerAtService: number | null;
  hoursAtService: number | null;
  cost: number | null;
  nextServiceDate: string | null;
  nextServiceOdometer: number | null;
  nextServiceHours: number | null;
  isInspection: boolean;
  createdAt: string;
}

export interface AssetMaintenanceTask {
  id: string;
  assetId: string;
  phase: AssetMaintenancePhase;
  title: string;
  detail: string | null;
  isComplete: boolean;
  completedBy: string | null;
  completedDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Building Systems ──────────────────────────────────────────────────────────

export type BuildingType =
  | 'cabin' | 'bathhouse' | 'dining_hall' | 'kitchen' | 'infirmary'
  | 'office' | 'activity' | 'storage' | 'utility' | 'other';

export type BuildingSystem = 'electrical' | 'plumbing';

export type ComponentStatus = 'operational' | 'needs_attention' | 'out_of_service';

export type ElectricalComponentType =
  | 'breaker_panel' | 'sub_panel' | 'outlet' | 'light_fixture'
  | 'switch' | 'exterior_light' | 'generator' | 'transfer_switch' | 'other_electrical';

export type PlumbingComponentType =
  | 'shutoff_valve' | 'water_heater' | 'well_pump' | 'backflow_preventer'
  | 'toilet' | 'sink' | 'shower' | 'urinal' | 'water_fountain'
  | 'hose_bib' | 'sump_pump' | 'septic' | 'other_plumbing';

export type BuildingComponentType = ElectricalComponentType | PlumbingComponentType;

export interface Building {
  id: string;
  name: string;
  type: BuildingType;
  // Soft link to a camp `locations` string (used to pre-fill flagged issues).
  locationLabel: string | null;
  mainWaterShutoff: string | null;
  mainElectricalPanel: string | null;
  mainGasShutoff: string | null;
  yearBuilt: number | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingRoom {
  id: string;
  buildingId: string;
  name: string;
  floor: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingComponent {
  id: string;
  buildingId: string;
  roomId: string | null;
  system: BuildingSystem;
  type: BuildingComponentType;
  label: string;
  // Where in the room ("under sink, NW corner").
  locationDetail: string | null;
  status: ComponentStatus;
  statusDetail: string | null;
  lastServiced: string | null;
  nextServiceDue: string | null;
  photoUrl: string | null;
  // Type-specific specs: isGfci, bulbType, voltage, valveType, gallons, fuelType, …
  metadata: Record<string, unknown>;
  // The breaker that powers this component (panel schedule link).
  controllingCircuitId: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingCircuit {
  id: string;
  // The breaker_panel / sub_panel component this breaker lives on.
  panelId: string;
  breakerNumber: string | null;
  label: string | null;
  amperage: number | null;
  controls: string | null;
  isOn: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingSeasonalTask {
  id: string;
  // null = camp-wide task (not tied to one building).
  buildingId: string | null;
  title: string;
  detail: string | null;
  phase: SeasonalPhase;
  isComplete: boolean;
  completedBy: string | null;
  completedDate: string | null;
  assignees: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Commissary ────────────────────────────────────────────────────────────────
// Unit model note: every quantity below whose name ends in `Base` is stored in the
// owning item's canonical base unit (each / oz / fl oz). Convert with the helpers
// in `src/lib/commissaryUnits.ts` — never compare a Base value to a display value.

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type InventoryCategory =
  | 'protein' | 'dairy' | 'produce' | 'dry_goods' | 'pantry'
  | 'frozen' | 'snacks' | 'beverage' | 'other';

export type StorageLocation =
  | 'walk_in_refrigerator' | 'walk_in_freezer' | 'dry_storage'
  | 'reach_in_refrigerator' | 'other';

export type AdjustmentReason =
  | 'received' | 'used' | 'waste' | 'count_correction' | 'other';

export interface CommissarySession {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  // targetPortions = camperCount + staffCount. Staff are separate because seasonal
  // counselors eat but do not have app accounts.
  camperCount: number;
  staffCount: number;
  isActive: boolean;
  notes: string | null;
  /** Budgeted per-diem (cost per person per day) the Cost tab measures against. */
  budgetPerPersonPerDay: number | null;
  mealsPerDay: number;
  /**
   * Per-meal head count override. null = same count (camperCount+staffCount) for every
   * meal. A partial map keyed by meal period; any meal absent falls back to the total.
   * One-off per-date changes are handled separately by MealEvent, layered on top.
   */
  mealCounts: Partial<Record<MealPeriod, number>> | null;
  // ── Operating cadence: the weekly count/order/deliver rhythm that drives the order
  //    coverage window. Day columns are lowercase weekday names; null = derive from startDate.
  orderFrequencyDays: number;
  countDay: string | null;
  orderDay: string | null;
  deliveryDay: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissaryVendor {
  id: string;
  name: string;
  specialty: string | null;
  accountNumber: string | null;
  repName: string | null;
  repEmail: string | null;
  repPhone: string | null;
  orderCutoff: string | null;
  deliveryDay: string | null;
  minOrder: number | null;
  deliveryFee: number | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  storageLocation: StorageLocation;

  // Unit model. The two `*InBase` factors are facts about THIS item — a case of
  // eggs is 360 each — so no generic unit table can supply them.
  dimension: 'count' | 'weight' | 'volume';
  baseUnit: string;
  stockUnit: string;
  stockUnitInBase: number;
  purchaseUnit: string;
  purchaseUnitInBase: number;
  /** Price of ONE purchase unit (per case, per gallon, …). */
  unitPrice: number | null;

  onHandBase: number;
  /** Minimum on hand — the safety floor ordering keeps you above (formerly "par"). */
  parLevelBase: number;
  /** When on-hand was last affirmatively counted/set. null = never (e.g. a fresh import). */
  lastCountedAt: string | null;
  /** Days a perishable keeps; caps how far ahead it's ordered. null = non-perishable (no cap). */
  shelfLifeDays: number | null;

  vendorId: string | null;
  /** Canonical allergen slugs. Recipes derive theirs from these by union. */
  allergens: string[];
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One vendor's pack for an item — how that vendor sells it, in the item's base unit.
 * An item can have several; the one flagged `isDefault` mirrors the item's own
 * purchaseUnit/purchaseUnitInBase/unitPrice columns and drives order generation until a
 * line is switched to another vendor. See the multi-vendor migration.
 */
export interface ItemVendorPack {
  id: string;
  itemId: string;
  vendorId: string;
  purchaseUnit: string;
  purchaseUnitInBase: number;
  unitPrice: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A shared, global reference product (not camp-scoped). Standard food-service pack/units,
 * no price. Adding an inventory item can autofill name/category/unit/pack from one of these.
 * Grows via CSV import.
 */
export interface CatalogProduct {
  id: string;
  name: string;
  category: InventoryCategory;
  dimension: 'count' | 'weight' | 'volume';
  stockUnit: string;
  stockUnitInBase: number;
  packUnit: string | null;
  packSize: number | null;
  allergens: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAdjustment {
  id: string;
  itemId: string;
  /** Signed: deliveries positive, waste and usage negative. */
  deltaBase: number;
  resultingOnHandBase: number;
  reason: AdjustmentReason;
  notes: string | null;
  adjustedBy: string | null;
  createdAt: string;
}

export interface Recipe {
  id: string;
  name: string;
  mealPeriod: MealPeriod;
  /** Ingredient quantities are expressed per this many portions. */
  baseYield: number;
  prepTime: string | null;
  cookTime: string | null;
  method: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  /** null = unlinked ingredient (salt, "1 bunch chives"): no demand, no allergens. */
  itemId: string | null;
  label: string;
  qtyInBase: number | null;
  freeTextQty: string | null;
  /** null = inherit the item's allergens. [] = explicitly none ("GF bun"). */
  allergenOverride: string[] | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PrepTimeSlot = 'morning' | 'afternoon' | 'evening';

export interface RecipeStep {
  id: string;
  recipeId: string;
  stepNumber: number;
  instruction: string;
  /** Whole days before service this step must be done. 0 = day of. Drives the prep calendar. */
  leadDays: number;
  /** Sub-slot within the day, or null for "any time". */
  timeSlot: PrepTimeSlot | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuEntry {
  id: string;
  sessionId: string;
  weekNumber: number;
  /** 0..6 from the start of the week. */
  dayIndex: number;
  mealPeriod: MealPeriod;
  /** null = free-text chip ("Salad bar"): excluded from demand and allergen math. */
  recipeId: string | null;
  /** A chip may instead link a single inventory item directly (milk, fruit, bread). */
  itemId: string | null;
  /** Base-unit quantity of the linked item consumed per portion. Null unless itemId set. */
  itemQtyBase: number | null;
  /** Optional course bucket name ("Protein", "Side"), from the camp's course list. */
  course: string | null;
  label: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Per-camp customizable menu course (Protein / Carb / Vegetable / Side / Dessert…). */
export interface MenuCourse {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Commissary: ordering ──────────────────────────────────────────────────────

export type OrderStatus = 'draft' | 'sent' | 'received' | 'cancelled';
export type OrderSource = 'menu' | 'par';

export interface PurchaseOrder {
  id: string;
  vendorId: string | null;
  /** Frozen at generation — the order stays readable if the vendor is deleted. */
  vendorName: string;
  status: OrderStatus;
  source: OrderSource;
  sessionId: string | null;
  weekNumber: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryInstructions: string | null;
  createdBy: string | null;
  sentAt: string | null;
  /** Expected delivery date, set when the order is sent — drives the in-transit projection. */
  expectedDelivery: string | null;
  receivedAt: string | null;
  /** Actual invoiced total, set at receiving; drives per-diem actual spend when present. */
  invoiceTotal: number | null;
  invoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Every field below the FK is a SNAPSHOT: prices and stock move, a sent order must not. */
export interface PurchaseOrderLine {
  id: string;
  orderId: string;
  itemId: string | null;
  itemName: string;
  stockUnit: string;
  purchaseUnit: string;
  purchaseUnitInBase: number;
  onHandBase: number;
  neededBase: number;
  /** Whole purchase units. */
  orderQty: number;
  unitPrice: number | null;
  lineTotal: number;
  // Receiving actuals — null until received. What was booked into stock is
  // receivedQty ?? orderQty (see the receive_purchase_order RPC).
  receivedQty: number | null;
  receivedUnitPrice: number | null;
  receivedNote: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Commissary: production ────────────────────────────────────────────────────

export interface ProductionPlan {
  id: string;
  sessionId: string;
  weekNumber: number;
  dayIndex: number;
  /** Head count frozen at generation. */
  portions: number;
  /** Menu entry ids + latest updatedAt for the day. Mismatch => plan is stale. */
  menuSignature: string;
  generatedBy: string | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionIngredient {
  label: string;
  qty: string;
  /** false = unlinked ingredient: not scaled, excluded from demand. */
  linked: boolean;
}

export interface ProductionTask {
  id: string;
  planId: string;
  recipeId: string | null;
  mealPeriod: MealPeriod;
  title: string;
  portions: number;
  /** Snapshot of scaled quantities, so a printout and the screen agree. */
  ingredients: ProductionIngredient[];
  allergens: string[];
  prepTime: string | null;
  cookTime: string | null;
  notes: string | null;
  isComplete: boolean;
  completedBy: string | null;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A single time-phased prep task — one recipe step (or an auto freezer-pull), scheduled
 * to the day it must be done (serviceDate − leadDays) and independently checkable. Drives
 * the "Prep due today" board.
 */
export interface ProductionPrepTask {
  id: string;
  planId: string;
  recipeId: string | null;
  /** The day this prep is due (YYYY-MM-DD). */
  prepDate: string;
  timeSlot: PrepTimeSlot | null;
  mealPeriod: MealPeriod;
  /** The day the food is served (YYYY-MM-DD), for the "serves Wed" hint. */
  serviceDate: string;
  title: string;
  instruction: string;
  portions: number;
  isComplete: boolean;
  completedBy: string | null;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Commissary: allergy program ───────────────────────────────────────────────

export type RestrictionKind = 'allergen' | 'dietary';
export type RestrictionSeverity = 'intolerance' | 'confirmed' | 'anaphylactic';

export interface Camper {
  id: string;
  sessionId: string | null;
  name: string;
  cabin: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CamperRestriction {
  id: string;
  camperId: string;
  restriction: string;
  kind: RestrictionKind;
  /** null only for dietary preferences. */
  severity: RestrictionSeverity | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Aggregate readable by EVERY camp member (no names). Drives the kitchen's view and
 * the menu conflict warnings. Named rosters require health access.
 */
export interface RestrictionSummaryRow {
  /** Session these counts are for; null = campers not assigned to any session. */
  sessionId: string | null;
  restriction: string;
  kind: RestrictionKind;
  camperCount: number;
  anaphylacticCount: number;
}

/** A camper↔session assignment (many-to-many). A camper can attend several sessions. */
export interface CamperSession {
  camperId: string;
  sessionId: string;
}

// ─── Commissary phase 3: cost, templates, dietary, events, count, compliance ───

export interface CommissaryExpense {
  id: string;
  sessionId: string | null;
  date: string;
  category: InventoryCategory;
  description: string | null;
  amount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuTemplate {
  id: string;
  name: string;
  lengthWeeks: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuTemplateEntry {
  id: string;
  templateId: string;
  weekNumber: number;
  dayIndex: number;
  mealPeriod: MealPeriod;
  recipeId: string | null;
  itemId: string | null;
  itemQtyBase: number | null;
  course: string | null;
  label: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Session-level standing count for a restriction ("42 vegetarian"). */
export interface DietCount {
  id: string;
  sessionId: string;
  restriction: string;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export type MealEventKind = 'override' | 'bag_lunch' | 'event';
export type MealEventCountMode = 'absolute' | 'delta';

export interface MealEvent {
  id: string;
  sessionId: string;
  date: string;
  /** null = whole day. */
  mealPeriod: MealPeriod | null;
  kind: MealEventKind;
  /** absolute = "300 at visiting-day lunch"; delta = "-40 dinner (off-site)". */
  countMode: MealEventCountMode;
  count: number;
  label: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CountSession {
  id: string;
  date: string;
  countedBy: string | null;
  note: string | null;
  itemCount: number;
  createdAt: string;
}

/** Ties a storage location to the Safety module's temp-logged unit. */
export interface StorageMap {
  id: string;
  storageLocation: StorageLocation;
  safetyItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A replacement meal for allergy/dietary-affected campers at a specific meal. Each of
 * main/side may reference a recipe or an inventory item, or be free text; a label is
 * always stored so the plate instruction reads even if a link is deleted.
 */
export interface MenuSubstitution {
  id: string;
  sessionId: string;
  weekNumber: number;
  dayIndex: number;
  mealPeriod: MealPeriod;
  /** Restriction this alternative covers (allergen/dietary slug), or null = general. */
  forRestriction: string | null;
  mainRecipeId: string | null;
  mainItemId: string | null;
  mainLabel: string;
  sideRecipeId: string | null;
  sideItemId: string | null;
  sideLabel: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A source document (allergy roster, nurse's PDF) dropped into the allergy program. */
export interface CommissaryFile {
  id: string;
  sessionId: string | null;
  name: string;
  path: string;
  sizeBytes: number | null;
  contentType: string | null;
  uploadedBy: string | null;
  createdAt: string;
}
