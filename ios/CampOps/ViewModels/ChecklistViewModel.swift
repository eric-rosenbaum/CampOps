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

    func load() async {
        isLoading = true; errorMessage = nil
        do {
            async let t = DataService.shared.fetchTasks()
            async let s = DataService.shared.fetchActiveSeason()
            tasks = try await t; season = try await s
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func refresh() async {
        async let t = try? await DataService.shared.fetchTasks()
        async let s = try? await DataService.shared.fetchActiveSeason()
        if let t = await t { tasks = t }
        if let s = await s { season = s }
    }

    func updateTaskStatus(_ task: ChecklistTask, to status: ChecklistStatus, by user: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = tasks[idx].status
        tasks[idx].status = status; tasks[idx].updatedAt = Date()
        let entry = ActivityEntry(id: UUID().uuidString, userId: user.id,
                                  userName: user.name, action: "Changed status to \(status.displayName)")
        tasks[idx].activity.append(entry)
        do {
            try await DataService.shared.updateTask(tasks[idx])
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks[idx].status = old; tasks[idx].activity.removeLast()
            errorMessage = error.localizedDescription
        }
    }

    func assign(task: ChecklistTask, to assignee: CampUser?, by actor: CampUser) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = tasks[idx].assignedToId
        tasks[idx].assignedToId = assignee?.id; tasks[idx].updatedAt = Date()
        let action = assignee != nil ? "Assigned to \(assignee!.name)" : "Unassigned"
        let entry = ActivityEntry(id: UUID().uuidString, userId: actor.id, userName: actor.name, action: action)
        tasks[idx].activity.append(entry)
        do {
            try await DataService.shared.updateTask(tasks[idx])
            try await DataService.shared.insertTaskActivity(entry, taskId: task.id)
        } catch {
            tasks[idx].assignedToId = old; tasks[idx].activity.removeLast()
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

    func activateSeason(_ season: Season, by user: CampUser) async {
        do {
            try await DataService.shared.deactivateAllSeasons()
            try await DataService.shared.insertSeason(season)
            self.season = season
        } catch { errorMessage = error.localizedDescription }
    }
}
