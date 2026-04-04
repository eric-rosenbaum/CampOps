import Foundation

struct Issue: Codable, Identifiable {
    let id: String
    var title: String
    var description: String?
    var location: CampLocation
    var priority: Priority
    var status: IssueStatus
    var assignedToId: String?
    var reportedById: String
    var estimatedCost: Double?
    var actualCost: Double?
    var photoUrl: String?
    let createdAt: Date
    var updatedAt: Date
    var activity: [ActivityEntry]

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case location
        case priority
        case status
        case assignedToId   = "assigned_to_id"
        case reportedById   = "reported_by_id"
        case estimatedCost  = "estimated_cost"
        case actualCost     = "actual_cost"
        case photoUrl       = "photo_url"
        case createdAt      = "created_at"
        case updatedAt      = "updated_at"
        case activity
    }

    init(
        id: String = UUID().uuidString,
        title: String,
        description: String? = nil,
        location: CampLocation,
        priority: Priority,
        status: IssueStatus = .unassigned,
        assignedToId: String? = nil,
        reportedById: String,
        estimatedCost: Double? = nil,
        actualCost: Double? = nil,
        photoUrl: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        activity: [ActivityEntry] = []
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.location = location
        self.priority = priority
        self.status = status
        self.assignedToId = assignedToId
        self.reportedById = reportedById
        self.estimatedCost = estimatedCost
        self.actualCost = actualCost
        self.photoUrl = photoUrl
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.activity = activity
    }

    var reportedBy: CampUser? { CampUser.find(id: reportedById) }
    var assignedTo: CampUser? { assignedToId.flatMap { CampUser.find(id: $0) } }
}

// MARK: - DB row (flat, no nested activity)
struct IssueRow: Codable {
    let id: String
    var title: String
    var description: String?
    var location: CampLocation
    var priority: Priority
    var status: IssueStatus
    var assignedToId: String?
    var reportedById: String
    var estimatedCost: Double?
    var actualCost: Double?
    var photoUrl: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case description
        case location
        case priority
        case status
        case assignedToId   = "assigned_to_id"
        case reportedById   = "reported_by_id"
        case estimatedCost  = "estimated_cost"
        case actualCost     = "actual_cost"
        case photoUrl       = "photo_url"
        case createdAt      = "created_at"
        case updatedAt      = "updated_at"
    }

    func toIssue(activity: [ActivityEntry] = []) -> Issue {
        Issue(
            id: id,
            title: title,
            description: description,
            location: location,
            priority: priority,
            status: status,
            assignedToId: assignedToId,
            reportedById: reportedById,
            estimatedCost: estimatedCost,
            actualCost: actualCost,
            photoUrl: photoUrl,
            createdAt: createdAt,
            updatedAt: updatedAt,
            activity: activity
        )
    }
}
