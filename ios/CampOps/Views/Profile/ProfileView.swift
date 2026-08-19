import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var switching = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var deleteError: String? = nil

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
                    deleteAccountButton
                }
                .padding(Spacing.lg)
            }
            .campCanvas()
            // A destructive, irreversible action gets a real confirmation with the consequence
            // spelled out, not a bare "Are you sure?".
            //
            // An alert rather than a confirmationDialog: presented from inside this sheet,
            // SwiftUI renders a dialog as an anchored popover and silently drops the cancel
            // button, leaving a red "Delete my account" as the only thing to tap. An alert
            // always shows both buttons, with Cancel as the default, so a mis-tap does nothing.
            .alert("Delete your account?", isPresented: $confirmingDelete) {
                Button("Keep my account", role: .cancel) { }
                Button("Delete my account", role: .destructive) { deleteAccount() }
            } message: {
                Text("This removes your account and your access to \(campCountText). It cannot be undone. Work you logged stays with your camp under your name.")
            }
            .alert(
                "Account not deleted",
                isPresented: Binding(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })
            ) {
                Button("OK", role: .cancel) { deleteError = nil }
            } message: {
                Text(deleteError ?? "")
            }
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

    // Apple requires account deletion to be reachable from inside the app (Guideline
    // 5.1.1(v)). It sits below sign-out and is styled as plain text rather than a button so it
    // reads as the last resort it is, well away from anything tapped daily.
    private var deleteAccountButton: some View {
        Button {
            Haptics.tap()
            confirmingDelete = true
        } label: {
            HStack(spacing: Spacing.sm) {
                if deleting { ProgressView().controlSize(.small) }
                Text(deleting ? "Deleting\u{2026}" : "Delete my account")
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.45))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, Spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(deleting)
    }

    private var campCountText: String {
        let count = authManager.camps.count
        if count <= 1 { return authManager.currentCamp?.name ?? "your camp" }
        return "\(count) camps"
    }

    private func deleteAccount() {
        Task {
            deleting = true
            let failure = await authManager.deleteAccount()
            deleting = false
            if let failure {
                // The server refuses when deleting would leave a camp with no administrator.
                // That message names the camp, so it is shown as written.
                deleteError = failure
                Haptics.warning()
            } else {
                // Success signs the user out, which swaps the root view; dismissing keeps this
                // sheet from lingering over the login screen.
                dismiss()
            }
        }
    }
}
