import SwiftUI

/// Password reset, matching the web app's /forgot-password.
///
/// The reset link in the email opens the web app's /reset-password page. That host is the one
/// registered in Supabase's allowed redirect URLs, and it's where the password actually changes.
struct ForgotPasswordView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let prefilledEmail: String

    @State private var email = ""
    @State private var isLoading = false
    @State private var sent = false
    @FocusState private var emailFocused: Bool

    private var canSubmit: Bool {
        email.contains("@") && !email.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    if sent {
                        sentState
                    } else {
                        formState
                    }
                }
                .padding(Spacing.xl)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .campCanvas()
            .navigationTitle("Reset password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(sent ? "Done" : "Cancel") { dismiss() }
                        .font(.campBodyMedium)
                }
            }
        }
        .onAppear {
            email = prefilledEmail
            authManager.authError = nil
            if prefilledEmail.isEmpty { emailFocused = true }
        }
    }

    private var formState: some View {
        VStack(spacing: Spacing.lg) {
            Text("Enter the email address on your account and we'll send you a link to set a new password.")
                .font(.campBody)
                .foregroundStyle(Color.forest.opacity(0.65))
                .frame(maxWidth: .infinity, alignment: .leading)

            CampField(label: "Email address") {
                TextField("", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textContentType(.username)
                    .submitLabel(.go)
                    .focused($emailFocused)
                    .onSubmit { if canSubmit { submit() } }
            }

            if let err = authManager.authError {
                CampErrorBanner(message: err)
            }

            Button(action: submit) {
                if isLoading {
                    ProgressView().tint(Color.cream)
                } else {
                    Text("Send reset link")
                }
            }
            .buttonStyle(.campPrimary(enabled: canSubmit))
            .disabled(!canSubmit || isLoading)
        }
        .cardSurface(padding: Spacing.xl, radius: Radius.lg)
    }

    private var sentState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 40))
                .foregroundStyle(Color.sage)
                .padding(.bottom, Spacing.xs)

            Text("Check your email")
                .font(.campTitle)
                .foregroundStyle(Color.forest)

            Text("If an account exists for \(email), a reset link is on its way. Open it to choose a new password, then come back and sign in.")
                .font(.campBody)
                .foregroundStyle(Color.forest.opacity(0.6))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .cardSurface(padding: Spacing.xl, radius: Radius.lg)
    }

    private func submit() {
        emailFocused = false
        Task {
            isLoading = true
            let ok = await authManager.requestPasswordReset(email: email)
            isLoading = false
            // Always report success on a valid request: whether the address exists is not
            // something an unauthenticated screen should reveal.
            if ok { withAnimation(.easeOut(duration: 0.2)) { sent = true } }
        }
    }
}
