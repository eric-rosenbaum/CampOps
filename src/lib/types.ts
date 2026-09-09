export type Role = 'doe' | 'facilities_manager' | 'maintenance_staff';

export interface User {
  id: string;
  name: string;
  role: Role;
  initials: string;
}

export type Priority = 'urgent' | 'high' | 'normal';

export type IssueStatus =
  | 'unassigned' | 'assigned' | 'in_progress'
  // "Waiting on the septic guy since June" used to render as in_progress, which is how a
  // queue stops meaning anything. Both are open but explicitly not being worked.
  | 'waiting_on_vendor' | 'waiting_on_part'
  | 'resolved';

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
  /**
   * Read by rental availability and the rooming board, not merely displayed.
   *
   * Assets already had a status; locations did not — which meant a coordinator could put twelve
   * guests in a cabin that had been out of service since June, because the board had no way to
   * know. This is the second place the two halves of the product touch.
   */
  serviceStatus: LocationServiceStatus;
  outOfServiceReason: string | null;
  outOfServiceSince: string | null;
  expectedBack: string | null;
  /** Bookable by a rental group as a meeting/activity space. Beside isDorm, not overloading it. */
  programSpace: boolean;
  /** A room's program capacity is not its bed capacity: the Lodge sleeps nobody and seats eighty. */
  capacitySeated: number | null;
  /** Server-assigned by a column default, so absent on a locally-built object. */
  qrToken?: string | null;
  createdAt: string;
  updatedAt: string;
}
export type LocationServiceStatus = 'in_service' | 'out_of_service' | 'limited';
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

/** @deprecated The recurring checkbox never generated anything. See {@link WorkSchedule}. */
export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'annually';

/**
 * Which crew owns a piece of work.
 *
 * A column rather than a module: housekeeping is "the same as maintenance just coloured
 * differently", which is an enum. It is a filter default and a colour, NEVER a permission —
 * gating work by trade would rebuild the staff-visibility trap that once hid a reporter's own
 * issue from them.
 */
/**
 * A trade is whatever the camp calls one of its crews.
 *
 * It used to be a five-value union, which meant a camp with no IT person stared at an empty
 * Tech lane and a camp with a waterfront crew had nowhere to file that work. The key is now
 * free-form and the real list lives in `camp_trades`, one row per camp, seeded with the five
 * below — so nothing changed until somebody changed it.
 *
 * Keys are stable and labels are not: renaming Grounds to "Property" is a label edit, not a
 * rewrite of a season of work orders.
 */
export type Trade = string;

/** The seed list, and the fallback when a camp's trades have not loaded yet. */
export const TRADES: Trade[] = ['maintenance', 'housekeeping', 'grounds', 'kitchen', 'it'];

export const TRADE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  housekeeping: 'Housekeeping',
  grounds: 'Grounds',
  kitchen: 'Kitchen',
  it: 'Tech',
};

export interface CampTrade {
  id: string;
  campId: string;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

/**
 * Where a piece of work came in from. Null means unknown, not web.
 *
 * Five sources now, and the season review counts by this — which is what proves the sticker
 * programme worked, or that it did not.
 */
export type IssueSource =
  | 'web' | 'ios' | 'public' | 'qr' | 'routine' | 'retreat' | 'session' | 'module';

export interface Issue {
  id: string;
  title: string;
  description: string;
  locationIds: string[];
  locations: string[]; // denormalized name snapshot (display + iOS/back-compat)
  priority: Priority;
  status: IssueStatus;
  assigneeId: string | null;
  /**
   * The crew this is waiting on, when no one person has it. Mutually exclusive with
   * `assigneeId`, and still counts as unassigned: a crew is where work waits, not who owns it.
   */
  assigneeGroupId: string | null;
  reportedById: string | null;
  /** @deprecated 2026-09-02. Not written, not shown — an estimate typed under time pressure is fiction. */
  estimatedCostDisplay: string | null;
  /** @deprecated 2026-09-02. See estimatedCostDisplay. */
  estimatedCostValue: number | null;
  /** The only real money figure in the module. Optional, admin-only, and what lets the season
   *  review say "the Gator cost $2,340 across nine work orders" — a replace-it argument. */
  actualCost: number | null;
  photoUrl: string | null;
  dueDate: string | null;
  /** @deprecated 2026-09-02. Migrated into WorkSchedule; the checkbox never generated anything. */
  isRecurring: boolean;
  /** @deprecated 2026-09-02. See isRecurring. */
  recurringInterval: RecurringInterval | null;
  isPublicReport: boolean;
  reporterName: string | null;
  reporterContact: string | null;
  /** Which client logged this. Null on rows predating the column, show nothing, don't guess. */
  source: IssueSource | null;

