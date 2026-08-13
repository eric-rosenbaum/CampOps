import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var showingForgotPassword = false
    // Staff who joined with a group code have no password, and they are the majority of
    // phone users — so the emailed code is the DEFAULT here and the password is the
    // alternative, which is the reverse of the web app's desktop-leaning login.
    @State private var mode: Mode = .emailCode
    @State private var codeSent = false
    @State private var otp = ""
    @FocusState private var focused: Field?

    private enum Field { case email, password, otp }
    private enum Mode { case password, emailCode }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
    }
    private var canSendCode: Bool { email.contains("@") }
    private var otpReady: Bool { otp.count >= Constants.otpMinLength }

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

                    if mode == .password { passwordFields } else { emailCodeFields }

                    if let err = authManager.authError {
                        CampErrorBanner(message: err)
                    }

                    if mode == .password {
                        Button(action: submit) {
                            if isLoading { ProgressView().tint(Color.cream) } else { Text("Sign in") }
                        }
                        .buttonStyle(.campPrimary(enabled: canSubmit))
                        .disabled(!canSubmit || isLoading)

                        Button("Email me a sign-in code instead") {
                            authManager.authError = nil
                            withAnimation { mode = .emailCode }
                        }
                        .font(.campMetaMedium)
                        .foregroundStyle(Color.sage)

                        Button("Forgot your password?") {
                            authManager.authError = nil
                            showingForgotPassword = true
                        }
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.5))
                    } else {
                        Button(action: codeSent ? verifyCode : sendCode) {
                            if isLoading {
                                ProgressView().tint(Color.cream)
                            } else {
                                Text(codeSent ? "Sign in" : "Email me a code")
                            }
                        }
                        .buttonStyle(.campPrimary(enabled: codeSent ? otpReady : canSendCode))
                        .disabled(isLoading || (codeSent ? !otpReady : !canSendCode))

                        Button("Use a password instead") {
                            authManager.authError = nil
                            withAnimation { mode = .password; codeSent = false; otp = "" }
                        }
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.5))
                    }
                }
                .cardSurface(padding: Spacing.xl, radius: Radius.lg)
                .padding(.horizontal, Spacing.xl)

                // No join-code entry here by design. New staff join once from the invite
                // link their administrator sends; after that this screen only needs to let
                // them back in. Keeping the join code off the front door is what stops it
                // being confused with the sign-in code we email.
                VStack(spacing: Spacing.xs) {
                    Text("Don't have an account?")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.45))
                    Text("Your camp administrator sends you an invite link to get started.")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.45))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
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

    // MARK: - Field groups

    private var passwordFields: some View {
        Group {
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
        }
    }

    private var emailCodeFields: some View {
        Group {
            CampField(label: "Email address") {
                TextField("", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textContentType(.username)
                    .disabled(codeSent)
                    .focused($focused, equals: .email)
            }

            if codeSent {
                CampField(label: "Sign-in code") {
                    TextField("", text: $otp)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .multilineTextAlignment(.center)
                        .focused($focused, equals: .otp)
                        .onChange(of: otp) { _, new in
                            otp = String(new.filter(\.isNumber).prefix(Constants.otpMaxLength))
                        }
                }
            }
        }
    }

    private func sendCode() {
        focused = nil
        Task {
            isLoading = true
            // Never mint an account from a mistyped address: a person signing in must
            // already exist. Accounts are created only by accepting an invite on the web.
            let ok = await authManager.sendEmailCode(email: email, createIfNew: false)
            isLoading = false
            if ok {
                codeSent = true
                focused = .otp
            }
        }
    }

    private func verifyCode() {
        focused = nil
        Task {
            isLoading = true
            let ok = await authManager.verifyEmailCode(email: email, code: otp)
            isLoading = false
            if ok { Haptics.success() } else { Haptics.warning() }
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
