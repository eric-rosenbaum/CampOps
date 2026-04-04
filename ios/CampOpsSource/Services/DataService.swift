import Foundation
import Supabase

// MARK: - All Supabase data operations
final class DataService {
    static let shared = DataService()
    private var db: PostgrestClient { SupabaseService.shared.client.from("") }
    private var supabase: SupabaseClient { SupabaseService.shared.client }

    private init() {}

    // MARK: - Users

    func upsertUsers() async throws {
        let users = CampUser.seedUsers.map { user in
            [
                "id":       user.id,
                "name":     user.name,
                "role":     user.role.rawValue,
                "initials": user.initials,
            ]
        }
        try await supabase.from("users")
            .upsert(users)
            .execute()
    }

    // MARK: - Issues

    func fetchIssues() async throws -> [Issue] {
        let rows: [IssueRow] = try await supabase.from("issues")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value

        // Fetch activity for all issues in one query
        let allActivity: [ActivityRow] = try await supabase.from("issue_activity")
            .select()
            .order("created_at", ascending: true)
            .execute()
            .value

        let activityByIssue = Dictionary(grouping: allActivity, by: \.issueId)

        return rows.map { row in
            let activity = (activityByIssue[row.id] ?? []).map { $0.toEntry() }
            return row.toIssue(activity: activity)
        }
    }

    func insertIssue(_ issue: Issue) async throws {
        let row = IssueInsert(issue: issue)
        try await supabase.from("issues")
            .insert(row)
            .execute()
    }

    func updateIssue(_ issue: Issue) async throws {
        let row = IssueUpdate(issue: issue)
        try await supabase.from("issues")
            .update(row)
            .eq("id", value: issue.id)
            .execute()
    }

    func deleteIssue(id: String) async throws {
        try await supabase.from("issues")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    func insertIssueActivity(_ entry: ActivityEntry, issueId: String) async throws {
        let row: [String: String] = [
            "id":        entry.id,
            "issue_id":  issueId,
            "user_id":   entry.userId ?? "",
            "user_name": entry.userName,
            "action":    entry.action,
        ]
        try await supabase.from("issue_activity")
            .insert(row)
            .execute()
    }

    // MARK: - Checklist Tasks

    func fetchTasks() async throws -> [ChecklistTask] {
        let rows: [ChecklistTaskRow] = try await supabase.from("checklist_tasks")
            .select()
            .order("created_at", ascending: true)
            .execute()
            .value

        let allActivity: [TaskActivityRow] = try await supabase.from("task_activity")
            .select()
            .order("created_at", ascending: true)
            .execute()
            .value

        let activityByTask = Dictionary(grouping: allActivity, by: \.taskId)

        return rows.map { row in
            let activity = (activityByTask[row.id] ?? []).map { $0.toEntry() }
            return row.toTask(activity: activity)
        }
    }

    func insertTask(_ task: ChecklistTask) async throws {
        let row = TaskInsert(task: task)
        try await supabase.from("checklist_tasks")
            .insert(row)
            .execute()
    }

    func updateTask(_ task: ChecklistTask) async throws {
        let row = TaskUpdate(task: task)
        try await supabase.from("checklist_tasks")
            .update(row)
            .eq("id", value: task.id)
            .execute()
    }

    func insertTaskActivity(_ entry: ActivityEntry, taskId: String) async throws {
        let row: [String: String] = [
            "id":        entry.id,
            "task_id":   taskId,
            "user_id":   entry.userId ?? "",
            "user_name": entry.userName,
            "action":    entry.action,
        ]
        try await supabase.from("task_activity")
            .insert(row)
            .execute()
    }

    // MARK: - Seasons

    func fetchActiveSeason() async throws -> Season? {
        let seasons: [Season] = try await supabase.from("seasons")
            .select()
            .eq("is_active", value: true)
            .limit(1)
            .execute()
            .value
        return seasons.first
    }

    func insertSeason(_ season: Season) async throws {
        try await supabase.from("seasons")
            .insert(season)
            .execute()
    }

    func deactivateAllSeasons() async throws {
        try await supabase.from("seasons")
            .update(["is_active": false])
            .execute()
    }
}

// MARK: - Activity DB row types

private struct ActivityRow: Codable {
    let id: String
    let issueId: String
    let userId: String?
    let userName: String
    let action: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case issueId   = "issue_id"
        case userId    = "user_id"
        case userName  = "user_name"
        case action
        case createdAt = "created_at"
    }

