import SwiftUI

struct ChecklistTaskRow: View {
    let task: ChecklistTask
    var onTakeIt: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                ChecklistStatusBadge(status: task.status)
                Spacer()
                if let (label, overdue) = task.dueDateRelative {
                    Text(label).font(.campMeta)
                        .foregroundStyle(overdue ? Color.priorityUrgent : Color.forest.opacity(0.55))
                }
            }
            Text(task.title).font(.campBodySemibold).lineLimit(2)
            HStack(spacing: Spacing.sm) {
                Label(task.phase == .pre ? "Pre-camp" : "Post-camp", systemImage: "flag")
                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                Spacer()
                if let assignee = task.assignedTo {
                    HStack(spacing: 4) {
                        AvatarCircle(initials: assignee.initials, size: 20)
                        Text(assignee.firstName).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                    }
                }
            }
            if let onTakeIt {
                HStack {
                    Spacer()
                    Button("Take it") {
                        Haptics.tap()
                        onTakeIt()
                    }
                    .buttonStyle(.campChip(filled: true))
                }
            }
        }
        .cardSurface()
    }
}
