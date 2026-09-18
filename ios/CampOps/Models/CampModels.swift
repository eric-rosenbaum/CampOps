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

    /// Everything on. Crews stopped gating module access on the web in the 2026-09-10 rework
    /// ("staff see the whole app; what a crew decides is whose work you can see"), so a crew
    /// that arrives without a modules object grants rather than withholds.
    static let permissive = StaffGroupModules()

    private init() {
        issuesRepairs = true; prePost = true; pool = true
        safety = true; assets = true; buildingSystems = true
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

/// A crew.
///
/// "Trade" and "crew" are the same thing and the UI always says Crew. `key` is what
/// `issues.trade` holds, and the pair merged in the 2026-09-10 rework -- before that a camp had
/// a list of crews and a separate hard-coded list of trades that could not be reconciled.
///
/// A person belongs to MANY crews (`staff_group_members`). The single
/// `camp_members.staff_group_id` this app used to read is dead: nothing writes it, so anyone
/// added to a crew after 2026-09-10 looked crew-less on the phone and silently got full access.
struct StaffGroup: Codable, Identifiable {
    let id: String
    let campId: String
    let name: String
    /// The slug `issues.trade` stores. A trigger rejects a key that is not this camp's.
    let key: String
    let sortOrder: Int
    let isActive: Bool
    let modules: StaffGroupModules
    let issuesSeeUnassigned: Bool
    let canViewCamperHealth: Bool

    /// The crew's name as a reader should see it. A camp's own name is its own words and shows as
    /// typed, but the five seed crews under their seed names were never the camp's words — they are
    /// our defaults, so a Spanish reader sees "Mantenimiento" until the camp renames it. Before this
    /// the phone showed "Housekeeping" in the middle of an otherwise Spanish board. Mirrors
    /// `seedCrewName` in src/lib/useTrades.ts.
    var displayName: String {
        guard let seed = StaffGroup.seedNames[key], seed == name else { return name }
        return L10n.tr(seed)
    }

    static let seedNames: [String: String] = [
        "maintenance": "Maintenance", "housekeeping": "Housekeeping", "grounds": "Grounds",
        "kitchen": "Kitchen", "it": "Tech",
    ]

    enum CodingKeys: String, CodingKey {
        case id, name, modules, key
        case campId               = "camp_id"
        case sortOrder            = "sort_order"
        case isActive             = "is_active"
        case issuesSeeUnassigned  = "issues_see_unassigned"
        case canViewCamperHealth  = "can_view_camper_health"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id                  = try c.decode(String.self, forKey: .id)
        campId              = try c.decode(String.self, forKey: .campId)
        name                = try c.decode(String.self, forKey: .name)
        key                 = (try? c.decodeIfPresent(String.self, forKey: .key)) ?? ""
        sortOrder           = (try? c.decodeIfPresent(Int.self, forKey: .sortOrder)) ?? 0
        isActive            = (try? c.decodeIfPresent(Bool.self, forKey: .isActive)) ?? true
        modules             = (try? c.decode(StaffGroupModules.self, forKey: .modules))
            ?? StaffGroupModules.permissive
        issuesSeeUnassigned = (try? c.decodeIfPresent(Bool.self, forKey: .issuesSeeUnassigned)) ?? true
        canViewCamperHealth = (try? c.decodeIfPresent(Bool.self, forKey: .canViewCamperHealth)) ?? false
    }
}

/// Which crews a person is on. Read from `staff_group_members`, the many-to-many table.
struct StaffGroupMembership: Decodable {
    let staffGroupId: String
    let userId: String

    enum CodingKeys: String, CodingKey {
        case staffGroupId = "staff_group_id"
        case userId       = "user_id"
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
    // threw, and because memberships are decoded as an array, ONE unknown role failed the whole
    // `[CampMemberRow]` decode. The user then looked camp-less and was parked on the join screen
    // forever. Any role the web adds in future must degrade to read-only here, never to a lockout.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CampRole(rawValue: raw) ?? .viewer
    }

    var displayName: String {
        switch self {
        case .admin:  return L10n.tr("Administrator")
        case .staff:  return L10n.tr("Staff")
        case .viewer: return L10n.tr("Viewer")
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
    /// What the platform sells this camp, as distinct from what the camp has switched on.
    /// Module access is two levels: entitlement here, the camp's own choice in `modules`.
    let platformModules: [String: Bool]
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
        case platformModules = "platform_modules"
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
        platformModules = (try? c.decode([String: Bool].self, forKey: .platformModules)) ?? [:]
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

/// Preview of a join code from the `join_code_info` RPC, camp name and group, no membership data.
struct JoinCodeInfo: Decodable {
    let valid: Bool
    let reason: String?
    let campName: String?
    let role: String?
    let groupName: String?

    enum CodingKeys: String, CodingKey {
        case valid, reason, role
        case campName  = "camp_name"
        case groupName = "group_name"
    }

    var problemText: String {
        switch reason {
        case "expired":           return L10n.tr("This join code has expired. Ask your camp administrator for a new one.")
        case "used_up":           return L10n.tr("This join code has been used the maximum number of times.")
        case "camp_unavailable":  return L10n.tr("This camp isn't accepting new staff right now.")
        default:                  return L10n.tr("That join code isn't valid. Check it and try again.")
        }
    }
}

/// The result of `delete_my_account`.
///
/// The server refuses rather than throws when deletion would strand a camp without an
/// administrator, so a `false` here carries a sentence worth showing verbatim.
struct DeleteAccountResult: Decodable {
    let ok: Bool
    let error: String?
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
    /// 'en' | 'es' | 'he', shared with the web. Nil until somebody chooses, or on a server that
    /// predates the column.
    let preferredLanguage: String?
    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case preferredLanguage = "preferred_language"
    }
}
