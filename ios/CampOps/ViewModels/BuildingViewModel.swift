import Foundation
import Combine

@MainActor
final class BuildingViewModel: ObservableObject {
    @Published var buildings: [Building] = []
    @Published var rooms: [BuildingRoom] = []
    @Published var components: [BuildingComponent] = []
    @Published var circuits: [BuildingCircuit] = []
    @Published var seasonalTasks: [BuildingSeasonalTask] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Derived

    var sortedBuildings: [Building] {
        buildings.sorted {
            $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.name < $1.name
        }
    }

    func rooms(for buildingId: String) -> [BuildingRoom] {
        rooms.filter { $0.buildingId == buildingId }.sorted { $0.sortOrder < $1.sortOrder }
    }

    func components(for buildingId: String) -> [BuildingComponent] {
        components.filter { $0.buildingId == buildingId }
    }

    func components(roomId: String?, buildingId: String) -> [BuildingComponent] {
        components.filter { $0.buildingId == buildingId && $0.roomId == roomId }
    }

    func circuits(panelId: String) -> [BuildingCircuit] {
        circuits.filter { $0.panelId == panelId }.sorted { $0.sortOrder < $1.sortOrder }
    }

    func status(for buildingId: String) -> ComponentStatus {
        ComponentStatus.worst(components(for: buildingId).map { $0.status })
    }

    var panels: [BuildingComponent] {
        components.filter { $0.type == "breaker_panel" || $0.type == "sub_panel" }
    }

    var shutoffValves: [BuildingComponent] {
        components.filter { $0.type == "shutoff_valve" }
    }

    func tasksForPhase(_ phase: SeasonalPhase) -> [BuildingSeasonalTask] {
        seasonalTasks.filter { $0.phase == phase }.sorted { $0.sortOrder < $1.sortOrder }
    }

    var seasonalProgress: (done: Int, total: Int) {
        (seasonalTasks.filter { $0.isComplete }.count, seasonalTasks.count)
    }

    // MARK: - Load

    func load() async { isLoading = true; await loadAll(); isLoading = false }
    func refresh() async { await loadAll() }

