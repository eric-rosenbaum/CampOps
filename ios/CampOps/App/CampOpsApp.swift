import SwiftUI
import UIKit

@main
struct CampCommandApp: App {
    @StateObject private var authManager = AuthManager.shared

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
