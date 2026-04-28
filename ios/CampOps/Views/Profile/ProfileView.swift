import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        AvatarCircle(initials: authManager.currentUser.initials, size: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(authManager.currentUser.name)
                                .font(.headline)
                            Text(authManager.currentMember?.role.displayName ?? "")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            if let camp = authManager.currentCamp {
                                Text(camp.name)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section {
                    Button(role: .destructive) {
                        Task {
                            dismiss()
                            await authManager.signOut()
                        }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
