import SwiftUI

/// The board.
///
/// Open work, newest trouble first, with the filters a crew actually uses standing in a doorway:
/// whose is it, which crew, and is anything on fire. Everything here renders from the offline
/// cache, so it is on screen before the network has been asked.
struct IssueListView: View {
    var onScan: (() -> Void)?

    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: IssueListViewModel
    @EnvironmentObject private var campground: CampgroundStore
    @ObservedObject private var push = PushService.shared

    @State private var isCapturing = false
    @State private var isLogging = false
    @State private var openIssue: Issue?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Spacing.md) {
                    if let name = vm.scannedLocationName { scannedBanner(name) }
                    stats
                    filters
                    list
                }
                .padding(Spacing.lg)
            }
            .refreshable { await vm.refresh() }
            .campCanvas()
            .navigationTitle("Work")
            .searchable(text: $vm.searchText, prompt: "Search work")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { UserMenuButton() }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if let onScan {
                        Button { onScan() } label: { Image(systemName: "qrcode.viewfinder") }
                            .accessibilityLabel(Text("Scan a sticker"))
                    }
                    if authManager.can.createIssue {
                        // Scan, AI, Log -- in that order, left to right. Three named doors
                        // rather than one that has to be opened before you can see what is
                        // behind it: photographing a thing, and typing a line about it, are
                        // different intentions and both are one tap.
                        Button { isCapturing = true } label: {
                            Image(systemName: "sparkles")
                        }
                        .accessibilityLabel(Text("Log with a photo or your voice"))

                        Button { isLogging = true } label: {
                            Image(systemName: "square.and.pencil")
                        }
                        .accessibilityLabel(Text("Log work"))
                    }
                }
            }
            .navigationDestination(item: $openIssue) { issue in
                IssueDetailView(issue: issue)
            }
            .sheet(isPresented: $isCapturing) { CaptureSheet() }
            .sheet(isPresented: $isLogging) { LogIssueView() }
            // A tapped notification names a work order: open it, then clear the request.
            .task(id: push.pendingWorkOrderId) {
                guard let id = push.pendingWorkOrderId else { return }
                if let match = vm.issues.first(where: { $0.id == id }) { openIssue = match }
                push.pendingWorkOrderId = nil
            }
        }
    }

    // MARK: - Pieces

    private func scannedBanner(_ name: String) -> some View {
        HStack {
            Label(L10n.tr("Showing %@", name), systemImage: "qrcode")
                .font(.campMeta)
            Spacer()
            Button("Show all") { vm.clearScannedLocation() }
                .font(.campLabel)
                .buttonStyle(.plain)
                .underline()
        }
        .padding(Spacing.md)
        .background(Color.sagePale, in: RoundedRectangle(cornerRadius: Radius.lg))
    }

    private var stats: some View {
        let counts = vm.counts
        return HStack(spacing: Spacing.sm) {
            StatTile(value: counts.urgent, label: "Urgent", tint: .priorityUrgent)
            StatTile(value: counts.open, label: "Open", tint: .forest)
            StatTile(value: counts.waiting, label: "Waiting", tint: .forestMid)
            StatTile(value: counts.overdue, label: "Overdue", tint: .priorityHigh)
        }
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.sm) {
                    ForEach(IssueListViewModel.BoardFilter.allCases) { option in
                        Button(option.label) {
                            Haptics.tap()
                            vm.filter = option
                        }
                        .buttonStyle(.campChip(filled: vm.filter == option))
                    }
                }
            }
            // The crew filter only earns its row when the camp has more than one crew.
            if campground.trades.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        Button("All crews") {
                            Haptics.tap()
                            vm.filterTrade = nil
                        }
                        .buttonStyle(.campChip(filled: vm.filterTrade == nil))
                        ForEach(campground.trades) { crew in
                            Button(crew.name) {
                                Haptics.tap()
                                vm.filterTrade = crew.key
                            }
                            .buttonStyle(.campChip(filled: vm.filterTrade == crew.key))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var list: some View {
        if vm.isLoading && vm.issues.isEmpty {
            ProgressView().frame(maxWidth: .infinity).padding(.top, Spacing.xl)
        } else if vm.filteredIssues.isEmpty {
            emptyState
        } else {
            ForEach(vm.filteredIssues) { issue in
                Button {
                    openIssue = issue
                } label: {
                    IssueRow(
                        issue: issue,
                        hasUnread: vm.unreadIssueIds.contains(issue.id),
                        onTakeIt: canTake(issue) ? { take(issue) } : nil,
                        onUntake: issue.assigneeId == authManager.currentUser.id
                            ? { untake(issue) }
                            : nil
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: vm.filter == .done ? "checkmark.seal" : "leaf")
                .font(.system(size: 34))
                .foregroundStyle(Color.sage.opacity(0.6))
            Text(emptyTitle).font(.campTitle)
            Text(emptyMessage)
                .font(.campBody)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xxl)
    }

    private var emptyTitle: String {
        switch vm.filter {
        case .done:       return L10n.tr("Nothing closed yet")
        case .mine:       return L10n.tr("Nothing on your plate")
        case .urgent:     return L10n.tr("Nothing urgent")
        case .unassigned: return L10n.tr("Nothing up for grabs")
        case .waiting:    return L10n.tr("Nothing is stuck")
        case .all:        return L10n.tr("All clear")
        }
    }

    private var emptyMessage: String {
        vm.searchText.isEmpty
            ? L10n.tr("Scan a sticker, or tap the pencil to log something.")
            : L10n.tr("Nothing matches “%@”.", vm.searchText)
    }

    private func take(_ issue: Issue) {
        Task { await vm.takeIssue(issue, by: authManager.currentUser) }
    }

    private func untake(_ issue: Issue) {
        Task { await vm.untakeIssue(issue, by: authManager.currentUser) }
    }

    /// Only work nobody holds can be taken, and only by somebody allowed to see it.
    private func canTake(_ issue: Issue) -> Bool {
        authManager.can.assign && issue.isOpen && issue.assigneeId == nil
    }
}

/// One number and what it counts.
struct StatTile: View {
    let value: Int
    let label: LocalizedStringKey
    var tint: Color = .forest

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value, format: .number.locale(L10n.locale)).font(.campDisplay).foregroundStyle(tint)
            Text(label).font(.campLabel).foregroundStyle(Color.forest.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}
