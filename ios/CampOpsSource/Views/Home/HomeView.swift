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
                    myTasks
                }
                .padding(Spacing.lg)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Camp Ops")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingProfile = true } label: {
                        AvatarCircle(initials: userManager.currentUser.initials, size: 32)
                    }
                }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileView()
                    .environmentObject(userManager)
            }
        }
        .task {
            if issueVM.issues.isEmpty { await issueVM.load() }
            if checklistVM.tasks.isEmpty { await checklistVM.load() }
        }
    }

    // MARK: - Greeting

    private var greetingHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Good \(timeOfDayGreeting), \(userManager.currentUser.firstName)")
                .font(.title2.weight(.bold))
                .foregroundColor(.forest)
            Text(userManager.currentUser.role.displayName)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }

    private var timeOfDayGreeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "morning" }
        if hour < 17 { return "afternoon" }
        return "evening"
    }

    // MARK: - Stats

    private var statsGrid: some View {
        let openIssues   = issueVM.issues.filter { $0.status != .resolved }
        let urgentIssues = openIssues.filter { $0.priority == .urgent }
        let myTasks      = checklistVM.tasks.filter { $0.assignedToId == userManager.currentUser.id && $0.status != .complete }
        let overdueTasks = myTasks.filter { $0.dueDateRelative?.overdue == true }

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.md) {
            StatCard(label: "Open Issues",    value: "\(openIssues.count)",   icon: "wrench.adjustable",     color: .forestMid)
            StatCard(label: "Urgent",         value: "\(urgentIssues.count)", icon: "exclamationmark.circle", color: .priorityUrgent)
            StatCard(label: "My Tasks",       value: "\(myTasks.count)",      icon: "checkmark.circle",       color: .sage)
            StatCard(label: "Overdue",        value: "\(overdueTasks.count)", icon: "clock.badge.exclamationmark", color: overdueTasks.isEmpty ? .secondary : .priorityUrgent)
        }
    }

    // MARK: - Recent issues

    private var recentIssues: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Recent Issues")
                .font(.headline.weight(.semibold))
                .foregroundColor(.forest)

            let recent = issueVM.issues.filter { $0.status != .resolved }.prefix(3)
            if recent.isEmpty {
                Text("No open issues")
                    .font(.subheadline).foregroundColor(.secondary)
                    .padding(.vertical, Spacing.sm)
            } else {
                ForEach(Array(recent)) { issue in
                    NavigationLink(value: issue) {
                        IssueRow(issue: issue)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationDestination(for: Issue.self) { issue in
            IssueDetailView(issue: issue)
                .environmentObject(issueVM)
        }
    }

    // MARK: - My tasks

    private var myTasks: some View {
        let mine = checklistVM.tasks.filter {
            $0.assignedToId == userManager.currentUser.id && $0.status != .complete
        }.prefix(3)

        return VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("My Tasks")
                .font(.headline.weight(.semibold))
                .foregroundColor(.forest)

            if mine.isEmpty {
                Text("No tasks assigned to you")
                    .font(.subheadline).foregroundColor(.secondary)
                    .padding(.vertical, Spacing.sm)
            } else {
                ForEach(Array(mine)) { task in
                    NavigationLink(value: task.id) {
                        ChecklistTaskRow(task: task)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationDestination(for: String.self) { taskId in
            ChecklistDetailView(taskId: taskId)
                .environmentObject(userManager)
                .environmentObject(checklistVM)
        }
    }
}

// MARK: - Stat card

private struct StatCard: View {
    let label: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundColor(color)
                Spacer()
            }
            Text(value)
                .font(.title.weight(.bold))
                .foregroundColor(color)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .shadow(color: Color.black.opacity(0.05), radius: 3, x: 0, y: 2)
    }
}
