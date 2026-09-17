import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var issueVM     = IssueListViewModel()
    @StateObject private var poolVM      = PoolViewModel()
    @StateObject private var assetVM     = AssetViewModel()
    @StateObject private var buildingVM  = BuildingViewModel()
    @StateObject private var campground  = CampgroundStore.shared
    @StateObject private var syncService = SyncService.shared
    @ObservedObject private var push = PushService.shared
    @ObservedObject private var deepLink = DeepLinkRouter.shared
    @Environment(\.scenePhase) private var scenePhase

    /// Bound so a tapped notification or a scanned sticker can put a tab in front.
    @State private var selectedTab = Tab.home
    /// A scanned sticker opens the place itself, over whatever tab is in front.
    @State private var scannedTarget: DeepLinkRouter.ScannedTarget?
    @State private var isScannerOpen = false

    private enum Tab: Hashable { case home, work, pool, assets, building }

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
            } else if authManager.isPlatformAdmin && !authManager.hasCamp {
                // A founder is never dropped into a camp on launch. They choose one, every
                // time, because the alternative is editing a customer's live data by accident.
                AdminCampListView()
            } else if !authManager.hasCamp {
                JoinCampView()
            } else if authManager.isCampBlocked, let camp = authManager.currentCamp {
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
                    // A tapped notification names a work order. Bring the board forward; the
                    // list itself opens it, and clears the request once it has.
                    .task(id: push.pendingWorkOrderId) {
                        if push.pendingWorkOrderId != nil { selectedTab = .work }
                    }
                    // A scanned sticker names a place: open it directly.
                    .task(id: deepLink.pending) { routeScannedSticker() }
                    .sheet(item: $scannedTarget) { target in
                        ScannedTargetSheet(target: target)
                    }
                    .sheet(isPresented: $isScannerOpen) {
                        StickerScannerView { target in
                            isScannerOpen = false
                            scannedTarget = target
                        }
                    }
                    .alert(
                        "That sticker",
                        isPresented: Binding(
                            get: { deepLink.failure != nil },
                            set: { if !$0 { deepLink.failure = nil } }
                        )
                    ) {
                        Button("OK", role: .cancel) { deepLink.failure = nil }
                    } message: {
                        Text(deepLink.failure ?? "")
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
        .environmentObject(poolVM)
        .environmentObject(assetVM)
        .environmentObject(buildingVM)
        .environmentObject(campground)
    }

    // `syncStatusBar()` goes on each tab rather than on the TabView, so the pill sits above the
    // tab bar instead of behind it. It is the offline layer's only visible surface.
    private var mainTabView: some View {
        TabView(selection: $selectedTab) {
            HomeView(onScan: { isScannerOpen = true })
                .syncStatusBar()
                    .impersonationBar(authManager.isImpersonating)
                .tabItem { Label("Home", systemImage: "house") }
                .tag(Tab.home)
            if authManager.canAccessModule("issues") {
                IssueListView(onScan: { isScannerOpen = true })
                    .syncStatusBar()
                    .impersonationBar(authManager.isImpersonating)
                    .tabItem { Label("Work", systemImage: "wrench.adjustable") }
                    .tag(Tab.work)
            }
            if authManager.canAccessModule("pool") {
                PoolView()
                    .syncStatusBar()
                    .impersonationBar(authManager.isImpersonating)
                    .tabItem { Label("Pool", systemImage: "drop.fill") }
                    .tag(Tab.pool)
            }
            if authManager.canAccessModule("assets") {
                AssetView()
                    .syncStatusBar()
                    .impersonationBar(authManager.isImpersonating)
                    .tabItem { Label("Assets", systemImage: "car.fill") }
                    .tag(Tab.assets)
            }
            if authManager.canAccessModule("building") {
                BuildingView()
                    .syncStatusBar()
                    .impersonationBar(authManager.isImpersonating)
                    .tabItem { Label("Building", systemImage: "building.2.fill") }
                    .tag(Tab.building)
            }
        }
        // On iPhone extra tabs collapse into "More"; on iPad the same set becomes a sidebar.
        .tabViewStyle(.sidebarAdaptable)
    }

    /// Where a scanned sticker lands.
    ///
    /// Straight onto the place itself -- what is open here, log something here -- rather than
    /// into a filtered list. Somebody scanning a sticker is standing in front of the thing.
    private func routeScannedSticker() {
        guard let target = deepLink.pending else { return }
        deepLink.pending = nil
        scannedTarget = target
    }

    private func loadCampData() async {
        guard let campId = authManager.currentCamp?.id else { return }
        async let l = LocationStore.shared.load()
        async let i = issueVM.load()
        async let g = campground.load(campId: campId)
        async let p = poolVM.load()
        async let a = assetVM.load()
        async let b = buildingVM.load()
        _ = await (l, i, g, p, a, b)

        // Materialise any routine occurrences that have come due. Cheap when there is nothing
        // to make, and it means a crew who never open a laptop still see today's routines.
        try? await DataService.shared.generateScheduledWork()
        await issueVM.refresh()

        await syncService.subscribeToChanges(
            onIssueChange:      { await issueVM.refresh() },
            onThreadChange:     { await campground.refresh() },
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
        async let g = campground.refresh()
        async let p = poolVM.refresh()
        async let a = assetVM.refresh()
        async let b = buildingVM.refresh()
        async let m = authManager.reloadMemberAndGroup()
        _ = await (l, i, g, p, a, b, m)
    }
}

/// Branded full-screen loading state.
///
/// This is the first thing a new staff member sees after their code is accepted, so it carries
/// the wordmark and says what's happening, an unadorned spinner on a white field reads as a
/// hang, which is precisely the impression we're trying to avoid here.
struct AppLoadingView: View {
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
