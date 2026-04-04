import SwiftUI

struct UserPickerRow: View {
    let user: CampUser?
    let isSelected: Bool
    let onTap: () -> Void
    var body: some View {
        Button(action: onTap) {
            HStack {
                AvatarCircle(initials: user?.initials ?? "—", size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(user?.name ?? "Unassigned").font(.subheadline)
                    if let role = user?.role {
                        Text(role.displayName).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
                if isSelected { Image(systemName: "checkmark").foregroundColor(.sage) }
            }
        }
        .buttonStyle(.plain)
    }
}
