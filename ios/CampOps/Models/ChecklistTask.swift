import Foundation

struct ChecklistTask: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String
    /// Canonical selected location ids (unified `locations` tree).
    var locationIds: [String]
    /// NAME snapshot of `locationIds`, kept in sync on write; used for display.
    var locations: [String]
    var priority: Priority
    var status: ChecklistStatus
    var assigneeId: String?
    var phase: ChecklistPhase
    var daysRelativeToOpening: Int?
    var dueDate: String?
    var isRecurring: Bool
    let createdAt: Date
    var updatedAt: Date
    var activity: [ActivityEntry]

    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status, phase
        case locationIds            = "location_ids"
        case assigneeId             = "assignee_id"
        case daysRelativeToOpening  = "days_relative_to_opening"
        case dueDate                = "due_date"
        case isRecurring            = "is_recurring"
        case createdAt              = "created_at"
        case updatedAt              = "updated_at"
        case activity
    }

    init(
        id: String = UUID().uuidString,
        title: String,
        description: String = "",
        locationIds: [String] = [],
        locations: [String] = [],
        priority: Priority = .normal,
        status: ChecklistStatus = .pending,
        assigneeId: String? = nil,
        phase: ChecklistPhase,
        daysRelativeToOpening: Int? = nil,
        dueDate: String? = nil,
        isRecurring: Bool = true,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        activity: [ActivityEntry] = []
    ) {
        self.id = id; self.title = title; self.description = description
        self.locationIds = locationIds; self.locations = locations
        self.priority = priority; self.status = status
        self.assigneeId = assigneeId; self.phase = phase
        self.daysRelativeToOpening = daysRelativeToOpening; self.dueDate = dueDate
        self.isRecurring = isRecurring; self.createdAt = createdAt
        self.updatedAt = updatedAt; self.activity = activity
    }

    static func == (lhs: ChecklistTask, rhs: ChecklistTask) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var assignedTo: CampUser? { assigneeId.flatMap { id in AuthManager.shared.members.first { $0.id == id } } }
    var dueDateRelative: (label: String, overdue: Bool)? { dueDate?.relativeDueDate }
}

struct ChecklistTaskDBRow: Codable {
    let id: String
    var title: String
    var description: String
    var locationIds: [String]
    var locations: [String]
    var priority: Priority
    var status: ChecklistStatus
    var assigneeId: String?
    var phase: ChecklistPhase
    var daysRelativeToOpening: Int?
    var dueDate: String?
    var isRecurring: Bool
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status, phase
        case locationIds            = "location_ids"
        case assigneeId             = "assignee_id"
        case daysRelativeToOpening  = "days_relative_to_opening"
        case dueDate                = "due_date"
        case isRecurring            = "is_recurring"
        case createdAt              = "created_at"
        case updatedAt              = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id                    = try c.decode(String.self, forKey: .id)
        title                 = try c.decode(String.self, forKey: .title)
        description           = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? ""
        locationIds           = (try? c.decodeIfPresent([String].self, forKey: .locationIds)) ?? []
        locations             = (try? c.decodeIfPresent([String].self, forKey: .locations)) ?? []
        priority              = try c.decode(Priority.self, forKey: .priority)
        status                = try c.decode(ChecklistStatus.self, forKey: .status)
        assigneeId            = try c.decodeIfPresent(String.self, forKey: .assigneeId)
        phase                 = try c.decode(ChecklistPhase.self, forKey: .phase)
        daysRelativeToOpening = try c.decodeIfPresent(Int.self, forKey: .daysRelativeToOpening)
        dueDate               = try c.decodeIfPresent(String.self, forKey: .dueDate)
        isRecurring           = (try? c.decode(Bool.self, forKey: .isRecurring)) ?? true
        createdAt             = try c.decode(Date.self, forKey: .createdAt)
        updatedAt             = try c.decode(Date.self, forKey: .updatedAt)
    }

    func toTask(activity: [ActivityEntry] = []) -> ChecklistTask {
        ChecklistTask(id: id, title: title, description: description,
                      locationIds: locationIds, locations: locations,
                      priority: priority, status: status,
                      assigneeId: assigneeId, phase: phase,
                      daysRelativeToOpening: daysRelativeToOpening, dueDate: dueDate,
                      isRecurring: isRecurring, createdAt: createdAt,
                      updatedAt: updatedAt, activity: activity)
    }
}
