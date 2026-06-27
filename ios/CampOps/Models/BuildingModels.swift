import Foundation
import SwiftUI

// MARK: - JSON scalar (for component `metadata` jsonb)

/// Minimal Codable JSON scalar. Component metadata only ever holds string / number
/// / bool values (mirrors the web `metadata` jsonb), so we don't model objects/arrays.
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let d = try? c.decode(Double.self) { self = .number(d) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let d): try c.encode(d)
        case .bool(let b):   try c.encode(b)
        case .null:          try c.encodeNil()
        }
    }

    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    var doubleValue: Double? { if case .number(let d) = self { return d }; return nil }
    var boolValue: Bool?     { if case .bool(let b) = self { return b }; return nil }

    var displayString: String {
        switch self {
        case .string(let s): return s
        case .number(let d): return d == d.rounded() ? String(Int(d)) : String(d)
        case .bool(let b):   return b ? "Yes" : "No"
        case .null:          return ""
        }
    }
}

// MARK: - Enums

enum BuildingType: String, Codable, CaseIterable, Identifiable {
    case cabin, bathhouse, dining_hall, kitchen, infirmary
    case office, activity, storage, utility, other
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .cabin:       return "Cabin"
        case .bathhouse:   return "Bathhouse"
        case .dining_hall: return "Dining Hall"
        case .kitchen:     return "Kitchen"
        case .infirmary:   return "Infirmary / Health"
        case .office:      return "Office"
        case .activity:    return "Activity Building"
        case .storage:     return "Storage"
        case .utility:     return "Utility / Mechanical"
        case .other:       return "Other"
        }
    }
}

enum BuildingSystem: String, Codable, CaseIterable, Identifiable {
    case electrical, plumbing
    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
    var icon: String { self == .electrical ? "bolt.fill" : "drop.fill" }
}

enum ComponentStatus: String, Codable, CaseIterable, Identifiable {
    case operational, needs_attention, out_of_service
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .operational:     return "Operational"
        case .needs_attention: return "Needs attention"
        case .out_of_service:  return "Out of service"
        }
    }
    var color: Color {
        switch self {
        case .operational:     return .sage
        case .needs_attention: return .priorityHigh
        case .out_of_service:  return .priorityUrgent
        }
    }
    var bgColor: Color {
        switch self {
        case .operational:     return .greenBg
        case .needs_attention: return .amberBg
        case .out_of_service:  return .urgentBg
        }
    }
    private var rank: Int {
        switch self {
        case .operational: return 0
        case .needs_attention: return 1
        case .out_of_service: return 2
        }
    }
    static func worst(_ statuses: [ComponentStatus]) -> ComponentStatus {
        statuses.max { $0.rank < $1.rank } ?? .operational
    }
}

// MARK: - Component taxonomy

struct ComponentTypeOption: Identifiable {
    let value: String
    let label: String
    let system: BuildingSystem
    var id: String { value }
    var icon: String { BuildingTaxonomy.icon(for: value) }
}

enum SpecKind { case text, number, bool, select }

struct SpecField: Identifiable {
    let key: String
    let label: String
    let kind: SpecKind
    var options: [(value: String, label: String)] = []
    var id: String { key }
}

enum BuildingTaxonomy {
    static let electrical: [ComponentTypeOption] = [
        .init(value: "breaker_panel", label: "Breaker panel", system: .electrical),
        .init(value: "sub_panel", label: "Sub-panel", system: .electrical),
        .init(value: "outlet", label: "Outlet", system: .electrical),
        .init(value: "light_fixture", label: "Light fixture", system: .electrical),
        .init(value: "switch", label: "Switch", system: .electrical),
        .init(value: "exterior_light", label: "Exterior light", system: .electrical),
        .init(value: "generator", label: "Generator", system: .electrical),
        .init(value: "transfer_switch", label: "Transfer switch", system: .electrical),
        .init(value: "other_electrical", label: "Other electrical", system: .electrical),
    ]
    static let plumbing: [ComponentTypeOption] = [
        .init(value: "shutoff_valve", label: "Shutoff valve", system: .plumbing),
        .init(value: "water_heater", label: "Water heater", system: .plumbing),
        .init(value: "well_pump", label: "Well pump", system: .plumbing),
        .init(value: "backflow_preventer", label: "Backflow preventer", system: .plumbing),
        .init(value: "toilet", label: "Toilet", system: .plumbing),
        .init(value: "sink", label: "Sink", system: .plumbing),
        .init(value: "shower", label: "Shower", system: .plumbing),
        .init(value: "urinal", label: "Urinal", system: .plumbing),
        .init(value: "water_fountain", label: "Water fountain", system: .plumbing),
        .init(value: "hose_bib", label: "Hose bib / spigot", system: .plumbing),
        .init(value: "sump_pump", label: "Sump pump", system: .plumbing),
        .init(value: "septic", label: "Septic", system: .plumbing),
        .init(value: "other_plumbing", label: "Other plumbing", system: .plumbing),
    ]

    static func options(for system: BuildingSystem) -> [ComponentTypeOption] {
        system == .electrical ? electrical : plumbing
    }

