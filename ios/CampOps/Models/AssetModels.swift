import Foundation
import SwiftUI

// MARK: - Enums

enum AssetCategory: String, Codable, CaseIterable, Identifiable {
    var id: String { rawValue }
    case vehicle        = "vehicle"
    case golfCart       = "golf_cart"
    case watercraft     = "watercraft"
    case largeEquipment = "large_equipment"
    case trailer        = "trailer"
    case technology     = "technology"
    case other          = "other"

    var displayName: String {
        switch self {
        case .vehicle:        return "Vehicle"
        case .golfCart:       return "Golf Cart"
        case .watercraft:     return "Watercraft"
        case .largeEquipment: return "Large Equipment"
        case .trailer:        return "Trailer"
        case .technology:     return "Technology"
        case .other:          return "Other"
        }
    }

    var icon: String {
        switch self {
        case .vehicle:        return "car.fill"
        case .golfCart:       return "car.side.fill"
        case .watercraft:     return "water.waves"
        case .largeEquipment: return "tractor.fill"
        case .trailer:        return "rectangle.split.3x1.fill"
        case .technology:     return "desktopcomputer"
        case .other:          return "wrench.fill"
        }
    }
}

enum AssetStatus: String, Codable {
    case available   = "available"
    case checkedOut  = "checked_out"
    case inService   = "in_service"
    case retired     = "retired"

    var displayName: String {
        switch self {
        case .available:  return "Available"
        case .checkedOut: return "Checked Out"
        case .inService:  return "In Service"
        case .retired:    return "Retired"
        }
    }

    var color: Color {
        switch self {
        case .available:  return .sage
        case .checkedOut: return Color(red: 0.23, green: 0.49, blue: 0.88)
        case .inService:  return .priorityHigh
        case .retired:    return Color.gray
        }
    }

    var bgColor: Color {
        switch self {
        case .available:  return .greenBg
        case .checkedOut: return Color(red: 0.88, green: 0.94, blue: 1.0)
        case .inService:  return .amberBg
        case .retired:    return Color.gray.opacity(0.2)
        }
    }
}

enum AssetServiceType: String, Codable, CaseIterable {
    case oilChange         = "oil_change"
    case tireRotation      = "tire_rotation"
    case tireReplacement   = "tire_replacement"
    case brakeService      = "brake_service"
    case battery           = "battery"
    case beltReplacement   = "belt_replacement"
    case fluidTopOff       = "fluid_top_off"
    case filterReplacement = "filter_replacement"
    case stateInspection   = "state_inspection"
    case dotInspection     = "dot_inspection"
    case annualInspection  = "annual_inspection"
    case hullInspection    = "hull_inspection"
    case engineService     = "engine_service"
    case bladeSharpening   = "blade_sharpening"
    case cleaning          = "cleaning"
    case repair            = "repair"
    case other             = "other"

    var displayName: String {
        switch self {
        case .oilChange:         return "Oil change"
        case .tireRotation:      return "Tire rotation"
        case .tireReplacement:   return "Tire replacement"
        case .brakeService:      return "Brake service"
        case .battery:           return "Battery"
        case .beltReplacement:   return "Belt replacement"
        case .fluidTopOff:       return "Fluid top-off"
        case .filterReplacement: return "Filter replacement"
        case .stateInspection:   return "State inspection"
        case .dotInspection:     return "DOT inspection"
        case .annualInspection:  return "Annual inspection"
        case .hullInspection:    return "Hull inspection"
        case .engineService:     return "Engine service"
        case .bladeSharpening:   return "Blade sharpening"
        case .cleaning:          return "Cleaning"
        case .repair:            return "Repair"
        case .other:             return "Other"
        }
    }

    var isInspection: Bool {
        switch self {
        case .stateInspection, .dotInspection, .annualInspection, .hullInspection: return true
        default: return false
        }
    }

