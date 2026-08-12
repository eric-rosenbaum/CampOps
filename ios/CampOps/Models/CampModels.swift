import Foundation

// MARK: - Staff Groups

struct StaffGroupModules: Codable {
    let issuesRepairs: Bool
    let prePost: Bool
    let pool: Bool
    let safety: Bool
    let assets: Bool
    let buildingSystems: Bool

    enum CodingKeys: String, CodingKey {
        case issuesRepairs   = "issues_repairs"
        case prePost         = "pre_post"
        case buildingSystems = "building_systems"
        case pool, safety, assets
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        issuesRepairs   = (try? c.decode(Bool.self, forKey: .issuesRepairs)) ?? true
        prePost         = (try? c.decode(Bool.self, forKey: .prePost)) ?? true
        pool            = (try? c.decode(Bool.self, forKey: .pool)) ?? true
        safety          = (try? c.decode(Bool.self, forKey: .safety)) ?? true
        assets          = (try? c.decode(Bool.self, forKey: .assets)) ?? true
        // Defaults false: groups created before this module existed don't grant it.
        buildingSystems = (try? c.decode(Bool.self, forKey: .buildingSystems)) ?? false
    }
}

struct StaffGroup: Codable, Identifiable {
    let id: String
    let campId: String
    let name: String
    let modules: StaffGroupModules
    let issuesSeeUnassigned: Bool
    let prepostSeeUnassigned: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, modules
        case campId               = "camp_id"
        case issuesSeeUnassigned  = "issues_see_unassigned"
        case prepostSeeUnassigned = "prepost_see_unassigned"
    }
}

// MARK: - Camp Role

enum CampRole: String, Codable {
    case admin = "admin"
    case staff = "staff"
    case viewer = "viewer"

    // Decodes leniently, failing CLOSED to the least-privileged role.
    //
    // This used to be a plain synthesized decode, which meant a role the app didn't know about
    // threw — and because memberships are decoded as an array, ONE unknown role failed the whole
    // `[CampMemberRow]` decode. The user then looked camp-less and was parked on the join screen
    // forever. Any role the web adds in future must degrade to read-only here, never to a lockout.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CampRole(rawValue: raw) ?? .viewer
    }

    var displayName: String {
        switch self {
        case .admin:  return "Administrator"
        case .staff:  return "Staff"
        case .viewer: return "Viewer"
        }
    }
}

/// Mirrors the web app's `CampStatus`. Anything other than `.active` blocks access.
enum CampStatus: String, Codable {
    case active
    case suspended
    case trialExpired = "trial_expired"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CampStatus(rawValue: raw) ?? .active
    }
}

/// Mirrors the web app's `CampAccountType`.
enum CampAccountType: String, Codable {
    case customer, trial, demo, internalAccount = "internal"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CampAccountType(rawValue: raw) ?? .customer
    }
}

struct Camp: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let slug: String
    let logoUrl: String?
    let campType: String?
    let state: String?
    let modules: [String: Bool]
    let locations: [String]
    /// Suspended / trial-expired camps are blocked, exactly as on web.
    let status: CampStatus
    let accountType: CampAccountType
    let trialEndsAt: String?
    /// Set while the camp sits in the 30-day trash. Hidden from members entirely.
    let deletedAt: String?

    var isAccessible: Bool { status == .active && deletedAt == nil }

    enum CodingKeys: String, CodingKey {
        case id, name, slug, modules, locations, status, state
        case logoUrl     = "logo_url"
        case campType    = "camp_type"
        case accountType = "account_type"
        case trialEndsAt = "trial_ends_at"
        case deletedAt   = "deleted_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id          = try c.decode(String.self, forKey: .id)
        name        = try c.decode(String.self, forKey: .name)
        slug        = try c.decode(String.self, forKey: .slug)
        logoUrl     = try c.decodeIfPresent(String.self, forKey: .logoUrl)
        campType    = try c.decodeIfPresent(String.self, forKey: .campType)
        state       = try c.decodeIfPresent(String.self, forKey: .state)
        modules     = (try? c.decode([String: Bool].self, forKey: .modules)) ?? [:]
        locations   = (try? c.decode([String].self, forKey: .locations)) ?? []
        status      = (try? c.decode(CampStatus.self, forKey: .status)) ?? .active
        accountType = (try? c.decode(CampAccountType.self, forKey: .accountType)) ?? .customer
        trialEndsAt = try? c.decodeIfPresent(String.self, forKey: .trialEndsAt)
        deletedAt   = try? c.decodeIfPresent(String.self, forKey: .deletedAt)
    }

    static func == (lhs: Camp, rhs: Camp) -> Bool { lhs.id == rhs.id }
}

struct CampMember: Codable, Identifiable {
    let id: String
    let campId: String
    let userId: String
    let role: CampRole
    let department: String?
    let displayName: String?
    let isActive: Bool
    let staffGroupId: String?

    enum CodingKeys: String, CodingKey {
        case id, role, department
        case campId      = "camp_id"
        case userId      = "user_id"
        case displayName = "display_name"
        case isActive    = "is_active"
        case staffGroupId = "staff_group_id"
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
    let staffGroupId: String?

    enum CodingKeys: String, CodingKey {
        case id, role, department, camps
        case campId      = "camp_id"
        case userId      = "user_id"
        case displayName = "display_name"
        case isActive    = "is_active"
        case staffGroupId = "staff_group_id"
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
