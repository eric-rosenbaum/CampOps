import SwiftUI

struct ChecklistTaskRow: View {
    let task: ChecklistTask
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                ChecklistStatusBadge(status: task.status)
                Spacer()
                if let (label, overdue) = task.dueDateRelative {
                    Text(label).font(.caption)
                        .foregroundColor(overdue ? .priorityUrgent : .secondary)
                }
            }
            Text(task.title).font(.subheadline.weight(.semibold)).lineLimit(2)
            HStack(spacing: Spacing.sm) {
                Label(task.phase == .pre ? "Pre-camp" : "Post-camp", systemImage: "flag")
                    .font(.caption).foregroundColor(.secondary)
                Spacer()
                if let assignee = task.assignedTo {
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
