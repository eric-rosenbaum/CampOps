import UIKit
import Combine

/// Logging or editing a work order.
///
/// Everything here writes through the offline queue, never straight to PostgREST. A person
/// standing in a cabin with no signal types what is wrong and taps save, and the row exists with
/// its final id from that moment -- the network merely catches up later.
@MainActor
final class LogIssueViewModel: ObservableObject {
    @Published var title = ""
    @Published var description = ""
    @Published var locationIds: [String] = []
    @Published var priority: Priority = .normal
    /// The crew that does this kind of work. Never a hard-coded key: it is one of this camp's.
    @Published var trade: String = Trade.fallbackKey
    /// Who it goes to. A person, a crew, or nobody -- never a person and a crew at once.
    @Published var assignment: Assignment = .nobody
    @Published var dueDate: Date? = nil
    @Published var dueTime: Date? = nil
    @Published var assetId: String? = nil
    @Published var vendorId: String? = nil
    /// Applied after the row is saved, because the RPC needs a work order that exists.
    @Published var templateId: String? = nil
    @Published var selectedPhoto: UIImage? = nil
    @Published var isSaving = false
    @Published var errorMessage: String?

    /// Whether the person has touched "assign to" yet. Until they do, the crew's routing
    /// default fills it in, and changing crew re-applies the new crew's default.
    private var assignmentTouched = false

    enum Assignment: Hashable {
        case nobody
        case person(String)
        case crew(String)

        var personId: String? { if case let .person(id) = self { return id }; return nil }
        var crewId: String? { if case let .crew(id) = self { return id }; return nil }
    }

    var editingIssue: Issue?

    init(editing issue: Issue? = nil, prefillLocationId: String? = nil, prefillAssetId: String? = nil) {
        if let issue {
            editingIssue = issue
            title = issue.title
            description = issue.description ?? ""
            // Prefer canonical ids; fall back to resolving the legacy name snapshot.
            locationIds = issue.locationIds.isEmpty
                ? LocationStore.shared.ids(forNames: issue.locations)
                : issue.locationIds
            priority = issue.priority
            trade = issue.trade
            if let personId = issue.assigneeId { assignment = .person(personId) }
            else if let crewId = issue.assigneeGroupId { assignment = .crew(crewId) }
            dueDate = issue.dueDate.flatMap { CampDate.date(from: $0) }
            dueTime = issue.dueTime.flatMap { time in
                let parts = time.split(separator: ":").compactMap { Int($0) }
                guard parts.count >= 2 else { return nil }
                var c = DateComponents(); c.hour = parts[0]; c.minute = parts[1]
                return Calendar.current.date(from: c)
            }
            assetId = issue.assetId
            vendorId = issue.vendorId
            assignmentTouched = true
        } else {
            if let prefillLocationId { locationIds = [prefillLocationId] }
            assetId = prefillAssetId
            applyRoutingDefault()
        }
    }

    var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    /// Display names for the currently selected location ids.
    var locationNames: [String] { LocationStore.shared.names(for: locationIds) }

    /// The person chose a crew, so re-apply that crew's routing default unless they have
    /// already said who it goes to.
    func tradeChanged(to key: String) {
        trade = key
        guard !assignmentTouched else { return }
        applyRoutingDefault()
    }

    func setAssignment(_ value: Assignment) {
        assignment = value
        assignmentTouched = true
    }

    /// Prefills "assign to" from `work_routing`: where this camp says work of this crew goes.
    ///
    /// A prefill and not a decision -- the person can always change it, and leaving it alone
    /// lets the database's own insert trigger route the job to the crew.
    ///
    /// Every default is checked against who is actually here first, because routing rows outlive
    /// the people in them. Prospect QA's housekeeping route still names a staff member who left:
    /// taking that at face value blanked the picker (the id matched nothing in it) and would have
    /// filed the job under somebody who cannot see it. `route_work()` on the server applies the
    /// same test -- a default assignee counts only while they are an active admin or staff member.
    private func applyRoutingDefault() {
        guard let route = CampgroundStore.shared.routing.first(where: { $0.trade == trade }) else {
            assignment = .nobody
            return
        }
        let members = AuthManager.shared.members
        if let personId = route.defaultAssigneeId, members.contains(where: { $0.id == personId }) {
            assignment = .person(personId)
        } else if let crewId = route.defaultStaffGroupId,
                  CampgroundStore.shared.trades.contains(where: { $0.id == crewId }) {
            assignment = .crew(crewId)
        } else {
            assignment = .nobody
        }
    }

