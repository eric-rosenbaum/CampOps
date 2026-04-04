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
        let allActivity: [ActivityRow] = try await supabase.from("issue_activity")
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
        let allActivity: [TaskActivityRow] = try await supabase.from("task_activity")
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

    func insertTaskActivity(_ entry: ActivityEntry, taskId: String) async throws {
        let row: [String: String] = ["id": entry.id, "task_id": taskId,
            "user_id": entry.userId ?? "", "user_name": entry.userName, "action": entry.action]
        try await supabase.from("task_activity").insert(row).execute()
    }

    // MARK: - Seasons

    func fetchActiveSeason() async throws -> Season? {
        let seasons: [Season] = try await supabase.from("seasons")
            .select().eq("is_active", value: true).limit(1).execute().value
        return seasons.first
    }

    func insertSeason(_ season: Season) async throws {
        try await supabase.from("seasons").insert(season).execute()
    }

    func deactivateAllSeasons() async throws {
        try await supabase.from("seasons").update(["is_active": false]).execute()
    }
}

// MARK: - Private row types

private struct ActivityRow: Codable {
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
    let location, priority, status: String
    let assignedToId: String?; let reportedById: String
    let estimatedCost: Double?; let actualCost: Double?; let photoUrl: String?
    enum CodingKeys: String, CodingKey {
        case id, title, description, location, priority, status
        case assignedToId = "assigned_to_id"; case reportedById = "reported_by_id"
        case estimatedCost = "estimated_cost"; case actualCost = "actual_cost"
        case photoUrl = "photo_url"
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
    let title: String; let description: String?
    let location, priority, status: String
    let assignedToId: String?; let estimatedCost: Double?
    let actualCost: Double?; let photoUrl: String?; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case title, description, location, priority, status
        case assignedToId = "assigned_to_id"; case estimatedCost = "estimated_cost"
        case actualCost = "actual_cost"; case photoUrl = "photo_url"
        case updatedAt = "updated_at"
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
    let id, title: String; let description: String?
    let phase, status: String; let assignedToId: String?
    let dueDate: String?; let estimatedCost: Double?; let actualCost: Double?
    let isRecurring: Bool; let recurringInterval: String?; let seasonId: String
    enum CodingKeys: String, CodingKey {
        case id, title, description, phase, status
        case assignedToId = "assigned_to_id"; case dueDate = "due_date"
        case estimatedCost = "estimated_cost"; case actualCost = "actual_cost"
        case isRecurring = "is_recurring"; case recurringInterval = "recurring_interval"
        case seasonId = "season_id"
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
    let title: String; let description: String?
    let phase, status: String; let assignedToId: String?
    let dueDate: String?; let estimatedCost: Double?; let actualCost: Double?
    let isRecurring: Bool; let recurringInterval: String?; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case title, description, phase, status
        case assignedToId = "assigned_to_id"; case dueDate = "due_date"
        case estimatedCost = "estimated_cost"; case actualCost = "actual_cost"
        case isRecurring = "is_recurring"; case recurringInterval = "recurring_interval"
        case updatedAt = "updated_at"
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
