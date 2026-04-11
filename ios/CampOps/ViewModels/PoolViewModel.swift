import Foundation
import Combine

@MainActor
final class PoolViewModel: ObservableObject {
    @Published var readings: [ChemicalReading] = []
    @Published var equipment: [PoolEquipment] = []
    @Published var serviceLog: [PoolServiceLog] = []
    @Published var inspections: [PoolInspection] = []
    @Published var inspectionLog: [PoolInspectionLog] = []
    @Published var seasonalTasks: [PoolSeasonalTask] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Computed

    var latestReading: ChemicalReading? {
        readings.max { $0.createdAt < $1.createdAt }
    }

    var alertMessages: [(level: ChemStatus, message: String)] {
        guard let r = latestReading else { return [] }
        var result: [(ChemStatus, String)] = []
        let fc = chemStatus(field: .freeChlorine, value: r.freeChlorine)
        if fc == .alert {
            result.append((.alert, "Free chlorine \(r.freeChlorine) ppm is below required minimum (1.0 ppm). Do not open pool until corrected."))
        }
        let ph = chemStatus(field: .ph, value: r.ph)
        if ph == .alert {
            result.append((.alert, "pH \(r.ph) is outside safe range (7.2–7.8). Corrective action required."))
        }
        let alk = chemStatus(field: .alkalinity, value: r.alkalinity)
        if alk != .ok {
            result.append((alk, "Alkalinity \(r.alkalinity) ppm is outside \(alk == .alert ? "acceptable" : "target") range. Test and adjust."))
        }
        return result
    }

    func tasksForPhase(_ phase: SeasonalPhase) -> [PoolSeasonalTask] {
        seasonalTasks.filter { $0.phase == phase }.sorted { $0.sortOrder < $1.sortOrder }
    }

    var seasonalProgress: (done: Int, total: Int) {
        (seasonalTasks.filter { $0.isComplete }.count, seasonalTasks.count)
    }

    func progressForPhase(_ phase: SeasonalPhase) -> (done: Int, total: Int) {
        let tasks = tasksForPhase(phase)
        return (tasks.filter { $0.isComplete }.count, tasks.count)
    }

    func serviceLogFor(equipmentId: String) -> [PoolServiceLog] {
        serviceLog.filter { $0.equipmentId == equipmentId }.sorted { $0.datePerformed > $1.datePerformed }
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        await fetchAll()
        isLoading = false
    }

    func refresh() async { await fetchAll() }

