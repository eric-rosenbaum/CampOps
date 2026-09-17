import SwiftUI

/// An outlined stamp rather than a filled pill, on a page of paper-toned cards a filled chip
/// reads as UI chrome, where a ruled stamp reads as something inked onto the record.
/// Mirrors the web's StatusBadge.
private struct Stamp: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text.uppercased())
            .font(.campLabel)
            .tracking(0.8)
            .padding(.horizontal, 5)
            .padding(.vertical, 1.5)
            .foregroundColor(tint)
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(tint, lineWidth: 1)
            )
    }
}

struct StatusBadge: View {
    let status: IssueStatus
    var body: some View { Stamp(text: status.displayName, tint: tint) }

    private var tint: Color {
        switch status {
        case .unassigned: return .priorityUrgent
        case .assigned:   return .amberText
        case .inProgress: return .amberText
        // Open, but explicitly not being worked. Muted rather than amber so a board full of
        // "waiting on a part" doesn't read as a board full of work in progress.
        case .waitingOnVendor, .waitingOnPart: return .forestMid
        case .resolved:   return .priorityNormal
        }
    }
}

struct ChecklistStatusBadge: View {
    let status: ChecklistStatus
    var body: some View { Stamp(text: status.displayName, tint: tint) }

    private var tint: Color {
        switch status {
        case .pending:    return .forestMid
        case .inProgress: return .amberText
        case .complete:   return .priorityNormal
        }
    }
}
