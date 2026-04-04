import SwiftUI

/// A tappable row for assigning a user (or "Unassigned")
struct UserPickerRow: View {
    let user: CampUser?
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                AvatarCircle(initials: user?.initials ?? "—", size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(user?.name ?? "Unassigned")
                        .font(.subheadline)
                    if let role = user?.role {
                        Text(role.displayName)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundColor(.sage)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

struct AvatarCircle: View {
    let initials: String
    var size: CGFloat = 36

    var body: some View {
        Circle()
            .fill(Color.sageLight)
            .frame(width: size, height: size)
            .overlay(
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundColor(.forest)
            )
    }
}