    static func types(for category: AssetCategory) -> [AssetServiceType] {
        switch category {
        case .vehicle:
            return [.oilChange, .tireRotation, .tireReplacement, .brakeService, .battery,
                    .beltReplacement, .fluidTopOff, .filterReplacement,
                    .stateInspection, .dotInspection, .annualInspection,
                    .cleaning, .repair, .other]
        case .golfCart:
            return [.battery, .tireRotation, .tireReplacement, .brakeService,
                    .beltReplacement, .filterReplacement, .annualInspection,
                    .cleaning, .repair, .other]
        case .watercraft:
            return [.hullInspection, .engineService, .cleaning, .repair, .other]
        case .largeEquipment:
            return [.oilChange, .filterReplacement, .bladeSharpening, .engineService,
                    .beltReplacement, .fluidTopOff, .annualInspection,
                    .cleaning, .repair, .other]
        case .trailer:
            return [.tireRotation, .tireReplacement, .brakeService,
                    .annualInspection, .cleaning, .repair, .other]
        case .technology:
            return [.cleaning, .repair, .other]
        case .other:
            return AssetServiceType.allCases
        }
    }
}

enum AssetMaintenancePhase: String, Codable, CaseIterable, Identifiable {
    var id: String { rawValue }
    case preSeason  = "pre_season"
    case inSeason   = "in_season"
    case postSeason = "post_season"

    var displayName: String {
        switch self {
        case .preSeason:  return "Pre-season"
        case .inSeason:   return "In-season"
        case .postSeason: return "Post-season"
        }
    }
}

enum FuelLevel: String, Codable, CaseIterable {
    case empty        = "empty"
    case quarter      = "quarter"
    case half         = "half"
    case threeQuarter = "three_quarter"
    case full         = "full"

    var displayName: String {
        switch self {
        case .empty:        return "E"
        case .quarter:      return "¼"
        case .half:         return "½"
        case .threeQuarter: return "¾"
        case .full:         return "F"
        }
    }
}

enum CheckoutCondition: String, Codable {
    case noIssues       = "no_issues"
    case minorNote      = "minor_note"
    case needsAttention = "needs_attention"

    var displayName: String {
        switch self {
        case .noIssues:       return "No issues"
        case .minorNote:      return "Minor note"
        case .needsAttention: return "Needs attention"
        }
    }
}

// MARK: - Models

struct CampAsset: Codable, Identifiable {
    let id: String
    var name: String
    var category: AssetCategory
    var subtype: String
    var make: String?
    var model: String?
    var year: Int?
    var serialNumber: String?
    var licensePlate: String?
    var registrationExpiry: String?
    var storageLocation: String
    var status: AssetStatus
    var currentOdometer: Double?
    var currentHours: Double?
    var tracksOdometer: Bool
    var tracksHours: Bool
    var notes: String?
    var isActive: Bool
    var hullId: String?
    var uscgRegistration: String?
    var uscgRegistrationExpiry: String?
    var capacity: Int?
    var motorType: String?
    var hasLifejackets: Bool?
    var lifejacketCount: Int?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, category, subtype, make, model, year, notes, status, capacity
        case serialNumber          = "serial_number"
        case licensePlate          = "license_plate"
        case registrationExpiry    = "registration_expiry"
        case storageLocation       = "storage_location"
        case currentOdometer       = "current_odometer"
        case currentHours          = "current_hours"
        case tracksOdometer        = "tracks_odometer"
        case tracksHours           = "tracks_hours"
        case isActive              = "is_active"
        case hullId                = "hull_id"
        case uscgRegistration      = "uscg_registration"
        case uscgRegistrationExpiry = "uscg_registration_expiry"
        case motorType             = "motor_type"
        case hasLifejackets        = "has_lifejackets"
        case lifejacketCount       = "lifejacket_count"
        case createdAt             = "created_at"
        case updatedAt             = "updated_at"
    }
}