    func loadAll() async {
        do {
            async let b  = DataService.shared.fetchBuildings()
            async let r  = DataService.shared.fetchBuildingRooms()
            async let c  = DataService.shared.fetchBuildingComponents()
            async let ci = DataService.shared.fetchBuildingCircuits()
            async let s  = DataService.shared.fetchBuildingSeasonalTasks()
            let (b2, r2, c2, ci2, s2) = try await (b, r, c, ci, s)
            buildings = b2; rooms = r2; components = c2; circuits = ci2; seasonalTasks = s2
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Buildings

    func addBuilding(_ b: Building) async {
        buildings.append(b)
        do { try await DataService.shared.insertBuilding(b) }
        catch { buildings.removeAll { $0.id == b.id }; errorMessage = error.localizedDescription }
    }
    func updateBuilding(_ b: Building) async {
        guard let i = buildings.firstIndex(where: { $0.id == b.id }) else { return }
        let old = buildings[i]; buildings[i] = b
        do { try await DataService.shared.updateBuilding(b) }
        catch { buildings[i] = old; errorMessage = error.localizedDescription }
    }
    func deleteBuilding(id: String) async {
        let oldBuildings = buildings, oldRooms = rooms, oldComps = components, oldTasks = seasonalTasks
        buildings.removeAll { $0.id == id }
        rooms.removeAll { $0.buildingId == id }
        components.removeAll { $0.buildingId == id }
        seasonalTasks.removeAll { $0.buildingId == id }
        do { try await DataService.shared.deleteBuilding(id: id) }
        catch {
            buildings = oldBuildings; rooms = oldRooms; components = oldComps; seasonalTasks = oldTasks
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Rooms

    func addRoom(_ r: BuildingRoom) async {
        rooms.append(r)
        do { try await DataService.shared.insertRoom(r) }
        catch { rooms.removeAll { $0.id == r.id }; errorMessage = error.localizedDescription }
    }
    func updateRoom(_ r: BuildingRoom) async {
        guard let i = rooms.firstIndex(where: { $0.id == r.id }) else { return }
        let old = rooms[i]; rooms[i] = r
        do { try await DataService.shared.updateRoom(r) }
        catch { rooms[i] = old; errorMessage = error.localizedDescription }
    }
    func deleteRoom(id: String) async {
        let oldRooms = rooms, oldComps = components
        rooms.removeAll { $0.id == id }
        // Components in the deleted room fall back to unassigned (DB sets room_id null).
        for i in components.indices where components[i].roomId == id { components[i].roomId = nil }
        do { try await DataService.shared.deleteRoom(id: id) }
        catch { rooms = oldRooms; components = oldComps; errorMessage = error.localizedDescription }
    }

    // MARK: - Components

    func addComponent(_ c: BuildingComponent) async {
        components.append(c)
        do { try await DataService.shared.insertComponent(c) }
        catch { components.removeAll { $0.id == c.id }; errorMessage = error.localizedDescription }
    }
    func updateComponent(_ c: BuildingComponent) async {
        guard let i = components.firstIndex(where: { $0.id == c.id }) else { return }
        let old = components[i]; components[i] = c
        do { try await DataService.shared.updateComponent(c) }
        catch { components[i] = old; errorMessage = error.localizedDescription }
    }
    func deleteComponent(id: String) async {
        let oldComps = components, oldCircuits = circuits
        components.removeAll { $0.id == id }
        circuits.removeAll { $0.panelId == id }
        do { try await DataService.shared.deleteComponent(id: id) }
        catch { components = oldComps; circuits = oldCircuits; errorMessage = error.localizedDescription }
    }

    // MARK: - Circuits

    func addCircuit(_ c: BuildingCircuit) async {
        circuits.append(c)
        do { try await DataService.shared.insertCircuit(c) }
        catch { circuits.removeAll { $0.id == c.id }; errorMessage = error.localizedDescription }
    }
    func updateCircuit(_ c: BuildingCircuit) async {
        guard let i = circuits.firstIndex(where: { $0.id == c.id }) else { return }
        let old = circuits[i]; circuits[i] = c
        do { try await DataService.shared.updateCircuit(c) }
        catch { circuits[i] = old; errorMessage = error.localizedDescription }
    }
    func deleteCircuit(id: String) async {
        guard let i = circuits.firstIndex(where: { $0.id == id }) else { return }
        let old = circuits[i]; circuits.remove(at: i)
        do { try await DataService.shared.deleteCircuit(id: id) }
        catch { circuits.insert(old, at: i); errorMessage = error.localizedDescription }
    }

    // MARK: - Seasonal tasks

    func addSeasonalTask(_ t: BuildingSeasonalTask) async {
        seasonalTasks.append(t)
        do { try await DataService.shared.insertBuildingSeasonalTask(t) }
        catch { seasonalTasks.removeAll { $0.id == t.id }; errorMessage = error.localizedDescription }
    }
    func updateSeasonalTask(_ t: BuildingSeasonalTask) async {
        guard let i = seasonalTasks.firstIndex(where: { $0.id == t.id }) else { return }
        let old = seasonalTasks[i]; seasonalTasks[i] = t
        do { try await DataService.shared.updateBuildingSeasonalTask(t) }
        catch { seasonalTasks[i] = old; errorMessage = error.localizedDescription }
    }
    func deleteSeasonalTask(id: String) async {
        guard let i = seasonalTasks.firstIndex(where: { $0.id == id }) else { return }
        let old = seasonalTasks[i]; seasonalTasks.remove(at: i)
        do { try await DataService.shared.deleteBuildingSeasonalTask(id: id) }
        catch { seasonalTasks.insert(old, at: i); errorMessage = error.localizedDescription }
    }
    func toggleSeasonalTask(id: String, userName: String) async {
        guard let i = seasonalTasks.firstIndex(where: { $0.id == id }) else { return }
        let old = seasonalTasks[i]
        let nowComplete = !old.isComplete
        seasonalTasks[i].isComplete = nowComplete
        seasonalTasks[i].completedBy = nowComplete ? userName : nil
        seasonalTasks[i].completedDate = nowComplete ? Date().yyyyMMdd : nil
        seasonalTasks[i].updatedAt = Date()
        do { try await DataService.shared.toggleBuildingSeasonalTask(seasonalTasks[i]) }
        catch { seasonalTasks[i] = old; errorMessage = error.localizedDescription }
    }
}