    static func label(for type: String) -> String {
        (electrical + plumbing).first { $0.value == type }?.label ?? type
    }

    static func icon(for type: String) -> String {
        switch type {
        case "breaker_panel", "sub_panel", "generator", "transfer_switch": return "powerplug.fill"
        case "outlet":          return "powerplug"
        case "light_fixture":   return "lightbulb.fill"
        case "exterior_light":  return "lightbulb.led.fill"
        case "switch":          return "switch.2"
        case "other_electrical":return "bolt.fill"
        case "shutoff_valve", "backflow_preventer": return "gauge.with.dots.needle.bottom.50percent"
        case "water_heater":    return "flame.fill"
        case "well_pump", "sump_pump": return "water.waves"
        case "shower":          return "shower.fill"
        case "toilet", "sink", "urinal", "water_fountain", "hose_bib": return "drop.fill"
        case "septic":          return "circle.dotted"
        default:                return "wrench.adjustable"
        }
    }

    static func specs(for type: String) -> [SpecField] {
        switch type {
        case "outlet": return [
            .init(key: "isGfci", label: "GFCI protected", kind: .bool),
            .init(key: "voltage", label: "Voltage", kind: .select, options: [("120", "120V"), ("240", "240V")]),
            .init(key: "count", label: "Number of outlets", kind: .number),
        ]
        case "light_fixture": return [
            .init(key: "bulbType", label: "Bulb type", kind: .text),
            .init(key: "bulbCount", label: "Bulb count", kind: .number),
        ]
        case "exterior_light": return [
            .init(key: "bulbType", label: "Bulb type", kind: .text),
            .init(key: "isMotionSensor", label: "Motion sensor", kind: .bool),
        ]
        case "breaker_panel": return [
            .init(key: "amperageRating", label: "Panel rating (A)", kind: .number),
            .init(key: "breakerCount", label: "Number of breakers", kind: .number),
        ]
        case "sub_panel": return [
            .init(key: "amperageRating", label: "Panel rating (A)", kind: .number),
            .init(key: "fedFrom", label: "Fed from", kind: .text),
        ]
        case "generator": return [
            .init(key: "fuelType", label: "Fuel type", kind: .select, options: [
                ("propane", "Propane"), ("diesel", "Diesel"), ("gasoline", "Gasoline"), ("natural_gas", "Natural gas")]),
            .init(key: "wattage", label: "Output (watts)", kind: .number),
        ]
        case "transfer_switch": return [
            .init(key: "isAutomatic", label: "Automatic", kind: .bool),
        ]
        case "shutoff_valve": return [
            .init(key: "valveType", label: "Valve type", kind: .select, options: [
                ("gate", "Gate"), ("ball", "Ball"), ("other", "Other")]),
            .init(key: "serves", label: "What it serves", kind: .text),
        ]
        case "water_heater": return [
            .init(key: "gallons", label: "Capacity (gal)", kind: .number),
            .init(key: "fuelType", label: "Fuel type", kind: .select, options: [
                ("electric", "Electric"), ("propane", "Propane"), ("natural_gas", "Natural gas"), ("oil", "Oil")]),
            .init(key: "brand", label: "Brand", kind: .text),
        ]
        case "well_pump", "sump_pump": return [
            .init(key: "horsepower", label: "Horsepower", kind: .number),
        ]
        case "backflow_preventer": return [
            .init(key: "deviceType", label: "Device type", kind: .text),
        ]
        case "septic": return [
            .init(key: "capacityGallons", label: "Tank capacity (gal)", kind: .number),
            .init(key: "lastPumped", label: "Last pumped", kind: .text),
        ]
        case "toilet", "sink", "shower", "urinal": return [
            .init(key: "count", label: "Count", kind: .number),
        ]
        default: return []
        }
    }
}

/// One-line spec summary for compact rows (mirrors web `componentSummary`).
func componentSummary(_ c: BuildingComponent) -> String {
    let m = c.metadata
    var parts: [String] = []
    func num(_ k: String) -> String? { m[k]?.doubleValue.map { $0 == $0.rounded() ? String(Int($0)) : String($0) } }
    func str(_ k: String) -> String? { m[k]?.stringValue }
    func flag(_ k: String) -> Bool { m[k]?.boolValue ?? false }
    switch c.type {
    case "outlet":
        if flag("isGfci") { parts.append("GFCI") }
        if let v = str("voltage") { parts.append("\(v)V") }
        if let n = num("count") { parts.append("\(n)×") }
    case "light_fixture", "exterior_light":
        if let b = str("bulbType") { parts.append(b) }
        if let n = num("bulbCount") { parts.append("\(n) bulbs") }
        if flag("isMotionSensor") { parts.append("motion") }
    case "breaker_panel", "sub_panel":
        if let a = num("amperageRating") { parts.append("\(a)A") }
        if let b = num("breakerCount") { parts.append("\(b) breakers") }
    case "generator":
        if let w = num("wattage") { parts.append("\(w)W") }
        if let f = str("fuelType") { parts.append(f) }
    case "shutoff_valve":
        if let v = str("valveType") { parts.append("\(v) valve") }
        if let s = str("serves") { parts.append("serves \(s)") }
    case "water_heater":
        if let g = num("gallons") { parts.append("\(g) gal") }
        if let f = str("fuelType") { parts.append(f) }
    case "well_pump", "sump_pump":
        if let h = num("horsepower") { parts.append("\(h) HP") }
    case "toilet", "sink", "shower", "urinal":
        if let n = num("count") { parts.append("\(n)×") }
    default: break
    }
    return parts.joined(separator: " · ")
}

