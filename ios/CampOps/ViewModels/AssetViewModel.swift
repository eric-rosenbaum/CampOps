import Foundation
import Combine

@MainActor
final class AssetViewModel: ObservableObject {
    @Published var assets: [CampAsset] = []
    @Published var checkouts: [AssetCheckout] = []
    @Published var serviceRecords: [AssetServiceRecord] = []
    @Published var maintenanceTasks: [AssetMaintenanceTask] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Computed

    var activeAssets: [CampAsset] { assets.filter { $0.isActive } }

    func assets(for category: AssetCategory?) -> [CampAsset] {
        guard let category else { return activeAssets }
        return activeAssets.filter { $0.category == category }
    }

    func checkouts(for assetId: String) -> [AssetCheckout] {
        checkouts.filter { $0.assetId == assetId }.sorted { $0.checkedOutAt > $1.checkedOutAt }
    }

    func activeCheckout(for assetId: String) -> AssetCheckout? {
        checkouts.first { $0.assetId == assetId && $0.returnedAt == nil }
    }

    func serviceRecords(for assetId: String) -> [AssetServiceRecord] {
        serviceRecords.filter { $0.assetId == assetId }.sorted { $0.datePerformed > $1.datePerformed }
    }

    func maintenanceTasks(for assetId: String, phase: AssetMaintenancePhase? = nil) -> [AssetMaintenanceTask] {
        var tasks = maintenanceTasks.filter { $0.assetId == assetId }
        if let phase { tasks = tasks.filter { $0.phase == phase } }
        return tasks.sorted { $0.sortOrder < $1.sortOrder }
    }

    var currentlyCheckedOut: [(asset: CampAsset, checkout: AssetCheckout)] {
        checkouts.filter { $0.returnedAt == nil }.compactMap { co in
            guard let asset = assets.first(where: { $0.id == co.assetId }) else { return nil }
            return (asset, co)
        }.sorted { $0.checkout.expectedReturnAt < $1.checkout.expectedReturnAt }
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        await loadAllData()
        isLoading = false
    }

    func refresh() async { await loadAllData() }

