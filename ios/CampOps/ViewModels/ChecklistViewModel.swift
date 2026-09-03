import Foundation
import Combine

@MainActor
final class ChecklistViewModel: ObservableObject {
    @Published var tasks: [ChecklistTask] = []
    @Published var season: Season? = nil
    @Published var isLoading = false
    @Published var errorMessage: String?

    var preTasks:  [ChecklistTask] { tasks.filter { $0.phase == .pre } }
    var postTasks: [ChecklistTask] { tasks.filter { $0.phase == .post } }

    /// True when the list on screen came off the disk rather than the server.
    @Published private(set) var isShowingCachedCopy = false

    func load() async {
        isLoading = true; errorMessage = nil
        async let t = DataService.shared.fetchTasks()
        async let s = DataService.shared.fetchLatestSeason()
        if let fetched = try? await t {
            tasks = fetched
            isShowingCachedCopy = false
            await SyncEngine.shared.cacheFetched(fetched, table: SyncTable.checklistTasks)
        } else {
            // Same reasoning as the issues list: "we could not ask" must not be drawn as
            // "there is nothing to do".
            let campId = AuthManager.shared.currentCamp?.id ?? ""
            let cached = campId.isEmpty ? [] : await OfflineReads.tasks(campId: campId)
            if !cached.isEmpty {
                tasks = cached
                isShowingCachedCopy = true
            }
        }
        if let fetched = try? await s { season = fetched }
        isLoading = false
    }

    func refresh() async {
        async let t = try? await DataService.shared.fetchTasks()
        async let s = try? await DataService.shared.fetchLatestSeason()
        if let t = await t { tasks = t }
        if let s = await s { season = s }
    }

    /// Ticking off an opening/closing task. Queued, because half the pre-season list happens in
    /// cabins and boat houses at the edge of the property.
    ///
    /// The activity row is NOT queued alongside it: `checklist_activity` is not one of the
    /// tables `sync_push` accepts, so it is written directly and allowed to fail. Losing an
    /// audit line while keeping the status change is the right way round; the reverse is not.
    func updateTaskStatus(_ task: ChecklistTask, to status: ChecklistStatus, by user: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[idx].status = status; tasks[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                  userName: user.name, action: "Changed status to \(status.displayName)")
        tasks[idx].activity.append(entry)
        await SyncEngine.shared.queueTaskStatus(taskId: task.id, title: task.title, status: status)
        try? await DataService.shared.insertTaskActivity(entry, taskId: task.id)
    }

    func assign(task: ChecklistTask, to assignee: CampUser?, by actor: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = tasks[idx].assigneeId
        tasks[idx].assigneeId = assignee?.id; tasks[idx].updatedAt = Date()
        let action = assignee != nil ? "Assigned to \(assignee!.name)" : "Unassigned"
        let entry = ActivityEntry(id: UUID().uuidString, userId: actor.id, userName: actor.name, action: action)
        tasks[idx].activity.append(entry)
        do {
            try await DataService.shared.updateTask(tasks[idx])
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks[idx].assigneeId = old; tasks[idx].activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    func addTask(_ task: ChecklistTask, by user: CampUser) async {
        tasks.append(task)
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                  userName: user.name, action: "Added task")
        do {
            try await DataService.shared.insertTask(task)
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks.removeAll { $0.id == task.id }
            errorMessage = error.localizedDescription
        }
    }

    func updateTask(_ updated: ChecklistTask, by user: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == updated.id }) else { return }
        let old = tasks[idx]
        tasks[idx] = updated; tasks[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                  userName: user.name, action: "Edited task details")
        tasks[idx].activity.append(entry)
        do {
            try await DataService.shared.updateTask(tasks[idx])
            try await DataService.shared.insertTaskActivity(entry, taskId: updated.id)
        } catch {
            tasks[idx] = old
            errorMessage = error.localizedDescription
        }
    }

    func deleteTask(_ task: ChecklistTask) async {
        tasks.removeAll { $0.id == task.id }
        do {
            try await DataService.shared.deleteTask(id: task.id)
        } catch {
            tasks.append(task)
            errorMessage = error.localizedDescription
        }
    }

    func takeTask(_ task: ChecklistTask, by user: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[idx].assigneeId = user.id
        tasks[idx].status = .inProgress
        tasks[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name,
                                  action: "\(user.name) took this task")
        tasks[idx].activity.append(entry)
        await SyncEngine.shared.queueTaskAssignment(
            taskId: task.id, title: task.title, assigneeId: user.id, status: .inProgress
        )
        try? await DataService.shared.insertTaskActivity(entry, taskId: task.id)
    }

    func upsertSeason(_ season: Season) async {
        do {
            try await DataService.shared.upsertSeason(season)
            self.season = season
        } catch { errorMessage = error.localizedDescription }
    }
}
