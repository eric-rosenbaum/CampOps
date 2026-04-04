import Foundation

struct ChecklistTask: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String?
    var phase: ChecklistPhase
    var status: ChecklistStatus
    var assignedToId: String?
    var dueDate: String?
    var estimatedCost: Double?
    var actualCost: Double?
    var isRecurring: Bool
    var recurringInterval: RecurringInterval?
    var seasonId: String
    let createdAt: Date
    var updatedAt: Date
    var activity: [ActivityEntry]

    enum CodingKeys: String, CodingKey {
        case id, title, description, phase, status
        case assignedToId      = "assigned_to_id"
        case dueDate           = "due_date"
        case estimatedCost     = "estimated_cost"
        case actualCost        = "actual_cost"
        case isRecurring       = "is_recurring"
        case recurringInterval = "recurring_interval"
        case seasonId          = "season_id"
        case createdAt         = "created_at"
        case updatedAt         = "updated_at"
        case activity
    }

    init(
        id: String = UUID().uuidString,
        title: String,
        description: String? = nil,
        phase: ChecklistPhase,
        status: ChecklistStatus = .pending,
        assignedToId: String? = nil,
        dueDate: String? = nil,
        estimatedCost: Double? = nil,
        actualCost: Double? = nil,
        isRecurring: Bool = false,
        recurringInterval: RecurringInterval? = nil,
        seasonId: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        activity: [ActivityEntry] = []
    ) {
        self.id = id; self.title = title; self.description = description
        self.phase = phase; self.status = status; self.assignedToId = assignedToId
        self.dueDate = dueDate; self.estimatedCost = estimatedCost
        self.actualCost = actualCost; self.isRecurring = isRecurring
        self.recurringInterval = recurringInterval; self.seasonId = seasonId
        self.createdAt = createdAt; self.updatedAt = updatedAt; self.activity = activity
    }

    static func == (lhs: ChecklistTask, rhs: ChecklistTask) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var assignedTo: CampUser? { assignedToId.flatMap { CampUser.find(id: $0) } }
    var dueDateRelative: (label: String, overdue: Bool)? { dueDate?.relativeDueDate }
}

struct ChecklistTaskDBRow: Codable {
    let id: String
    var title: String
    var description: String?
    var phase: ChecklistPhase
    var status: ChecklistStatus
    var assignedToId: String?
    var dueDate: String?
    var estimatedCost: Double?
    var actualCost: Double?
    var isRecurring: Bool
    var recurringInterval: RecurringInterval?
    var seasonId: String
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, phase, status
        case assignedToId      = "assigned_to_id"
        case dueDate           = "due_date"
        case estimatedCost     = "estimated_cost"
        case actualCost        = "actual_cost"
        case isRecurring       = "is_recurring"
        case recurringInterval = "recurring_interval"
        case seasonId          = "season_id"
        case createdAt         = "created_at"
        case updatedAt         = "updated_at"
    }

    func toTask(activity: [ActivityEntry] = []) -> ChecklistTask {
        ChecklistTask(id: id, title: title, description: description, phase: phase,
                      status: status, assignedToId: assignedToId, dueDate: dueDate,
                      estimatedCost: estimatedCost, actualCost: actualCost,
                      isRecurring: isRecurring, recurringInterval: recurringInterval,
                      seasonId: seasonId, createdAt: createdAt, updatedAt: updatedAt,
                      activity: activity)
    }
}
