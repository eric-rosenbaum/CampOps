import SwiftUI

/// Toolbar avatar button that opens the profile sheet.
struct UserMenuButton: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var showingProfile = false

    var body: some View {
        Button {
            showingProfile = true
        } label: {
            AvatarCircle(initials: authManager.currentUser.initials, size: 32)
        }
        .sheet(isPresented: $showingProfile) {
            ProfileView()
                .environmentObject(authManager)
        }
    }
}
