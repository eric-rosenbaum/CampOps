import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @EnvironmentObject private var checklistVM: ChecklistViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    greetingHeader
                    statsGrid
                    myWorkSection
                    recentIssues
                }
                .padding(Spacing.lg)
                .id(authManager.currentUser.id)
                .navigationDestination(for: Issue.self) { issue in
                    IssueDetailView(issue: issue).environmentObject(issueVM)
                }
                .navigationDestination(for: String.self) { taskId in
                    ChecklistDetailView(taskId: taskId)
                        .environmentObject(authManager)
                        .environmentObject(checklistVM)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Camp Command")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    UserMenuButton()
                }
            }
        }
        .task(id: authManager.currentUser.id) {
            if issueVM.issues.isEmpty { await issueVM.load() }
            await checklistVM.load()
        }
    }

    // MARK: - Subviews

    private var greetingHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Good \(greeting), \(authManager.currentUser.firstName)")
                .font(.title2.weight(.bold)).foregroundColor(.forest)
            Text(authManager.currentMember?.role.displayName ?? "")
                .font(.subheadline).foregroundColor(.secondary)
        }
    }

    private var statsGrid: some View {
        let uid = authManager.currentUser.id
        let openIssues = issueVM.issues.filter { $0.status != .resolved }
        let urgent = openIssues.filter { $0.priority == .urgent }
        let myIssues = openIssues.filter { $0.assigneeId == uid }
        let myTasks = checklistVM.tasks.filter { $0.assigneeId == uid && $0.status != .complete }
        let overdue = myTasks.filter { $0.dueDateRelative?.overdue == true }
        let myWorkCount = myIssues.count + myTasks.count
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.md) {
            StatCard(label: "Open Issues",  value: "\(openIssues.count)", icon: "wrench.adjustable",           color: .forestMid)
            StatCard(label: "Urgent",       value: "\(urgent.count)",     icon: "exclamationmark.circle",      color: .priorityUrgent)
            StatCard(label: "My Work",      value: "\(myWorkCount)",      icon: "checkmark.circle",            color: .sage)
            StatCard(label: "Overdue",      value: "\(overdue.count)",    icon: "clock.badge.exclamationmark", color: overdue.isEmpty ? .secondary : .priorityUrgent)
        }
    }

    private var myWorkSection: some View {
        let uid = authManager.currentUser.id
        let myIssues = Array(
            issueVM.issues
                .filter { $0.assigneeId == uid && $0.status != .resolved }
                .sorted { $0.priority.sortOrder < $1.priority.sortOrder }
                .prefix(5)
        )
        let myTasks = Array(
            checklistVM.tasks
                .filter { $0.assigneeId == uid && $0.status != .complete }
                .prefix(5)
        )
        let bothPresent = !myIssues.isEmpty && !myTasks.isEmpty

        return VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("My Work").font(.headline.weight(.semibold)).foregroundColor(.forest)

            if myIssues.isEmpty && myTasks.isEmpty {
                Text("Nothing assigned to you")
                    .font(.subheadline).foregroundColor(.secondary)
                    .padding(.vertical, Spacing.sm)
            } else {
                if !myIssues.isEmpty {
                    if bothPresent {
                        Text("ISSUES")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.secondary)
                            .padding(.top, 2)
                    }
                    ForEach(myIssues) { issue in
                        NavigationLink(value: issue) {
                            IssueRow(issue: issue)
                        }.buttonStyle(.plain)
                    }
                }

                if !myTasks.isEmpty {
                    if bothPresent {
                        Text("TASKS")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.secondary)
                            .padding(.top, 4)
                    }
                    ForEach(myTasks) { task in
                        NavigationLink(value: task.id) {
                            ChecklistTaskRow(task: task)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var recentIssues: some View {
        let recent = Array(issueVM.issues.filter { $0.status != .resolved }.prefix(3))
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Recent Issues").font(.headline.weight(.semibold)).foregroundColor(.forest)
            if recent.isEmpty {
                Text("No open issues")
                    .font(.subheadline).foregroundColor(.secondary)
                    .padding(.vertical, Spacing.sm)
            } else {
                ForEach(recent) { issue in
                    NavigationLink(value: issue) { IssueRow(issue: issue) }.buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Helpers

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        if h < 12 { return "morning" }
        if h < 17 { return "afternoon" }
        return "evening"
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
