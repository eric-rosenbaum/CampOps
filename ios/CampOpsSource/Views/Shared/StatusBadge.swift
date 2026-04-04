import SwiftUI

struct StatusBadge: View {
    let status: IssueStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 3)
            .background(background)
            .foregroundColor(foreground)
            .clipShape(Capsule())
    }

    private var background: Color {
        switch status {
        case .unassigned: return Color(.systemGray5)
        case .assigned:   return .amberBg
        case .inProgress: return Color(hex: "e8f0fe")
        case .resolved:   return .greenBg
        }
    }

    private var foreground: Color {
        switch status {
        case .unassigned: return Color(.secondaryLabel)
        case .assigned:   return .amberText
        case .inProgress: return Color(hex: "1a56db")
        case .resolved:   return .greenText
        }
    }
}

struct ChecklistStatusBadge: View {
    let status: ChecklistStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 3)
            .background(background)
            .foregroundColor(foreground)
            .clipShape(Capsule())
    }

    private var background: Color {
        switch status {
        case .pending:    return Color(.systemGray5)
        case .inProgress: return .amberBg
        case .complete:   return .greenBg
        }
    }

    private var foreground: Color {
        switch status {
        case .pending:    return Color(.secondaryLabel)
        case .inProgress: return .amberText
        case .complete:   return .greenText
        }
    }
}
