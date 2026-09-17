import SwiftUI

/// Where a scanned sticker lands: one place, and everything about it.
///
/// This is the screen the whole scanning feature exists for. Somebody is standing in front of a
/// cabin door with a phone in one hand. They need three things and nothing else: what is already
/// open here, a way to add something, and a way to mark one done. Anything past that is a
/// scrolling exercise performed one-handed in the rain.
///
/// Everything renders from the offline cache, because a sticker is on a door and doors are where
/// the signal is worst.
struct ScannedTargetSheet: View {
    let target: DeepLinkRouter.ScannedTarget

    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @EnvironmentObject private var campground: CampgroundStore
    @Environment(\.dismiss) private var dismiss

    @State private var isCapturing = false
    @State private var openIssue: Issue?
    /// The work order just marked done, held for a few seconds so it can be undone.
    @State private var justClosed: Issue?
    @State private var undoTask: Task<Void, Never>?

    private var here: [Issue] {
        let all = issueVM.visible
        if target.isAsset {
            return all.filter { $0.assetId == target.targetId }
        }
        return all.filter { $0.locationIds.contains(target.targetId) }
    }

    private var openHere: [Issue] {
        here.filter(\.isOpen).sorted { $0.priority.sortOrder < $1.priority.sortOrder }
    }

    private var routinesHere: [WorkSchedule] {
        target.isAsset
            ? campground.schedules.filter { $0.assetId == target.targetId }
            : campground.schedules(atLocation: target.targetId)
    }

    /// "Boys Side › Cabin 7", without the place itself on the end.
    private var ancestorPath: String? {
        let parts = LocationStore.shared.path(of: target.targetId).components(separatedBy: " › ")
        guard parts.count > 1 else { return nil }
        return parts.dropLast().joined(separator: " › ")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    header
                    actions
                    openWork
                    if !routinesHere.isEmpty { routines }
                    if !here.filter({ !$0.isOpen }).isEmpty { recentlyDone }
                }
                .padding(Spacing.lg)
            }
            .campCanvas()
            .navigationTitle(target.targetName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationDestination(item: $openIssue) { issue in
                IssueDetailView(issue: issue)
            }
            .sheet(isPresented: $isCapturing) {
                CaptureSheet(
                    locationId: target.isAsset ? nil : target.targetId,
                    locationName: target.isAsset ? nil : target.targetName,
                    assetId: target.isAsset ? target.targetId : nil,
                    assetName: target.isAsset ? target.targetName : nil
                )
            }
            .safeAreaInset(edge: .bottom) {
                if let justClosed { undoBar(for: justClosed) }
            }
        }
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Label(target.isAsset ? "Equipment" : "Location", systemImage: target.isAsset ? "wrench.and.screwdriver" : "mappin.and.ellipse")
                .font(.campLabel)
                .foregroundStyle(Color.forest.opacity(0.55))
            Text(target.targetName).font(.campDisplay)
            // Where it sits in the tree, ancestors only. `path(of:)` ends with the location
            // itself, and printing that under a heading that already says it just reads as a
            // rendering bug.
            if !target.isAsset, let ancestors = ancestorPath, !ancestors.isEmpty {
                Text(ancestors).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }
            Text(openHere.isEmpty ? "Nothing open here" : "\(openHere.count) open here")
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
    }

    private var actions: some View {
        VStack(spacing: Spacing.sm) {
            if authManager.can.createIssue {
                // One button. Photo, voice and "just type it" all live behind it, with this
                // place already filled in whichever way they go.
                Button {
                    Haptics.tap()
                    isCapturing = true
                } label: {
                    Label("Log something here", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.campPrimary())
            }
        }
    }

    private var openWork: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Open here")
            if openHere.isEmpty {
                Text("Nothing is open at this spot.")
                    .font(.campBody)
                    .foregroundStyle(Color.forest.opacity(0.55))
                    .padding(.vertical, Spacing.sm)
            }
            ForEach(openHere) { issue in
                VStack(spacing: 0) {
                    Button {
                        openIssue = issue
                    } label: {
                        IssueRow(issue: issue, hasUnread: issueVM.unreadIssueIds.contains(issue.id))
                    }
                    .buttonStyle(.plain)

                    if authManager.can.markResolved {
                        HStack {
                            Spacer()
                            Button("Mark done") { close(issue) }
                                .buttonStyle(.campChip(filled: true))
                        }
                        .padding(.top, Spacing.xs)
                    }
                }
            }
        }
    }

    private var routines: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Routines here")
            ForEach(routinesHere) { schedule in
                VStack(alignment: .leading, spacing: 2) {
                    Text(schedule.title).font(.campBodySemibold)
                    HStack(spacing: Spacing.xs) {
                        CrewPill(trade: schedule.trade)
                        Text(schedule.cadenceLabel)
                            .font(.campMeta)
                            .foregroundStyle(Color.forest.opacity(0.55))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface()
            }
        }
    }

    private var recentlyDone: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Recently done")
            ForEach(here.filter { !$0.isOpen }.prefix(3)) { issue in
                Button { openIssue = issue } label: {
                    IssueRow(issue: issue)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func undoBar(for issue: Issue) -> some View {
        HStack {
            Text("Marked done").font(.campMeta)
            Spacer()
            Button("Undo") { undo(issue) }
                .font(.campLabel)
                .buttonStyle(.plain)
                .underline()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .background(Color.forestFill)
        .foregroundStyle(Color.ccCream)
    }

    // MARK: - Closing one out

    /// One tap closes it, with five seconds to take it back.
    ///
    /// The undo is not politeness. This button is pressed with a thumb, outdoors, on a list of
    /// similar-looking jobs, and the alternative to an undo window is a confirmation dialog on
    /// the single most common action in the app.
    private func close(_ issue: Issue) {
        Haptics.success()
        let detail = IssueDetailViewModel(issue: issue)
        Task {
            await detail.resolve(actualCost: nil, by: authManager.currentUser)
            issueVM.apply(detail.issue)
        }
        justClosed = issue
        undoTask?.cancel()
        undoTask = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            justClosed = nil
        }
    }

    private func undo(_ issue: Issue) {
        undoTask?.cancel()
        justClosed = nil
        let detail = IssueDetailViewModel(issue: issue)
        Task {
            await detail.updateStatus(issue.status, by: authManager.currentUser)
            issueVM.apply(detail.issue)
        }
    }
}
