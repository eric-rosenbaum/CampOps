import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var showingForgotPassword = false
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CampWordmark()
                    .padding(.top, 56)

                Text("Camp operations, simplified.")
                    .font(.campSecondary)
                    .foregroundStyle(Color.forest.opacity(0.5))
                    .padding(.top, Spacing.sm)
                    .padding(.bottom, Spacing.xxl)

                VStack(spacing: Spacing.lg) {
                    Text("Sign in")
                        .font(.campSection)
                        .foregroundStyle(Color.forest)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    CampField(label: "Email address") {
                        TextField("", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            // Without these the Keychain never offers a saved login here.
                            .textContentType(.username)
                            .submitLabel(.next)
                            .focused($focused, equals: .email)
                            .onSubmit { focused = .password }
                    }

                    CampField(label: "Password") {
                        SecureField("", text: $password)
                            .textContentType(.password)
                            .submitLabel(.go)
                            .focused($focused, equals: .password)
                            .onSubmit { if canSubmit { submit() } }
                    }

                    if let err = authManager.authError {
                        CampErrorBanner(message: err)
                    }

                    Button(action: submit) {
                        if isLoading {
                            ProgressView().tint(Color.cream)
                        } else {
                            Text("Sign in")
                        }
                    }
                    .buttonStyle(.campPrimary(enabled: canSubmit))
                    .disabled(!canSubmit || isLoading)

                    Button("Forgot your password?") {
                        authManager.authError = nil
                        showingForgotPassword = true
                    }
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.5))
                }
                .cardSurface(padding: Spacing.xl, radius: Radius.lg)
                .padding(.horizontal, Spacing.xl)

                // Account creation is invite-only and handled on the web — there is no
                // self-serve signup to link to here.
                VStack(spacing: Spacing.xs) {
                    Text("Don't have an account?")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.45))
                    Text("Your camp administrator sends an invitation by email.")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.45))
                        .multilineTextAlignment(.center)
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
        .sheet(isPresented: $showingForgotPassword) {
            ForgotPasswordView(prefilledEmail: email)
                .environmentObject(authManager)
        }
    }

    private func submit() {
        focused = nil
        Task {
            isLoading = true
            await authManager.signIn(email: email, password: password)
            isLoading = false
        }
    }
}
