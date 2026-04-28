import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var issueVM     = IssueListViewModel()
    @StateObject private var checklistVM = ChecklistViewModel()
    @StateObject private var poolVM      = PoolViewModel()
    @StateObject private var assetVM     = AssetViewModel()
    @StateObject private var syncService = SyncService.shared

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
            IssueListView()
                .tabItem { Label("Issues", systemImage: "wrench.adjustable") }
            ChecklistView()
                .tabItem { Label("Checklist", systemImage: "checklist") }
            PoolView()
                .tabItem { Label("Pool", systemImage: "drop.fill") }
            AssetView()
                .tabItem { Label("Assets", systemImage: "car.fill") }
        }
    }

    private func loadCampData() async {
        await issueVM.load()
        await checklistVM.load()
        await poolVM.load()
        await assetVM.load()
        await syncService.subscribeToChanges(
            onIssueChange: { await issueVM.refresh() },
            onTaskChange:  { await checklistVM.refresh() },
            onPoolChange:  { await poolVM.refresh() },
            onAssetChange: { await assetVM.refresh() }
        )
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
