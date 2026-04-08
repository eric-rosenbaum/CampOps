import Foundation
import Supabase

final class DataService {
    static let shared = DataService()
    private var supabase: SupabaseClient { SupabaseService.shared.client }
    private init() {}

    // MARK: - Users

    func upsertUsers() async throws {
        let users = CampUser.seedUsers.map { u in
            ["id": u.id, "name": u.name, "role": u.role.rawValue, "initials": u.initials]
        }
        try await supabase.from("users").upsert(users).execute()
    }

    // MARK: - Issues

    func fetchIssues() async throws -> [Issue] {
        let rows: [IssueDBRow] = try await supabase.from("issues")
            .select().order("created_at", ascending: false).execute().value
        let allActivity: [IssueActivityRow] = try await supabase.from("issue_activity")
            .select().order("created_at", ascending: true).execute().value
        let byIssue = Dictionary(grouping: allActivity, by: \.issueId)
        return rows.map { $0.toIssue(activity: (byIssue[$0.id] ?? []).map { $0.toEntry() }) }
    }

    func insertIssue(_ issue: Issue) async throws {
        try await supabase.from("issues").insert(IssueInsert(issue: issue)).execute()
    }

    func updateIssue(_ issue: Issue) async throws {
        try await supabase.from("issues").update(IssueUpdate(issue: issue))
            .eq("id", value: issue.id).execute()
    }

    func deleteIssue(id: String) async throws {
        try await supabase.from("issues").delete().eq("id", value: id).execute()
    }

    func insertIssueActivity(_ entry: ActivityEntry, issueId: String) async throws {
        let row: [String: String] = ["id": entry.id, "issue_id": issueId,
            "user_id": entry.userId ?? "", "user_name": entry.userName, "action": entry.action]
        try await supabase.from("issue_activity").insert(row).execute()
    }

    // MARK: - Tasks

    func fetchTasks() async throws -> [ChecklistTask] {
        let rows: [ChecklistTaskDBRow] = try await supabase.from("checklist_tasks")
            .select().order("created_at", ascending: true).execute().value
        let allActivity: [TaskActivityRow] = try await supabase.from("checklist_activity")
            .select().order("created_at", ascending: true).execute().value
        let byTask = Dictionary(grouping: allActivity, by: \.taskId)
        return rows.map { $0.toTask(activity: (byTask[$0.id] ?? []).map { $0.toEntry() }) }
    }

    func insertTask(_ task: ChecklistTask) async throws {
        try await supabase.from("checklist_tasks").insert(TaskInsert(task: task)).execute()
    }

    func updateTask(_ task: ChecklistTask) async throws {
        try await supabase.from("checklist_tasks").update(TaskUpdate(task: task))
            .eq("id", value: task.id).execute()
    }

    func deleteTask(id: String) async throws {
        try await supabase.from("checklist_tasks").delete().eq("id", value: id).execute()
    }

    func insertTaskActivity(_ entry: ActivityEntry, taskId: String) async throws {
        let row: [String: String] = ["id": entry.id, "task_id": taskId,
            "user_id": entry.userId ?? "", "user_name": entry.userName, "action": entry.action]
        try await supabase.from("checklist_activity").insert(row).execute()
    }

    // MARK: - Seasons

    func fetchLatestSeason() async throws -> Season? {
        let seasons: [Season] = try await supabase.from("seasons")
            .select().order("created_at", ascending: false).limit(1).execute().value
        return seasons.first
    }

    func upsertSeason(_ season: Season) async throws {
        try await supabase.from("seasons").upsert(season).execute()
    }
}

// MARK: - Private row types

private struct IssueActivityRow: Codable {
    let id: String; let issueId: String; let userId: String?
    let userName: String; let action: String; let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id; case issueId = "issue_id"; case userId = "user_id"
        case userName = "user_name"; case action; case createdAt = "created_at"
    }
    func toEntry() -> ActivityEntry {
        ActivityEntry(id: id, userId: userId, userName: userName, action: action, createdAt: createdAt)
    }
}

private struct TaskActivityRow: Codable {
    let id: String; let taskId: String; let userId: String?
    let userName: String; let action: String; let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id; case taskId = "task_id"; case userId = "user_id"
        case userName = "user_name"; case action; case createdAt = "created_at"
    }
    func toEntry() -> ActivityEntry {
        ActivityEntry(id: id, userId: userId, userName: userName, action: action, createdAt: createdAt)
    }
}

private struct IssueInsert: Encodable {
    let id, title: String; let description: String?
    let locations: [String]; let priority, status: String
    let assigneeId: String?; let reportedById: String
    let estimatedCost: Double?; let actualCost: Double?; let photoUrl: String?
    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status
        case assigneeId    = "assignee_id"
        case reportedById  = "reported_by_id"
        case estimatedCost = "estimated_cost"
        case actualCost    = "actual_cost"
        case photoUrl      = "photo_url"
    }
    init(issue: Issue) {
        id = issue.id; title = issue.title; description = issue.description
        locations = issue.locations.map(\.rawValue); priority = issue.priority.rawValue
        status = issue.status.rawValue; assigneeId = issue.assigneeId
        reportedById = issue.reportedById; estimatedCost = issue.estimatedCost
        actualCost = issue.actualCost; photoUrl = issue.photoUrl
    }
}

private struct IssueUpdate: Encodable {
    let title: String; let description: String?
    let locations: [String]; let priority, status: String
    let assigneeId: String?; let estimatedCost: Double?
    let actualCost: Double?; let photoUrl: String?; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case title, description, locations, priority, status
        case assigneeId    = "assignee_id"
        case estimatedCost = "estimated_cost"
        case actualCost    = "actual_cost"
        case photoUrl      = "photo_url"
        case updatedAt     = "updated_at"
    }
    init(issue: Issue) {
        title = issue.title; description = issue.description
        locations = issue.locations.map(\.rawValue); priority = issue.priority.rawValue
        status = issue.status.rawValue; assigneeId = issue.assigneeId
        estimatedCost = issue.estimatedCost; actualCost = issue.actualCost
        photoUrl = issue.photoUrl; updatedAt = Date()
    }
}

private struct TaskInsert: Encodable {
    let id, title, description: String
    let locations: [String]; let priority, status, phase: String
    let assigneeId: String?; let daysRelativeToOpening: Int
    let dueDate: String?; let isRecurring: Bool
    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status, phase
        case assigneeId            = "assignee_id"
        case daysRelativeToOpening = "days_relative_to_opening"
        case dueDate               = "due_date"
        case isRecurring           = "is_recurring"
    }
    init(task: ChecklistTask) {
        id = task.id; title = task.title; description = task.description
        locations = task.locations.map(\.rawValue); priority = task.priority.rawValue
        status = task.status.rawValue; phase = task.phase.rawValue
        assigneeId = task.assigneeId; daysRelativeToOpening = task.daysRelativeToOpening
        dueDate = task.dueDate; isRecurring = task.isRecurring
    }
}

private struct TaskUpdate: Encodable {
    let title, description: String
    let locations: [String]; let priority, status, phase: String
    let assigneeId: String?; let dueDate: String?; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case title, description, locations, priority, status, phase
        case assigneeId = "assignee_id"
        case dueDate    = "due_date"
        case updatedAt  = "updated_at"
    }
    init(task: ChecklistTask) {
        title = task.title; description = task.description
        locations = task.locations.map(\.rawValue); priority = task.priority.rawValue
        status = task.status.rawValue; phase = task.phase.rawValue
        assigneeId = task.assigneeId; dueDate = task.dueDate; updatedAt = Date()
    }
}
