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

    /// Hand the job to a person.
    ///
    /// Clears the crew in the same write: a job sits with a person or a crew and never both.
    func assign(to user: CampUser?, by actor: CampUser) async {
        issue.assigneeId = user?.id
        issue.assigneeGroupId = nil
        issue.status = user != nil ? .assigned : .unassigned
        issue.updatedAt = Date()
        let action = user != nil ? "Assigned to \(user!.name)" : "Unassigned"
        let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: actor.id,
                                  userName: actor.name, action: action)
        issue.activity.append(entry)

        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title,
            assigneeId: user?.id, assigneeGroupId: nil, status: issue.status
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// Hand the job to a crew rather than a person.
    ///
    /// It stays `unassigned`, because nobody has taken it -- that is what keeps it on the board
    /// for the crew to pick up.
    func assign(toCrew crew: StaffGroup, by actor: CampUser) async {
        issue.assigneeId = nil
        issue.assigneeGroupId = crew.id
        issue.status = .unassigned
        issue.updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: actor.id,
                                  userName: actor.name, action: "Sent to \(crew.name)")
        issue.activity.append(entry)

        await SyncEngine.shared.queueIssueAssignment(
            issueId: issue.id, title: issue.title,
            assigneeId: nil, assigneeGroupId: crew.id, status: .unassigned
        )
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// The contractor the job is waiting on.
    func setVendor(_ vendor: ServiceVendor?, by actor: CampUser) async {
        issue.vendorId = vendor?.id
        issue.updatedAt = Date()
        // The wording depends on the state, exactly as on the web: naming a vendor on a job
        // that is already waiting is a different event from calling one in.
        let action: String
        if let vendor {
            action = issue.status.isStalled ? "Waiting on \(vendor.name)" : "Called in \(vendor.name)"
        } else {
            action = "Cleared the vendor"
        }
        let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: actor.id,
                                  userName: actor.name, action: action)
        issue.activity.append(entry)
        await SyncEngine.shared.queueIssueVendor(issueId: issue.id, title: issue.title,
                                                 vendorId: vendor?.id)
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// Time spent, in minutes. Optional everywhere: closing a job never requires a field.
    func setMinutes(_ minutes: Int?) async {
        issue.minutesSpent = minutes
        await SyncEngine.shared.queueIssueMinutes(issueId: issue.id, title: issue.title,
                                                  minutes: minutes)
    }

    /// Put a closed job back in the queue.
    func reopen(by user: CampUser) async {
        issue.status = .inProgress
        issue.updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                  userName: user.name, action: "Reopened this")
        issue.activity.append(entry)
        await SyncEngine.shared.queueIssueStatus(issueId: issue.id, title: issue.title,
                                                 status: .inProgress)
        await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
    }

    /// Closing the work order. The single most important write in the app to get right offline.
    func resolve(actualCost: Double?, minutes: Int? = nil, by user: CampUser) async {
        issue.status = .resolved
        issue.actualCost = actualCost
        if let minutes { issue.minutesSpent = minutes }
        issue.updatedAt = Date()
        let action = actualCost != nil
            ? "Resolved, actual cost $\(String(format: "%.2f", actualCost!))"
            : "Resolved"
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name, action: action)
        issue.activity.append(entry)

        await SyncEngine.shared.queueIssueResolution(
            issueId: issue.id, title: issue.title, actualCost: actualCost
        )
        if let minutes {
            await SyncEngine.shared.queueIssueMinutes(issueId: issue.id, title: issue.title,
                                                      minutes: minutes)
        }
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
