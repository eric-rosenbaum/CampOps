import SwiftUI

struct IssueRow: View {
    let issue: Issue
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                PriorityBadge(priority: issue.priority)
                StatusBadge(status: issue.status)
                Spacer()
                Text(issue.createdAt.relativeDisplay).font(.caption).foregroundColor(.secondary)
            }
            Text(issue.title).font(.subheadline.weight(.semibold)).lineLimit(2)
            HStack(spacing: Spacing.sm) {
                Label(issue.locations.map(\.displayName).joined(separator: ", "), systemImage: "mappin.circle")
                    .font(.caption).foregroundColor(.secondary)
                Spacer()
                if let assignee = issue.assignedTo {
                    HStack(spacing: 4) {
                        AvatarCircle(initials: assignee.initials, size: 20)
                        Text(assignee.firstName).font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .shadow(color: Color.black.opacity(0.06), radius: 4, x: 0, y: 2)
    }
}