  // ── Campground ─────────────────────────────────────────────────────────────
  trade: Trade;
  /** Work against a *thing*. The central idea of a CMMS and what makes repair-vs-replace possible. */
  assetId: string | null;
  /** Dispatched out. Camps do not fix the commercial dishwasher themselves. */
  vendorId: string | null;
  /** Set when this is one occurrence of a routine rather than a one-off. */
  scheduleId: string | null;
  /** Set when a rental group's approved space request generated this. The seam. */
  retreatSpaceRequestId: string | null;
  retreatId: string | null;
  /** Optional, off by default. A salaried summer crew does not clock in. */
  minutesSpent: number | null;
  /** First assignment only — measures the queue, not the churn. Stamped by a DB trigger. */
  assignedAt: string | null;
  /** Stamped by a DB trigger, and cleared on reopen because it was then never closed. */
  resolvedAt: string | null;
  /** Handed to a public reporter on the success screen so they can see what happened. */
  reporterToken: string | null;

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
  /** Opaque token on this asset's sticker. Server-assigned, so absent on a locally-built object. */
  qrToken?: string | null;
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
  /** Null only while status is 'inquiry'. A DB check constraint enforces that. */
  arrivalDate: string | null;
  departureDate: string | null;
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

  // ── Pipeline ───────────────────────────────────────────────────────────────
  // Deliberately not a separate CRM: a camp has fifteen to forty groups a year, not four
  // thousand leads, and a kanban with next-actions plus a contact log is the entire job.
  leadStage: LeadStage;
  leadSource: string | null;
  lostReason: string | null;
  /** The single most important field in any small pipeline. Without it, a CRM is just a list. */
  nextAction: string | null;
  nextActionOn: string | null;
  ownerId: string | null;
  estimatedValue: number | null;
  /** "Any weekend in October." Free text on purpose — parsing it discards what they said. */
  dateFlexibility: string | null;
  /** The raw paste an intake draft was extracted from, kept so provenance survives. */
  intakeNotes: string | null;
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
  /** Which catalogue extra this came from, when it came from one. Joining on the description
   *  works only until a camp renames "Linen service", so the review reads this instead. */
  addonId: string | null;
  /** The group asked for it in the portal rather than the camp adding it. */
  requestedByGuest: boolean;
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
  /** Stripe Checkout session. The money is the CAMP's — Connect, so it settles to them. */
  stripeSessionId: string | null;
  paymentLinkUrl: string | null;
  paymentLinkExpiresAt: string | null;
  paidAt: string | null;
  amountPaid: number;
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
  /**
   * An incident form is filed in season on a 24-hour clock, not with the permit packet. Grouping
   * it with the application would put it in the wrong envelope and the wrong month.
   */
  isIncidentForm: boolean;
  /** False when the published URL carries a revision date and will break. */
  urlStable: boolean;
  sourceCheckedOn: string | null;
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
  /**
   * Part of the annual permit application envelope, rather than something produced on site.
   * The inspection screen excludes these: a sanitarian walking the property does not ask for
   * the application fee.
   */
  inPermitPackage: boolean;
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
  /** The document this rule was read from, and the day we last read it. */
  sourceId: string | null;
  sourceCheckedOn: string | null;
  verifyStatus: 'verified' | 'needs_verification';
  /**
   * Evidence for this is other people's personal records: camper health files, staff register
   * clearances. The camp confirms it holds them rather than uploading them here.
   */
  holdsPersonalRecords: boolean;
  /**
   * The documents this rule appears on. Empty means it is on no form at all and the county
   * checks it by walking the property, which is a real answer and is said out loud.
   */
  formCodes: string[];
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

/**
 * A reportable incident, and the clock it was reported on.
 *
 * 10 NYCRR 7-2.8(d) gives a camp 24 hours to report a specific list of injuries and illnesses,
 * and there are eight forms it lands on. What this record deliberately does NOT hold is who was
 * hurt: the named medical log belongs to the health director and stays in the health office.
 * This exists to prove a reportable incident was reported before its deadline, which is the
 * question an inspector actually asks.
 */
export type IncidentKind =
  | 'injury' | 'illness_outbreak' | 'abuse_allegation' | 'fire' | 'multiple_victim'
  | 'rabies_exposure' | 'epinephrine' | 'vaccine_preventable' | 'water_contamination'
  | 'amusement_device' | 'other';

export interface ComplianceIncident {
  id: string;
  campId: string;
  seasonId: string | null;
  occurredAt: string | null;
  /** The clock runs from when the camp knew, not when it happened. */
  discoveredAt: string;
  kind: IncidentKind;
  subject: 'camper' | 'staff' | 'volunteer' | 'visitor' | 'multiple' | 'none' | null;
  /** Which of 7-2.8(d)'s criteria this meets. Drives `reportable`. */
  severity: string[];
  formCode: string | null;
  reportable: boolean;
  reportDueAt: string | null;
  reportedAt: string | null;
  reportedTo: string | null;
  reportMethod: string | null;
  reportedBy: string | null;
  narrative: string | null;
  locationId: string | null;
  followUp: string | null;
  closedAt: string | null;
  /** 7-2.25(b) clocks, only for a camp at the 20% developmental-disability threshold. */
  investigationStartedAt: string | null;
  writtenReportAt: string | null;
  correctivePlanAt: string | null;
  correctiveImplementedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** One row of 7-2.8(d), kept as data so the reportability test and the UI read the same list. */
export interface IncidentCriterion {
  code: string;
  label: string;
  appliesTo: 'any' | 'camper' | 'staff';
  sortOrder: number;
}

/**
 * That a background check was run, when, and by what method — never its result.
 *
 * The DCJS response letter, the LDSS-3370 household and the DOH-2271 criminal-history statement
 * stay in the camp's own files, which is where the regulation puts them. `cleared` is the
 * operator's attestation, not a stored registry response.
 */
export type ScreeningKind =
  | 'dcjs_sor' | 'nsopw' | 'scr_ldss3370' | 'justice_center_sel' | 'reference_check'
  | 'employment_certificate';

export interface ComplianceScreening {
  id: string;
  campId: string;
  seasonId: string | null;
  staffId: string | null;
  /** For somebody not on the roster — "persons who frequent the camp" under the county rule. */
  subjectLabel: string | null;
  kind: ScreeningKind;
  performedOn: string;
  method: 'fax' | 'mail' | 'email' | 'cd' | 'telephone' | 'portal' | 'in_person' | null;
  /** DCJS issues a screener ID on telephone screenings and the fact sheet requires recording it. */
  referenceId: string | null;
  cleared: boolean | null;
  expiresOn: string | null;
  note: string | null;
  recordedBy: string | null;
}

export type TrainingKind =
  | 'staff_orientation' | 'camper_orientation' | 'mandated_reporter' | 'code_of_conduct'
  | 'activity_specific' | 'skills_verification' | 'other';

export interface ComplianceTraining {
  id: string;
  campId: string;
  seasonId: string | null;
  staffId: string | null;
  kind: TrainingKind;
  title: string | null;
  deliveredOn: string;
  deliveredBy: string | null;
  minutes: number | null;
  /** The Justice Center code of conduct is acknowledged, not merely attended. */
  acknowledgedOn: string | null;
  note: string | null;
}

export interface ComplianceInsurance {
  id: string;
  campId: string;
  seasonId: string | null;
  kind: 'workers_comp' | 'disability' | 'amusement_device_liability' | 'general_liability'
    | 'vehicle' | 'other';
  carrier: string | null;
  policyNumber: string | null;
  /** C-105.2, U-26.3, SI-12, GSI-105.2, CE-200, DB-120.1, DB-155. */
  formCode: string | null;
  perOccurrenceCents: number | null;
  aggregateCents: number | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  documentId: string | null;
  /** Amusement device cover must be proved to the county annually before use. */
  filedWith: string | null;
  filedOn: string | null;
  note: string | null;
}

/**
 * Where an obligation came from, and whether that address will still work next season.
 *
 * `urlStable` is false when the URL carries a date or revision and will break — the county
 * publishes its sanitary code as "CHAPTER 873 FINAL VERSION APPROVED 8-5-25.pdf". For those the
 * archived copy is the durable artefact and the UI links to it instead.
 */
export interface ComplianceSource {
  id: string;
  sourceKey: string;
  title: string;
  issuer: string | null;
  kind: 'regulation' | 'form' | 'packet' | 'guidance' | 'code' | 'factsheet';
  url: string | null;
  urlStable: boolean;
  archivedPath: string | null;
}

/** One reading of a source. The sha256 is what makes "what's new" a diff rather than a memory. */
export interface ComplianceSourceVersion {
  id: string;
  sourceId: string;
  sha256: string | null;
  retrievedAt: string;
  effectiveDate: string | null;
  revisionLabel: string | null;
  changeSummary: string | null;
  /** { req_codes: [...], applies_when: {...} } — decides whether a given camp cares. */
  affects: { req_codes?: string[]; applies_when?: Record<string, unknown> };
  isCurrent: boolean;
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
  /** The checklist this component fills. */
  formCodes: string[];
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
  /**
   * `from` marks a choice the setup interview already decided: it renders ticked and locked,
   * and `fromLabel` is the question that decides it, so a camp can see why and where to change it.
   */
  choices: { value: string; label: string; from?: string; fromLabel?: string }[] | null;
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

/**
 * One answer to the state's 92-question safety plan template.
 *
 * Three shapes because the template has three: boxes to tick, an "Enter text here" rule, and ten
 * questions asked as a table. A question can carry both `checked` and `text` — the template
 * routinely puts "Other (specify): Enter text here." after its checkboxes.
 */
export interface PlanAnswerValue {
  checked?: string[];
  text?: string;
  rows?: string[][];
}

/** Plan answers for one camp and season, keyed by PlanQuestion.key. */
export type PlanAnswers = Record<string, PlanAnswerValue>;

// ═══════════════════════════════════════════════════════════════════════════════
// Campground
// ═══════════════════════════════════════════════════════════════════════════════
// The work half: one queue, two crews, five ways in. Everything below hangs off `issues`,
// which is deliberately still called that in the database — the module was renamed in the UI
// only, because renaming a table thirteen surfaces and an iOS app read from is pure risk.

/** A contractor the camp dispatches work to. */
export interface ServiceVendor {
  id: string;
  campId: string;
  name: string;
  trade: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  accountNumber: string | null;
  /** Compliance reads this: several obligations are satisfied by a third party's annual visit. */
  insuranceExpiry: string | null;
  notes: string | null;
  lastUsedOn: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where a trade's work lands by default.
 *
 * The highest-value row in the whole module. An untriaged queue is why CMMS rollouts die: a
 * housekeeping report that sits unassigned until an admin notices it is a report nobody acts on.
 */
export interface WorkRouting {
  campId: string;
  trade: Trade;
  defaultStaffGroupId: string | null;
  defaultAssigneeId: string | null;
  updatedAt: string;
}

export type Cadence =
  | 'daily' | 'weekly' | 'monthly' | 'annually'
  | 'season_relative' | 'on_turnover' | 'meter';

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  annually: 'Every year',
  season_relative: 'Relative to opening day',
  on_turnover: 'On every turnover',
  meter: 'By hours or miles',
};

/**
 * A routine: recurring work, done properly this time.
 *
 * An issue is an EVENT; a recurrence is a TEMPLATE. The old boolean on the event could not say
 * "every third Tuesday, housekeeping, only between June and August, with these eleven steps" —
 * which is why it generated nothing for its entire life.
 *
 * Occurrences are materialized as real issues rather than computed, because a virtual occurrence
 * cannot be assigned, photographed, commented on, checklisted or counted in the season review.
 */
export interface WorkSchedule {
  id: string;
  campId: string;
  title: string;
  description: string | null;
  trade: Trade;
  priority: Priority;
  locationIds: string[];
  locations: string[];
  assetId: string | null;
  assigneeId: string | null;
  staffGroupId: string | null;
  vendorId: string | null;
  checklistTemplateId: string | null;

