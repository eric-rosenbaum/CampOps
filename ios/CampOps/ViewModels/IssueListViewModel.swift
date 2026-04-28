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

    func load() async {
        isLoading = true; errorMessage = nil
        do { issues = try await DataService.shared.fetchIssues() }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

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

    func refresh() async {
        guard let fresh = try? await DataService.shared.fetchIssues() else { return }
        issues = fresh
    }
}