struct AssetCheckout: Codable, Identifiable {
    let id: String
    var assetId: String
    var checkedOutBy: String
    var purpose: String
    var checkedOutAt: Date
    var expectedReturnAt: Date
    var returnedAt: Date?
    var startOdometer: Double?
    var endOdometer: Double?
    var startHours: Double?
    var endHours: Double?
    var fuelLevelOut: FuelLevel?
    var fuelLevelIn: FuelLevel?
    var checkoutNotes: String?
    var returnNotes: String?
    var returnCondition: CheckoutCondition?
    var loggedBy: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, purpose
        case assetId         = "asset_id"
        case checkedOutBy    = "checked_out_by"
        case checkedOutAt    = "checked_out_at"
        case expectedReturnAt = "expected_return_at"
        case returnedAt      = "returned_at"
        case startOdometer   = "start_odometer"
        case endOdometer     = "end_odometer"
        case startHours      = "start_hours"
        case endHours        = "end_hours"
        case fuelLevelOut    = "fuel_level_out"
        case fuelLevelIn     = "fuel_level_in"
        case checkoutNotes   = "checkout_notes"
        case returnNotes     = "return_notes"
        case returnCondition = "return_condition"
        case loggedBy        = "logged_by"
        case createdAt       = "created_at"
    }
}

struct AssetServiceRecord: Codable, Identifiable {
    let id: String
    var assetId: String
    var serviceType: AssetServiceType
    var datePerformed: String
    var performedBy: String
    var vendor: String?
    var description: String?
    var odometerAtService: Double?
    var hoursAtService: Double?
    var cost: Double?
    var nextServiceDate: String?
    var nextServiceOdometer: Double?
    var nextServiceHours: Double?
    var isInspection: Bool
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, description, vendor, cost
        case assetId             = "asset_id"
        case serviceType         = "service_type"
        case datePerformed       = "date_performed"
        case performedBy         = "performed_by"
        case odometerAtService   = "odometer_at_service"
        case hoursAtService      = "hours_at_service"
        case nextServiceDate     = "next_service_date"
        case nextServiceOdometer = "next_service_odometer"
        case nextServiceHours    = "next_service_hours"
        case isInspection        = "is_inspection"
        case createdAt           = "created_at"
    }
}

struct AssetMaintenanceTask: Codable, Identifiable {
    let id: String
    var assetId: String
    var phase: AssetMaintenancePhase
    var title: String
    var detail: String?
    var isComplete: Bool
    var completedBy: String?
    var completedDate: String?
    var sortOrder: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, phase, title, detail
        case assetId       = "asset_id"
        case isComplete    = "is_complete"
        case completedBy   = "completed_by"
        case completedDate = "completed_date"
        case sortOrder     = "sort_order"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }
}

// MARK: - Display helpers

let subtypeDisplayNames: [String: String] = [
    "truck": "Truck", "van": "Van", "car": "Car", "bus": "Bus", "atv": "ATV",
    "golf_cart": "Golf Cart", "utility_cart": "Utility Cart",
    "kayak": "Kayak", "canoe": "Canoe", "rowboat": "Rowboat", "motorboat": "Motorboat",
    "sailboat": "Sailboat", "paddleboard": "Paddleboard", "raft": "Raft", "pontoon": "Pontoon",
    "tractor": "Tractor", "mower": "Mower", "excavator": "Excavator",
    "forklift": "Forklift", "compactor": "Compactor",
    "utility_trailer": "Utility Trailer", "horse_trailer": "Horse Trailer",
    "boat_trailer": "Boat Trailer", "enclosed_trailer": "Enclosed Trailer",
    "generator": "Generator", "pump": "Pump", "compressor": "Compressor",
    "desktop": "Desktop", "laptop": "Laptop", "tablet": "Tablet",
    "projector": "Projector", "printer": "Printer", "server": "Server",
    "other": "Other",
]

let subtypesByCategory: [AssetCategory: [String]] = [
    .vehicle:        ["truck", "van", "car", "bus", "atv"],
    .golfCart:       ["golf_cart", "utility_cart"],
    .watercraft:     ["kayak", "canoe", "rowboat", "motorboat", "sailboat", "paddleboard", "raft", "pontoon"],
    .largeEquipment: ["tractor", "mower", "excavator", "forklift", "compactor"],
    .trailer:        ["utility_trailer", "horse_trailer", "boat_trailer", "enclosed_trailer"],
    .technology:     ["desktop", "laptop", "tablet", "projector", "printer", "server", "other"],
    .other:          ["generator", "pump", "compressor", "other"],
]
