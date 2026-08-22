import SwiftUI

struct IssueRow: View {
    let issue: Issue
    var onTakeIt: (() -> Void)? = nil
    var onUntake: (() -> Void)? = nil

    /// Nil source means a row written before we recorded it — show nothing rather than guess.
    /// Public reports carry their own badge, so a third marker there would just be noise.
    private var sourceGlyph: String? {
        switch issue.source {
        case "ios": return "iphone"
        case "web": return "desktopcomputer"
        default:    return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                PriorityBadge(priority: issue.priority)
                StatusBadge(status: issue.status)
                Spacer()
                if let sourceGlyph {
                    Image(systemName: sourceGlyph)
                        .font(.system(size: 10))
                        .foregroundStyle(Color.forest.opacity(0.4))
                }
                Text(issue.createdAt.relativeDisplay).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }
            Text(issue.title).font(.campBodySemibold).lineLimit(2)
            HStack(spacing: Spacing.sm) {
                Label(issue.locations.joined(separator: ", "), systemImage: "mappin.circle")
                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                Spacer()
                if let assignee = issue.assignedTo {
                    HStack(spacing: 4) {
                        AvatarCircle(initials: assignee.initials, size: 20)
                        Text(assignee.firstName).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                    }
                }
            }
            if onTakeIt != nil || onUntake != nil {
                HStack {
                    Spacer()
                    if let onTakeIt {
                        Button("Take it") {
                            Haptics.tap()
                            onTakeIt()
                        }
                        .buttonStyle(.campChip(filled: true))
                    } else if let onUntake {
                        Button("Untake") {
                            Haptics.tap()
                            onUntake()
                        }
                        .buttonStyle(.campChip(filled: false))
                    }
                }
            }
        }
        .cardSurface()
    }
}