    private func fetchAll() async {
        do {
            async let r  = DataService.shared.fetchChemicalReadings()
            async let e  = DataService.shared.fetchPoolEquipment()
            async let sl = DataService.shared.fetchPoolServiceLog()
            async let i  = DataService.shared.fetchPoolInspections()
            async let il = DataService.shared.fetchPoolInspectionLog()
            async let st = DataService.shared.fetchPoolSeasonalTasks()
            let (r2, e2, sl2, i2, il2, st2) = try await (r, e, sl, i, il, st)
            readings = r2; equipment = e2; serviceLog = sl2
            inspections = i2; inspectionLog = il2; seasonalTasks = st2
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Chemical Readings

    func addReading(_ reading: ChemicalReading) async {
        readings.insert(reading, at: 0)
        do { try await DataService.shared.insertChemicalReading(reading) }
        catch { readings.removeFirst(); errorMessage = error.localizedDescription }
    }

    func updateReading(_ reading: ChemicalReading) async {
        guard let idx = readings.firstIndex(where: { $0.id == reading.id }) else { return }
        let old = readings[idx]
        readings[idx] = reading
        do { try await DataService.shared.updateChemicalReading(reading) }
        catch { readings[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteReading(id: String) async {
        guard let idx = readings.firstIndex(where: { $0.id == id }) else { return }
        let old = readings[idx]
        readings.remove(at: idx)
        do { try await DataService.shared.deleteChemicalReading(id: id) }
        catch { readings.insert(old, at: idx); errorMessage = error.localizedDescription }
    }

    // MARK: - Equipment

    func addEquipment(_ equip: PoolEquipment) async {
        equipment.append(equip)
        do { try await DataService.shared.insertPoolEquipment(equip) }
        catch { equipment.removeLast(); errorMessage = error.localizedDescription }
    }

    func updateEquipment(_ equip: PoolEquipment) async {
        guard let idx = equipment.firstIndex(where: { $0.id == equip.id }) else { return }
        let old = equipment[idx]
        equipment[idx] = equip
        do { try await DataService.shared.updatePoolEquipment(equip) }
        catch { equipment[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteEquipment(id: String) async {
        guard let idx = equipment.firstIndex(where: { $0.id == id }) else { return }
        let old = equipment[idx]
        equipment.remove(at: idx)
        do { try await DataService.shared.deletePoolEquipment(id: id) }
        catch { equipment.insert(old, at: idx); errorMessage = error.localizedDescription }
    }

    // MARK: - Service Log

    func addServiceLog(_ entry: PoolServiceLog) async {
        serviceLog.insert(entry, at: 0)
        // Update equipment's last serviced / next service due
        if let eqId = entry.equipmentId, let idx = equipment.firstIndex(where: { $0.id == eqId }) {
            equipment[idx].lastServiced = entry.datePerformed
            if let next = entry.nextServiceDue { equipment[idx].nextServiceDue = next }
            equipment[idx].updatedAt = Date()
        }
        do {
            try await DataService.shared.insertPoolServiceLog(entry)
            if let eqId = entry.equipmentId, let eq = equipment.first(where: { $0.id == eqId }) {
                try await DataService.shared.updatePoolEquipment(eq)
            }
        } catch { errorMessage = error.localizedDescription }
    }

    // MARK: - Inspections

    func addInspectionLog(_ entry: PoolInspectionLog) async {
        inspectionLog.insert(entry, at: 0)
        if let id = entry.inspectionId, let idx = inspections.firstIndex(where: { $0.id == id }) {
            let formatted = entry.inspectionDate.localDateDisplay
            inspections[idx].status = .ok
            inspections[idx].lastCompleted = entry.inspectionDate
            if let next = entry.nextDue { inspections[idx].nextDue = next }
            inspections[idx].history = Array(([formatted] + inspections[idx].history).prefix(5))
            inspections[idx].updatedAt = Date()
        }
        do {
            try await DataService.shared.insertPoolInspectionLog(entry)
            if let id = entry.inspectionId, let insp = inspections.first(where: { $0.id == id }) {
                try await DataService.shared.updatePoolInspection(insp)
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func updateInspectionLog(_ entry: PoolInspectionLog) async {
        guard let idx = inspectionLog.firstIndex(where: { $0.id == entry.id }) else { return }
        let old = inspectionLog[idx]
        inspectionLog[idx] = entry
        do { try await DataService.shared.updatePoolInspectionLog(entry) }
        catch { inspectionLog[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteInspectionLog(id: String) async {
        guard let idx = inspectionLog.firstIndex(where: { $0.id == id }) else { return }
        let old = inspectionLog[idx]
        inspectionLog.remove(at: idx)
        do { try await DataService.shared.deletePoolInspectionLog(id: id) }
        catch { inspectionLog.insert(old, at: idx); errorMessage = error.localizedDescription }
    }

    // MARK: - Seasonal Tasks

    func addSeasonalTask(_ task: PoolSeasonalTask) async {
        seasonalTasks.append(task)
        do { try await DataService.shared.insertPoolSeasonalTask(task) }
        catch { seasonalTasks.removeAll { $0.id == task.id }; errorMessage = error.localizedDescription }
    }

    func updateSeasonalTask(_ task: PoolSeasonalTask) async {
        guard let idx = seasonalTasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = seasonalTasks[idx]
        seasonalTasks[idx] = task
        do { try await DataService.shared.updatePoolSeasonalTask(task) }
        catch { seasonalTasks[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteSeasonalTask(id: String) async {
        guard let idx = seasonalTasks.firstIndex(where: { $0.id == id }) else { return }
        let old = seasonalTasks[idx]
        seasonalTasks.remove(at: idx)
        do { try await DataService.shared.deletePoolSeasonalTask(id: id) }
        catch { seasonalTasks.insert(old, at: idx); errorMessage = error.localizedDescription }
    }

    func toggleSeasonalTask(id: String, userName: String) async {
        guard let idx = seasonalTasks.firstIndex(where: { $0.id == id }) else { return }
        let old = seasonalTasks[idx]
        let nowComplete = !old.isComplete
        seasonalTasks[idx].isComplete = nowComplete
        seasonalTasks[idx].completedBy = nowComplete ? userName : nil
        seasonalTasks[idx].completedDate = nowComplete ? Date().yyyyMMdd : nil
        seasonalTasks[idx].updatedAt = Date()
        do { try await DataService.shared.togglePoolSeasonalTask(seasonalTasks[idx]) }
        catch { seasonalTasks[idx] = old; errorMessage = error.localizedDescription }
    }
}
