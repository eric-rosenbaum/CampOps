import Foundation

// MARK: - Location tree
//
// The backend unified every physical "location" (buildings, cabins, rooms,
// zones, etc.) into a single nestable, camp-scoped tree (`locations`), grouped
// by `location_categories`. Issues and checklist tasks now reference canonical
// `location_ids`, while keeping a `locations` text[] NAME snapshot for display.

struct Location: Codable, Identifiable, Hashable {
    let id: String
    var campId: String
    var parentId: String?
    var name: String
    var categoryId: String?
    var isDorm: Bool
    var retreatAvailable: Bool
    var bedCapacity: Int?
    var accessible: Bool
    var sortOrder: Int
    var isActive: Bool
    var notes: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, notes
        case campId           = "camp_id"
        case parentId         = "parent_id"
        case categoryId       = "category_id"
        case isDorm           = "is_dorm"
        case retreatAvailable = "retreat_available"
        case bedCapacity      = "bed_capacity"
        case accessible
        case sortOrder        = "sort_order"
        case isActive         = "is_active"
        case createdAt        = "created_at"
        case updatedAt        = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id               = try c.decode(String.self, forKey: .id)
        campId           = try c.decode(String.self, forKey: .campId)
        parentId         = try c.decodeIfPresent(String.self, forKey: .parentId)
        name             = try c.decode(String.self, forKey: .name)
        categoryId       = try c.decodeIfPresent(String.self, forKey: .categoryId)
        isDorm           = (try? c.decode(Bool.self, forKey: .isDorm)) ?? false
        retreatAvailable = (try? c.decode(Bool.self, forKey: .retreatAvailable)) ?? false
        bedCapacity      = try c.decodeIfPresent(Int.self, forKey: .bedCapacity)
        accessible       = (try? c.decode(Bool.self, forKey: .accessible)) ?? false
        sortOrder        = (try? c.decode(Int.self, forKey: .sortOrder)) ?? 0
        isActive         = (try? c.decode(Bool.self, forKey: .isActive)) ?? true
        notes            = try c.decodeIfPresent(String.self, forKey: .notes)
        createdAt        = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
        updatedAt        = (try? c.decode(Date.self, forKey: .updatedAt)) ?? Date()
    }

    static func == (lhs: Location, rhs: Location) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct LocationCategory: Codable, Identifiable, Hashable {
    let id: String
    var campId: String
    var name: String
    var sortOrder: Int
    var isPreset: Bool

    enum CodingKeys: String, CodingKey {
        case id, name
        case campId    = "camp_id"
        case sortOrder = "sort_order"
        case isPreset  = "is_preset"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id        = try c.decode(String.self, forKey: .id)
        campId    = try c.decode(String.self, forKey: .campId)
        name      = try c.decode(String.self, forKey: .name)
        sortOrder = (try? c.decode(Int.self, forKey: .sortOrder)) ?? 0
        isPreset  = (try? c.decode(Bool.self, forKey: .isPreset)) ?? false
    }

    static func == (lhs: LocationCategory, rhs: LocationCategory) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Building details (attached to a structure-level location)
//
// A location is a "building" when it has a `building_details` row. Rooms are its
// child locations (parent_id = the building's location id).

struct BuildingDetails: Codable, Identifiable {
    /// Primary key is the location id.
    let locationId: String
    var campId: String
    var buildingType: String?
    var mainWaterShutoff: String?
    var mainElectricalPanel: String?
    var mainGasShutoff: String?
    var yearBuilt: Int?

    var id: String { locationId }

    enum CodingKeys: String, CodingKey {
        case locationId          = "location_id"
        case campId              = "camp_id"
        case buildingType        = "building_type"
        case mainWaterShutoff    = "main_water_shutoff"
        case mainElectricalPanel = "main_electrical_panel"
        case mainGasShutoff      = "main_gas_shutoff"
        case yearBuilt           = "year_built"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        locationId          = try c.decode(String.self, forKey: .locationId)
        campId              = try c.decode(String.self, forKey: .campId)
        buildingType        = try c.decodeIfPresent(String.self, forKey: .buildingType)
        mainWaterShutoff    = try c.decodeIfPresent(String.self, forKey: .mainWaterShutoff)
        mainElectricalPanel = try c.decodeIfPresent(String.self, forKey: .mainElectricalPanel)
        mainGasShutoff      = try c.decodeIfPresent(String.self, forKey: .mainGasShutoff)
        yearBuilt           = try c.decodeIfPresent(Int.self, forKey: .yearBuilt)
    }
}
