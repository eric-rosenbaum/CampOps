import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var switching = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    identityCard

                    // Only worth showing when there's actually a choice to make.
                    if authManager.camps.count > 1 {
                        campSwitcher
                    }

                    signOutButton
                }
                .padding(Spacing.lg)
            }
            .campCanvas()
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .font(.campBodyMedium)
                }
            }
        }
    }

    private var identityCard: some View {
        VStack(spacing: Spacing.md) {
            AvatarCircle(initials: authManager.currentUser.initials, size: 64)

            VStack(spacing: 4) {
                Text(authManager.currentUser.name)
                    .font(.campTitle)
                    .foregroundStyle(Color.forest)
                    .multilineTextAlignment(.center)

                if let role = authManager.currentMember?.role {
                    Text(role.displayName)
                        .font(.campMetaSemibold)
                        .foregroundStyle(Color.sage)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 3)
                        .background(Color.sagePale, in: Capsule())
                }

                if let camp = authManager.currentCamp {
                    Text(camp.name)
                        .font(.campSecondary)
                        .foregroundStyle(Color.forest.opacity(0.5))
                        .padding(.top, 2)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .cardSurface(padding: Spacing.xl, radius: Radius.lg)
    }

    // Members of more than one camp had no way to switch on iOS — the app silently picked
    // the saved-or-first camp and stayed there. The web app has had a switcher all along.
    private var campSwitcher: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Your camps")

            VStack(spacing: 0) {
                ForEach(Array(authManager.camps.enumerated()), id: \.element.id) { index, camp in
                    Button {
                        guard camp.id != authManager.currentCamp?.id else { return }
                        Haptics.tap()
                        switching = true
                        Task {
                            await authManager.selectCamp(camp.id)
                            switching = false
                            dismiss()
                        }
                    } label: {
                        HStack(spacing: Spacing.md) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(camp.name)
                                    .font(.campBodyMedium)
                                    .foregroundStyle(Color.forest)
                                if camp.status != .active {
                                    Text(camp.status == .trialExpired ? "Demo ended" : "Paused")
                                        .font(.campMicro)
                                        .foregroundStyle(Color.priorityHigh)
                                }
                            }
                            Spacer(minLength: 0)
                            if camp.id == authManager.currentCamp?.id {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Color.sage)
                            }
                        }
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(switching)

                    if index < authManager.camps.count - 1 {
                        Divider().overlay(Color.border).padding(.leading, Spacing.md)
                    }
                }
            }
            .background(Color.surface, in: .rect(cornerRadius: Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md)
                    .strokeBorder(Color.border, lineWidth: 1)
            )
        }
    }

    private var signOutButton: some View {
        Button {
            Task {
                dismiss()
                await authManager.signOut()
            }
        } label: {
            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                .font(.campBodyMedium)
                .foregroundStyle(Color.priorityUrgent)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Color.surface, in: .rect(cornerRadius: Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md)
                        .strokeBorder(Color.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}
