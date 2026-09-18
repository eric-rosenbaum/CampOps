import SwiftUI

/// The first screen of a shift.
///
/// Not a dashboard. The question it answers is "what am I doing next", so it leads with the two
/// buttons somebody uses while walking -- scan a sticker, log what they are looking at -- and
/// then lists their own work, overdue first. Camp-wide numbers sit underneath, because they are
/// context rather than instruction.
struct HomeView: View {
    var onScan: (() -> Void)?

    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @Environment(\.scenePhase) private var scenePhase

    @State private var isCapturing = false
    @State private var isLogging = false
    @State private var openIssue: Issue?

    /// Whether this camp has Campground at all. Home is the one screen every camp sees, so it
    /// has to hold its tongue about work orders in a camp that does not have them -- a founder
    /// opening a kitchen-only camp should not be told it has four overdue repairs.
    private var hasCampground: Bool { authManager.canAccessModule("issues") }

    private var me: String { authManager.currentUser.id }
    private var today: String { CampDate.today() }

    private var myWork: [Issue] {
        issueVM.visible
            .filter { $0.isOpen && $0.assigneeId == me }
            .sorted { lhs, rhs in
                let l = lhs.isOverdue(today: today) ? 0 : 1
                let r = rhs.isOverdue(today: today) ? 0 : 1
                if l != r { return l < r }
                return lhs.priority.sortOrder < rhs.priority.sortOrder
            }
    }

    /// Work waiting for this person's crews, which is what they can pick up.
    private var upForGrabs: [Issue] {
        guard authManager.issuesSeeUnassigned else { return [] }
        let mine = Set(authManager.myCrewIds)
        return issueVM.visible.filter {
            $0.isOpen && $0.assigneeId == nil
                && ($0.assigneeGroupId == nil || mine.contains($0.assigneeGroupId ?? ""))
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    greeting
                    if hasCampground {
                        quickActions
                        if !myWork.isEmpty { mySection }
                        if !upForGrabs.isEmpty { grabsSection }
                        if myWork.isEmpty && upForGrabs.isEmpty { allClear }
                        campNumbers
                    } else {
                        noCampground
                    }
                }
                .padding(Spacing.lg)
            }
            .refreshable { await issueVM.refresh() }
            .campCanvas()
            .navigationTitle(authManager.currentCamp?.name ?? "CampCommand")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { UserMenuButton() }
            }
            .navigationDestination(item: $openIssue) { issue in
                IssueDetailView(issue: issue)
            }
            .sheet(isPresented: $isCapturing) { CaptureSheet() }
            .sheet(isPresented: $isLogging) { LogIssueView() }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(timeOfDayGreeting).font(.campHero)
            Text(Date().formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
    }

    private var timeOfDayGreeting: String {
        let name = authManager.currentUser.name.split(separator: " ").first.map(String.init) ?? "Hello"
        switch Calendar.current.component(.hour, from: Date()) {
        case 0..<12:  return "Morning, \(name)"
        case 12..<17: return "Afternoon, \(name)"
        default:      return "Evening, \(name)"
        }
    }

    /// Scan, AI, Log -- the same three doors as the board's toolbar, so the gesture that logs
    /// something is the same wherever you start from.
    private var quickActions: some View {
        HStack(spacing: Spacing.sm) {
            if let onScan {
                quickAction(icon: "qrcode.viewfinder", title: "Scan", primary: false) {
                    onScan()
                }
            }
            if authManager.can.createIssue {
                quickAction(icon: "sparkles", title: "AI", primary: false) {
                    isCapturing = true
                }
                quickAction(icon: "square.and.pencil", title: "Log", primary: true) {
                    isLogging = true
                }
            }
        }
    }

    @ViewBuilder
    private func quickAction(icon: String, title: String, primary: Bool,
                             action: @escaping () -> Void) -> some View {
        let label = VStack(spacing: Spacing.xs) {
            Image(systemName: icon).font(.system(size: 22))
            Text(title).font(.campLabel)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.lg)

        if primary {
            Button { Haptics.tap(); action() } label: { label }
                .buttonStyle(.campPrimary())
        } else {
            Button { Haptics.tap(); action() } label: { label }
                .buttonStyle(.campSecondary)
        }
    }

    private var mySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Yours")
            ForEach(myWork) { issue in
                Button { openIssue = issue } label: {
                    IssueRow(issue: issue, today: today,
                             hasUnread: issueVM.unreadIssueIds.contains(issue.id))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var grabsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Up for grabs")
            ForEach(upForGrabs.prefix(5)) { issue in
                Button { openIssue = issue } label: {
                    IssueRow(
                        issue: issue, today: today,
                        hasUnread: issueVM.unreadIssueIds.contains(issue.id),
                        onTakeIt: authManager.can.assign ? { take(issue) } : nil
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func take(_ issue: Issue) {
        Task { await issueVM.takeIssue(issue, by: authManager.currentUser) }
    }

    /// A camp without Campground still gets a front door, and an honest one.
    private var noCampground: some View {
        VStack(spacing: Spacing.sm) {
            Image(systemName: "leaf")
                .font(.system(size: 32))
                .foregroundStyle(Color.sage.opacity(0.6))
            Text("Nothing to do here yet").font(.campTitle)
            Text("This camp does not have the Campground module switched on.")
                .font(.campBody)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xl)
    }

    private var allClear: some View {
        VStack(spacing: Spacing.sm) {
            Image(systemName: "leaf")
                .font(.system(size: 32))
                .foregroundStyle(Color.sage.opacity(0.6))
            Text("Nothing waiting on you").font(.campTitle)
            Text("Scan a sticker if you spot something out on your rounds.")
                .font(.campBody)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xl)
    }

    private var campNumbers: some View {
        let counts = issueVM.counts
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Across camp")
            HStack(spacing: Spacing.sm) {
                StatTile(value: counts.open, label: "Open", tint: .forest)
                StatTile(value: counts.urgent, label: "Urgent", tint: .priorityUrgent)
                StatTile(value: counts.overdue, label: "Overdue", tint: .priorityHigh)
            }
        }
    }
}
