import SwiftUI

struct IssueRow: View {
    let issue: Issue
    var onTakeIt: (() -> Void)? = nil
    var onUntake: (() -> Void)? = nil

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
                Label(issue.locations.joined(separator: ", "), systemImage: "mappin.circle")
                    .font(.caption).foregroundColor(.secondary)
                Spacer()
                if let assignee = issue.assignedTo {
                    HStack(spacing: 4) {
                        AvatarCircle(initials: assignee.initials, size: 20)
                        Text(assignee.firstName).font(.caption).foregroundColor(.secondary)
                    }
                }
            }
            if onTakeIt != nil || onUntake != nil {
                HStack {
                    Spacer()
                    if let onTakeIt {
                        Button(action: onTakeIt) {
                            Text("Take it")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color.sage)
                                .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    } else if let onUntake {
                        Button(action: onUntake) {
                            Text("Untake")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.sage)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.sage, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
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
