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
            .campCanvas()
            .refreshable {
                async let i: Void = issueVM.refresh()
                async let c: Void = checklistVM.refresh()
                _ = await (i, c)
            }
            .navigationTitle("CampCommand")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { campHeader }
                ToolbarItem(placement: .primaryAction) { UserMenuButton() }
            }
        }
        .task(id: authManager.currentUser.id) {
            if issueVM.issues.isEmpty { await issueVM.load() }
            await checklistVM.load()
        }
    }

    // The camp's own identity in the title bar — its logo when it has one, otherwise a
    // wordmark. `logoUrl` was fetched but never shown anywhere in the app before.
    private var campHeader: some View {
        HStack(spacing: Spacing.sm) {
            if let logo = authManager.currentCamp?.logoUrl, let url = URL(string: logo) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.sagePale
                }
                .frame(width: 22, height: 22)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            } else {
                Image(systemName: "tree.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.sage)
            }
            Text(authManager.currentCamp?.name ?? "CampCommand")
                .font(.campBodySemibold)
                .foregroundStyle(Color.forest)
                .lineLimit(1)
        }
    }

    // MARK: - Helpers

    // Issues visible to the current user, respecting staff group filtering.
    private var visibleIssues: [Issue] {
        guard authManager.currentMember?.role == .staff else { return issueVM.issues }
        let uid = authManager.currentUser.id
        return issueVM.issues.filter { issue in
            issue.assigneeId == uid ||
            issue.reportedById == uid ||
            (authManager.issuesSeeUnassigned && issue.assigneeId == nil)
        }
    }

    // MARK: - Subviews

    private var greetingHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Good \(greeting), \(authManager.currentUser.firstName)")
                .font(.campDisplay)
                .foregroundStyle(Color.forest)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Text(todayLabel)
                .font(.campSecondary)
                .foregroundStyle(Color.forest.opacity(0.5))
        }
    }

    private var todayLabel: String {
        let f = DateFormatter()
        f.dateFormat = "EEEE, MMMM d"
        return f.string(from: Date())
    }

    private var statsGrid: some View {
        let uid = authManager.currentUser.id
        // The two left-hand tiles report the CAMP's state, not the viewer's slice of it.
        // A counselor who can't open every issue should still know whether the camp has 3
        // open or 30 — that's situational awareness, not access to the detail. The list
        // itself stays filtered; only these counts are camp-wide.
        let openIssues = issueVM.issues.filter { $0.status != .resolved }
        let urgent = openIssues.filter { $0.priority == .urgent }
        let myIssues = visibleIssues.filter { $0.status != .resolved && $0.assigneeId == uid }
        let myTasks = checklistVM.tasks.filter { $0.assigneeId == uid && $0.status != .complete }
        let overdue = myTasks.filter { $0.dueDateRelative?.overdue == true }
        let myWorkCount = myIssues.count + myTasks.count
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.md) {
            StatCard(label: "Open issues", hint: "Across the camp", value: "\(openIssues.count)", icon: "wrench.adjustable",           color: .forestMid)
            StatCard(label: "Urgent",      hint: "Across the camp", value: "\(urgent.count)",     icon: "exclamationmark.circle",      color: .priorityUrgent)
            StatCard(label: "My work",     hint: "Assigned to you", value: "\(myWorkCount)",      icon: "checkmark.circle",            color: .sage)
            StatCard(label: "Overdue",     hint: "Assigned to you", value: "\(overdue.count)",    icon: "clock.badge.exclamationmark", color: overdue.isEmpty ? .forestLight : .priorityUrgent)
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
            Text("My work").font(.campSection).foregroundStyle(Color.forest)

            if myIssues.isEmpty && myTasks.isEmpty {
                HomeEmptyState(
                    icon: "checkmark.circle",
                    title: "You're all clear",
                    message: "Nothing is assigned to you right now."
                )
            } else {
                if !myIssues.isEmpty {
                    if bothPresent {
                        SectionEyebrow(text: "Issues").padding(.top, 2)
                    }
                    ForEach(myIssues) { issue in
                        let isStaff = authManager.currentMember?.role == .staff
                        NavigationLink(value: issue) {
                            IssueRow(issue: issue,
                                     onUntake: isStaff
                                        ? { Task { await issueVM.untakeIssue(issue, by: authManager.currentUser) } }
                                        : nil)
                        }.buttonStyle(.plain)
                    }
                }

                if !myTasks.isEmpty {
                    if bothPresent {
                        SectionEyebrow(text: "Tasks").padding(.top, 4)
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
        let recent = Array(visibleIssues.filter { $0.status != .resolved }.prefix(3))
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Recent issues").font(.campSection).foregroundStyle(Color.forest)
            if recent.isEmpty {
                HomeEmptyState(
                    icon: "wrench.adjustable",
                    title: "No open issues",
                    message: "Everything reported has been resolved."
                )
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

/// Quiet in-card empty state. `ContentUnavailableView` is the right tool for a whole screen,
/// but it centres itself in the available space, which is wrong for a section inside a scroll.
private struct HomeEmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 17))
                .foregroundStyle(Color.sage)
                .frame(width: 36, height: 36)
                .background(Color.sagePale, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.campBodySemibold)
                    .foregroundStyle(Color.forest)
                Text(message)
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.5))
            }
            Spacer(minLength: 0)
        }
        .cardSurface()
    }
}

private struct StatCard: View {
    let label: String
    /// Says whose number this is. Without it, a camp-wide count sitting next to a personal
    /// one is just misleading — the viewer can't tell which is which.
    var hint: String? = nil
    let value: String; let icon: String; let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            // Icon sits in a tinted disc rather than floating, which gives the tiles a
            // consistent optical weight regardless of glyph shape.
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 32, height: 32)
                .background(color.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.campStat)
                    .monospacedDigit()
                    // Counts change on every refresh; roll them rather than snapping.
                    .contentTransition(.numericText())
                    .animation(.snappy(duration: 0.28), value: value)
                    .foregroundStyle(color)
                Text(label)
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.55))
                if let hint {
                    Text(hint)
                        .font(.campMicro)
                        .foregroundStyle(Color.forest.opacity(0.35))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}