    func loadAllData() async {
        do {
            async let a  = DataService.shared.fetchAssets()
            async let co = DataService.shared.fetchAssetCheckouts()
            async let sr = DataService.shared.fetchAssetServiceRecords()
            async let mt = DataService.shared.fetchAssetMaintenanceTasks()
            let (a2, co2, sr2, mt2) = try await (a, co, sr, mt)
            assets = a2; checkouts = co2; serviceRecords = sr2; maintenanceTasks = mt2
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Asset CRUD

    func addAsset(_ asset: CampAsset) async {
        assets.append(asset)
        do { try await DataService.shared.insertAsset(asset) }
        catch { assets.removeAll { $0.id == asset.id }; errorMessage = error.localizedDescription }
    }

    func updateAsset(_ asset: CampAsset) async {
        guard let idx = assets.firstIndex(where: { $0.id == asset.id }) else { return }
        let old = assets[idx]
        assets[idx] = asset
        do { try await DataService.shared.updateAsset(asset) }
        catch { assets[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteAsset(id: String) async {
        guard let idx = assets.firstIndex(where: { $0.id == id }) else { return }
        let old = assets[idx]
        assets.remove(at: idx)
        checkouts.removeAll { $0.assetId == id }
        serviceRecords.removeAll { $0.assetId == id }
        maintenanceTasks.removeAll { $0.assetId == id }
        do { try await DataService.shared.deleteAsset(id: id) }
        catch { assets.insert(old, at: idx); errorMessage = error.localizedDescription }
    }

    // MARK: - Checkouts

    func checkOutAsset(_ checkout: AssetCheckout) async {
        checkouts.append(checkout)
        if let idx = assets.firstIndex(where: { $0.id == checkout.assetId }) {
            assets[idx].status = .checkedOut
        }
        do { try await DataService.shared.insertAssetCheckout(checkout) }
        catch {
            checkouts.removeAll { $0.id == checkout.id }
            if let idx = assets.firstIndex(where: { $0.id == checkout.assetId }) {
                assets[idx].status = .available
            }
            errorMessage = error.localizedDescription
        }
    }

    func updateCheckout(_ checkout: AssetCheckout) async {
        guard let idx = checkouts.firstIndex(where: { $0.id == checkout.id }) else { return }
        let old = checkouts[idx]
        checkouts[idx] = checkout
        do { try await DataService.shared.updateAssetCheckout(checkout) }
        catch { checkouts[idx] = old; errorMessage = error.localizedDescription }
    }

    func returnAsset(_ checkout: AssetCheckout) async {
        guard let idx = checkouts.firstIndex(where: { $0.id == checkout.id }) else { return }
        let old = checkouts[idx]
        checkouts[idx] = checkout
        if let aIdx = assets.firstIndex(where: { $0.id == checkout.assetId }) {
            assets[aIdx].status = .available
            if let end = checkout.endOdometer { assets[aIdx].currentOdometer = end }
            if let end = checkout.endHours    { assets[aIdx].currentHours = end }
        }
        do {
            try await DataService.shared.updateAssetCheckout(checkout)
            if let asset = assets.first(where: { $0.id == checkout.assetId }) {
                try await DataService.shared.updateAsset(asset)
            }
        }
        catch { checkouts[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteCheckout(id: String) async {
        guard let idx = checkouts.firstIndex(where: { $0.id == id }) else { return }
        let old = checkouts[idx]
        let wasActive = old.returnedAt == nil
        checkouts.remove(at: idx)
        if wasActive, let aIdx = assets.firstIndex(where: { $0.id == old.assetId }) {
            assets[aIdx].status = .available
        }
        do { try await DataService.shared.deleteAssetCheckout(id: id) }
        catch {
            checkouts.insert(old, at: idx)
            if wasActive, let aIdx = assets.firstIndex(where: { $0.id == old.assetId }) {
                assets[aIdx].status = .checkedOut
            }
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Service Records

    func addServiceRecord(_ record: AssetServiceRecord) async {
        serviceRecords.insert(record, at: 0)
        do { try await DataService.shared.insertAssetServiceRecord(record) }
        catch { serviceRecords.removeAll { $0.id == record.id }; errorMessage = error.localizedDescription }
    }

    func updateServiceRecord(_ record: AssetServiceRecord) async {
        guard let idx = serviceRecords.firstIndex(where: { $0.id == record.id }) else { return }
        let old = serviceRecords[idx]
        serviceRecords[idx] = record
        do { try await DataService.shared.updateAssetServiceRecord(record) }
        catch { serviceRecords[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteServiceRecord(id: String) async {
        guard let idx = serviceRecords.firstIndex(where: { $0.id == id }) else { return }
        let old = serviceRecords[idx]
        serviceRecords.remove(at: idx)
        do { try await DataService.shared.deleteAssetServiceRecord(id: id) }
        catch { serviceRecords.insert(old, at: idx); errorMessage = error.localizedDescription }
    }

    // MARK: - Maintenance Tasks

    func addMaintenanceTask(_ task: AssetMaintenanceTask) async {
        maintenanceTasks.append(task)
        do { try await DataService.shared.insertAssetMaintenanceTask(task) }
        catch { maintenanceTasks.removeAll { $0.id == task.id }; errorMessage = error.localizedDescription }
    }

    func updateMaintenanceTask(_ task: AssetMaintenanceTask) async {
        guard let idx = maintenanceTasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = maintenanceTasks[idx]
        maintenanceTasks[idx] = task
        do { try await DataService.shared.updateAssetMaintenanceTask(task) }
        catch { maintenanceTasks[idx] = old; errorMessage = error.localizedDescription }
    }

    func toggleMaintenanceTask(id: String, userName: String) async {
        guard let idx = maintenanceTasks.firstIndex(where: { $0.id == id }) else { return }
        let old = maintenanceTasks[idx]
        let nowComplete = !old.isComplete
        maintenanceTasks[idx].isComplete = nowComplete
        maintenanceTasks[idx].completedBy = nowComplete ? userName : nil
        maintenanceTasks[idx].completedDate = nowComplete ? Date().yyyyMMdd : nil
        maintenanceTasks[idx].updatedAt = Date()
        do { try await DataService.shared.updateAssetMaintenanceTask(maintenanceTasks[idx]) }
        catch { maintenanceTasks[idx] = old; errorMessage = error.localizedDescription }
    }

    func deleteMaintenanceTask(id: String) async {
        guard let idx = maintenanceTasks.firstIndex(where: { $0.id == id }) else { return }
        let old = maintenanceTasks[idx]
        maintenanceTasks.remove(at: idx)
        do { try await DataService.shared.deleteAssetMaintenanceTask(id: id) }
        catch { maintenanceTasks.insert(old, at: idx); errorMessage = error.localizedDescription }
    }
}
