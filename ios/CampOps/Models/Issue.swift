import Foundation

struct Issue: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String?
    /// Canonical selected location ids (unified `locations` tree).
    var locationIds: [String]
    /// NAME snapshot of `locationIds`, kept in sync on write; used for display.
    var locations: [String]
    var priority: Priority
    var status: IssueStatus
    var assigneeId: String?
    var reportedById: String
    var estimatedCost: Double?
    var actualCost: Double?
    var photoUrl: String?
    let createdAt: Date
    var updatedAt: Date
    var activity: [ActivityEntry]

    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status
        case locationIds   = "location_ids"
        case assigneeId  = "assignee_id"
        case reportedById  = "reported_by_id"
        case estimatedCost = "estimated_cost"
        case actualCost    = "actual_cost"
        case photoUrl      = "photo_url"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
        case activity
    }

    init(
        id: String = UUID().uuidString,
        title: String,
        description: String? = nil,
        locationIds: [String] = [],
        locations: [String],
        priority: Priority,
        status: IssueStatus = .unassigned,
        assigneeId: String? = nil,
        reportedById: String,
        estimatedCost: Double? = nil,
        actualCost: Double? = nil,
        photoUrl: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        activity: [ActivityEntry] = []
    ) {
        self.id = id; self.title = title; self.description = description
        self.locationIds = locationIds; self.locations = locations
        self.priority = priority; self.status = status
        self.assigneeId = assigneeId; self.reportedById = reportedById
        self.estimatedCost = estimatedCost; self.actualCost = actualCost
        self.photoUrl = photoUrl; self.createdAt = createdAt
        self.updatedAt = updatedAt; self.activity = activity
    }

    static func == (lhs: Issue, rhs: Issue) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var reportedBy: CampUser? { AuthManager.shared.members.first { $0.id == reportedById } }
    var assignedTo: CampUser? { assigneeId.flatMap { id in AuthManager.shared.members.first { $0.id == id } } }
}

struct IssueDBRow: Codable {
    let id: String
    var title: String
    var description: String?
    var locationIds: [String]
    var locations: [String]
    var priority: Priority
    var status: IssueStatus
    var assigneeId: String?
    var reportedById: String
    var estimatedCost: Double?
    var actualCost: Double?
    var photoUrl: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status
        case locationIds   = "location_ids"
        case assigneeId  = "assignee_id"
        case reportedById  = "reported_by_id"
        case estimatedCost = "estimated_cost"
        case actualCost    = "actual_cost"
        case photoUrl      = "photo_url"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id            = try c.decode(String.self, forKey: .id)
        title         = try c.decode(String.self, forKey: .title)
        description   = try c.decodeIfPresent(String.self, forKey: .description)
        locationIds   = (try? c.decodeIfPresent([String].self, forKey: .locationIds)) ?? []
        locations     = (try? c.decodeIfPresent([String].self, forKey: .locations)) ?? []
        priority      = try c.decode(Priority.self, forKey: .priority)
        status        = try c.decode(IssueStatus.self, forKey: .status)
        assigneeId    = try c.decodeIfPresent(String.self, forKey: .assigneeId)
        reportedById  = try c.decode(String.self, forKey: .reportedById)
        estimatedCost = try c.decodeIfPresent(Double.self, forKey: .estimatedCost)
        actualCost    = try c.decodeIfPresent(Double.self, forKey: .actualCost)
        photoUrl      = try c.decodeIfPresent(String.self, forKey: .photoUrl)
        createdAt     = try c.decode(Date.self, forKey: .createdAt)
        updatedAt     = try c.decode(Date.self, forKey: .updatedAt)
    }

    func toIssue(activity: [ActivityEntry] = []) -> Issue {
        Issue(id: id, title: title, description: description,
              locationIds: locationIds, locations: locations,
              priority: priority, status: status, assigneeId: assigneeId,
              reportedById: reportedById, estimatedCost: estimatedCost,
              actualCost: actualCost, photoUrl: photoUrl,
              createdAt: createdAt, updatedAt: updatedAt, activity: activity)
    }
}
