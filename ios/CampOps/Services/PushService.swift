import Combine
import Foundation
import Supabase
import UIKit
import UserNotifications

/// Remote notifications: asking for them, keeping this phone's APNs token on the server, and
/// deciding where a tapped notification lands.
///
/// The server sends two things and only two: a work order was assigned to you, and somebody
/// commented on a thread you are on. Both are things a crew member is expected to act on within
/// the hour, which is the bar for interrupting somebody. Everything else stays in email.
///
/// The token itself is the only thing this class is careful about. APNs hands the same token to
/// the same app install for as long as it lives, so `device_tokens` is unique on it and filing one
/// MOVES it: when a camp phone is handed to somebody else and they sign in, the previous person's
/// work orders stop arriving on a phone they no longer hold.
@MainActor
final class PushService: NSObject, ObservableObject {
    static let shared = PushService()

    /// The work order a tapped notification asked for, waiting for the UI to open it.
    ///
    /// It is published rather than pushed straight into a navigation stack because the tap can
    /// arrive before there is anything to navigate: cold launch, a camp still loading, or a tab
    /// the staff group cannot see. Whoever can act on it clears it.
    @Published var pendingWorkOrderId: String?

    private var supabase: SupabaseClient { SupabaseService.shared.client }

    /// The hex token from APNs, held so a camp switch can re-file it without waiting for iOS to
    /// hand it over again (it only does that on launch, or when it changes).
    private var deviceToken: String?
    private var lastFiledCampId: String?

    private override init() { super.init() }

    // MARK: - Registration

    /// Called once a signed-in user has an accessible camp, and again whenever they switch camps.
    ///
    /// The permission prompt comes here rather than at first launch: by this point the person has
    /// signed in and joined a camp, so "CampCommand would like to send you notifications" is a
    /// question about work they have already said yes to, not a question from a stranger.
    func register(campId: String) async {
        let centre = UNUserNotificationCenter.current()
        centre.delegate = self

        let settings = await centre.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            let granted = (try? await centre.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            guard granted else { return }
        case .denied:
            // Asking again does nothing -- iOS answers from the stored decision without showing
            // anything -- and registering anyway would only collect a token that can never
            // produce an alert. The outbox still emails them.
            return
        default:
            break
        }

        UIApplication.shared.registerForRemoteNotifications()

        // A token already in hand (a camp switch, a second call in the same session) needs
        // re-filing against the new camp; iOS will not deliver it again on its own.
        if deviceToken != nil, lastFiledCampId != campId {
            await fileToken(campId: campId)
        }
    }

    /// iOS handed us a token. Called from the app delegate.
    func tokenArrived(_ raw: Data) {
        deviceToken = raw.map { String(format: "%02x", $0) }.joined()
        lastFiledCampId = nil
        guard let campId = AuthManager.shared.currentCamp?.id else { return }
        Task { await fileToken(campId: campId) }
    }

    /// iOS refused to register. Not worth surfacing: it happens on a simulator without a signed-in
    /// Apple account and on a device with no network, and the only user-facing consequence is that
    /// they keep getting email instead.
    func registrationFailed(_ error: Error) {
        print("PushService: APNs registration failed — \(error.localizedDescription)")
    }

    private func fileToken(campId: String) async {
        guard let token = deviceToken, AuthManager.shared.session != nil else { return }

        // Through an RPC rather than a straight upsert. device_tokens is unique on the token and
        // its policy is `user_id = auth.uid()` both ways, so a phone that already carries somebody
        // else's row cannot be re-filed from the client: the update path would need the previous
        // owner's identity. `register_device_token` takes the token away from whoever held it and
        // files it under the caller, which is the whole point when a camp phone changes hands.
        do {
            try await supabase
                .rpc("register_device_token", params: [
                    "p_camp_id": campId,
                    "p_token": token,
                    "p_platform": "ios",
                    "p_environment": Self.apnsEnvironment,
                ])
                .execute()
            lastFiledCampId = campId
        } catch {
            // Nothing to tell the user. The next foreground pass calls register() again, and
            // until it lands they simply get the email they were always getting.
            print("PushService: could not file the device token — \(error.localizedDescription)")
        }
    }

    /// Sign-out. Stops this phone receiving the camp's work.
    ///
    /// Unawaited on purpose, for the same reason `signOut()` does not wait on its own POST: a
    /// half-dead camp wifi socket must not hold the sign-out screen. If the delete never lands the
    /// row is still reclaimed the moment anybody signs in on this phone, because filing a token
    /// moves it to its new owner. Unregistering with iOS is the half that always works.
    func forgetThisDevice() {
        guard let token = deviceToken else { return }
        deviceToken = nil
        lastFiledCampId = nil
        let client = supabase
        Task { try? await client.from("device_tokens").delete().eq("token", value: token).execute() }
        UIApplication.shared.unregisterForRemoteNotifications()
    }

    // MARK: - Which APNs

    /// Whether the token this build gets is valid against APNs sandbox or production.
    ///
    /// It is a property of the provisioning profile, not of the build configuration, so this reads
    /// `aps-environment` out of the embedded profile rather than guessing from `#if DEBUG`. A
    /// Release build installed over a cable with a development profile really does get a sandbox
    /// token, and guessing wrong is silent at both ends: APNs answers `BadDeviceToken`, which
    /// reads exactly like a phone that has deleted the app.
    static let apnsEnvironment: String = {
        guard
            let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
            let raw = try? Data(contentsOf: url),
            // The profile is CMS-signed binary with a plist in the middle of it; isoLatin1 maps
            // every byte to a character, so the XML can be cut out without corrupting the rest.
            let text = String(data: raw, encoding: .isoLatin1),
            let start = text.range(of: "<?xml"),
            let end = text.range(of: "</plist>"),
            let plist = String(text[start.lowerBound..<end.upperBound]).data(using: .isoLatin1),
            let root = try? PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any],
            let entitlements = root["Entitlements"] as? [String: Any],
            let aps = entitlements["aps-environment"] as? String
        else {
            // No profile to read: the simulator. Its tokens are not real APNs tokens anyway.
            #if DEBUG
            return "sandbox"
            #else
            return "production"
            #endif
        }
        return aps == "development" ? "sandbox" : "production"
    }()
}

// MARK: - Notifications arriving

extension PushService: UNUserNotificationCenterDelegate {
    /// Show it even with the app open. Somebody reading one work order should still be told that
    /// another has just landed on them; iOS's default of swallowing it is wrong for this.
    func userNotificationCenter(
        _ centre: UNUserNotificationCenter,
        willPresent notification: UNNotification,
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _ centre: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
    ) async {
        let payload = response.notification.request.content.userInfo
        guard let data = payload["data"] as? [String: Any],
              let issueId = data["issue_id"] as? String
        else { return }

        // The camp switch happens before the work order is published, not alongside it: switching
        // reloads every module, and a screen that starts looking for the work order while the old
        // camp is still loaded finds nothing and gives up.
        if let campId = data["camp_id"] as? String {
            await AuthManager.shared.selectCamp(campId)
        }
        pendingWorkOrderId = issueId
    }
}
