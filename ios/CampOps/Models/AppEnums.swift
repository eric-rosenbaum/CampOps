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

enum IssueStatus: String, Codable, CaseIterable {
    case unassigned = "unassigned"
    case assigned = "assigned"
    case inProgress = "in_progress"
    case resolved = "resolved"

    var displayName: String {
        switch self {
        case .unassigned: return "Unassigned"
        case .assigned: return "Assigned"
        case .inProgress: return "In progress"
        case .resolved: return "Resolved"
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

enum CampLocation: String, Codable, CaseIterable {
    case waterfront     = "Waterfront"
    case diningHall     = "Dining Hall"
    case cabins         = "Cabins"
    case artBarn        = "Art Barn"
    case aquatics       = "Aquatics"
    case athleticFields = "Athletic Fields"
    case mainLodge      = "Main Lodge"
    case healthCenter   = "Health Center"
    case other          = "Other"

    var displayName: String { rawValue }
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
