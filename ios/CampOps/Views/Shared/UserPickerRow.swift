import SwiftUI

struct UserPickerRow: View {
    let user: CampUser?
    let isSelected: Bool
    let onTap: () -> Void
    var body: some View {
        Button(action: onTap) {
            HStack {
                AvatarCircle(initials: user?.initials ?? "—", size: 32)
                Text(user?.name ?? "Unassigned").font(.subheadline)
                Spacer()
                if isSelected { Image(systemName: "checkmark").foregroundColor(.sage) }
            }
        }
        .buttonStyle(.plain)
    }
}
