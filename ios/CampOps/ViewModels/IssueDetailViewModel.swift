import Foundation
import Combine

/// One work order, open on screen.
///
/// Every write here goes through `MutationQueue` rather than straight to PostgREST. This is the
/// screen a maintenance lead is looking at when they finish a job, and the job is frequently
/// finished somewhere with no signal - a pump house, a basement, the far end of a field. A tap
/// that only works with bars is a tap that does not work.
///
/// Note what is deliberately absent: the rollback. The old code optimistically applied a change
/// and undid it if the request failed, which is right when the request is the only chance the
/// change gets. It is wrong once there is a queue: the change has not failed, it is waiting, and
/// snapping the status back to Assigned in front of somebody who just closed the job tells them
/// a lie. If it truly cannot be saved, it surfaces in the sync pill with its text intact.
@MainActor
final class IssueDetailViewModel: ObservableObject {
    @Published var issue: Issue
    @Published var isSaving = false
    @Published var errorMessage: String?

    init(issue: Issue) { self.issue = issue }

    func updateStatus(_ status: IssueStatus, by user: CampUser) async {
        issue.status = status
        issue.updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                  userName: user.name, action: "Changed status to \(status.displayName)")
        issue.activity.append(entry)

        // Two mutations, not one. `sync_push` applies them individually, so a rejected activity
        // row cannot take the status change down with it.
        await SyncEngine.shared.queueIssueStatus(issueId: issue.id, title: issue.title, status: status)
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    func assign(to user: CampUser?, by actor: CampUser) async {
        issue.assigneeId = user?.id
        issue.status = user != nil ? .assigned : .unassigned
        issue.updatedAt = Date()
        let action = user != nil ? "Assigned to \(user!.name)" : "Unassigned"
        let entry = ActivityEntry(id: UUID().uuidString, userId: actor.id, userName: actor.name, action: action)
        issue.activity.append(entry)

        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title,
            assigneeId: user?.id, status: issue.status
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// Closing the work order. The single most important write in the app to get right offline.
    func resolve(actualCost: Double?, by user: CampUser) async {
        issue.status = .resolved
        issue.actualCost = actualCost
        issue.updatedAt = Date()
        let action = actualCost != nil
            ? "Resolved, actual cost $\(String(format: "%.2f", actualCost!))"
            : "Resolved"
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name, action: action)
        issue.activity.append(entry)

        await SyncEngine.shared.queueIssueResolution(
            issueId: issue.id, title: issue.title, actualCost: actualCost
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
        Haptics.success()
    }

    /// Pull-to-refresh. On failure it keeps what is on screen rather than blanking it: the
    /// offline cache has already had any unsent local change laid over it, so what the person is
    /// looking at is the best available answer either way.
    func refresh() async {
        guard let fresh = try? await DataService.shared.fetchIssue(id: issue.id) else { return }
        issue = fresh
    }

    func applyEdit(_ updated: Issue) { issue = updated }
}
