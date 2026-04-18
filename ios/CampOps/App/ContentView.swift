import SwiftUI

struct ContentView: View {
    @StateObject private var userManager   = UserManager.shared
    @StateObject private var issueVM       = IssueListViewModel()
    @StateObject private var checklistVM   = ChecklistViewModel()
    @StateObject private var poolVM        = PoolViewModel()
    @StateObject private var assetVM       = AssetViewModel()
    @StateObject private var syncService   = SyncService.shared

    var body: some View {
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
        .environmentObject(userManager)
        .environmentObject(issueVM)
        .environmentObject(checklistVM)
        .environmentObject(poolVM)
        .environmentObject(assetVM)
        .task {
            try? await DataService.shared.upsertUsers()
            await syncService.subscribeToChanges(
                onIssueChange: { await issueVM.refresh() },
                onTaskChange:  { await checklistVM.refresh() },
                onPoolChange:  { await poolVM.refresh() },
                onAssetChange: { await assetVM.refresh() }
            )
        }
    }
}
