import UIKit
import Combine

@MainActor
final class LogIssueViewModel: ObservableObject {
    @Published var title = ""
    @Published var description = ""
    @Published var location: CampLocation = .other
    @Published var priority: Priority = .normal
    @Published var assigneeId: String? = nil
    @Published var estimatedCost = ""
    @Published var selectedPhoto: UIImage? = nil
    @Published var isSaving = false
    @Published var errorMessage: String?

    var editingIssue: Issue?

    init(editing issue: Issue? = nil) {
        if let issue {
            editingIssue = issue
            title = issue.title
            description = issue.description ?? ""
            location = issue.location
            priority = issue.priority
            assigneeId = issue.assigneeId
            estimatedCost = issue.estimatedCost.map { String($0) } ?? ""
        }
    }

    var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    func save(reportedBy user: CampUser) async throws -> Issue {
        isSaving = true; defer { isSaving = false }
        let cost = Double(estimatedCost)
        let id = editingIssue?.id ?? UUID().uuidString
        var photoUrl: String? = editingIssue?.photoUrl
        if let img = selectedPhoto {
            photoUrl = try await PhotoService.shared.uploadPhoto(img, issueId: id)
        }
        if var existing = editingIssue {
            existing.title = title.trimmingCharacters(in: .whitespaces)
            existing.description = description.isEmpty ? nil : description
            existing.location = location; existing.priority = priority
            existing.assigneeId = assigneeId; existing.estimatedCost = cost
            existing.photoUrl = photoUrl; existing.updatedAt = Date()
            let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                     userName: user.name, action: "Edited issue details")
            existing.activity.append(entry)
            try await DataService.shared.updateIssue(existing)
            try await DataService.shared.insertIssueActivity(entry, issueId: existing.id)
            return existing
        } else {
            let issue = Issue(id: id, title: title.trimmingCharacters(in: .whitespaces),
                description: description.isEmpty ? nil : description,
                location: location, priority: priority,
                status: assigneeId != nil ? .assigned : .unassigned,
                assigneeId: assigneeId, reportedById: user.id,
                estimatedCost: cost, photoUrl: photoUrl)
            let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                     userName: user.name, action: "Logged issue")
            try await DataService.shared.insertIssue(issue)
            try await DataService.shared.insertIssueActivity(entry, issueId: issue.id)
            var withActivity = issue; withActivity.activity = [entry]
            return withActivity
        }
    }
}
