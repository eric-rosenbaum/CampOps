import SwiftUI

// MARK: - Trades (crews)

/// A trade and a crew are one thing.
///
/// `issues.trade` holds a `staff_groups.key` belonging to this camp, and a trigger
/// (`assert_trade_belongs_to_camp`) rejects anything else. So the phone must never ship a
/// hard-coded list of five: a camp that renamed its crews, or added "Waterfront", would have
/// every save rejected with a constraint error nobody can read.
///
/// What lives here is only the vocabulary around a key -- the keys themselves come from the
/// camp's own crews, loaded at sign-in.
enum Trade {
    /// The key used when nothing else is known. Matches the database column default, so a work
    /// order saved before the crews have loaded still lands somewhere sensible.
    static let fallbackKey = "maintenance"

    /// The label for a key, from this camp's crews, falling back to a tidied key.
    static func label(_ key: String) -> String {
        if let crew = AuthManager.shared.crews.first(where: { $0.key == key }) { return crew.displayName }
        return key.replacingOccurrences(of: "_", with: " ").capitalized
    }

    /// Colour carried by a stripe and a small pill, never a fill.
    ///
    /// Red and amber already belong to priority and overdue, exactly as on the web. A camp's own
    /// crew gets a stable colour from the quiet half of the palette, chosen by hashing its key
    /// so it does not change between launches.
    static func color(_ key: String) -> Color {
        switch key {
        case "maintenance":  return .forest
        case "housekeeping": return .blue
        case "grounds":      return .sage
        case "kitchen":      return .amberText
        case "it":           return .purple
        default:
            let spares: [Color] = [.sage, .blue, .forestMid, .purple]
            var h = 0
            for scalar in key.unicodeScalars { h = (h &* 31 &+ Int(scalar.value)) & 0xFFFFFF }
            return spares[h % spares.count]
        }
    }
}

// MARK: - Routines

/// A routine: the rule that generates work, not the work itself.
///
/// The phone reads these and never writes them. Setting up a routine is a desk job with a lot of
/// fields; doing the work it generates is what a phone is for. Each occurrence arrives as an
/// ordinary work order with `source: .routine` and `schedule_id` set.
struct WorkSchedule: Codable, Identifiable {
    let id: String
    let campId: String
    var title: String
    var description: String?
    var trade: String
    var priority: Priority
    var locationIds: [String]
    var locations: [String]
    var assetId: String?
    var cadence: Cadence
    var intervalCount: Int
    var byWeekday: [Int]?
    var byMonthday: Int?
    var anchorDate: String?
    var daysRelativeToOpening: Int?
    var meterInterval: Int?
    var meterKind: String
    var isActive: Bool

    enum Cadence: String, Codable {
        case daily, weekly, monthly, annually
        case seasonRelative = "season_relative"
        case onTurnover = "on_turnover"
        case meter

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Cadence(rawValue: raw) ?? .daily
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, title, description, trade, priority, locations, cadence
        case campId                = "camp_id"
        case locationIds           = "location_ids"
        case assetId               = "asset_id"
        case intervalCount         = "interval_count"
        case byWeekday             = "by_weekday"
        case byMonthday            = "by_monthday"
        case anchorDate            = "anchor_date"
        case daysRelativeToOpening = "days_relative_to_opening"
        case meterInterval         = "meter_interval"
        case meterKind             = "meter_kind"
        case isActive              = "is_active"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id            = try c.decode(String.self, forKey: .id)
        campId        = try c.decode(String.self, forKey: .campId)
        title         = try c.decode(String.self, forKey: .title)
        description   = try? c.decodeIfPresent(String.self, forKey: .description)
        trade         = (try? c.decodeIfPresent(String.self, forKey: .trade)) ?? Trade.fallbackKey
        priority      = (try? c.decode(Priority.self, forKey: .priority)) ?? .normal
        locationIds   = (try? c.decodeIfPresent([String].self, forKey: .locationIds)) ?? []
        locations     = (try? c.decodeIfPresent([String].self, forKey: .locations)) ?? []
        assetId       = try? c.decodeIfPresent(String.self, forKey: .assetId)
        cadence       = (try? c.decode(Cadence.self, forKey: .cadence)) ?? .daily
        intervalCount = (try? c.decodeIfPresent(Int.self, forKey: .intervalCount)) ?? 1
        byWeekday     = try? c.decodeIfPresent([Int].self, forKey: .byWeekday)
        byMonthday    = try? c.decodeIfPresent(Int.self, forKey: .byMonthday)
        anchorDate    = try? c.decodeIfPresent(String.self, forKey: .anchorDate)
        daysRelativeToOpening = try? c.decodeIfPresent(Int.self, forKey: .daysRelativeToOpening)
        meterInterval = try? c.decodeIfPresent(Int.self, forKey: .meterInterval)
        meterKind     = (try? c.decodeIfPresent(String.self, forKey: .meterKind)) ?? "hours"
        isActive      = (try? c.decodeIfPresent(Bool.self, forKey: .isActive)) ?? true
    }

