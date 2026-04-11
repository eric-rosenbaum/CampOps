import Foundation
import SwiftUI

// MARK: - Enums

enum EquipmentStatus: String, Codable {
    case ok, warn, alert
    var displayName: String {
        switch self {
        case .ok:    return "Operational"
        case .warn:  return "Monitor"
        case .alert: return "Needs attention"
        }
    }
    var color: Color {
        switch self {
        case .ok:    return .sage
        case .warn:  return .priorityHigh
        case .alert: return .priorityUrgent
        }
    }
    var bgColor: Color {
        switch self {
        case .ok:    return .greenBg
        case .warn:  return .amberBg
        case .alert: return .urgentBg
        }
    }
}

enum EquipmentType: String, Codable, CaseIterable {
    case pump, filter, heater, chlorinator, safety, other
    var displayName: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .pump:       return "arrow.triangle.2.circlepath"
        case .filter:     return "line.3.horizontal.decrease.circle"
        case .heater:     return "flame"
        case .chlorinator:return "drop.circle"
        case .safety:     return "shield"
        case .other:      return "wrench.adjustable"
        }
    }
}

enum PoolServiceType: String, Codable, CaseIterable {
    case routineMaintenance = "routine_maintenance"
    case repair             = "repair"
    case inspection         = "inspection"
    case partReplacement    = "part_replacement"
    case vendorService      = "vendor_service"
    var displayName: String {
        switch self {
        case .routineMaintenance: return "Routine maintenance"
        case .repair:             return "Repair"
        case .inspection:         return "Inspection"
        case .partReplacement:    return "Part replacement"
        case .vendorService:      return "Vendor service"
        }
    }
}

enum InspectionStatus: String, Codable {
    case ok, due, overdue
}

enum InspectionResult: String, Codable, CaseIterable {
    case passed         = "passed"
    case passedWithNotes = "passed_with_notes"
    case conditional    = "conditional"
    case failed         = "failed"
    var displayName: String {
        switch self {
        case .passed:          return "Passed"
        case .passedWithNotes: return "Passed with notes"
        case .conditional:     return "Conditional"
        case .failed:          return "Failed"
        }
    }
    var color: Color {
        switch self {
        case .passed:          return .greenText
        case .passedWithNotes: return .amberText
        case .conditional:     return .amberText
        case .failed:          return .priorityUrgent
        }
    }
    var bgColor: Color {
        switch self {
        case .passed:          return .greenBg
        case .passedWithNotes: return .amberBg
        case .conditional:     return .amberBg
        case .failed:          return .urgentBg
        }
    }
}

enum SeasonalPhase: String, Codable, CaseIterable, Identifiable {
    case opening  = "opening"
    case inSeason = "in_season"
    case closing  = "closing"
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .opening:  return "Pre-season opening"
        case .inSeason: return "In-season maintenance"
        case .closing:  return "End-of-season closing"
        }
    }
}

enum PoolStatusValue: String, Codable, CaseIterable {
    case openAllClear     = "open_all_clear"
    case openMonitoring   = "open_monitoring"
    case closedCorrective = "closed_corrective"
    case closedRetest     = "closed_retest"
    var displayName: String {
        switch self {
        case .openAllClear:     return "Open — all clear"
        case .openMonitoring:   return "Open — monitoring"
        case .closedCorrective: return "Closed — corrective action"
        case .closedRetest:     return "Closed — re-test required"
        }
    }
}

// MARK: - Chemical status

enum ChemStatus {
    case ok, warn, alert
    var color: Color {
        switch self {
        case .ok:    return .sage
        case .warn:  return .priorityHigh
        case .alert: return .priorityUrgent
        }
    }
    var bgColor: Color {
        switch self {
        case .ok:    return .greenBg
        case .warn:  return .amberBg
        case .alert: return .urgentBg
        }
    }
    var label: String {
        switch self {
        case .ok:    return "OK"
        case .warn:  return "Monitor"
        case .alert: return "Alert"
        }
    }
}

extension ChemStatus: Equatable {}

enum ChemField: String, CaseIterable, Identifiable {
    var id: String { rawValue }
    case freeChlorine, ph, alkalinity, cyanuricAcid, waterTemp
    var displayName: String {
        switch self {
        case .freeChlorine: return "Free chlorine"
        case .ph:           return "pH"
        case .alkalinity:   return "Alkalinity"
        case .cyanuricAcid: return "Cyanuric acid"
        case .waterTemp:    return "Water temp"
        }
    }
    var unit: String {
        switch self {
        case .waterTemp: return "°F"
        default:         return "ppm"
        }
    }
    var rangeDisplay: String {
        switch self {
        case .freeChlorine: return "1.0–3.0 ppm"
        case .ph:           return "7.2–7.8"
        case .alkalinity:   return "80–120 ppm"
        case .cyanuricAcid: return "30–50 ppm"
        case .waterTemp:    return "68–82°F"
        }
    }
    func value(from r: ChemicalReading) -> Double {
        switch self {
        case .freeChlorine: return r.freeChlorine
        case .ph:           return r.ph
        case .alkalinity:   return r.alkalinity
        case .cyanuricAcid: return r.cyanuricAcid
        case .waterTemp:    return r.waterTemp
        }
    }
}

