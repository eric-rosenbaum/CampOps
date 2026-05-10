import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var issueVM     = IssueListViewModel()
    @StateObject private var checklistVM = ChecklistViewModel()
    @StateObject private var poolVM      = PoolViewModel()
    @StateObject private var assetVM     = AssetViewModel()
    @StateObject private var syncService = SyncService.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if authManager.isLoading {
                AppLoadingView()
            } else if !authManager.isAuthenticated {
                LoginView()
            } else if !authManager.hasCamp {
                JoinCampView()
            } else {
                mainTabView
                    .task(id: authManager.currentCamp?.id) {
                        await loadCampData()
                    }
                    .onChange(of: scenePhase) { _, phase in
                        if phase == .active {
                            Task { await refreshAll() }
                        }
                    }
            }
        }
        .environmentObject(authManager)
        .environmentObject(issueVM)
        .environmentObject(checklistVM)
        .environmentObject(poolVM)
        .environmentObject(assetVM)
    }

    private var mainTabView: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            if authManager.canAccessModule("issues_repairs") {
                IssueListView()
                    .tabItem { Label("Issues", systemImage: "wrench.adjustable") }
            }
            if authManager.canAccessModule("pre_post") {
                ChecklistView()
                    .tabItem { Label("Checklist", systemImage: "checklist") }
            }
            if authManager.canAccessModule("pool") {
                PoolView()
                    .tabItem { Label("Pool", systemImage: "drop.fill") }
            }
            if authManager.canAccessModule("assets") {
                AssetView()
                    .tabItem { Label("Assets", systemImage: "car.fill") }
            }
        }
    }

    private func loadCampData() async {
        async let i = issueVM.load()
        async let c = checklistVM.load()
        async let p = poolVM.load()
        async let a = assetVM.load()
        _ = await (i, c, p, a)
        await syncService.subscribeToChanges(
            onIssueChange:      { await issueVM.refresh() },
            onTaskChange:       { await checklistVM.refresh() },
            onPoolChange:       { await poolVM.refresh() },
            onAssetChange:      { await assetVM.refresh() },
            onPermissionChange: { await authManager.reloadMemberAndGroup() }
        )
    }

    // Refreshes all data without touching subscriptions (used on foreground resume).
    private func refreshAll() async {
        async let i = issueVM.refresh()
        async let c = checklistVM.refresh()
        async let p = poolVM.refresh()
        async let a = assetVM.refresh()
        async let m = authManager.reloadMemberAndGroup()
        _ = await (i, c, p, a, m)
    }
}

private struct AppLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading…")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }
}
