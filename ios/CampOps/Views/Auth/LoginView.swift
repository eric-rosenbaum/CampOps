import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var showingSignUp = false

    var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && password.count >= 6
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "megaphone.fill")
                    .font(.system(size: 40))
                    .foregroundColor(.sage)
                Text("CampCommand")
                    .font(.title2).fontWeight(.bold)
                    .foregroundColor(.forest)
            }
            .padding(.bottom, 36)

            VStack(spacing: 20) {
                Text("Sign in")
                    .font(.headline)
                    .frame(maxWidth: .infinity, alignment: .leading)

                LabeledField(label: "Email") {
                    TextField("", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                }

                LabeledField(label: "Password") {
                    SecureField("", text: $password)
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
                        await authManager.signIn(email: email, password: password)
                        isLoading = false
                    }
                } label: {
                    Group {
                        if isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Sign In")
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

            Button {
                authManager.authError = nil
                showingSignUp = true
            } label: {
                Text("Don't have an account? **Create one**")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 20)

            Spacer()
            Spacer()
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .onAppear { authManager.authError = nil }
        .sheet(isPresented: $showingSignUp) {
            SignUpView()
                .environmentObject(authManager)
        }
    }
}

private struct LabeledField<Content: View>: View {
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
