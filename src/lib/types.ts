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

// ─── Unified locations (one nestable, categorized tree per camp) ───────────────────
export interface CampLocation {
  id: string;
  campId: string;
  parentId: string | null;
  name: string;
  categoryId: string | null;
  isDorm: boolean;
  retreatAvailable: boolean;
  bedCapacity: number | null;
  accessible: boolean;
  sortOrder: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface LocationCategory {
  id: string;
  campId: string;
  name: string;
  sortOrder: number;
  isPreset: boolean;
}
export interface BuildingDetail {
  locationId: string;
  campId: string;
  buildingType: string | null;
  mainWaterShutoff: string | null;
  mainElectricalPanel: string | null;
  mainGasShutoff: string | null;
  yearBuilt: number | null;
}

export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'annually';

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

/** Where an issue came in from. Null means unknown, not web. */
export type IssueSource = 'web' | 'ios' | 'public';

export interface Issue {
  id: string;
  title: string;
  description: string;
  locationIds: string[];
  locations: string[]; // denormalized name snapshot (display + iOS/back-compat)
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
  /** Which client logged this. Null on rows predating the column, show nothing, don't guess. */
  source: IssueSource | null;
  createdAt: string;
  updatedAt: string;
  activityLog: ActivityEntry[];
}

export interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  locationIds: string[];
  locations: string[]; // denormalized name snapshot (display + iOS/back-compat)
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
  /** Photo of the strip the numbers were read from. Only the iOS scanner sets one. */
  stripPhotoUrl?: string | null;
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
  locationId: string | null;
  location: string; // denormalized name snapshot
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
  /**
   * The details New York's permit forms ask for about a named person. All optional, because
   * most of them are only ever asked about a handful of the roster: DOH-367a wants a date of
   * birth beside every certified lifeguard and first-aid holder, and DOH-367 wants the camp
   * director's and health director's background. A kitchen porter has none of it, and a blank
   * on the form is the correct outcome for them.
   */
  /** YYYY-MM-DD, a calendar day. Personal data about an employee; see the staff modal. */
  dateOfBirth: string | null;
  /** 'male' or 'female', the only two columns the counselor-data table on DOH-367a prints. */
  sex: string | null;
  education: string | null;
  qualifyingExperience: string | null;
  /** DOH-367 prints this as the health director's NYS license number. */
  professionalLicenseNumber: string | null;
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
  locationId: string | null;
  storageLocation: string; // denormalized name snapshot
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
  // The `locations` node this component lives on, either a building (top-level
  // structure) location or one of its room (child) locations. Post unification,
  // this replaces the legacy building_id/room_id pair.
  locationId: string;
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
  // The `locations` node this task is scoped to (building or room). null = camp-wide.
  locationId: string | null;
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
// in `src/lib/commissaryUnits.ts`never compare a Base value to a display value.

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type InventoryCategory =
  | 'protein' | 'dairy' | 'produce' | 'dry_goods' | 'pantry'
  | 'frozen' | 'snacks' | 'beverage' | 'other';

export type StorageLocation =
  | 'walk_in_refrigerator' | 'walk_in_freezer' | 'dry_storage'
  | 'reach_in_refrigerator' | 'other';

export type AdjustmentReason =
  | 'received' | 'used' | 'waste' | 'count_correction' | 'other';

/**
 * Why something was thrown away. Only ever set on a `waste` adjustment (enforced by a
 * CHECK constraint), and null on every row logged before categorisation existed.
 *
 * The split that matters is reducible vs not. See `REDUCIBLE_WASTE` in
 * `commissaryUnits.ts`. Ordering and forecasting can move spoilage, overproduction and
 * damage; they cannot move trim loss or what campers leave on the plate.
 */
export type WasteCategory =
  | 'spoilage' | 'overproduction' | 'damage' | 'prep_loss' | 'plate_waste' | 'other';

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

  // Unit model. The two `*InBase` factors are facts about THIS item, a case of
  // eggs is 360 each, so no generic unit table can supply them.
  dimension: 'count' | 'weight' | 'volume';
  baseUnit: string;
  stockUnit: string;
  stockUnitInBase: number;
  purchaseUnit: string;
  purchaseUnitInBase: number;
  /** Price of ONE purchase unit (per case, per gallon, …). */
  unitPrice: number | null;

  onHandBase: number;
  /** Minimum on hand. The safety floor ordering keeps you above (formerly "par"). */
  parLevelBase: number;
  /** When on-hand was last affirmatively counted/set. null = never (e.g. a fresh import). */
  lastCountedAt: string | null;
  /** Days a perishable keeps; caps how far ahead it's ordered. null = non-perishable (no cap). */
  shelfLifeDays: number | null;

