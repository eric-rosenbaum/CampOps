import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var issueVM     = IssueListViewModel()
    @StateObject private var checklistVM = ChecklistViewModel()
    @StateObject private var poolVM      = PoolViewModel()
    @StateObject private var assetVM     = AssetViewModel()
    @StateObject private var buildingVM  = BuildingViewModel()
    @StateObject private var syncService = SyncService.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if authManager.isLoading {
                AppLoadingView(message: "Loading…")
            } else if !authManager.isAuthenticated {
                LoginView()
            } else if authManager.isLoadingCamp {
                // Signed in, camp still arriving. Covering this window is what stops a
                // successful sign-in flashing the "you don't belong to a camp" screen.
                AppLoadingView(message: "Setting up your camp…")
            } else if !authManager.hasCamp {
                JoinCampView()
            } else if let camp = authManager.currentCamp, !camp.isAccessible {
                // Suspended or trial-expired camps are blocked before any data loads.
                CampBlockedView(status: camp.status)
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
        .environmentObject(buildingVM)
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
            if authManager.canAccessModule("building_systems") {
                BuildingView()
                    .tabItem { Label("Building", systemImage: "building.2.fill") }
            }
        }
        // An admin with every module sees six tabs, which iPhone collapses into "More".
        // On iPad the same set becomes a proper sidebar instead of a cramped tab strip.
        .tabViewStyle(.sidebarAdaptable)
    }

    private func loadCampData() async {
        async let l = LocationStore.shared.load()
        async let i = issueVM.load()
        async let c = checklistVM.load()
        async let p = poolVM.load()
        async let a = assetVM.load()
        async let b = buildingVM.load()
        _ = await (l, i, c, p, a, b)
        await syncService.subscribeToChanges(
            onIssueChange:      { await issueVM.refresh() },
            onTaskChange:       { await checklistVM.refresh() },
            onPoolChange:       { await poolVM.refresh() },
            onAssetChange:      { await assetVM.refresh() },
            onBuildingChange:   { await buildingVM.refresh() },
            onLocationChange:   { await LocationStore.shared.refresh() },
            onPermissionChange: { await authManager.reloadMemberAndGroup() }
        )
    }

    // Refreshes all data without touching subscriptions (used on foreground resume).
    private func refreshAll() async {
        async let l = LocationStore.shared.refresh()
        async let i = issueVM.refresh()
        async let c = checklistVM.refresh()
        async let p = poolVM.refresh()
        async let a = assetVM.refresh()
        async let b = buildingVM.refresh()
        async let m = authManager.reloadMemberAndGroup()
        _ = await (l, i, c, p, a, b, m)
    }
}

/// Branded full-screen loading state.
///
/// This is the first thing a new staff member sees after their code is accepted, so it carries
/// the wordmark and says what's happening — an unadorned spinner on a white field reads as a
/// hang, which is precisely the impression we're trying to avoid here.
private struct AppLoadingView: View {
    var message: String = "Loading…"

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()
            CampWordmark()
            VStack(spacing: Spacing.md) {
                ProgressView()
                    .tint(Color.sage)
                    .scaleEffect(1.1)
                Text(message)
                    .font(.campBody)
                    .foregroundStyle(Color.forest.opacity(0.5))
            }
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .campCanvas()
    }
}
