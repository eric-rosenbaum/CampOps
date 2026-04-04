import SwiftUI

struct ActivityFeed: View {
    let activity: [ActivityEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Activity")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.forest)
                .padding(.bottom, Spacing.sm)

            if activity.isEmpty {
                Text("No activity yet.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                ForEach(activity.reversed()) { entry in
                    ActivityRow(entry: entry)
                    if entry.id != activity.first?.id {
                        Divider().padding(.leading, 28)
                    }
                }
            }
        }
    }
}

private struct ActivityRow: View {
    let entry: ActivityEntry

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Circle()
                .fill(Color.sageLight)
                .frame(width: 20, height: 20)
                .overlay(
                    Text(initials)
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(.forest)
                )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(entry.userName)
                        .font(.caption.weight(.semibold))
                    Text(entry.createdAt.relativeDisplay)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Text(entry.action)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, Spacing.xs)
    }

    private var initials: String {
        entry.userName
            .components(separatedBy: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0) }
            .joined()
    }
}
