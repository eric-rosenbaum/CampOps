import Foundation
import Combine

@MainActor
final class IssueListViewModel: ObservableObject {
    @Published var issues: [Issue] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText = ""
    @Published var filterStatus: IssueStatus? = nil
    @Published var filterPriority: Priority? = nil

    var filteredIssues: [Issue] {
        var result = issues
        if !searchText.isEmpty {
            let q = searchText.lowercased()
            result = result.filter {
                $0.title.lowercased().contains(q) ||
                ($0.description?.lowercased().contains(q) ?? false) ||
                $0.locations.contains { $0.lowercased().contains(q) }
            }
        }
        if let s = filterStatus   { result = result.filter { $0.status == s } }
        if let p = filterPriority { result = result.filter { $0.priority == p } }
        return result.sorted { $0.priority.sortOrder < $1.priority.sortOrder }
    }

    /// True when the list on screen came off the disk rather than the server.
    @Published private(set) var isShowingCachedCopy = false

    func load() async {
        isLoading = true; errorMessage = nil
        do {
            issues = try await DataService.shared.fetchIssues()
            isShowingCachedCopy = false
            await SyncEngine.shared.cacheFetched(issues, table: SyncTable.issues)
        } catch {
            // No signal on a cold launch. An empty list here does not mean "no issues", it means
            // "we could not ask", and those are very different statements to put in front of
            // somebody about to start their rounds. Fall back to the last snapshot the sync
            // engine pulled, which already has any unsent local change laid over the top.
            let campId = AuthManager.shared.currentCamp?.id ?? ""
            let cached = campId.isEmpty ? [] : await OfflineReads.issues(campId: campId)
            if cached.isEmpty {
                errorMessage = error.localizedDescription
            } else {
                issues = cached
                isShowingCachedCopy = true
            }
        }
        isLoading = false
    }

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
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name,
                                  action: "\(user.name) unassigned themselves")
        issues[idx].activity.append(entry)
        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title, assigneeId: nil, status: .unassigned
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    func takeIssue(_ issue: Issue, by user: CampUser) async {
        guard let idx = issues.firstIndex(where: { $0.id == issue.id }) else { return }
        issues[idx].assigneeId = user.id
        issues[idx].status = .assigned
        issues[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name,
                                  action: "\(user.name) took this issue")
        issues[idx].activity.append(entry)
        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title, assigneeId: user.id, status: .assigned
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    func refresh() async {
        guard let fresh = try? await DataService.shared.fetchIssues() else { return }
        issues = fresh
        await SyncEngine.shared.cacheFetched(fresh, table: SyncTable.issues)
    }
}
