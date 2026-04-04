import Foundation
import UIKit

@MainActor
final class LogIssueViewModel: ObservableObject {
    // MARK: - Form fields
    @Published var title = ""
    @Published var description = ""
    @Published var location: CampLocation = .other
    @Published var priority: Priority = .normal
    @Published var assignedToId: String? = nil
    @Published var estimatedCost = ""
    @Published var selectedPhoto: UIImage? = nil

    // MARK: - State
    @Published var isSaving = false
    @Published var errorMessage: String?

    /// Non-nil when editing an existing issue
    var editingIssue: Issue?

    init(editing issue: Issue? = nil) {
        if let issue {
            editingIssue = issue
            title = issue.title
            description = issue.description ?? ""
            location = issue.location
            priority = issue.priority
            assignedToId = issue.assignedToId
            estimatedCost = issue.estimatedCost.map { String($0) } ?? ""
        }
    }

    var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    // MARK: - Save

    /// Returns the saved issue (new or updated).
    func save(reportedBy user: CampUser) async throws -> Issue {
        isSaving = true
        defer { isSaving = false }

        let cost = Double(estimatedCost)
        let id   = editingIssue?.id ?? UUID().uuidString

        // Upload photo if selected
        var photoUrl: String? = editingIssue?.photoUrl
        if let img = selectedPhoto {
            photoUrl = try await PhotoService.shared.uploadPhoto(img, issueId: id)
        }

        if var existing = editingIssue {
            // Edit flow
            existing.title = title.trimmingCharacters(in: .whitespaces)
            existing.description = description.isEmpty ? nil : description
            existing.location = location
            existing.priority = priority
            existing.assignedToId = assignedToId
            existing.estimatedCost = cost
            existing.photoUrl = photoUrl
            existing.updatedAt = Date()

            let entry = ActivityEntry(
                id: UUID().uuidString,
                userId: user.id,
                userName: user.name,
                action: "Edited issue details"
            )
            existing.activity.append(entry)

            try await DataService.shared.updateIssue(existing)
            try await DataService.shared.insertIssueActivity(entry, issueId: existing.id)
            return existing

        } else {
            // Create flow
            let issue = Issue(
                id: id,
                title: title.trimmingCharacters(in: .whitespaces),
                description: description.isEmpty ? nil : description,
                location: location,
                priority: priority,
                status: assignedToId != nil ? .assigned : .unassigned,
                assignedToId: assignedToId,
                reportedById: user.id,
                estimatedCost: cost,
                photoUrl: photoUrl
            )
            let entry = ActivityEntry(
                id: UUID().uuidString,
                userId: user.id,
                userName: user.name,
                action: "Logged issue"
            )

            try await DataService.shared.insertIssue(issue)
            try await DataService.shared.insertIssueActivity(entry, issueId: issue.id)

            var withActivity = issue
            withActivity.activity = [entry]
            return withActivity
        }
    }
}
