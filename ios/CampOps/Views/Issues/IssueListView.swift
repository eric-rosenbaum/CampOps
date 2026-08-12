import SwiftUI

struct IssueListView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: IssueListViewModel
    @State private var showingLogIssue = false

    // Staff see only their own issues + (if permitted) unassigned ones.
    private var staffFilteredIssues: [Issue] {
        guard authManager.currentMember?.role == .staff else { return vm.filteredIssues }
        let userId = authManager.currentUser.id
        return vm.filteredIssues.filter { issue in
            issue.assigneeId == userId ||
            (authManager.issuesSeeUnassigned && issue.assigneeId == nil)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.issues.isEmpty {
                    ProgressView("Loading...").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if staffFilteredIssues.isEmpty {
                    emptyState
                } else {
                    issueList
                }
            }
            .campCanvas()
            .refreshable { await vm.refresh() }
            .navigationTitle("Issues & Repairs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) { UserMenuButton() }
                if authManager.can.createIssue {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showingLogIssue = true } label: { Image(systemName: "plus") }
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) { filterMenu }
            }
            .searchable(text: $vm.searchText, prompt: "Search issues")
            .sheet(isPresented: $showingLogIssue) {
                LogIssueView { newIssue in vm.issues.insert(newIssue, at: 0) }
            }
        }
    }

    private var issueList: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.sm) {
                ForEach(staffFilteredIssues) { issue in
                    let isStaff = authManager.currentMember?.role == .staff
                    let uid = authManager.currentUser.id
                    let takeAction: (() -> Void)? = (isStaff && authManager.issuesSeeUnassigned && issue.assigneeId == nil)
                        ? { Task { await vm.takeIssue(issue, by: authManager.currentUser) } }
                        : nil
                    let untakeAction: (() -> Void)? = (isStaff && issue.assigneeId == uid)
                        ? { Task { await vm.untakeIssue(issue, by: authManager.currentUser) } }
                        : nil
                    NavigationLink(value: issue) {
                        IssueRow(issue: issue, onTakeIt: takeAction, onUntake: untakeAction)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task { await vm.delete(issue: issue) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .padding(Spacing.md)
        }
        .navigationDestination(for: Issue.self) { issue in
            IssueDetailView(issue: issue).environmentObject(vm)
        }
    }

    private var emptyState: some View {
        Group {
            if vm.searchText.isEmpty {
                ContentUnavailableView {
                    Label("No issues logged", systemImage: "wrench.adjustable")
                        .font(.campSection)
                } description: {
                    Text("When something breaks, log it here so the right person picks it up.")
                        .font(.campBody)
                } actions: {
                    if authManager.can.createIssue {
                        Button("Log an issue") { showingLogIssue = true }
                            .font(.campBodySemibold)
                            .foregroundStyle(Color.sage)
                    }
                }
            } else {
                ContentUnavailableView.search(text: vm.searchText)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var filterMenu: some View {
        Menu {
            Section("Status") {
                Button("All") { vm.filterStatus = nil }
                ForEach(IssueStatus.allCases, id: \.self) { s in Button(s.displayName) { vm.filterStatus = s } }
            }
            Section("Priority") {
                Button("All") { vm.filterPriority = nil }
                ForEach(Priority.allCases, id: \.self) { p in Button(p.displayName) { vm.filterPriority = p } }
            }
        } label: {
            Image(systemName: vm.filterStatus != nil || vm.filterPriority != nil
                  ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
    }
}
