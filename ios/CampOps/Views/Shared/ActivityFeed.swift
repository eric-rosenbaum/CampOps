import SwiftUI

struct ActivityFeed: View {
    let activity: [ActivityEntry]
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Activity")
                .font(.campBodySemibold)
                .foregroundColor(.forest)
                .padding(.bottom, Spacing.sm)
            if activity.isEmpty {
                Text("No activity yet.")
                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            } else {
                ForEach(activity.reversed()) { entry in
                    HStack(alignment: .top, spacing: Spacing.sm) {
                        AvatarCircle(initials: initials(for: entry.userName), size: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 4) {
                                Text(entry.userName).font(.campMetaSemibold)
                                Text(entry.createdAt.relativeDisplay)
                                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                            }
                            Text(entry.action).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                        }
                    }
                    .padding(.vertical, Spacing.xs)
                }
            }
        }
    }
    private func initials(for name: String) -> String {
        name.components(separatedBy: " ").compactMap { $0.first }.prefix(2).map(String.init).joined()
    }
}
