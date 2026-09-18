import SwiftUI
import UIKit
import UserNotifications

@main
struct CampCommandApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var language = LanguageStore.shared
    // APNs hands its token to a UIApplicationDelegate and nothing else, so SwiftUI needs one.
    @UIApplicationDelegateAdaptor(PushDelegate.self) private var pushDelegate

    init() { Self.applyBrandAppearance(for: L10n.language) }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(language)
                // The chosen language, not the device's. `Text` literals resolve against this
                // locale, and Hebrew mirrors the whole layout from here down.
                .environment(\.locale, language.locale)
                .environment(\.layoutDirection, language.language.layoutDirection)
                // A later switch goes through `applyChrome`, called by `LanguageStore.choose`.
                .onAppear { Self.applyLayoutDirection(language.language) }
                .tint(Color.sage)
                .task { await authManager.initialize() }
                // A scanned sticker arrives one of two ways and both land in the same router:
                // a universal link comes in as a browsing user activity, a campcommand:// link
                // as a plain URL.
                .onOpenURL { DeepLinkRouter.shared.handle($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { DeepLinkRouter.shared.handle(url) }
                }
        }
    }

    /// Brings UIKit's chrome over to a newly chosen language.
    ///
    /// Called BEFORE the change is published. From an `onChange` it ran after the shell had
    /// already been rebuilt, so the fresh navigation bars read the old appearance and kept the
    /// profile button on the English side of a Hebrew screen.
    static func applyChrome(for language: AppLanguage) {
        applyBrandAppearance(for: language)
        applyLayoutDirection(language)
    }

    /// Mirrors UIKit's chrome -- the tab bar, navigation bars, sheets -- with the chosen language.
    ///
    /// SwiftUI's `\.layoutDirection` stops at the hosting controller. The tab bar kept Home on
    /// the left under Hebrew, and the profile button sat at the trailing edge, because UIKit
    /// takes its direction from the trait collection, which follows the language the app was
    /// LAUNCHED in. Forcing it through `UIView.appearance().semanticContentAttribute` was worse:
    /// bars created before a switch kept the old forced direction for the rest of the session.
    /// A trait override on the window reaches every controller under it, including ones
    /// already on screen.
    private static func applyLayoutDirection(_ language: AppLanguage) {
        let direction: UITraitEnvironmentLayoutDirection = language.isRightToLeft ? .rightToLeft : .leftToRight
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            for window in scene.windows {
                window.traitOverrides.layoutDirection = direction
            }
        }
    }

    /// Navigation and tab chrome are drawn by UIKit, so SwiftUI's `.font()` never reaches them.
    /// Without this the app reads as DM Sans everywhere except its titles, which stay SF.
    ///
    /// Under Hebrew the bars use the system face: Bitter and Karla have no Hebrew glyphs.
    private static func applyBrandAppearance(for language: AppLanguage) {
        let ink = UIColor(Color.forest)
        let brandFonts = !language.isRightToLeft
        // The one place the window's trait override is not enough: the system back button picks
        // its chevron from the direction the app LAUNCHED in, so after switching from Hebrew to
        // English it still pointed right, away from where it goes. The bars are rebuilt with the
        // shell on a switch, so the new ones read this.
        UINavigationBar.appearance().semanticContentAttribute =
            language.isRightToLeft ? .forceRightToLeft : .forceLeftToRight

        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = UIColor(Color.canvas)
        nav.shadowColor = UIColor(Color.border)
        if brandFonts, let large = UIFont(name: "Bitter-SemiBold", size: 30) {
            nav.largeTitleTextAttributes = [.font: large, .foregroundColor: ink]
        } else {
            nav.largeTitleTextAttributes = [.font: UIFont.systemFont(ofSize: 30, weight: .semibold), .foregroundColor: ink]
        }
        if brandFonts, let inline = UIFont(name: "Karla-Regular_SemiBold", size: 17) {
            nav.titleTextAttributes = [.font: inline, .foregroundColor: ink]
        } else {
            nav.titleTextAttributes = [.font: UIFont.systemFont(ofSize: 17, weight: .semibold), .foregroundColor: ink]
        }
        // The back chevron is chosen by hand. The system's own follows the language the app
        // LAUNCHED in, ignoring both the window's trait and the bar's semantic attribute, so
        // after a switch it pointed away from where it goes. The bar also mirrors whatever image
        // it is given when the app launched right-to-left, so the glyph is picked to come out
        // the right way after that flip: launched in Hebrew and now in English, it is handed a
        // right chevron and shows a left one.
        let launchedRightToLeft = UIApplication.shared.userInterfaceLayoutDirection == .rightToLeft
        let back = UIImage(systemName: language.isRightToLeft != launchedRightToLeft ? "chevron.right" : "chevron.left",
                           withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold))
        nav.setBackIndicatorImage(back, transitionMaskImage: back)
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor(Color.canvas)
        if let item = brandFonts ? UIFont(name: "Karla-Regular_Medium", size: 10)
                                 : UIFont.systemFont(ofSize: 10, weight: .medium) {
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
