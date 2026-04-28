import SwiftUI

struct SignUpView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false

    private var passwordMismatch: Bool {
        !confirmPassword.isEmpty && password != confirmPassword
    }

    private var canSubmit: Bool {
        !fullName.trimmingCharacters(in: .whitespaces).isEmpty &&
        !email.trimmingCharacters(in: .whitespaces).isEmpty &&
        password.count >= 6 &&
        password == confirmPassword
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "megaphone.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.sage)
                        Text("CampCommand")
                            .font(.title2).fontWeight(.bold)
                            .foregroundColor(.forest)
                    }
                    .padding(.top, 20)

                    VStack(spacing: 20) {
                        Text("Create account")
                            .font(.headline)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        LabeledSignUpField(label: "Full name") {
                            TextField("Jane Smith", text: $fullName)
                                .textContentType(.name)
                                .autocorrectionDisabled()
                        }

                        LabeledSignUpField(label: "Email") {
                            TextField("you@example.com", text: $email)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled()
                                .textContentType(.emailAddress)
                        }

                        LabeledSignUpField(label: "Password") {
                            SecureField("At least 6 characters", text: $password)
                                .textContentType(.newPassword)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            LabeledSignUpField(label: "Confirm password") {
                                SecureField("Re-enter password", text: $confirmPassword)
                                    .textContentType(.newPassword)
                            }
                            if passwordMismatch {
                                Text("Passwords don't match")
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                        }

                        if let err = authManager.authError {
                            Text(err)
                                .font(.caption)
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            Task {
                                isLoading = true
                                authManager.authError = nil
                                await authManager.signUp(email: email, password: password, fullName: fullName.trimmingCharacters(in: .whitespaces))
                                isLoading = false
                                if authManager.authError == nil {
                                    dismiss()
                                }
                            }
                        } label: {
                            Group {
                                if isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Create account")
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(canSubmit ? Color.forest : Color.forest.opacity(0.4))
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(!canSubmit || isLoading)
                    }
                    .padding(24)
                    .background(Color(.systemBackground))
                    .cornerRadius(16)
                    .shadow(color: .black.opacity(0.06), radius: 12, x: 0, y: 4)
                    .padding(.horizontal, 24)
                }
                .padding(.bottom, 40)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

private struct LabeledSignUpField<Content: View>: View {
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.secondary)
            content()
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)
        }
    }
}
