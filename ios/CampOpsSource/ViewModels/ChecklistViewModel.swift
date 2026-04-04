import Foundation

@MainActor
final class ChecklistViewModel: ObservableObject {
    @Published var tasks: [ChecklistTask] = []
    @Published var season: Season? = nil
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var filterPhase: ChecklistPhase? = nil
    @Published var filterStatus: ChecklistStatus? = nil

    var preTasks:  [ChecklistTask] { filtered(phase: .pre)  }
    var postTasks: [ChecklistTask] { filtered(phase: .post) }

    private func filtered(phase: ChecklistPhase) -> [ChecklistTask] {
        tasks.filter { $0.phase == phase }
    }

    var filteredTasks: [ChecklistTask] {
        var result = tasks
        if let p = filterPhase  { result = result.filter { $0.phase   == p } }
        if let s = filterStatus { result = result.filter { $0.status  == s } }
        return result
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let tasksResult  = DataService.shared.fetchTasks()
            async let seasonResult = DataService.shared.fetchActiveSeason()
            tasks  = try await tasksResult
            season = try await seasonResult
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func refresh() async {
        async let tasksResult  = try? await DataService.shared.fetchTasks()
        async let seasonResult = try? await DataService.shared.fetchActiveSeason()
        if let t = await tasksResult { tasks  = t }
        if let s = await seasonResult { season = s }
    }

    // MARK: - Status update

    func updateTaskStatus(_ task: ChecklistTask, to status: ChecklistStatus, by user: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = tasks[idx].status
        tasks[idx].status = status
        tasks[idx].updatedAt = Date()

        let entry = ActivityEntry(
            id: UUID().uuidString,
            userId: user.id,
            userName: user.name,
            action: "Changed status to \(status.displayName)"
        )
        tasks[idx].activity.append(entry)

        do {
            try await DataService.shared.updateTask(tasks[idx])
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks[idx].status = old
            tasks[idx].activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Assignment

    func assign(task: ChecklistTask, to assignee: CampUser?, by actor: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = tasks[idx].assignedToId
        tasks[idx].assignedToId = assignee?.id
        tasks[idx].updatedAt = Date()

        let action = assignee != nil ? "Assigned to \(assignee!.name)" : "Unassigned"
        let entry = ActivityEntry(id: UUID().uuidString, userId: actor.id, userName: actor.name, action: action)
        tasks[idx].activity.append(entry)

        do {
            try await DataService.shared.updateTask(tasks[idx])
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks[idx].assignedToId = old
            tasks[idx].activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Add task

    func addTask(_ task: ChecklistTask, by user: CampUser) async {
        tasks.append(task)

        let entry = ActivityEntry(
            id: UUID().uuidString,
            userId: user.id,
            userName: user.name,
            action: "Added task"
        )

        do {
            try await DataService.shared.insertTask(task)
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks.removeAll { $0.id == task.id }
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Season activation

    func activateSeason(_ season: Season, by user: CampUser) async {
        do {
            try await DataService.shared.deactivateAllSeasons()
            try await DataService.shared.insertSeason(season)
            self.season = season
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
