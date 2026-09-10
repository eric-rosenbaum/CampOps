import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var issueVM     = IssueListViewModel()
    @StateObject private var checklistVM = ChecklistViewModel()
    @StateObject private var poolVM      = PoolViewModel()
    @StateObject private var assetVM     = AssetViewModel()
    @StateObject private var buildingVM  = BuildingViewModel()
    @StateObject private var syncService = SyncService.shared
    @ObservedObject private var push = PushService.shared
    @Environment(\.scenePhase) private var scenePhase

    /// Bound so a tapped notification can put the Issues tab in front. Nothing else moves it.
    @State private var selectedTab = Tab.home

    private enum Tab: Hashable { case home, issues, prePost, pool, assets, building }

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
                        if let campId = authManager.currentCamp?.id {
                            SyncEngine.shared.start(campId: campId)
                            // Asked for here rather than at launch: by this point they have signed
                            // in and joined a camp, so the permission prompt is about work they
                            // already said yes to.
                            await PushService.shared.register(campId: campId)
                        }
                        await loadCampData()
                    }
                    // A tapped notification names a work order. Bring Issues forward; the list
                    // itself opens it, and clears the request once it has.
                    .task(id: push.pendingWorkOrderId) {
                        if push.pendingWorkOrderId != nil { selectedTab = .issues }
                    }
                    .onChange(of: scenePhase) { _, phase in
                        if phase == .active {
                            Task { await refreshAll() }
                        }
                    }
            }
        }
        // Stop the timers when the session goes away. Note this deliberately does NOT clear the
        // mutation queue: a token expiring mid-shift is not a reason to throw away work somebody
        // has already been told was saved. `SyncEngine.signOut(campId:)` is the explicit path
        // for actually discarding it.
        .onChange(of: authManager.isAuthenticated) { _, isAuthenticated in
            if !isAuthenticated { SyncEngine.shared.stop() }
        }
        .environmentObject(authManager)
        .environmentObject(issueVM)
        .environmentObject(checklistVM)
        .environmentObject(poolVM)
        .environmentObject(assetVM)
        .environmentObject(buildingVM)
    }

    // `syncStatusBar()` goes on each tab rather than on the TabView, so the pill sits above the
    // tab bar instead of behind it. It is the offline layer's only visible surface.
    private var mainTabView: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .syncStatusBar()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(Tab.home)
            if authManager.canAccessModule("issues_repairs") {
                IssueListView()
                    .syncStatusBar()
                    .tabItem { Label("Issues", systemImage: "wrench.adjustable") }
                    .tag(Tab.issues)
            }
            if authManager.canAccessModule("pre_post") {
                ChecklistView()
                    .syncStatusBar()
                    .tabItem { Label("Pre/Post", systemImage: "checklist") }
                    .tag(Tab.prePost)
            }
            if authManager.canAccessModule("pool") {
                PoolView()
                    .syncStatusBar()
                    .tabItem { Label("Pool", systemImage: "drop.fill") }
                    .tag(Tab.pool)
            }
            if authManager.canAccessModule("assets") {
                AssetView()
                    .syncStatusBar()
                    .tabItem { Label("Assets", systemImage: "car.fill") }
                    .tag(Tab.assets)
            }
            if authManager.canAccessModule("building_systems") {
                BuildingView()
                    .syncStatusBar()
                    .tabItem { Label("Building", systemImage: "building.2.fill") }
                    .tag(Tab.building)
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
/// the wordmark and says what's happening, an unadorned spinner on a white field reads as a
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
