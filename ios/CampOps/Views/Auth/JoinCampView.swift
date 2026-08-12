import SwiftUI

/// Shown when someone is signed in but belongs to no camp.
///
/// The web equivalent is the /no-access screen. Join codes are still a live way in (admins
/// generate them in Team settings), so this keeps the code entry as the primary action and
/// adds the same escape hatches the web screen offers: contact support, or sign out and try
/// the address the invitation was actually sent to.
struct JoinCampView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var code = ""
    @State private var isLoading = false
    @FocusState private var codeFocused: Bool

    private var formattedCode: String { code.uppercased() }
    private var canJoin: Bool { formattedCode.count == 6 }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CampWordmark()
                    .padding(.top, 48)
                    .padding(.bottom, Spacing.xxl)

                VStack(spacing: Spacing.lg) {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Join your camp")
                            .font(.campSection)
                            .foregroundStyle(Color.forest)
                        Text("Enter the 6-character join code from your camp administrator.")
                            .font(.campSecondary)
                            .foregroundStyle(Color.forest.opacity(0.55))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    TextField("ABC123", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.system(.title2, design: .monospaced).weight(.semibold))
                        .foregroundStyle(Color.forest)
                        .tint(Color.sage)
                        .multilineTextAlignment(.center)
                        .focused($codeFocused)
                        .submitLabel(.go)
                        .frame(height: 58)
                        .background(Color.surfaceRaised, in: .rect(cornerRadius: Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Radius.sm)
                                .strokeBorder(canJoin ? Color.sage : Color.border, lineWidth: 1)
                        )
                        .onChange(of: code) { _, new in
                            code = String(new.uppercased().prefix(6))
                        }
                        .onSubmit { if canJoin { join() } }

                    if let err = authManager.authError {
                        CampErrorBanner(message: err)
                    }

                    Button(action: join) {
                        if isLoading {
                            ProgressView().tint(Color.cream)
                        } else {
                            Text("Join camp")
                        }
                    }
                    .buttonStyle(.campPrimary(enabled: canJoin))
                    .disabled(!canJoin || isLoading)
                }
                .cardSurface(padding: Spacing.xl, radius: Radius.lg)
                .padding(.horizontal, Spacing.xl)

                VStack(spacing: Spacing.md) {
                    Text("Invited by email instead? Open the invitation link on the web to finish setting up, then sign in here.")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.45))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    SupportAndSignOutFooter(
                        signOutLabel: "Sign out and use a different email"
                    )
                }
                .padding(.top, Spacing.xl)
                .padding(.horizontal, Spacing.xl)

                Spacer(minLength: Spacing.xxl)
            }
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .campCanvas()
        .onAppear { authManager.authError = nil }
    }

    private func join() {
        codeFocused = false
        Task {
            isLoading = true
            await authManager.joinWithCode(formattedCode)
            isLoading = false
        }
    }
}