    func toEntry() -> ActivityEntry {
        ActivityEntry(id: id, userId: userId, userName: userName, action: action, createdAt: createdAt)
    }
}

private struct TaskActivityRow: Codable {
    let id: String
    let taskId: String
    let userId: String?
    let userName: String
    let action: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case taskId    = "task_id"
        case userId    = "user_id"
        case userName  = "user_name"
        case action
        case createdAt = "created_at"
    }

    func toEntry() -> ActivityEntry {
        ActivityEntry(id: id, userId: userId, userName: userName, action: action, createdAt: createdAt)
    }
}

// MARK: - Insert/Update payloads (Encodable only)

private struct IssueInsert: Encodable {
    let id: String
    let title: String
    let description: String?
    let location: String
    let priority: String
    let status: String
    let assignedToId: String?
    let reportedById: String
    let estimatedCost: Double?
    let actualCost: Double?
    let photoUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, location, priority, status
        case assignedToId  = "assigned_to_id"
        case reportedById  = "reported_by_id"
        case estimatedCost = "estimated_cost"
        case actualCost    = "actual_cost"
        case photoUrl      = "photo_url"
    }

    init(issue: Issue) {
        id = issue.id; title = issue.title; description = issue.description
        location = issue.location.rawValue; priority = issue.priority.rawValue
        status = issue.status.rawValue; assignedToId = issue.assignedToId
        reportedById = issue.reportedById; estimatedCost = issue.estimatedCost
        actualCost = issue.actualCost; photoUrl = issue.photoUrl
    }
}

private struct IssueUpdate: Encodable {
    let title: String
    let description: String?
    let location: String
    let priority: String
    let status: String
    let assignedToId: String?
    let estimatedCost: Double?
    let actualCost: Double?
    let photoUrl: String?
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case title, description, location, priority, status
        case assignedToId  = "assigned_to_id"
        case estimatedCost = "estimated_cost"
        case actualCost    = "actual_cost"
        case photoUrl      = "photo_url"
        case updatedAt     = "updated_at"
    }

    init(issue: Issue) {
        title = issue.title; description = issue.description
        location = issue.location.rawValue; priority = issue.priority.rawValue
        status = issue.status.rawValue; assignedToId = issue.assignedToId
        estimatedCost = issue.estimatedCost; actualCost = issue.actualCost
        photoUrl = issue.photoUrl; updatedAt = Date()
    }
}

private struct TaskInsert: Encodable {
    let id: String
    let title: String
    let description: String?
    let phase: String
    let status: String
    let assignedToId: String?
    let dueDate: String?
    let estimatedCost: Double?
    let actualCost: Double?
    let isRecurring: Bool
    let recurringInterval: String?
    let seasonId: String

    enum CodingKeys: String, CodingKey {
        case id, title, description, phase, status
        case assignedToId      = "assigned_to_id"
        case dueDate           = "due_date"
        case estimatedCost     = "estimated_cost"
        case actualCost        = "actual_cost"
        case isRecurring       = "is_recurring"
        case recurringInterval = "recurring_interval"
        case seasonId          = "season_id"
    }

    init(task: ChecklistTask) {
        id = task.id; title = task.title; description = task.description
        phase = task.phase.rawValue; status = task.status.rawValue
        assignedToId = task.assignedToId; dueDate = task.dueDate
        estimatedCost = task.estimatedCost; actualCost = task.actualCost
        isRecurring = task.isRecurring; recurringInterval = task.recurringInterval?.rawValue
        seasonId = task.seasonId
    }
}

private struct TaskUpdate: Encodable {
    let title: String
    let description: String?
    let phase: String
    let status: String
    let assignedToId: String?
    let dueDate: String?
    let estimatedCost: Double?
    let actualCost: Double?
    let isRecurring: Bool
    let recurringInterval: String?
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case title, description, phase, status
        case assignedToId      = "assigned_to_id"
        case dueDate           = "due_date"
        case estimatedCost     = "estimated_cost"
        case actualCost        = "actual_cost"
        case isRecurring       = "is_recurring"
        case recurringInterval = "recurring_interval"
        case updatedAt         = "updated_at"
    }

    init(task: ChecklistTask) {
        title = task.title; description = task.description
        phase = task.phase.rawValue; status = task.status.rawValue
        assignedToId = task.assignedToId; dueDate = task.dueDate
        estimatedCost = task.estimatedCost; actualCost = task.actualCost
        isRecurring = task.isRecurring; recurringInterval = task.recurringInterval?.rawValue
        updatedAt = Date()
    }
}
