import SwiftUI

@main
struct CampCommandApp: App {
    @StateObject private var authManager = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .task { await authManager.initialize() }
        }
    }
}