    /// Fills the form from an AI draft. Never saves: the person confirms every field.
    func apply(draft: WorkOrderDraft) {
        if !draft.title.isEmpty { title = draft.title }
        if let text = draft.description, !text.isEmpty { description = text }
        if let key = draft.trade, CampgroundStore.shared.tradeKeys.contains(key) { trade = key }
        if let value = draft.priority { priority = value }
        if let id = draft.locationId, locationIds.isEmpty { locationIds = [id] }
        if let id = draft.assetId, assetId == nil { assetId = id }
        if let id = draft.assigneeId, !assignmentTouched { assignment = .person(id) }
    }

    func save(reportedBy user: CampUser) async throws -> Issue {
        isSaving = true; defer { isSaving = false }

        let id = editingIssue?.id ?? UUID().uuidString.lowercased()
        let campId = AuthManager.shared.currentCamp?.id ?? ""
        let names = LocationStore.shared.names(for: locationIds)
        let day = dueDate.map { CampDate.dayString($0) }
        let clock = dueTime.map { CampDate.timeString(from: $0) }

        // The photo is queued, not uploaded. Waiting on an upload here would mean that the one
        // place a phone beats a laptop stops working in exactly the buildings people are
        // standing in when something breaks.
        var photoUrl: String? = editingIssue?.photoUrl
        if let img = selectedPhoto {
            await PhotoQueue.shared.enqueue(img, campId: campId, target: .workOrder(issueId: id))
            photoUrl = nil
        }

        if var existing = editingIssue {
            existing.title = title.trimmingCharacters(in: .whitespaces)
            existing.description = description.isEmpty ? nil : description
            existing.locationIds = locationIds; existing.locations = names
            existing.priority = priority
            existing.trade = trade
            existing.assetId = assetId; existing.vendorId = vendorId
            existing.dueDate = day; existing.dueTime = clock
            if photoUrl != nil { existing.photoUrl = photoUrl }
            existing.updatedAt = Date()

            let entry = ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                      userName: user.name, action: "Edited the details")
            existing.activity.append(entry)
            await SyncEngine.shared.queueIssueEdit(existing)
            await SyncEngine.shared.queueIssueActivity(entry, issueId: existing.id)
            return existing
        }

        let issue = Issue(
            id: id,
            title: title.trimmingCharacters(in: .whitespaces),
            description: description.isEmpty ? nil : description,
            locationIds: locationIds, locations: names,
            priority: priority,
            // Naming a person assigns it. A crew holding it is still unassigned: nobody has
            // taken it yet, and the board has to keep showing it as available.
            status: assignment.personId != nil ? .assigned : .unassigned,
            assigneeId: assignment.personId,
            assigneeGroupId: assignment.crewId,
            reportedById: user.id,
            trade: trade,
            assetId: assetId, vendorId: vendorId,
            photoUrl: photoUrl,
            dueDate: day, dueTime: clock,
            source: .ios
        )

        var entries = [ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                     userName: user.name, action: "Logged this")]
        if let personId = assignment.personId,
           let person = AuthManager.shared.members.first(where: { $0.id == personId }) {
            entries.append(ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                         userName: user.name,
                                         action: "Assigned to \(person.name)"))
        } else if let crewId = assignment.crewId,
                  let crew = AuthManager.shared.crews.first(where: { $0.id == crewId }) {
            entries.append(ActivityEntry(id: UUID().uuidString.lowercased(), userId: user.id,
                                         userName: user.name,
                                         action: "Sent to \(crew.name)"))
        }

        await SyncEngine.shared.queueIssueCreate(issue)
        for entry in entries {
            await SyncEngine.shared.queueIssueActivity(entry, issueId: issue.id)
        }

        // The template has to wait for the row to exist server-side, and needs a connection:
        // it is an RPC, not a row write. Offline, the work order simply arrives without its
        // steps, which is a visibly incomplete job rather than a lost one.
        if let templateId {
            Task {
                await SyncEngine.shared.syncNow(reason: .userRequested, force: true)
                try? await DataService.shared.applyChecklistTemplate(issueId: issue.id,
                                                                     templateId: templateId)
            }
        }

        var withActivity = issue; withActivity.activity = entries
        return withActivity
    }
}
