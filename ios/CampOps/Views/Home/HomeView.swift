import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @EnvironmentObject private var checklistVM: ChecklistViewModel
    @State private var showingProfile = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    greetingHeader
                    statsGrid
                    recentIssues
                    myTasksSection
                }
                .padding(Spacing.lg)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Camp Ops")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingProfile = true } label: {
                        AvatarCircle(initials: userManager.currentUser.initials, size: 32)
                    }
                }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileView().environmentObject(userManager)
            }
        }
        .task {
            if issueVM.issues.isEmpty { await issueVM.load() }
            if checklistVM.tasks.isEmpty { await checklistVM.load() }
        }
    }

    private var greetingHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Good \(greeting), \(userManager.currentUser.firstName)")
                .font(.title2.weight(.bold)).foregroundColor(.forest)
            Text(userManager.currentUser.role.displayName)
                .font(.subheadline).foregroundColor(.secondary)
        }
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        if h < 12 { return "morning" }
        if h < 17 { return "afternoon" }
        return "evening"
    }

    private var statsGrid: some View {
        let open    = issueVM.issues.filter { $0.status != .resolved }
        let urgent  = open.filter { $0.priority == .urgent }
        let mine    = checklistVM.tasks.filter { $0.assigneeId == userManager.currentUser.id && $0.status != .complete }
        let overdue = mine.filter { $0.dueDateRelative?.overdue == true }
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.md) {
            StatCard(label: "Open Issues",  value: "\(open.count)",    icon: "wrench.adjustable",           color: .forestMid)
            StatCard(label: "Urgent",       value: "\(urgent.count)",  icon: "exclamationmark.circle",      color: .priorityUrgent)
            StatCard(label: "My Tasks",     value: "\(mine.count)",    icon: "checkmark.circle",            color: .sage)
            StatCard(label: "Overdue",      value: "\(overdue.count)", icon: "clock.badge.exclamationmark", color: overdue.isEmpty ? .secondary : .priorityUrgent)
        }
    }

    private var recentIssues: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Recent Issues").font(.headline.weight(.semibold)).foregroundColor(.forest)
            let recent = issueVM.issues.filter { $0.status != .resolved }.prefix(3)
            if recent.isEmpty {
                Text("No open issues").font(.subheadline).foregroundColor(.secondary).padding(.vertical, Spacing.sm)
            } else {
                ForEach(Array(recent)) { issue in
                    NavigationLink(value: issue) { IssueRow(issue: issue) }.buttonStyle(.plain)
                }
            }
        }
        .navigationDestination(for: Issue.self) { issue in
            IssueDetailView(issue: issue).environmentObject(issueVM)
        }
    }

    private var myTasksSection: some View {
        let mine = checklistVM.tasks.filter {
            $0.assigneeId == userManager.currentUser.id && $0.status != .complete
        }.prefix(3)
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("My Tasks").font(.headline.weight(.semibold)).foregroundColor(.forest)
            if mine.isEmpty {
                Text("No tasks assigned to you").font(.subheadline).foregroundColor(.secondary).padding(.vertical, Spacing.sm)
            } else {
                ForEach(Array(mine)) { task in
                    NavigationLink(value: task.id) { ChecklistTaskRow(task: task) }.buttonStyle(.plain)
                }
            }
        }
        .navigationDestination(for: String.self) { taskId in
            ChecklistDetailView(taskId: taskId).environmentObject(userManager).environmentObject(checklistVM)
        }
    }
}

private struct StatCard: View {
    let label: String; let value: String; let icon: String; let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack { Image(systemName: icon).font(.subheadline).foregroundColor(color); Spacer() }
            Text(value).font(.title.weight(.bold)).foregroundColor(color)
            Text(label).font(.caption).foregroundColor(.secondary)
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .shadow(color: Color.black.opacity(0.05), radius: 3, x: 0, y: 2)
    }
}
