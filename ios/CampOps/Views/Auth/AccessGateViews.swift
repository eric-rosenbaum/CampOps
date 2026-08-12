import SwiftUI

/// Blocks a camp that is suspended or whose demo has expired.
///
/// The web app gates every camp route on `currentCamp.status !== 'active'`. iOS had no notion
/// of camp status at all, so a camp suspended for non-payment — or a 30-day demo that ended —
/// stayed fully usable on the phone. This is the missing gate.
struct CampBlockedView: View {
    @EnvironmentObject private var authManager: AuthManager

    var status: CampStatus

    private var isTrial: Bool { status == .trialExpired }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                CampWordmark()
                    .padding(.top, 56)
                    .padding(.bottom, Spacing.xxl)

                VStack(spacing: Spacing.md) {
                    Image(systemName: isTrial ? "hourglass" : "pause.circle")
                        .font(.system(size: 38))
                        .foregroundStyle(Color.sage)
                        .padding(.bottom, Spacing.xs)

                    Text(isTrial ? "Your demo has ended" : "Your account is paused")
                        .font(.campTitle)
                        .foregroundStyle(Color.forest)
                        .multilineTextAlignment(.center)

                    Text(isTrial
                         ? "Your 30-day CampCommand demo is over. To set up a real account and pick up where you left off, get in touch and we'll get you started."
                         : "This account is currently paused. Please reach out and we'll get you back up and running.")
                        .font(.campBody)
                        .foregroundStyle(Color.forest.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity)
                .cardSurface(padding: Spacing.xl, radius: Radius.lg)
                .padding(.horizontal, Spacing.xl)

                SupportAndSignOutFooter(signOutLabel: "Sign out and try a different account")
                    .padding(.top, Spacing.xl)
                    .padding(.horizontal, Spacing.xl)

                Spacer(minLength: Spacing.xxl)
            }
            .frame(maxWidth: .infinity)
        }
        .campCanvas()
    }
}

/// "Email support" + "Sign out" pair, shared by every blocked-access screen.
struct SupportAndSignOutFooter: View {
    @EnvironmentObject private var authManager: AuthManager

    var signOutLabel: String = "Sign out"

    var body: some View {
        VStack(spacing: Spacing.md) {
            Link(destination: URL(string: "mailto:\(Constants.supportEmail)")!) {
                Text("Email \(Constants.supportEmail)")
            }
            .buttonStyle(.campSecondary)

            Button(signOutLabel) {
                Task { await authManager.signOut() }
            }
            .font(.campMeta)
            .foregroundStyle(Color.forest.opacity(0.5))
        }
    }
}
