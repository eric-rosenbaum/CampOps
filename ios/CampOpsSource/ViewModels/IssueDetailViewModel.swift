import Foundation
import UIKit

@MainActor
final class IssueDetailViewModel: ObservableObject {
    @Published var issue: Issue
    @Published var isSaving = false
    @Published var errorMessage: String?

    init(issue: Issue) {
        self.issue = issue
    }

    // MARK: - Status updates

    func updateStatus(_ status: IssueStatus, by user: CampUser) async {
        let old = issue.status
        issue.status = status
        issue.updatedAt = Date()

        let entry = ActivityEntry(
            id: UUID().uuidString,
            userId: user.id,
            userName: user.name,
            action: "Changed status to \(status.displayName)"
        )
        issue.activity.append(entry)

        do {
            try await DataService.shared.updateIssue(issue)
            try await DataService.shared.insertIssueActivity(entry, issueId: issue.id)
        } catch {
            issue.status = old
            issue.activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Assignment

    func assign(to user: CampUser?, by actor: CampUser) async {
        let oldAssignee = issue.assignedToId
        let oldStatus   = issue.status
        issue.assignedToId = user?.id
        issue.status = user != nil ? .assigned : .unassigned
        issue.updatedAt = Date()

        let action = user != nil ? "Assigned to \(user!.name)" : "Unassigned"
        let entry = ActivityEntry(id: UUID().uuidString, userId: actor.id, userName: actor.name, action: action)
        issue.activity.append(entry)

        do {
            try await DataService.shared.updateIssue(issue)
            try await DataService.shared.insertIssueActivity(entry, issueId: issue.id)
        } catch {
            issue.assignedToId = oldAssignee
            issue.status = oldStatus
            issue.activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Resolve

    func resolve(actualCost: Double?, by user: CampUser) async {
        let oldStatus = issue.status
        let oldCost   = issue.actualCost
        issue.status = .resolved
        issue.actualCost = actualCost
        issue.updatedAt = Date()

        let action = actualCost != nil
            ? "Resolved — actual cost $\(String(format: "%.2f", actualCost!))"
            : "Resolved"
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name, action: action)
        issue.activity.append(entry)

        do {
            try await DataService.shared.updateIssue(issue)
            try await DataService.shared.insertIssueActivity(entry, issueId: issue.id)
        } catch {
            issue.status = oldStatus
            issue.actualCost = oldCost
            issue.activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Full edit (from LogIssueViewModel save flow)

    func applyEdit(_ updated: Issue) {
        issue = updated
    }
}
