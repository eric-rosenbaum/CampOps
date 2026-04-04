import SwiftUI

struct ContentView: View {
    @StateObject private var userManager   = UserManager.shared
    @StateObject private var issueVM       = IssueListViewModel()
    @StateObject private var checklistVM   = ChecklistViewModel()
    @StateObject private var syncService   = SyncService.shared

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            IssueListView()
                .tabItem { Label("Issues", systemImage: "wrench.adjustable") }
            ChecklistView()
                .tabItem { Label("Checklist", systemImage: "checklist") }
        }
        .environmentObject(userManager)
        .environmentObject(issueVM)
        .environmentObject(checklistVM)
        .task {
            try? await DataService.shared.upsertUsers()
            await syncService.subscribeToChanges(
                onIssueChange: { await issueVM.refresh() },
                onTaskChange:  { await checklistVM.refresh() }
            )
        }
    }
}