  cadence: Cadence;
  intervalCount: number;
  /** 0 = Sunday. Weekly only. */
  byWeekday: number[] | null;
  byMonthday: number | null;
  anchorDate: string | null;
  daysRelativeToOpening: number | null;
  meterInterval: number | null;
  meterLastAt: number | null;
  /** Which existing reading this counts against — camp_assets already tracks both. */
  meterKind: 'hours' | 'odometer';

  /** Without a window, a daily routine runs in January and the whole queue stops being trusted. */
  activeFrom: string | null;
  activeUntil: string | null;
  generateAheadDays: number;
  rescheduleFrom: 'due_date' | 'completed_at';

  lastGeneratedOn: string | null;
  /**
   * How many cycles this routine is behind.
   *
   * Only ONE open occurrence exists per schedule at a time: if last week's is still open when
   * this week's comes due, the open one is bumped and this counter goes up. Stacking duplicates
   * is how every recurring-task system earns itself a mute inside a month.
   */
  missedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTemplateItem {
  text: string;
  note?: string;
  /** Use sparingly. "Beds made" on a rental turnover earns one; "took out the trash" does not. */
  requiresPhoto?: boolean;
}

export interface WorkChecklistTemplate {
  id: string;
  campId: string;
  name: string;
  trade: Trade;
  items: ChecklistTemplateItem[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One checkable step on a work order. Rows, not jsonb, because each is done by a named person. */
export interface IssueChecklistItem {
  id: string;
  campId: string;
  issueId: string;
  position: number;
  text: string;
  note: string | null;
  requiresPhoto: boolean;
  /** The checklist this step came from, or null if somebody typed it on the job. */
  templateId: string | null;
  isDone: boolean;
  doneBy: string | null;
  doneByName: string | null;
  doneAt: string | null;
  photoUrl: string | null;
  createdAt: string;
}

/**
 * A human message on a work order.
 *
 * Rendered in ONE timeline with the activity events, never in a second tab — a "History" tab
 * beside a "Comments" tab is exactly the interface where messages go to be missed.
 */
export interface IssueComment {
  id: string;
  campId: string;
  issueId: string;
  /** Null means the public reporter, who has no account. */
  authorId: string | null;
  authorName: string;
  body: string;
  photoUrls: string[];
  /** Off by default: a camp talking to itself must not accidentally publish that to a scanner. */
  visibleToReporter: boolean;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

/** What a QR scan resolves to. Returned by an anon RPC that exposes display fields only. */
export interface QrTarget {
  campId: string;
  campName: string;
  campSlug: string;
  logoUrl: string | null;
  kind: 'location' | 'asset';
  targetId: string;
  targetName: string;
  targetPath: string | null;
}

/** The draft that comes back from a photo, a voice transcript, or both. Never filed unseen. */
export interface WorkOrderDraft {
  readable: boolean;
  confidence: number;
  title: string;
  description: string;
  trade: Trade;
  priority: Priority | null;
  locationId: string | null;
  assetId: string | null;
  assigneeId: string | null;
  notes: string;
  questions: string[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rentals
// ═══════════════════════════════════════════════════════════════════════════════

export type SpaceRequestStatus = 'requested' | 'approved' | 'declined' | 'countered';
export type SpaceLayout = 'theater' | 'rounds' | 'classroom' | 'open' | 'other';

export const LAYOUT_LABELS: Record<SpaceLayout, string> = {
  theater: 'Theater rows',
  rounds: 'Rounds',
  classroom: 'Classroom',
  open: 'Open floor',
  other: 'Something else',
};

/**
 * A group asking for a room, and the work that follows from saying yes.
 *
 * One row per space PER DAY rather than a date range, for two reasons: a reset between a Friday
 * session and a Saturday session is two jobs, and conflicts are per-day. Times are text, because
 * camps run on "after dinner", not on ISO timestamps.
 */
export interface RetreatSpaceRequest {
  id: string;
  campId: string;
  retreatId: string;
  locationId: string;
  /** First day of the run. */
  dayDate: string;
  /** Last day, inclusive. Equal to dayDate for a single-day ask. */
  endDate: string;
  startLabel: string | null;
  endLabel: string | null;
  purpose: string | null;
  expectedCount: number | null;
  layout: SpaceLayout;
  layoutOther: string | null;
  /** The group's words, verbatim. The camp adds beside it, never edits it. */
  setupNotes: string | null;
  campNotes: string | null;
  status: SpaceRequestStatus;
  responseMessage: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  /** The set-up work order approval generated. */
  workOrderId: string | null;
  /** The strike. Camps forget it every time, so the system creates it with the set-up. */
  strikeOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the camp sees at the moment of approving. Warnings, plus exactly one hard stop. */
export interface SpaceRequestConflicts {
  doubleBooked: { retreat: string; purpose: string | null; start: string | null }[];
  alsoADorm: boolean;
  housedThatNight: string[];
  buildingHousingOthers: string[];
  outOfService: boolean;
  outOfServiceReason: string | null;
  expectedBack: string | null;
  overCapacity: boolean;
  capacitySeated: number | null;
}

export type LeadStage = 'new' | 'qualifying' | 'proposal' | 'contract_out' | 'won' | 'lost';

export const LEAD_STAGES: LeadStage[] = ['new', 'qualifying', 'proposal', 'contract_out', 'won', 'lost'];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New enquiry',
  qualifying: 'Qualifying',
  proposal: 'Proposal out',
  contract_out: 'Contract out',
  won: 'Booked',
  lost: 'Lost',
};

export interface RetreatContact {
  id: string;
  campId: string;
  retreatId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TouchpointKind = 'call' | 'email' | 'meeting' | 'site_visit' | 'note';

export interface RetreatTouchpoint {
  id: string;
  campId: string;
  retreatId: string;
  kind: TouchpointKind;
  occurredAt: string;
  summary: string;
  byUserId: string | null;
  byName: string | null;
  createdAt: string;
}

export type AddonUnit = 'per_person' | 'per_night' | 'per_person_night' | 'per_unit' | 'flat';

export const ADDON_UNIT_LABELS: Record<AddonUnit, string> = {
  per_person: 'Per person',
  per_night: 'Per night',
  per_person_night: 'Per person, per night',
  per_unit: 'Each',
  flat: 'Flat fee',
};

/** The only upsell surface in the product. */
export interface RetreatAddon {
  id: string;
  campId: string;
  name: string;
  description: string | null;
  unit: AddonUnit;
  rate: number;
  /** Whether the guest portal offers it, or it is camp-side only. */
  guestSelectable: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';

/**
 * The document that wins the booking.
 *
 * `viewedAt` alone justifies this table — knowing they opened it on Tuesday changes the
 * follow-up call.
 */
export interface RetreatProposal {
  /** What this quote asks for up front. Written onto the booking when the group accepts. */
  depositAmount: number | null;
  /** The price the quote was built on, so an accepted quote can set the booking's rate. */
  pricingModel: string | null;
  ratePerPersonNight: number | null;
  flatRate: number | null;
  id: string;
  campId: string;
  retreatId: string;
  version: number;
  lineItems: RetreatInvoiceLine[];
  total: number;
  validUntil: string | null;
  terms: string | null;
  intro: string | null;
  status: ProposalStatus;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the intake endpoint returns from pasted call notes or an email thread. */
export interface RetreatIntakeDraft {
  groupName: string | null;
  groupType: string | null;
  contacts: { name: string; role?: string; email?: string; phone?: string }[];
  arrivalDate: string | null;
  departureDate: string | null;
  dateFlexibility: string | null;
  headcount: number | null;
  mealsWanted: string | null;
  spacesMentioned: string[];
  specialRequests: string | null;
  estimatedValue: number | null;
  leadSource: string | null;
  /** What the notes do not answer. Output, not failure — it becomes the follow-up email. */
  questions: string[];
  /** The exact sentence each field came from. Without it, people re-read the email anyway. */
  provenance: Record<string, string>;
  replyDraft: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notifications, sessions, reviews
// ═══════════════════════════════════════════════════════════════════════════════

export type MessageState = 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';

/**
 * One queued automated message.
 *
 * An outbox rather than a cron job that sends, because the planner re-runs nightly and CANCELS
 * anything whose condition stopped being true. The worst email this product could send is
 * "please submit your rooming" the morning after they submitted it.
 */
export interface ScheduledMessage {
  id: string;
  campId: string;
  subjectType: 'retreat' | 'work_order' | 'compliance';
  subjectId: string;
  ruleKey: string;
  recipientKind: 'guest' | 'camp' | 'assignee' | 'admin';
  toEmail: string;
  toName: string | null;
  replyTo: string | null;
  subject: string;
  bodyHtml: string;
  sendAfter: string;
  state: MessageState;
  suppressedReason: string | null;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Camp-wide sessions. Mirrored from commissary_sessions until that module moves onto this. */
export interface CampSession {
  id: string;
  campId: string;
  sourceId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  camperCount: number;
  staffCount: number;
  isActive: boolean;
}

/** The shapes the two review RPCs return. Computed in Postgres, never in the browser. */
export interface SeasonReview {
  from: string;
  to: string;
  /** The instant these numbers describe. Absent on payloads stored before as-of existed. */
  as_of?: string;
  /** The cut-off is meaningfully in the past, so this is not simply "right now". */
  is_historical?: boolean;
  volume: {
    reported: number; closed: number; open: number;
    by_trade: Record<string, number>;
    by_week: { week: string; reported: number; closed: number }[];
  };
  timing: {
    trade: string; priority: string;
    median_hours_to_assign: number | null;
    median_hours_to_close: number | null;
    sample: number;
  }[];
  locations: { location: string; count: number; open_days: number; cost: number }[];
  assets: { asset: string; count: number; cost: number; days_out: number }[];
  workload: {
    name: string; closed: number; still_open: number;
    median_hours_to_close: number | null; minutes_logged: number;
  }[];
  sources: Record<string, number>;
  routines: { active: number; generated: number; behind: { title: string; cycles: number }[] };
  carry_over: {
    id: string; title: string; trade: string; priority: string;
    location: string | null; age_days: number; status: string;
  }[];
  money: { recorded_cost: number; with_cost: number };
  /** Per-contractor breakdown. `cost` is a floor: only what somebody typed into actual_cost. */
  vendors: {
    id: string; name: string; trade: string | null;
    jobs: number; open: number; closed: number;
    cost: number; with_cost: number; median_days: number | null;
  }[];
}

export interface RentalsReview {
  from: string;
  to: string;
  occupancy: {
    beds_available: number; nights: number;
    bed_nights_available: number; bed_nights_sold: number;
    by_month: { month: string; bed_nights: number }[];
    out_of_service_beds: number;
  };
  revenue: {
    invoiced: number; collected: number; outstanding: number;
    addons: { name: string; times_sold: number; revenue: number }[];
    by_group: { group: string; invoiced: number; people: number }[];
  };
  pipeline: {
    inquiries: number; proposals_sent: number; won: number; lost: number;
    median_days_to_win: number | null;
    lost_reasons: Record<string, number>;
  };
  where_groups_come_from: {
    by_source: Record<string, number>; returning: number; total: number;
  };
  cost_to_host: {
    group: string; budgeted: number; actual: number;
    work_orders: number; work_minutes: number; work_cost: number;
  }[];
  feedback: {
    average_overall: number | null; responses: number;
    would_not_return: { group: string; comment: string | null; overall: number | null }[];
  };
}

/** One screen where both products are visibly the same product. */
export interface PropertyCalendar {
  sessions: { id: string; name: string; start: string; end: string; people: number }[];
  retreats: {
    id: string; group: string; start: string; end: string;
    people: number; status: string; lead_stage: string;
  }[];
  space_bookings: {
    id: string; space: string; day: string; group: string;
    status: string; purpose: string | null;
  }[];
  out_of_service: {
    id: string; name: string; reason: string | null;
    since: string | null; expected_back: string | null; kind: string;
  }[];
  /** A departure and an arrival on the same day with eleven cabins to turn is a staffing call. */
  turnover_days: { day: string; departing: number; arriving: number; rooms_to_turn: number }[];
}
