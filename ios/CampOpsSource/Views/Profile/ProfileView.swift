import SwiftUI

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var userManager: UserManager

    var body: some View {
        NavigationStack {
            List {
                // Current user section
                Section {
                    HStack(spacing: Spacing.md) {
                        AvatarCircle(initials: userManager.currentUser.initials, size: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(userManager.currentUser.name)
                                .font(.headline)
                            Text(userManager.currentUser.role.displayName)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, Spacing.xs)
                }

                // Switch user (demo/impersonation)
                Section("Switch User") {
                    ForEach(CampUser.seedUsers) { user in
                        Button {
                            userManager.switchUser(to: user)
                            dismiss()
                        } label: {
                            HStack(spacing: Spacing.md) {
                                AvatarCircle(initials: user.initials, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(user.name).font(.subheadline)
                                    Text(user.role.displayName)
                                        .font(.caption).foregroundColor(.secondary)
                                }
                                Spacer()
                                if user.id == userManager.currentUser.id {
                                    Image(systemName: "checkmark").foregroundColor(.sage)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } footer: {
                    Text("Viewing the app as different users shows role-based permissions. Replace switchUser() with Supabase auth when ready.")
                        .font(.caption)
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