// MARK: - Models

struct Building: Codable, Identifiable {
    let id: String
    var name: String
    var type: BuildingType
    var locationLabel: String?
    var mainWaterShutoff: String?
    var mainElectricalPanel: String?
    var mainGasShutoff: String?
    var yearBuilt: Int?
    var notes: String?
    var sortOrder: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, type, notes
        case locationLabel        = "location_label"
        case mainWaterShutoff     = "main_water_shutoff"
        case mainElectricalPanel  = "main_electrical_panel"
        case mainGasShutoff       = "main_gas_shutoff"
        case yearBuilt            = "year_built"
        case sortOrder            = "sort_order"
        case createdAt            = "created_at"
        case updatedAt            = "updated_at"
    }
}

struct BuildingRoom: Codable, Identifiable {
    let id: String
    var buildingId: String
    var name: String
    var floor: String?
    var notes: String?
    var sortOrder: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, floor, notes
        case buildingId = "building_id"
        case sortOrder  = "sort_order"
        case createdAt  = "created_at"
        case updatedAt  = "updated_at"
    }
}

struct BuildingComponent: Codable, Identifiable {
    let id: String
    var buildingId: String
    var roomId: String?
    var system: BuildingSystem
    var type: String
    var label: String
    var locationDetail: String?
    var status: ComponentStatus
    var statusDetail: String?
    var lastServiced: String?
    var nextServiceDue: String?
    var photoUrl: String?
    var metadata: [String: JSONValue]
    var notes: String?
    var sortOrder: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, system, type, label, notes, metadata, status
        case buildingId     = "building_id"
        case roomId         = "room_id"
        case locationDetail = "location_detail"
        case statusDetail   = "status_detail"
        case lastServiced   = "last_serviced"
        case nextServiceDue = "next_service_due"
        case photoUrl       = "photo_url"
        case sortOrder      = "sort_order"
        case createdAt      = "created_at"
        case updatedAt      = "updated_at"
    }

    init(id: String, buildingId: String, roomId: String?, system: BuildingSystem, type: String,
         label: String, locationDetail: String?, status: ComponentStatus, statusDetail: String?,
         lastServiced: String?, nextServiceDue: String?, photoUrl: String?,
         metadata: [String: JSONValue], notes: String?, sortOrder: Int, createdAt: Date, updatedAt: Date) {
        self.id = id; self.buildingId = buildingId; self.roomId = roomId; self.system = system
        self.type = type; self.label = label; self.locationDetail = locationDetail; self.status = status
        self.statusDetail = statusDetail; self.lastServiced = lastServiced; self.nextServiceDue = nextServiceDue
        self.photoUrl = photoUrl; self.metadata = metadata; self.notes = notes; self.sortOrder = sortOrder
        self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        buildingId = try c.decode(String.self, forKey: .buildingId)
        roomId = try c.decodeIfPresent(String.self, forKey: .roomId)
        system = try c.decode(BuildingSystem.self, forKey: .system)
        type = try c.decode(String.self, forKey: .type)
        label = try c.decode(String.self, forKey: .label)
        locationDetail = try c.decodeIfPresent(String.self, forKey: .locationDetail)
        status = (try? c.decode(ComponentStatus.self, forKey: .status)) ?? .operational
        statusDetail = try c.decodeIfPresent(String.self, forKey: .statusDetail)
        lastServiced = try c.decodeIfPresent(String.self, forKey: .lastServiced)
        nextServiceDue = try c.decodeIfPresent(String.self, forKey: .nextServiceDue)
        photoUrl = try c.decodeIfPresent(String.self, forKey: .photoUrl)
        metadata = (try? c.decodeIfPresent([String: JSONValue].self, forKey: .metadata)) ?? [:]
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        sortOrder = (try? c.decode(Int.self, forKey: .sortOrder)) ?? 0
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
}

struct BuildingCircuit: Codable, Identifiable {
    let id: String
    var panelId: String
    var breakerNumber: String?
    var label: String?
    var amperage: Int?
    var controls: String?
    var isOn: Bool
    var sortOrder: Int
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, label, amperage, controls
        case panelId       = "panel_id"
        case breakerNumber = "breaker_number"
        case isOn          = "is_on"
        case sortOrder     = "sort_order"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }
}

struct BuildingSeasonalTask: Codable, Identifiable {
    let id: String
    var buildingId: String?
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
        case id, title, detail, phase, assignees
        case buildingId    = "building_id"
        case isComplete    = "is_complete"
        case completedBy   = "completed_by"
        case completedDate = "completed_date"
        case sortOrder     = "sort_order"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }
}
