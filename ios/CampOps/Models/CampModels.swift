import Foundation

enum CampRole: String, Codable {
    case admin = "admin"
    case staff = "staff"

    var displayName: String {
        switch self {
        case .admin: return "Administrator"
        case .staff: return "Staff"
        }
    }
}

struct Camp: Codable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let logoUrl: String?
    let campType: String?
    let state: String?
    let modules: [String: Bool]
    let locations: [String]

    enum CodingKeys: String, CodingKey {
        case id, name, slug, modules, locations
        case logoUrl  = "logo_url"
        case campType = "camp_type"
        case state
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id        = try c.decode(String.self, forKey: .id)
        name      = try c.decode(String.self, forKey: .name)
        slug      = try c.decode(String.self, forKey: .slug)
        logoUrl   = try c.decodeIfPresent(String.self, forKey: .logoUrl)
        campType  = try c.decodeIfPresent(String.self, forKey: .campType)
        state     = try c.decodeIfPresent(String.self, forKey: .state)
        modules   = (try? c.decode([String: Bool].self, forKey: .modules)) ?? [:]
        locations = (try? c.decode([String].self, forKey: .locations)) ?? []
    }
}

struct CampMember: Codable, Identifiable {
    let id: String
    let campId: String
    let userId: String
    let role: CampRole
    let department: String?
    let displayName: String?
    let isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, role, department
        case campId      = "camp_id"
        case userId      = "user_id"
        case displayName = "display_name"
        case isActive    = "is_active"
    }
}

// Row type for the joined camp_members + camps query
struct CampMemberRow: Decodable {
    let id: String
    let campId: String
    let userId: String
    let role: CampRole
    let department: String?
    let displayName: String?
    let isActive: Bool
    let camps: Camp

    enum CodingKeys: String, CodingKey {
        case id, role, department, camps
        case campId      = "camp_id"
        case userId      = "user_id"
        case displayName = "display_name"
        case isActive    = "is_active"
    }
}

struct JoinCodeResult: Decodable {
    let campId: String?
    let campName: String?
    let error: String?
    enum CodingKeys: String, CodingKey {
        case campId   = "camp_id"
        case campName = "camp_name"
        case error
    }
}

struct ProfileRow: Decodable {
    let fullName: String?
    enum CodingKeys: String, CodingKey { case fullName = "full_name" }
}
