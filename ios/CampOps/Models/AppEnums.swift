import SwiftUI

enum Priority: String, Codable, CaseIterable {
    case urgent = "urgent"
    case high = "high"
    case normal = "normal"

    var displayName: String {
        switch self {
        case .urgent: return "Urgent"
        case .high: return "High"
        case .normal: return "Normal"
        }
    }

    var color: Color {
        switch self {
        case .urgent: return .priorityUrgent
        case .high: return .priorityHigh
        case .normal: return .priorityNormal
        }
    }

    var bgColor: Color {
        switch self {
        case .urgent: return .urgentBg
        case .high: return .amberBg
        case .normal: return .greenBg
        }
    }

    var sortOrder: Int {
        switch self {
        case .urgent: return 0
        case .high: return 1
        case .normal: return 2
        }
    }
}

/// The six states a work order can be in, matching the `issues_status_check` constraint.
///
/// The two waiting states arrived with the 2026-09-02 rework and are the whole reason this
/// enum had to change: "waiting on the septic guy since June" used to be stored as
/// `in_progress`, which is how a queue stops meaning anything. Both are open but explicitly
/// not being worked.
enum IssueStatus: String, Codable, CaseIterable {
    case unassigned = "unassigned"
    case assigned = "assigned"
    case inProgress = "in_progress"
    case waitingOnVendor = "waiting_on_vendor"
    case waitingOnPart = "waiting_on_part"
    case resolved = "resolved"

    /// Decodes leniently, degrading to an open state rather than throwing.
    ///
    /// Work orders are decoded as an array, so one row in a status this build has never heard
    /// of used to fail the whole `[IssueDBRow]` decode and leave the board showing nothing but
    /// a stale cache. That is exactly what shipping `waiting_on_vendor` to a phone built before
    /// it existed did. `inProgress` is the safe landing: it is open, so the work stays visible,
    /// and it is not claimable, so nobody takes a job that is already somebody else's.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = IssueStatus(rawValue: raw) ?? .inProgress
    }

    var displayName: String {
        switch self {
        case .unassigned: return "Unassigned"
        case .assigned: return "Assigned"
        case .inProgress: return "In progress"
        case .waitingOnVendor: return "Waiting on vendor"
        case .waitingOnPart: return "Waiting on a part"
        case .resolved: return "Done"
        }
    }

    /// Everything that is not done.
    static var open: [IssueStatus] {
        [.unassigned, .assigned, .inProgress, .waitingOnVendor, .waitingOnPart]
    }

    var isOpen: Bool { self != .resolved }

    /// Open, but nobody is actually working it.
    var isStalled: Bool { self == .waitingOnVendor || self == .waitingOnPart }

    /// Board ordering. Matches STATUS_RANK in src/lib/workOrder.ts.
    var sortOrder: Int {
        switch self {
        case .unassigned: return 0
        case .assigned: return 1
        case .inProgress: return 2
        case .waitingOnVendor: return 3
        case .waitingOnPart: return 4
        case .resolved: return 5
        }
    }
}

/// Where a work order came from. Mirrors `issues_source_check` and SOURCE_LABELS on the web.
enum IssueSource: String, Codable {
    case web, ios, `public`, qr, routine, retreat, session, module

    var displayName: String {
        switch self {
        case .web:     return "Logged in the app"
        case .ios:     return "Logged on a phone"
        case .public:  return "Public report"
        case .qr:      return "Scanned a sticker"
        case .routine: return "Routine"
        case .retreat: return "Rental group"
        case .session: return "Session turnover"
        case .module:  return "Flagged by another module"
        }
    }
}

enum ChecklistStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case inProgress = "in_progress"
    case complete = "complete"

    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .inProgress: return "In progress"
        case .complete: return "Complete"
        }
    }
}


enum RecurringInterval: String, Codable {
    case daily = "daily"
    case weekly = "weekly"
    case monthly = "monthly"
    case annually = "annually"
}

enum ChecklistPhase: String, Codable {
    case pre = "pre"
    case post = "post"
}
