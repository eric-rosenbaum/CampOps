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

export type Location =
  | 'Waterfront'
  | 'Dining Hall'
  | 'Cabins'
  | 'Art Barn'
  | 'Aquatics'
  | 'Athletic Fields'
  | 'Main Lodge'
  | 'Health Center'
  | 'Other';

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
  reportedById: string;
  estimatedCostDisplay: string | null;
  estimatedCostValue: number | null;
  actualCost: number | null;
  photoUrl: string | null;
  dueDate: string | null;
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
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
  daysRelativeToOpening: number;
  dueDate: string | null;
  isRecurring: true;
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

export type PoolType = 'pool' | 'lake' | 'pond' | 'river' | 'waterfront' | 'other';

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

export type AssetCategory = 'vehicle' | 'golf_cart' | 'watercraft' | 'large_equipment' | 'trailer' | 'other';

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