    /// "Every 2 weeks on Mon, Thu". Mirrors `describeCadence` in src/lib/workOrder.ts, because a
    /// routine that cannot be read back in one line cannot be checked by the person doing it.
    var cadenceLabel: String {
        let n = max(1, intervalCount)
        // The chosen language's own short weekday names, Sunday first to match `by_weekday`.
        let days = L10n.calendar.shortWeekdaySymbols

        switch cadence {
        case .daily:
            return n == 1 ? L10n.tr("Every day") : L10n.tr("Every %lld days", n)
        case .weekly:
            let every = n == 1 ? L10n.tr("Every week") : L10n.tr("Every %lld weeks", n)
            let named = (byWeekday ?? []).compactMap { $0 >= 0 && $0 < days.count ? days[$0] : nil }
            guard !named.isEmpty else { return every }
            return L10n.tr("%1$@ on %2$@", every, named.formatted(.list(type: .and).locale(L10n.locale)))
        case .monthly:
            let every = n == 1 ? L10n.tr("Every month") : L10n.tr("Every %lld months", n)
            guard let byMonthday else { return every }
            return L10n.tr("%1$@, on day %2$lld", every, byMonthday)
        case .annually:
            return n == 1 ? L10n.tr("Every year") : L10n.tr("Every %lld years", n)
        case .seasonRelative:
            let d = daysRelativeToOpening ?? 0
            if d == 0 { return L10n.tr("On opening day") }
            return d < 0 ? L10n.tr("%lld days before opening", abs(d)) : L10n.tr("%lld days after opening", d)
        case .onTurnover:
            return L10n.tr("Every turnover")
        case .meter:
            guard let meterInterval else { return L10n.tr("By meter") }
            return meterKind == "odometer"
                ? L10n.tr("Every %lld miles", meterInterval)
                : L10n.tr("Every %lld hours", meterInterval)
        }
    }
}

// MARK: - Vendors

/// A contractor the camp calls. `trade` here is the contractor's specialty, not a crew.
struct ServiceVendor: Codable, Identifiable {
    let id: String
    var name: String
    var trade: String?
    var contactName: String?
    var phone: String?
    var email: String?
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, trade, phone, email
        case contactName = "contact_name"
        case isActive    = "is_active"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id          = try c.decode(String.self, forKey: .id)
        name        = try c.decode(String.self, forKey: .name)
        trade       = try? c.decodeIfPresent(String.self, forKey: .trade)
        contactName = try? c.decodeIfPresent(String.self, forKey: .contactName)
        phone       = try? c.decodeIfPresent(String.self, forKey: .phone)
        email       = try? c.decodeIfPresent(String.self, forKey: .email)
        isActive    = (try? c.decodeIfPresent(Bool.self, forKey: .isActive)) ?? true
    }
}

// MARK: - Checklist templates

/// A named list of steps an admin wrote on the web, applied to a work order here.
struct WorkChecklistTemplate: Codable, Identifiable {
    let id: String
    var name: String
    var trade: String
    var isActive: Bool
    var items: [TemplateItem]

    struct TemplateItem: Codable {
        var text: String
        var note: String?
        var requiresPhoto: Bool

        enum CodingKeys: String, CodingKey {
            case text, note
            case requiresPhoto = "requires_photo"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            text = (try? c.decode(String.self, forKey: .text)) ?? ""
            note = try? c.decodeIfPresent(String.self, forKey: .note)
            requiresPhoto = (try? c.decodeIfPresent(Bool.self, forKey: .requiresPhoto)) ?? false
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, name, trade, items
        case isActive = "is_active"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id       = try c.decode(String.self, forKey: .id)
        name     = try c.decode(String.self, forKey: .name)
        trade    = (try? c.decodeIfPresent(String.self, forKey: .trade)) ?? Trade.fallbackKey
        isActive = (try? c.decodeIfPresent(Bool.self, forKey: .isActive)) ?? true
        items    = (try? c.decodeIfPresent([TemplateItem].self, forKey: .items)) ?? []
    }
}

// MARK: - Routing

/// Where work of a given trade goes when nobody picks a person. The phone reads it to prefill
/// the "assign to" field; only the web edits it.
struct WorkRouting: Codable {
    let trade: String
    var defaultStaffGroupId: String?
    var defaultAssigneeId: String?

    enum CodingKeys: String, CodingKey {
        case trade
        case defaultStaffGroupId = "default_staff_group_id"
        case defaultAssigneeId   = "default_assignee_id"
    }
}

// MARK: - Per-issue access grants

/// Somebody tagged a person into one work order and chose to open it to them. A narrow,
/// recorded exception that does not touch their crew settings.
struct IssueViewer: Codable {
    let issueId: String
    let userId: String

    enum CodingKeys: String, CodingKey {
        case issueId = "issue_id"
        case userId  = "user_id"
    }
}

// MARK: - Read state

/// When this person last opened a work order's thread. Rows are owner-only.
struct CommentRead: Codable {
    let issueId: String
    let lastReadAt: Date

    enum CodingKeys: String, CodingKey {
        case issueId    = "issue_id"
        case lastReadAt = "last_read_at"
    }
}
