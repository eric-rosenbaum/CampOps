import SwiftUI

/// Toolbar button that lets any user switch the active user from a dropdown menu.
struct UserMenuButton: View {
    @EnvironmentObject private var userManager: UserManager

    var body: some View {
        Menu {
            ForEach(CampUser.seedUsers) { user in
                Button {
                    userManager.switchUser(to: user)
                } label: {
                    HStack {
                        Text(user.name)
                        Text("· \(user.role.displayName)")
                            .foregroundColor(.secondary)
                    }
                    if user.id == userManager.currentUser.id {
                        Image(systemName: "checkmark")
                    }
                }
            }
        } label: {
            AvatarCircle(initials: userManager.currentUser.initials, size: 32)
        }
    }
}
