import Foundation

struct ChecklistTask: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String
    var location: CampLocation
    var priority: Priority
    var status: ChecklistStatus
    var assigneeId: String?
    var phase: ChecklistPhase
    var daysRelativeToOpening: Int
    var dueDate: String?
    var isRecurring: Bool
    let createdAt: Date
    var updatedAt: Date
    var activity: [ActivityEntry]

    enum CodingKeys: String, CodingKey {
        case id, title, description, location, priority, status, phase
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
        location: CampLocation = .other,
        priority: Priority = .normal,
        status: ChecklistStatus = .pending,
        assigneeId: String? = nil,
        phase: ChecklistPhase,
        daysRelativeToOpening: Int = 0,
        dueDate: String? = nil,
        isRecurring: Bool = true,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        activity: [ActivityEntry] = []
    ) {
        self.id = id; self.title = title; self.description = description
        self.location = location; self.priority = priority; self.status = status
        self.assigneeId = assigneeId; self.phase = phase
        self.daysRelativeToOpening = daysRelativeToOpening; self.dueDate = dueDate
        self.isRecurring = isRecurring; self.createdAt = createdAt
        self.updatedAt = updatedAt; self.activity = activity
    }

    static func == (lhs: ChecklistTask, rhs: ChecklistTask) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var assignedTo: CampUser? { assigneeId.flatMap { CampUser.find(id: $0) } }
    var dueDateRelative: (label: String, overdue: Bool)? { dueDate?.relativeDueDate }
}

struct ChecklistTaskDBRow: Codable {
    let id: String
    var title: String
    var description: String
    var location: CampLocation
    var priority: Priority
    var status: ChecklistStatus
    var assigneeId: String?
    var phase: ChecklistPhase
    var daysRelativeToOpening: Int
    var dueDate: String?
    var isRecurring: Bool
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, location, priority, status, phase
        case assigneeId             = "assignee_id"
        case daysRelativeToOpening  = "days_relative_to_opening"
        case dueDate                = "due_date"
        case isRecurring            = "is_recurring"
        case createdAt              = "created_at"
        case updatedAt              = "updated_at"
    }

    func toTask(activity: [ActivityEntry] = []) -> ChecklistTask {
        ChecklistTask(id: id, title: title, description: description,
                      location: location, priority: priority, status: status,
                      assigneeId: assigneeId, phase: phase,
                      daysRelativeToOpening: daysRelativeToOpening, dueDate: dueDate,
                      isRecurring: isRecurring, createdAt: createdAt,
                      updatedAt: updatedAt, activity: activity)
    }
}