  vendorId: string | null;
  /** Canonical allergen slugs. Recipes derive theirs from these by union. */
  allergens: string[];
  /** Dietary tags (vegetarian/vegan/kosher/halal), accommodations, kept apart from allergens. */
  dietary: string[];
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One vendor's pack for an item, how that vendor sells it, in the item's base unit.
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
  /** Set only when `reason === 'waste'`. null on pre-categorisation rows, never assume a bucket. */
  wasteCategory: WasteCategory | null;
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
  /**
   * Portions the recipe card is scaled to on screen and in print. Null follows the
   * active session's head count, which is the default. Persisted so a cook's "we make
   * this for 80" survives a refresh.
   */
  scaleTo: number | null;
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
  /** Frozen at generation. The order stays readable if the vendor is deleted. */
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
  /** Expected delivery date, set when the order is sent, drives the in-transit projection. */
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
  // Receiving actuals, null until received. What was booked into stock is
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
 * A single time-phased prep task, one recipe step (or an auto freezer-pull), scheduled
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

// ─── Implementation files (white-glove onboarding hand-off) ─────────────────────
// Raw source files a camp sends us during setup so our team can load their data. Private,
// camp-scoped bucket + metadata row. Never deleted from the app. See the migration.

export const IMPLEMENTATION_CATEGORIES = [
  'locations', 'staff', 'sessions', 'campers',
  'prepost', 'pool', 'safety', 'assets', 'building',
  'inventory', 'vendors', 'retreats',
  'other',
] as const;
export type ImplementationCategory = (typeof IMPLEMENTATION_CATEGORIES)[number];

export interface ImplementationFile {
  id: string;
  campId: string;
  category: ImplementationCategory;
  name: string;
  path: string;
  sizeBytes: number | null;
  contentType: string | null;
  note: string | null;
  uploadedBy: string | null;
  uploaderName: string | null;
  uploaderEmail: string | null;
  createdAt: string;
}

// ─── Retreats (external group rentals + guest portal) ───────────────────────────
// A completely separate domain from the camp's own operations: renting the facility to
// outside groups. Everything below is camp-scoped. Guest-facing writes go through the
// token-keyed portal RPCs, never these tables directly.

export type RetreatStatus = 'inquiry' | 'confirmed' | 'ready' | 'active' | 'complete' | 'cancelled';

/** How a group is billed. per_person_night uses ratePerPersonNight; the others use flatRate. */
export type RetreatPricingModel = 'per_person_night' | 'per_cabin_night' | 'flat';

export interface Retreat {
  id: string;
  campId: string;
  groupName: string;
  groupType: string;               // synagogue | corporate | youth | alumni | family | school | other
  arrivalDate: string;
  departureDate: string;
  headcount: number;
  pricingModel: RetreatPricingModel;
  ratePerPersonNight: number | null;
  /** For per_cabin_night: rate per cabin per night. For flat: total facility fee for the stay. */
  flatRate: number | null;
  depositRequired: number | null;
  depositReceived: number | null;
  depositDue: string | null;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  coordinatorPhone: string | null;
  status: RetreatStatus;
  housingDeadline: string | null;
  headcountCutoff: string | null;
  /** Final headcount the group confirmed through the guest portal (null until they submit). */
  finalHeadcount: number | null;
  finalHeadcountAt: string | null;
  finalHeadcountBy: string | null;
  /** The group said their rooming is finished. Their sign-off, not the camp's approval. */
  housingSubmittedAt: string | null;
  housingSubmittedBy: string | null;
  /** Aggregate counts, e.g. { vegetarian: 4, gluten_free: 2, kosher: 0, nut_allergy: 1 }. */
  dietaryFlags: Record<string, number> | null;
  notes: string | null;
  /** Secret token for the guest portal link (no password). */
  portalToken: string;
  menuPublished: boolean;
  changeRequestsEnabled: boolean;
  feedbackOpens: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Camp-level cabin/space inventory, reused across retreats. */
export interface RetreatSpace {
  id: string;
  campId: string;
  name: string;
  bedCapacity: number;
  accessible: boolean;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** One named person on a retreat's roster. locationId null = not yet placed in a room. */
export interface RetreatGuest {
  id: string;
  campId: string;
  retreatId: string;
  fullName: string;
  subgroup: string | null;
  gender: string | null;
  dietary: string | null;
  needsAccessible: boolean;
  notes: string | null;
  locationId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatHousing {
  id: string;
  campId: string;
  retreatId: string;
  /** Dorm node in the unified locations tree this housing references. */
  locationId: string | null;
  spaceId: string | null;
  /** Snapshot so a deleted space (or renamed dorm) still reads. */
  spaceName: string | null;
  subgroupName: string | null;
  /** Total occupancy: unnamedCount + the number of named guests placed in this room. */
  peopleCount: number;
  /** People booked here as a bare number, with no name attached. */
  unnamedCount: number;
  notes: string | null;
  locked: boolean;
  /** True when peopleCount is maintained from the guest roster rather than typed by hand. */
  rosterDriven: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatHousingVersion {
  id: string;
  campId: string;
  retreatId: string;
  version: number;
  label: string | null;
  summary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type RetreatDocType = 'agreement' | 'coi' | 'waiver' | 'deposit' | 'other';
export type RetreatDocStatus = 'missing' | 'pending' | 'received' | 'signed' | 'approved';

export interface RetreatDocument {
  id: string;
  campId: string;
  retreatId: string;
  docType: RetreatDocType;
  name: string;
  status: RetreatDocStatus;
  filePath: string | null;
  signedBy: string | null;
  signedAt: string | null;
  dueDate: string | null;
  /** COI: { policyNumber, coverage, expiry, additionalInsured }; waiver: { signedCount, total }. */
  meta: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatMeal {
  id: string;
  campId: string;
  retreatId: string;
  dayDate: string;
  mealPeriod: MealPeriod;
  name: string | null;
  items: string | null;
  allergens: string[];
  alternatives: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type RetreatRequestKind = 'housing' | 'menu' | 'headcount' | 'other';
export type RetreatRequestStatus = 'pending' | 'approved' | 'declined' | 'countered';

/** Who started the thread. 'camp' requests are answered by the group in the portal. */
export type RetreatRequestOrigin = 'guest' | 'camp';

export interface RetreatChangeRequest {
  id: string;
  campId: string;
  retreatId: string;
  origin: RetreatRequestOrigin;
  kind: RetreatRequestKind;
  submittedBy: string | null;
  submittedAt: string;
  body: string;
  status: RetreatRequestStatus;
  responseMessage: string | null;
  /** Not visible to the group. */
  internalNote: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatCost {
  id: string;
  campId: string;
  retreatId: string;
  category: string;
  budgeted: number;
  actual: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatCharge {
  id: string;
  campId: string;
  retreatId: string;
  description: string;
  qty: number;
  unitRate: number;
  amount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type RetreatPaymentKind = 'deposit' | 'balance' | 'payment';

export interface RetreatPayment {
  id: string;
  campId: string;
  retreatId: string;
  paidOn: string;
  amount: number;
  method: string | null;
  kind: RetreatPaymentKind;
  note: string | null;
  createdAt: string;
}

export type RetreatInvoiceKind = 'deposit' | 'balance';
export type RetreatInvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export interface RetreatInvoiceLine { description: string; amount: number; }

export interface RetreatInvoice {
  id: string;
  campId: string;
  retreatId: string;
  kind: RetreatInvoiceKind;
  number: string;
  amount: number;
  note: string | null;
  dueDate: string | null;
  status: RetreatInvoiceStatus;
  /** Subtracted from the line total. `amount` is already net of it. */
  discount: number;
  discountNote: string | null;
  /** Snapshot of the billed lines at issue time (immutable). */
  lineItems: RetreatInvoiceLine[];
  issuedAt: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Structured retreat menu entry (managed in Commissary retreats mode). Recipe/item-linked
 *  entries drive combined ordering; label-only entries are display-only. */
export interface RetreatMenuEntry {
  id: string;
  campId: string;
  retreatId: string;
  dayDate: string;              // YYYY-MM-DD (absolute)
  mealPeriod: MealPeriod;
  recipeId: string | null;
  itemId: string | null;
  itemQtyBase: number | null;
  label: string | null;         // free-text dish name (or override display)
  allergens: string[] | null;
  alternatives: string | null;  // guest-facing veg/GF note
  portionsOverride: number | null; // null = use the retreat's headcount
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type RetreatIssueStatus = 'open' | 'in_progress' | 'resolved';

export interface RetreatIssue {
  id: string;
  campId: string;
  retreatId: string;
  title: string;
  reportedBy: string | null;
  priority: string;
  assignedTo: string | null;
  status: RetreatIssueStatus;
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export type RetreatChecklistPhase = 'setup' | 'checkout';

export interface RetreatChecklistItem {
  id: string;
  campId: string;
  retreatId: string;
  phase: RetreatChecklistPhase;
  title: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatScheduleItem {
  id: string;
  campId: string;
  retreatId: string;
  dayDate: string | null;
  timeLabel: string | null;
  title: string;
  location: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetreatFeedback {
  id: string;
  campId: string;
  retreatId: string;
  overall: number | null;
  accommodations: number | null;
  food: number | null;
  communication: number | null;
  comment: string | null;
  returningStatus: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface RetreatReminder {
  id: string;
  campId: string;
  retreatId: string;
  reminderType: string | null;
  message: string | null;
  sentBy: string | null;
  sentAt: string;
}

// ─── Compliance & Evidence ────────────────────────────────────────────────────
// A jurisdiction is data, not code: profiles and requirements are rows we curate, so adding a
// county or a state is a seed rather than a migration. Status is computed in Postgres by
// compute_camp_compliance() and read here — never derived in the browser, because the client
// hydrates asynchronously and a score built from half-loaded stores is not one to file on.

// 'needs_answer' is deliberately distinct from 'not_applicable'. A camp that told us it has
// no rifle range is off the hook; a camp we never asked is not, and saying otherwise would be
// a claim the product cannot stand behind.
export type ComplianceStatus =
  | 'satisfied' | 'partial' | 'expiring' | 'missing' | 'not_applicable' | 'needs_answer';

export type EvidenceType =
  | 'document' | 'certification' | 'screening' | 'training' | 'inspection' | 'drill'
  | 'temp_log' | 'pool_log' | 'water_sample' | 'asset_expiry' | 'plan_section'
  | 'attestation' | 'roster' | 'manual';

export type PlanSectionStatus = 'not_started' | 'drafted' | 'complete' | 'not_applicable';

export interface ComplianceProfile {
  id: string;
  code: string;
  name: string;
  jurisdictionLevel: 'state' | 'county' | 'city' | 'accreditor' | 'insurer' | 'grant';
  jurisdictionCode: string | null;
  reader: 'lhd' | 'aca' | 'insurer' | 'grant' | 'internal';
  description: string | null;
  sourceUrl: string | null;
  sortOrder: number;
}

/**
 * A party that reviews the camp. Deliberately not called an inspector: of the six that touch a
 * New York camp, only the county health department reliably attends. The rest receive filings.
 */
export interface ComplianceAuthority {
  id: string;
  profileId: string;
  code: string;
  name: string;
  shortName: string | null;
  level: 'federal' | 'state' | 'county' | 'municipal' | 'accreditor' | 'insurer' | 'internal';
  /** True only for parties that physically attend. */
  visitsSite: boolean;
  /** Prose, not a computed schedule: the regulation says "before opening and at least once
   *  during operation", and inventing a date from that would be a fabrication. */
  visitSchedule: string | null;
  scope: string | null;
  contactNote: string | null;
  sourceUrl: string | null;
  sortOrder: number;
}

/** An official document a party issues or expects. */
export interface ComplianceAuthorityForm {
  id: string;
  authorityId: string;
  designation: string | null;
  title: string;
  revision: string | null;
  /** A blank official PDF shipped with the app, or null when we do not hold the form. */
  bundledPath: string | null;
  /** Which pages of bundledPath hold this form, when the bundle is a multi-form packet. */
  pageRef: string | null;
  issuedBy: string | null;
  sourceUrl: string | null;
  /** Where to get it, when we do not bundle it. */
  obtainNote: string | null;
  /** The camp obtains this one itself, so the UI takes an upload rather than only explaining. */
  campSupplied: boolean;
  /** False parks the document without deleting it. */
  isActive: boolean;
  /** The requirement whose deadline governs this document. */
  requirementCode: string | null;
  fillable: boolean;
  sortOrder: number;
}

export interface ComplianceRequirement {
  id: string;
  profileId: string;
  /** Who receives or checks this. Null until a jurisdiction seeds its authorities. */
  authorityId: string | null;
  reqCode: string;
  label: string;
  summary: string | null;
  category: string;
  evidenceType: EvidenceType;
  evidenceHint: string | null;
  frequency: string | null;
  /**
   * When it is owed. {"type":"relative_to_opening","days":-60} for a duty measured from the
   * camp's own opening day, {"type":"fixed","month":M,"day":D} for a calendar date, or a
   * {"note":"..."} for real timing the engine cannot model, like a 24-hour incident clock.
   */
  deadlineRule: Record<string, unknown> | null;
  /** {} means it always applies; otherwise every key must match the camp's setup answers. */
  appliesWhen: Record<string, string>;
  citation: string | null;
  citationUrl: string | null;
  /**
   * Regulatory wording is only ever shown when this is 'verified' and a source URL exists.
   * The product does not present unconfirmed rule text as fact.
   */
  verifyStatus: 'verified' | 'needs_verification';
  /**
   * Evidence for this is other people's personal records: camper health files, staff register
   * clearances. The camp confirms it holds them rather than uploading them here.
   */
  holdsPersonalRecords: boolean;
  sortOrder: number;
}

export interface RequirementStatus {
  requirementId: string;
  status: ComplianceStatus;
  /** What the evaluator found: counts, dates, what is missing. Drives the "why" in the UI. */
  detail: Record<string, unknown>;
  dueOn: string | null;
  assignedTo: string | null;
  naReason: string | null;
  computedAt: string;
}

export interface ComplianceDocument {
  id: string;
  campId: string;
  seasonId: string | null;
  title: string;
  docType: string | null;
  bucketPath: string;
  mime: string | null;
  sizeBytes: number | null;
  expiresOn: string | null;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: string;
  /** Requirement ids this document has been linked to. */
  requirementIds: string[];
}

export interface CompliancePlanSection {
  id: string;
  campId: string;
  seasonId: string;
  sectionCode: string;
  category: string;
  title: string;
  body: string | null;
  /** DOH-2040 asks which page of the camp's plan covers each component. */
  pageRef: string | null;
  status: PlanSectionStatus;
  naReason: string | null;
  sortOrder: number;
  updatedAt: string;
}

/**
 * A component of the written plan as the regulation defines it, with the guidance that turns a
 * bare title into an answerable question. Catalog data, shared by every camp in the
 * jurisdiction, joined onto a camp's sections at read time so improving the guidance does not
 * require re-running setup.
 */
export interface CompliancePlanTemplate {
  code: string;
  category: string;
  title: string;
  /** What this section has to cover, in plain language. */
  prompt: string | null;
  /** Two to five concrete things the section should mention. */
  checklist: string[] | null;
  /** The checklist row this component fills. Explicit, never derived from the title. */
  formRowKey: string | null;
  sortOrder: number;
}

/**
 * One thing a form asks the camp, as a question rather than as a cell.
 *
 * Catalog data. `renders` says where the answer lands on the page, so a date asked once fills
 * the three boxes the form splits it into.
 */
export interface ComplianceFormQuestion {
  id: string;
  questionKey: string;
  formCode: string;
  groupKey: string;
  groupLabel: string;
  label: string;
  helpText: string | null;
  answerKind: 'text' | 'longtext' | 'integer' | 'date' | 'bool' | 'choice' | 'multi';
  choices: { value: string; label: string }[] | null;
  renders: Record<string, unknown>[];
  /** Only asked once this other question is answered. */
  dependsOn: string | null;
  dependsOnValue: string | null;
  /** Set when the platform could answer this itself; a note, not a promise. */
  derivesFrom: string | null;
  appliesWhen: Record<string, string>;
  required: boolean;
  sortOrder: number;
}

/** questionKey to the camp's answer, as typed. */
export type FormAnswers = Record<string, string>;

/** The applicability interview. Keys match ComplianceRequirement.appliesWhen. */
export type ComplianceAnswers = Record<string, string>;

/**
 * One row of DOH-367's camper capacity table.
 *
 * The form prints ten session rows and no more, which is why `sessionIndex` is 1 to 10 and the
 * database checks it: the index is not an ordering hint, it is which printed row this is.
 *
 * The counts are what the camp actually enrolled last season, split the way New York splits it.
 * They are stored as plain numbers because the column is NOT NULL — so a band left blank in the
 * editor is held as 0, and a 0 prints nothing on the page rather than a printed zero the camp
 * did not write.
 */
export interface SessionCapacity {
  id: string;
  campId: string;
  seasonId: string;
  /** Which of the form's ten rows this is. 1-based. */
  sessionIndex: number;
  /** The camp's own name for the session. The form has no cell for it; it is here to work with. */
  sessionName: string | null;
  /** Day or overnight, one tick per row on the form. Null means neither box is ticked. */
  campType: 'day' | 'overnight' | null;
  numberOfDays: number | null;
  age1To5Male: number;
  age1To5Female: number;
  /** The form's "6 & 7" band; the column is age_6_7_* in the database. */
  age6And7Male: number;
  age6And7Female: number;
  age8To12Male: number;
  age8To12Female: number;
  age13To15Male: number;
  age13To15Female: number;
  /** The form's "16 & 17" band; the column is age_16_17_* in the database. */
  age16And17Male: number;
  age16And17Female: number;
  /** Counselors in training. A CIT must be 15 or over, so this band overlaps the two above it. */
  citsMale: number;
  citsFemale: number;
  /** The commissary session a prefill copied the name and dates from, when one did. */
  sourceSessionId: string | null;
  updatedAt: string;
}