func chemStatus(field: ChemField, value: Double) -> ChemStatus {
    switch field {
    case .freeChlorine:
        if value < 1.0 { return .alert }
        if value > 3.0 { return .warn }
        return .ok
    case .ph:
        if value < 7.0 || value > 8.2 { return .alert }
        if value < 7.2 || value > 7.8 { return .warn }
        return .ok
    case .alkalinity:
        if value < 60 || value > 140 { return .alert }
        if value < 90 || value > 110 { return .warn }
        return .ok
    case .cyanuricAcid:
        if value < 20 || value > 60 { return .alert }
        if value < 32 || value > 48 { return .warn }
        return .ok
    case .waterTemp:
        if value < 60 || value > 90 { return .alert }
        if value < 68 || value > 82 { return .warn }
        return .ok
    }
}

// MARK: - Models

struct ChemicalReading: Codable, Identifiable {
    let id: String
    let freeChlorine: Double
    let ph: Double
    let alkalinity: Double
    let cyanuricAcid: Double
    let waterTemp: Double
    let calciumHardness: Double?
    let timeOfDay: String
    let loggedById: String
    let loggedByName: String
    let correctiveAction: String?
    let poolStatus: PoolStatusValue
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case freeChlorine     = "free_chlorine"
        case ph, alkalinity
        case cyanuricAcid     = "cyanuric_acid"
        case waterTemp        = "water_temp"
        case calciumHardness  = "calcium_hardness"
        case timeOfDay        = "time_of_day"
        case loggedById       = "logged_by_id"
        case loggedByName     = "logged_by_name"
        case correctiveAction = "corrective_action"
        case poolStatus       = "pool_status"
        case createdAt        = "created_at"
    }
}

struct PoolEquipment: Codable, Identifiable {
    let id: String
    var name: String
    var type: EquipmentType
    var status: EquipmentStatus
    var statusDetail: String
    var lastServiced: String?
    var nextServiceDue: String?
    var vendor: String?
    var specs: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, type, status
        case statusDetail   = "status_detail"
        case lastServiced   = "last_serviced"
        case nextServiceDue = "next_service_due"
        case vendor, specs
        case createdAt      = "created_at"
        case updatedAt      = "updated_at"
    }
}

struct PoolServiceLog: Codable, Identifiable {
    let id: String
    let equipmentId: String?
    let serviceType: PoolServiceType
    let datePerformed: String
    let performedBy: String
    let notes: String?
    let cost: Double?
    let nextServiceDue: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case equipmentId    = "equipment_id"
        case serviceType    = "service_type"
        case datePerformed  = "date_performed"
        case performedBy    = "performed_by"
        case notes, cost
        case nextServiceDue = "next_service_due"
        case createdAt      = "created_at"
    }
}

struct PoolInspection: Codable, Identifiable {
    let id: String
    var name: String
    var frequency: String
    var authority: String
    var standard: String?
    var status: InspectionStatus
    var lastCompleted: String?
    var nextDue: String?
    var history: [String]
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, frequency, authority, standard, status
        case lastCompleted = "last_completed"
        case nextDue       = "next_due"
        case history
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }
}

struct PoolInspectionLog: Codable, Identifiable {
    let id: String
    var inspectionId: String?
    var inspectionDate: String
    var conductedBy: String
    var result: InspectionResult
    var notes: String?
    var nextDue: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case inspectionId  = "inspection_id"
        case inspectionDate = "inspection_date"
        case conductedBy   = "conducted_by"
        case result, notes
        case nextDue       = "next_due"
        case createdAt     = "created_at"
    }

    func typeName(inspections: [PoolInspection]) -> String {
        let hardcoded: [String: String] = [
            "health_dept":        "Health dept. water quality",
            "aca_waterfront":     "ACA waterfront safety",
            "equipment_monthly":  "Pool equipment monthly service",
            "lifeguard_cert":     "Lifeguard certification verification",
            "pre_season":         "Pre-season pool opening",
            "end_of_season":      "End-of-season closing",
            "other":              "Other",
        ]
        if let id = inspectionId {
            return inspections.first { $0.id == id }?.name ?? hardcoded[id] ?? id
        }
        return "Inspection"
    }
}

struct PoolSeasonalTask: Codable, Identifiable {
    let id: String
    var title: String
    var detail: String?
    var phase: SeasonalPhase
    var isComplete: Bool
    var completedBy: String?
    var completedDate: String?
    var assignees: [String]
    var sortOrder: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, detail, phase
        case isComplete    = "is_complete"
        case completedBy   = "completed_by"
        case completedDate = "completed_date"
        case assignees
        case sortOrder     = "sort_order"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }
}

// MARK: - Date helper

extension Date {
    var yyyyMMdd: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: self)
    }
}
