import Foundation
import Combine

/// The board.
///
/// Holds every work order this person is allowed to see, and the filters they narrow it with.
/// The visibility rule is the load-bearing part and it mirrors the web's exactly -- including
/// the clause that keeps somebody's own report in front of them, without which logging
/// something makes it vanish.
@MainActor
final class IssueListViewModel: ObservableObject {
    @Published var issues: [Issue] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText = ""
    @Published var filter: BoardFilter = .all
    /// Narrow to one crew. Nil means every crew this person can see.
    @Published var filterTrade: String? = nil

    /// The board's saved views, in the order the segmented control shows them.
    enum BoardFilter: String, CaseIterable, Identifiable {
        case all, mine, urgent, unassigned, waiting, done

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all:        return L10n.tr("All")
            case .mine:       return L10n.tr("Mine")
            case .urgent:     return L10n.tr("Urgent")
            case .unassigned: return L10n.tr("Up for grabs")
            case .waiting:    return L10n.tr("Waiting")
            case .done:       return L10n.tr("status.done")
            }
        }
    }

    /// Narrowed to one place because a sticker on its door was scanned. Held as id + name: the
    /// id is what filters (a location can be renamed mid-season), the name is what the banner
    /// says so the list never claims to be showing everything when it is not.
    @Published var scannedLocationId: String?
    @Published var scannedLocationName: String?

    func clearScannedLocation() {
        scannedLocationId = nil
        scannedLocationName = nil
    }

    // MARK: - Visibility

    /// What this person is allowed to see.
    ///
    /// Load-bearing, and copied clause for clause from the web. A staff member always keeps
    /// sight of what they reported, even when their crew cannot see unassigned work -- without
    /// that, logging something makes it disappear, which is the bug that once convinced a whole
    /// crew the app was eating their reports.
    var visible: [Issue] {
        let auth = AuthManager.shared
        guard auth.currentMember?.role == .staff else { return issues }
        let me = auth.currentUser.id
        let myCrewIds = Set(auth.myCrewIds)
        let seeUnassigned = auth.issuesSeeUnassigned
        let granted = CampgroundStore.shared.viewerGrants

        return issues.filter { issue in
            if issue.assigneeId == me { return true }
            if issue.reportedById == me { return true }
            // Work waiting for the whole camp, or waiting for this person's own crew. A crew
            // whose members cannot see what is waiting for them cannot pick anything up.
            if seeUnassigned, issue.assigneeId == nil,
               issue.assigneeGroupId == nil || myCrewIds.contains(issue.assigneeGroupId ?? "") {
                return true
            }
            // Somebody tagged them into this one and chose to open it. A narrow, recorded
            // exception: this work order and no other.
            return granted.contains(issue.id)
        }
    }

    var filteredIssues: [Issue] {
        let today = CampDate.today()
        var result = visible

        if let locId = scannedLocationId {
            result = result.filter { $0.locationIds.contains(locId) }
        }
        if let trade = filterTrade {
            result = result.filter { $0.trade == trade }
        }
        if !searchText.isEmpty {
            // Matches the words that were typed AND the translation on screen. Searching only
            // the original meant a reader could not find a work order by the words they had just
            // read on its card.
            let q = searchText.lowercased()
            let translations = ContentTranslations.shared
            result = result.filter { issue in
                let title = translations.searchable(.issues, id: issue.id, field: "title", original: issue.title)
                let details = issue.description.map {
                    translations.searchable(.issues, id: issue.id, field: "description", original: $0)
                } ?? ""
                return title.lowercased().contains(q)
                    || details.lowercased().contains(q)
                    || issue.locations.contains { $0.lowercased().contains(q) }
            }
        }

        let me = AuthManager.shared.currentUser.id
        switch filter {
        case .all:        result = result.filter(\.isOpen)
        case .mine:       result = result.filter { $0.isOpen && $0.assigneeId == me }
        case .urgent:     result = result.filter { $0.isOpen && $0.priority == .urgent }
        case .unassigned: result = result.filter { $0.isOpen && $0.assigneeId == nil }
        case .waiting:    result = result.filter { $0.status.isStalled }
        case .done:       result = result.filter { !$0.isOpen }
        }

        return result.sorted { compare($0, $1, today: today) }
    }

    /// Overdue first, then state, then priority, then how long it has been sitting.
    /// Mirrors `compareWorkOrders` on the web so both boards read in the same order.
    private func compare(_ a: Issue, _ b: Issue, today: String) -> Bool {
        let aLate = a.isOverdue(today: today) ? 0 : 1
        let bLate = b.isOverdue(today: today) ? 0 : 1
        if aLate != bLate { return aLate < bLate }
        if a.status.sortOrder != b.status.sortOrder { return a.status.sortOrder < b.status.sortOrder }
        if a.priority.sortOrder != b.priority.sortOrder { return a.priority.sortOrder < b.priority.sortOrder }
        return a.createdAt < b.createdAt
    }

    /// Counts for the stat row: what is open, what is shouting, what is stuck.
    var counts: (urgent: Int, open: Int, waiting: Int, overdue: Int) {
        let today = CampDate.today()
        let open = visible.filter(\.isOpen)
        return (
            urgent: open.filter { $0.priority == .urgent }.count,
            open: open.count,
            waiting: open.filter { $0.status.isStalled }.count,
            overdue: open.filter { $0.isOverdue(today: today) }.count
        )
    }

    /// Work orders that have said something since this person last looked: theirs, or ones they
    /// have already spoken on. A message you are waiting on should find you.
    @Published private(set) var unreadIssueIds: Set<String> = []

    func recomputeUnread(comments: [IssueComment]) {
        let me = AuthManager.shared.currentUser.id
        let readAt = CampgroundStore.shared.readAt
        var unread: Set<String> = []
        for comment in comments where comment.authorId != me && comment.deletedAt == nil {
            guard let issue = issues.first(where: { $0.id == comment.issueId }) else { continue }
            let involved = issue.assigneeId == me
                || issue.reportedById == me
                || comment.mentions.contains(me)
            guard involved else { continue }
            if let seen = readAt[issue.id], seen >= comment.createdAt { continue }
            unread.insert(issue.id)
        }
        unreadIssueIds = unread
    }

    /// True when the list on screen came off the disk rather than the server.
    @Published private(set) var isShowingCachedCopy = false

    // MARK: - Loading

    /// Cache first, then the network.
    ///
    /// Reversed from how this used to work, and the reason is signal: waiting on a request that
    /// will time out means staring at a spinner in exactly the buildings where work gets logged.
    /// The cached board is on screen in milliseconds and corrects itself when the reply lands.
    func load() async {
        isLoading = true; errorMessage = nil
        let campId = AuthManager.shared.currentCamp?.id ?? ""
        if !campId.isEmpty {
            let cached = await OfflineReads.issues(campId: campId)
            if !cached.isEmpty {
                issues = cached
                isShowingCachedCopy = true
                isLoading = false
            }
        }

        do {
            issues = try await DataService.shared.fetchIssues()
            isShowingCachedCopy = false
            await SyncEngine.shared.cacheFetched(issues, table: SyncTable.issues)
        } catch {
            // An empty list here does not mean "no work", it means "we could not ask", and
            // those are very different things to put in front of somebody starting their rounds.
            if issues.isEmpty { errorMessage = error.localizedDescription }
        }
        isLoading = false
    }

    func refresh() async {
        guard let fresh = try? await DataService.shared.fetchIssues() else { return }
        issues = fresh
        isShowingCachedCopy = false
        await SyncEngine.shared.cacheFetched(fresh, table: SyncTable.issues)
    }

    // MARK: - Acting on one

    /// Deliberately NOT queued. Deleting a work order also deletes its photo from storage, which
    /// needs the network anyway, and it is an office action rather than something anyone does
    /// while walking a trail. It keeps the old optimistic-with-rollback behaviour.
    func delete(issue: Issue) async {
        issues.removeAll { $0.id == issue.id }
        do {
            if let url = issue.photoUrl { try? await PhotoService.shared.deletePhoto(url: url) }
            try await DataService.shared.deleteIssue(id: issue.id)
        } catch {
            issues.append(issue)
            errorMessage = error.localizedDescription
        }
    }

    /// Taking and untaking are the two things a crew does from the list itself, standing in a
    /// doorway deciding what to pick up. Both go through the queue; neither rolls back on
    /// failure, because a chip that flips back under somebody's thumb is worse than a chip that
    /// stays put and a pill that says three changes are waiting.
    func untakeIssue(_ issue: Issue, by user: CampUser) async {
        guard let idx = issues.firstIndex(where: { $0.id == issue.id }) else { return }
        issues[idx].assigneeId = nil
        issues[idx].status = .unassigned
        issues[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                  userName: user.name, action: "\(user.name) put this back")
        issues[idx].activity.append(entry)
        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title,
            assigneeId: nil, assigneeGroupId: nil, status: .unassigned
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// Picking up a job.
    ///
    /// Clears the crew as well as naming the person. A job sits with one or the other and never
    /// both, so taking a crew-held job without clearing the crew is a write the database
    /// refuses -- which is still a live bug on the web's own "Take it" button, where the
    /// rejection only ever reached the console.
    func takeIssue(_ issue: Issue, by user: CampUser) async {
        guard let idx = issues.firstIndex(where: { $0.id == issue.id }) else { return }
        issues[idx].assigneeId = user.id
        issues[idx].assigneeGroupId = nil
        issues[idx].status = .assigned
        issues[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                  userName: user.name, action: "\(user.name) took this on")
        issues[idx].activity.append(entry)
        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title,
            assigneeId: user.id, assigneeGroupId: nil, status: .assigned
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// Applies a change made on the detail screen without waiting for a round trip.
    func apply(_ updated: Issue) {
        if let idx = issues.firstIndex(where: { $0.id == updated.id }) {
            issues[idx] = updated
        } else {
            issues.insert(updated, at: 0)
        }
    }
}
