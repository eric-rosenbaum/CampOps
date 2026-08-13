import SwiftUI

/// The staff lane, entirely on the phone: join code → name + email → 6-digit code → in.
///
/// Seasonal staff shouldn't have to create an account in a browser and then sign in again here.
/// One emailed code creates the account, proves the address, and signs them in, so there is no
/// password to invent on a phone keyboard and nothing to forget by the next shift.
///
/// Account creation stays gated: `shouldCreateUser` is only true once `join_code_info` has
/// confirmed a real, unexpired code, and camp access itself comes from `join_camp_with_code`.
struct JoinWithCodeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    private enum Step { case code, identity, otp }

    @State private var step: Step = .code
    @State private var code = ""
    @State private var info: JoinCodeInfo?
    @State private var name = ""
    @State private var email = ""
    @State private var otp = ""
    @State private var busy = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    switch step {
                    case .code:     codeStep
                    case .identity: identityStep
                    case .otp:      otpStep
                    }
                }
                .padding(Spacing.xl)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .campCanvas()
            .navigationTitle("Join a camp")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.font(.campBodyMedium)
                }
            }
        }
        .onAppear { authManager.authError = nil }
    }

    // MARK: - Steps

    private var codeStep: some View {
        VStack(spacing: Spacing.lg) {
            stepHeader(
                title: "Enter your join code",
                subtitle: "Your camp administrator gives you a 6-character code."
            )

            TextField("ABC123", text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.system(.title2, design: .monospaced).weight(.semibold))
                .foregroundStyle(Color.forest)
                .tint(Color.sage)
                .multilineTextAlignment(.center)
                .focused($focused)
                .frame(height: 58)
                .background(Color.surfaceRaised, in: .rect(cornerRadius: Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .strokeBorder(code.count == 6 ? Color.sage : Color.border, lineWidth: 1)
                )
                .onChange(of: code) { _, new in code = String(new.uppercased().prefix(6)) }

            errorBanner

            Button {
                Task {
                    busy = true
                    if let found = await authManager.lookUpJoinCode(code) {
                        if found.valid {
                            info = found
                            Haptics.success()
                            withAnimation { step = .identity }
                        } else {
                            authManager.authError = found.problemText
                            Haptics.warning()
                        }
                    }
                    busy = false
                }
            } label: {
                if busy { ProgressView().tint(Color.cream) } else { Text("Continue") }
            }
            .buttonStyle(.campPrimary(enabled: code.count == 6))
            .disabled(code.count != 6 || busy)
        }
        .cardSurface(padding: Spacing.xl, radius: Radius.lg)
    }

    private var identityStep: some View {
        VStack(spacing: Spacing.lg) {
            stepHeader(
                title: "Join \(info?.campName ?? "your camp")",
                subtitle: info?.groupName.map { "You'll join as \($0). We'll email you a code to sign in — no password needed." }
                    ?? "We'll email you a code to sign in — no password needed."
            )

            CampField(label: "Your name") {
                TextField("", text: $name)
                    .textContentType(.name)
                    .autocorrectionDisabled()
            }

            CampField(label: "Email") {
                TextField("", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textContentType(.emailAddress)
            }

            errorBanner

            Button {
                Task {
                    busy = true
                    let ok = await authManager.sendEmailCode(
                        email: email,
                        fullName: name.trimmingCharacters(in: .whitespaces),
                        createIfNew: true
                    )
                    busy = false
                    if ok { withAnimation { step = .otp } }
                }
            } label: {
                if busy { ProgressView().tint(Color.cream) } else { Text("Email me a code") }
            }
            .buttonStyle(.campPrimary(enabled: canSendCode))
            .disabled(!canSendCode || busy)
        }
        .cardSurface(padding: Spacing.xl, radius: Radius.lg)
    }

    private var otpStep: some View {
        VStack(spacing: Spacing.lg) {
            stepHeader(
                title: "Enter your code",
                subtitle: "We sent a 6-digit code to \(email)."
            )

            TextField("000000", text: $otp)
                .keyboardType(.numberPad)
                // Lets iOS offer the code straight from the mail notification.
                .textContentType(.oneTimeCode)
                .font(.system(.title2, design: .monospaced).weight(.semibold))
                .foregroundStyle(Color.forest)
                .tint(Color.sage)
                .multilineTextAlignment(.center)
                .frame(height: 58)
                .background(Color.surfaceRaised, in: .rect(cornerRadius: Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .strokeBorder(otp.count == 6 ? Color.sage : Color.border, lineWidth: 1)
                )
                .onChange(of: otp) { _, new in
                    otp = String(new.filter(\.isNumber).prefix(6))
                }

            errorBanner

            Button {
                Task {
                    busy = true
                    if await authManager.verifyEmailCode(email: email, code: otp) {
                        // The session now exists, so the join runs as this user.
                        await authManager.joinWithCode(code)
                        Haptics.success()
                        busy = false
                        if authManager.authError == nil { dismiss() }
                    } else {
                        Haptics.warning()
                        busy = false
                    }
                }
            } label: {
                if busy { ProgressView().tint(Color.cream) } else { Text("Join camp") }
            }
            .buttonStyle(.campPrimary(enabled: otp.count == 6))
            .disabled(otp.count != 6 || busy)

            Button("Send a new code") {
                Task {
                    _ = await authManager.sendEmailCode(email: email, fullName: name, createIfNew: true)
                }
            }
            .font(.campMeta)
            .foregroundStyle(Color.forest.opacity(0.5))
        }
        .cardSurface(padding: Spacing.xl, radius: Radius.lg)
    }

    // MARK: - Bits

    private var canSendCode: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && email.contains("@")
    }

    private func stepHeader(title: String, subtitle: String) -> some View {
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

    @ViewBuilder
    private var errorBanner: some View {
        if let err = authManager.authError {
            CampErrorBanner(message: err)
        }
    }
}
