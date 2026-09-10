import SwiftUI
import UIKit
import UserNotifications

@main
struct CampCommandApp: App {
    @StateObject private var authManager = AuthManager.shared
    // APNs hands its token to a UIApplicationDelegate and nothing else, so SwiftUI needs one.
    @UIApplicationDelegateAdaptor(PushDelegate.self) private var pushDelegate

    init() { Self.applyBrandAppearance() }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .tint(Color.sage)
                .task { await authManager.initialize() }
        }
    }

    /// Navigation and tab chrome are drawn by UIKit, so SwiftUI's `.font()` never reaches them.
    /// Without this the app reads as DM Sans everywhere except its titles, which stay SF.
    private static func applyBrandAppearance() {
        let ink = UIColor(Color.forest)

        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = UIColor(Color.canvas)
        nav.shadowColor = UIColor(Color.border)
        if let large = UIFont(name: "Bitter-SemiBold", size: 30) {
            nav.largeTitleTextAttributes = [.font: large, .foregroundColor: ink]
        }
        if let inline = UIFont(name: "Karla-Regular_SemiBold", size: 17) {
            nav.titleTextAttributes = [.font: inline, .foregroundColor: ink]
        }
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor(Color.canvas)
        if let item = UIFont(name: "Karla-Regular_Medium", size: 10) {
            for layout in [tab.stackedLayoutAppearance, tab.inlineLayoutAppearance, tab.compactInlineLayoutAppearance] {
                layout.normal.titleTextAttributes = [.font: item]
                layout.selected.titleTextAttributes = [.font: item]
            }
        }
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }
}

/// The one thing SwiftUI cannot do for us.
///
/// `registerForRemoteNotifications()` answers through `UIApplicationDelegate` — there is no
/// SwiftUI equivalent — so the app keeps a delegate whose entire job is to hand the token to
/// `PushService` and get out of the way.
final class PushDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set here rather than at registration time: a notification tapped while the app was dead
        // is delivered during launch, and a delegate assigned later than this misses it.
        UNUserNotificationCenter.current().delegate = PushService.shared
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushService.shared.tokenArrived(deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushService.shared.registrationFailed(error)
    }
}
