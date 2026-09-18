import SwiftUI

/// One work order on the board.
///
/// Reading order is the order a person standing in a doorway needs it: what state it is in, what
/// it is, where it is, who has it. The crew is carried by a left stripe and a small pill and
/// never by a fill, because red and amber already mean priority and overdue -- two colour
/// systems competing for one card is how a board stops being readable.
struct IssueRow: View {
    let issue: Issue
    /// Camp-local today, passed in so a long list doesn't recompute it per row.
    var today: String = CampDate.today()
    var hasUnread: Bool = false
    var onTakeIt: (() -> Void)? = nil
    var onUntake: (() -> Void)? = nil

    /// Nil source means a row written before we recorded it: show nothing rather than guess.
    /// Public reports and routines carry their own badge, so a glyph there would be noise.
    private var sourceGlyph: String? {
        switch issue.source {
        case .ios: return "iphone"
        case .web: return "desktopcomputer"
        case .qr:  return "qrcode"
        default:   return nil
        }
    }

    private var isOverdue: Bool { issue.isOverdue(today: today) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                PriorityBadge(priority: issue.priority)
                StatusBadge(status: issue.status)
                if hasUnread {
                    Circle()
                        .fill(Color.priorityUrgent)
                        .frame(width: 7, height: 7)
                        .accessibilityLabel(Text("Unread messages"))
                }
                Spacer()
                if let sourceGlyph {
                    Image(systemName: sourceGlyph)
                        .font(.system(size: 10))
                        .foregroundStyle(Color.forest.opacity(0.4))
                }
                Text(issue.createdAt.relativeDisplay)
                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }

            // In the reader's language when a current translation exists; the original is on
            // the work order itself.
            TranslatedLine(source: .issues, id: issue.id, field: "title", original: issue.title)
                .font(.campBodySemibold).lineLimit(2)

            // Crew, and the routine or guest-report marker when there is one.
            HStack(spacing: Spacing.xs) {
                CrewPill(trade: issue.trade)
                if issue.source == .routine {
                    MetaTag(text: "Routine", systemImage: "arrow.triangle.2.circlepath")
                }
                if issue.isPublicReport {
                    MetaTag(text: "Guest report", systemImage: "person.crop.circle.badge.exclamationmark")
                }
                if issue.source == .retreat {
                    MetaTag(text: "Rental group", systemImage: "person.3")
                }
            }

            HStack(spacing: Spacing.sm) {
                if !issue.locations.isEmpty {
                    Label(issue.locations.joined(separator: ", "), systemImage: "mappin.circle")
                        .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                        .lineLimit(1)
                }
                Spacer()
                if let due = issue.dueLabel {
                    Label(due, systemImage: isOverdue ? "exclamationmark.circle" : "calendar")
                        .font(.campMeta)
                        .foregroundStyle(isOverdue ? Color.priorityUrgent : Color.forest.opacity(0.55))
                }
            }

            HStack(spacing: Spacing.sm) {
                if let assignee = issue.assignedTo {
                    HStack(spacing: 4) {
                        AvatarCircle(initials: assignee.initials, size: 20)
                        Text(assignee.firstName)
                            .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                    }
                } else if let crew = issue.assignedCrew {
                    // Waiting with a crew is not the same as waiting with nobody, and a board
                    // that renders both as "Unassigned" hides who is meant to pick it up.
                    Label(L10n.tr("With %@", crew.name), systemImage: "person.2")
                        .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                }
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
        .cardSurface()
        // `.leading`, not a left edge: under Hebrew the crew stripe belongs on the right, where
        // the card starts.
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Trade.color(issue.trade))
                .frame(width: 3)
        }
    }
}

/// The crew a job belongs to, as a quiet pill.
struct CrewPill: View {
    let trade: String
    var body: some View {
        Text(Trade.label(trade))
            .font(.campLabel)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Trade.color(trade).opacity(0.14), in: RoundedRectangle(cornerRadius: Radius.sm))
            .foregroundStyle(Trade.color(trade))
    }
}

/// A small neutral marker: where a job came from, rather than what it is.
struct MetaTag: View {
    private let text: Text
    let systemImage: String

    /// A fixed label, translated.
    init(text: LocalizedStringKey, systemImage: String) {
        self.text = Text(text)
        self.systemImage = systemImage
    }

    /// A value from the data, shown as it is.
    init(verbatim: String, systemImage: String) {
        self.text = Text(verbatim: verbatim)
        self.systemImage = systemImage
    }

    var body: some View {
        Label { text } icon: { Image(systemName: systemImage) }
            .font(.campLabel)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.forest.opacity(0.07), in: RoundedRectangle(cornerRadius: Radius.sm))
            .foregroundStyle(Color.forest.opacity(0.65))
    }
}
