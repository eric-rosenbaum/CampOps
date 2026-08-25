import SwiftUI

struct IssueListView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: IssueListViewModel
    @State private var showingLogIssue = false

    // Staff see only their own issues + (if permitted) unassigned ones.
    /// True when the list is being narrowed by staff-group rules rather than genuinely empty.
    private var isFilteredStaffView: Bool {
        authManager.currentMember?.role == .staff
            && !authManager.issuesSeeUnassigned
            && !vm.issues.isEmpty
    }

    private var staffFilteredIssues: [Issue] {
        guard authManager.currentMember?.role == .staff else { return vm.filteredIssues }
        let userId = authManager.currentUser.id
        return vm.filteredIssues.filter { issue in
            issue.assigneeId == userId ||
            issue.reportedById == userId ||
            (authManager.issuesSeeUnassigned && issue.assigneeId == nil)
        }
    }

    // Work I'm responsible for. Always the first thing on screen.
    private var assignedToMe: [Issue] {
        let uid = authManager.currentUser.id
        return staffFilteredIssues.filter { $0.assigneeId == uid }
    }

    // Issues I raised that someone else owns (or nobody owns yet). Kept visually distinct
    // from my assignments: reporting something is not the same as being on the hook for it.
    private var reportedByMe: [Issue] {
        let uid = authManager.currentUser.id
        return staffFilteredIssues.filter { $0.reportedById == uid && $0.assigneeId != uid }
    }

    /// Split the list only when the group can't see everything; otherwise a flat list is right.
    private var showsSplitSections: Bool {
        authManager.currentMember?.role == .staff && !authManager.issuesSeeUnassigned
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
                if showsSplitSections {
                    if !assignedToMe.isEmpty {
                        SectionEyebrow(text: "Assigned to you")
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(assignedToMe) { row(for: $0) }
                    }
                    if !reportedByMe.isEmpty {
                        SectionEyebrow(text: "You reported")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, assignedToMe.isEmpty ? 0 : Spacing.md)
                        Text("Someone else will pick these up. You'll see status changes here.")
                            .font(.campMeta)
                            .foregroundStyle(Color.forest.opacity(0.45))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(reportedByMe) { row(for: $0) }
                    }
                } else {
                    ForEach(staffFilteredIssues) { row(for: $0) }
                }
            }
            .padding(Spacing.md)
        }
        .navigationDestination(for: Issue.self) { issue in
            IssueDetailView(issue: issue).environmentObject(vm)
        }
    }

    @ViewBuilder
    private func row(for issue: Issue) -> some View {
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

    private var emptyState: some View {
        Group {
            if vm.searchText.isEmpty {
                ContentUnavailableView {
                    Label(isFilteredStaffView ? "Nothing assigned to you" : "No issues logged",
                          systemImage: "wrench.adjustable")
                        .font(.campSection)
                } description: {
                    // Staff in a group that can't see unassigned work will find this screen
                    // empty even when the camp has plenty of open issues. Saying so beats
                    // implying nothing exists.
                    Text(isFilteredStaffView
                         ? "You'll see issues here once they're assigned to you, plus anything you report yourself."
                         : "When something breaks, log it here so the right person picks it up.")
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
