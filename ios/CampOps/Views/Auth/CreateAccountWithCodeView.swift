import SwiftUI

/// Account creation on the phone, for staff who were handed a join code instead of an emailed
/// invitation.
///
/// The emailed invitation is the path we push, because the link arrives in the person's own
/// inbox and no code is involved at all. But a code is what actually gets handed out at staff
/// orientation, and until now the only way to redeem one was to find a computer. This closes
/// that gap without putting the join code on the sign-in screen, where it would sit next to the
/// emailed sign-in code and invite exactly the confusion we removed.
///
/// The order of steps is what keeps the two codes apart. The join code is entered first, on its
/// own screen, and is checked against the server before an email address is ever requested · so
/// by the time a sign-in code arrives, the join code is already spent and out of sight. The
/// screen naming follows: "join code" identifies the camp, "sign-in code" proves the address.
struct CreateAccountWithCodeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    private enum Step { case code, identity, verify }
    private enum Field { case code, name, email, otp }

    @State private var step: Step = .code
    @State private var code = ""
    @State private var campInfo: JoinCodeInfo? = nil
    @State private var fullName = ""
    @State private var email = ""
    @State private var otp = ""
    @State private var isLoading = false
    @FocusState private var focused: Field?

    private var formattedCode: String {
        code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }
    private var codeReady: Bool { formattedCode.count >= Constants.joinCodeMinLength }
    private var identityReady: Bool {
        !fullName.trimmingCharacters(in: .whitespaces).isEmpty && email.contains("@")
    }
    private var otpReady: Bool { otp.count >= Constants.otpMinLength }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    CampWordmark()
                        .padding(.top, Spacing.xl)
                        .padding(.bottom, Spacing.xxl)

                    VStack(spacing: Spacing.lg) {
                        header

                        switch step {
                        case .code:     codeField
                        case .identity: identityFields
                        case .verify:   otpField
                        }

                        if let err = authManager.authError {
                            CampErrorBanner(message: err)
                        }

                        primaryButton

                        if step == .verify {
                            Button("Send a new code") { sendSignInCode() }
                                .font(.campMeta)
                                .foregroundStyle(Color.forest.opacity(0.5))
                                .disabled(isLoading)
                        }
                    }
                    .cardSurface(padding: Spacing.xl, radius: Radius.lg)
                    .padding(.horizontal, Spacing.xl)

                    Spacer(minLength: Spacing.xxl)
                }
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .campCanvas()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.forest.opacity(0.6))
                }
            }
        }
        .onAppear {
            authManager.authError = nil
            focused = .code
        }
        // Verifying the emailed code signs the user in, at which point ContentView replaces the
        // login screen underneath this sheet. Close it so they land on their camp, not on a
        // sheet floating over the app they just got into.
        .onChange(of: authManager.isAuthenticated) { _, signedIn in
            if signedIn { dismiss() }
        }
    }

    // MARK: - Steps

    @ViewBuilder
    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.campSection)
                .foregroundStyle(Color.forest)
            Text(subtitle)
                .font(.campSecondary)
                .foregroundStyle(Color.forest.opacity(0.55))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: String {
        switch step {
        case .code:     return "Join your camp"
        case .identity: return campInfo?.campName ?? "Your details"
        case .verify:   return "Check your email"
        }
    }

    private var subtitle: String {
        switch step {
        case .code:
            return "Enter the join code from your camp administrator, like CEDAR-4821."
        case .identity:
            // Naming the camp back to them is the confirmation that the code was the right one.
            var line = "You're joining \(campInfo?.campName ?? "this camp")"
            if let group = campInfo?.groupName { line += " as \(group)" }
            return line + ". Tell us who you are and we'll set up your account."
        case .verify:
            return "We sent a code to \(email.lowercased()). Enter it to finish setting up."
        }
    }

    private var codeField: some View {
        TextField("CEDAR-4821", text: $code)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .font(.system(.title2, design: .monospaced).weight(.semibold))
            .foregroundStyle(Color.forest)
            .tint(Color.sage)
            .multilineTextAlignment(.center)
            .focused($focused, equals: .code)
            .submitLabel(.next)
            .frame(height: 58)
            .background(Color.surfaceRaised, in: .rect(cornerRadius: Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.sm)
                    .strokeBorder(codeReady ? Color.sage : Color.border, lineWidth: 1)
            )
            .onChange(of: code) { _, new in
                // Word codes run longer than the old six-character hex ones, so the cap is
                // generous; only the separator and alphanumerics survive.
                let cleaned = new.uppercased().filter { $0.isLetter || $0.isNumber || $0 == "-" }
                if cleaned != code { code = String(cleaned.prefix(24)) }
            }
            .onSubmit { if codeReady { checkCode() } }
    }

    private var identityFields: some View {
        Group {
            CampField(label: "Full name") {
                TextField("", text: $fullName)
                    .textContentType(.name)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.next)
                    .focused($focused, equals: .name)
                    .onSubmit { focused = .email }
            }

            CampField(label: "Email address") {
                TextField("", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textContentType(.emailAddress)
                    .submitLabel(.go)
                    .focused($focused, equals: .email)
                    .onSubmit { if identityReady { sendSignInCode() } }
            }
        }
    }

    private var otpField: some View {
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

    private var primaryButton: some View {
        Button(action: primaryAction) {
            if isLoading {
                ProgressView().tint(Color.cream)
            } else {
                Text(primaryLabel)
            }
        }
        .buttonStyle(.campPrimary(enabled: primaryEnabled))
        .disabled(!primaryEnabled || isLoading)
    }

    private var primaryLabel: String {
        switch step {
        case .code:     return "Continue"
        case .identity: return "Email me a code"
        case .verify:   return "Create my account"
        }
    }

    private var primaryEnabled: Bool {
        switch step {
        case .code:     return codeReady
        case .identity: return identityReady
        case .verify:   return otpReady
        }
    }

    private func primaryAction() {
        switch step {
        case .code:     checkCode()
        case .identity: sendSignInCode()
        case .verify:   verify()
        }
    }

    // MARK: - Actions

    /// Validate the join code before asking for anything else.
    ///
    /// Checking first means a mistyped or expired code is caught while it is still the only
    /// thing on screen, rather than after the person has entered their details and waited on an
    /// email that was never going to help.
    private func checkCode() {
        focused = nil
        Task {
            isLoading = true
            let info = await authManager.lookUpJoinCode(formattedCode)
            isLoading = false

            guard let info else { return }               // lookUpJoinCode set authError
            guard info.valid else {
                authManager.authError = info.problemText
                Haptics.warning()
                return
            }

            campInfo = info
            authManager.authError = nil
            Haptics.success()
            withAnimation { step = .identity }
            focused = .name
        }
    }

    private func sendSignInCode() {
        focused = nil
        Task {
            isLoading = true
            // createIfNew is true here, unlike on the sign-in screen, and it is safe for the
            // same reason: a bare auth account grants nothing. Camp access comes only from
            // join_camp_with_code, which re-validates the code server-side.
            let ok = await authManager.sendEmailCode(
                email: email,
                fullName: fullName.trimmingCharacters(in: .whitespaces),
                createIfNew: true
            )
            isLoading = false
            if ok {
                withAnimation { step = .verify }
                focused = .otp
            }
        }
    }

    private func verify() {
        focused = nil
        // Hand the code over before verifying. Verification signs the user in, which tears this
        // view down; the manager redeems the code from its own long-lived task instead.
        authManager.setPendingJoinCode(formattedCode)
        Task {
            isLoading = true
            let ok = await authManager.verifyEmailCode(email: email, code: otp)
            isLoading = false
            if ok { Haptics.success() } else { Haptics.warning() }
        }
    }
}
