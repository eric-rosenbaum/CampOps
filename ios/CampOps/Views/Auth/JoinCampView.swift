import SwiftUI

struct JoinCampView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var code = ""
    @State private var isLoading = false

    var formattedCode: String { code.uppercased() }
    var canJoin: Bool { formattedCode.count == 6 }

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
                VStack(alignment: .leading, spacing: 6) {
                    Text("Join your camp")
                        .font(.headline)
                    Text("Enter the 6-character join code provided by your camp administrator.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                TextField("ABC123", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(.title2, design: .monospaced).weight(.semibold))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
                    .frame(height: 56)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
                    .onChange(of: code) { _, new in
                        code = String(new.uppercased().prefix(6))
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
                        await authManager.joinWithCode(formattedCode)
                        isLoading = false
                    }
                } label: {
                    Group {
                        if isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("Join Camp")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(canJoin ? Color.forest : Color.forest.opacity(0.4))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .disabled(!canJoin || isLoading)
            }
            .padding(24)
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.06), radius: 12, x: 0, y: 4)
            .padding(.horizontal, 24)

            Button {
                Task { await authManager.signOut() }
            } label: {
                Text("Sign out")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 20)

            Spacer()
            Spacer()
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }
}
