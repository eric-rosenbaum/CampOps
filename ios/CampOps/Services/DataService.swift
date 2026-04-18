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

    // MARK: - Pool: Pools CRUD

    func fetchPools() async throws -> [CampPool] {
        try await supabase.from("pools")
            .select().order("sort_order", ascending: true).execute().value
    }

    func insertPool(_ pool: CampPool) async throws {
        try await supabase.from("pools").insert(PoolInsert(pool)).execute()
    }

    func updatePool(_ pool: CampPool) async throws {
        try await supabase.from("pools").update(PoolUpdate(pool))
            .eq("id", value: pool.id).execute()
    }

    func deletePool(id: String) async throws {
        try await supabase.from("pools").delete().eq("id", value: id).execute()
    }

    func deleteAllPoolData() async throws {
        try await supabase.from("pool_inspection_log").delete().neq("id", value: "").execute()
        try await supabase.from("pool_service_log").delete().neq("id", value: "").execute()
        try await supabase.from("pool_seasonal_tasks").delete().neq("id", value: "").execute()
        try await supabase.from("pool_inspections").delete().neq("id", value: "").execute()
        try await supabase.from("pool_equipment").delete().neq("id", value: "").execute()
        try await supabase.from("pool_chemical_readings").delete().neq("id", value: "").execute()
        try await supabase.from("pools").delete().neq("id", value: "").execute()
    }

    // MARK: - Pool: Chemical Readings

    func fetchChemicalReadings() async throws -> [ChemicalReading] {
        try await supabase.from("pool_chemical_readings")
            .select().order("reading_time", ascending: false).execute().value
    }

    func insertChemicalReading(_ r: ChemicalReading) async throws {
        try await supabase.from("pool_chemical_readings").insert(ChemReadingInsert(r)).execute()
    }

    func updateChemicalReading(_ r: ChemicalReading) async throws {
        try await supabase.from("pool_chemical_readings").update(ChemReadingUpdate(r))
            .eq("id", value: r.id).execute()
    }

    func deleteChemicalReading(id: String) async throws {
        try await supabase.from("pool_chemical_readings").delete().eq("id", value: id).execute()
    }

    // MARK: - Pool: Equipment

    func fetchPoolEquipment() async throws -> [PoolEquipment] {
        try await supabase.from("pool_equipment")
            .select().order("created_at", ascending: true).execute().value
    }

    func insertPoolEquipment(_ e: PoolEquipment) async throws {
        try await supabase.from("pool_equipment").insert(EquipmentInsert(e)).execute()
    }

    func updatePoolEquipment(_ e: PoolEquipment) async throws {
        try await supabase.from("pool_equipment").update(EquipmentUpdate(e))
            .eq("id", value: e.id).execute()
    }

    func deletePoolEquipment(id: String) async throws {
        try await supabase.from("pool_equipment").delete().eq("id", value: id).execute()
    }

    // MARK: - Pool: Service Log

    func fetchPoolServiceLog() async throws -> [PoolServiceLog] {
        try await supabase.from("pool_service_log")
            .select().order("created_at", ascending: false).execute().value
    }

    func insertPoolServiceLog(_ entry: PoolServiceLog) async throws {
        try await supabase.from("pool_service_log").insert(ServiceLogInsert(entry)).execute()
    }

    func updatePoolServiceLog(_ entry: PoolServiceLog) async throws {
        try await supabase.from("pool_service_log").update(ServiceLogUpdate(entry))
            .eq("id", value: entry.id).execute()
    }

    func deletePoolServiceLog(id: String) async throws {
        try await supabase.from("pool_service_log").delete().eq("id", value: id).execute()
    }

    // MARK: - Pool: Inspections

    func fetchPoolInspections() async throws -> [PoolInspection] {
        try await supabase.from("pool_inspections")
            .select().order("created_at", ascending: true).execute().value
    }

    func updatePoolInspection(_ insp: PoolInspection) async throws {
        try await supabase.from("pool_inspections").update(InspectionUpdate(insp))
            .eq("id", value: insp.id).execute()
    }

    // MARK: - Pool: Inspection Log

    func fetchPoolInspectionLog() async throws -> [PoolInspectionLog] {
        try await supabase.from("pool_inspection_log")
            .select().order("created_at", ascending: false).execute().value
    }

    func insertPoolInspectionLog(_ entry: PoolInspectionLog) async throws {
        try await supabase.from("pool_inspection_log").insert(InspectionLogInsert(entry)).execute()
    }

    func updatePoolInspectionLog(_ entry: PoolInspectionLog) async throws {
        try await supabase.from("pool_inspection_log").update(InspectionLogUpdate(entry))
            .eq("id", value: entry.id).execute()
    }

    func deletePoolInspectionLog(id: String) async throws {
        try await supabase.from("pool_inspection_log").delete().eq("id", value: id).execute()
    }

    // MARK: - Pool: Seasonal Tasks

    func fetchPoolSeasonalTasks() async throws -> [PoolSeasonalTask] {
        try await supabase.from("pool_seasonal_tasks")
            .select().order("sort_order", ascending: true).execute().value
    }

    func insertPoolSeasonalTask(_ task: PoolSeasonalTask) async throws {
        try await supabase.from("pool_seasonal_tasks").insert(SeasonalTaskInsert(task)).execute()
    }

    func updatePoolSeasonalTask(_ task: PoolSeasonalTask) async throws {
        try await supabase.from("pool_seasonal_tasks").update(SeasonalTaskUpdate(task))
            .eq("id", value: task.id).execute()
    }

    func deletePoolSeasonalTask(id: String) async throws {
        try await supabase.from("pool_seasonal_tasks").delete().eq("id", value: id).execute()
    }

    func togglePoolSeasonalTask(_ task: PoolSeasonalTask) async throws {
        try await supabase.from("pool_seasonal_tasks").update(SeasonalTaskToggle(task))
            .eq("id", value: task.id).execute()
    }

    // MARK: - Assets

    func fetchAssets() async throws -> [CampAsset] {
        try await supabase.from("camp_assets")
            .select().order("created_at", ascending: true).execute().value
    }

    func insertAsset(_ asset: CampAsset) async throws {
        try await supabase.from("camp_assets").insert(AssetInsert(asset)).execute()
    }

    func updateAsset(_ asset: CampAsset) async throws {
        try await supabase.from("camp_assets").update(AssetUpdate(asset))
            .eq("id", value: asset.id).execute()
    }

    func deleteAsset(id: String) async throws {
        try await supabase.from("camp_assets").delete().eq("id", value: id).execute()
    }

    // MARK: - Asset Checkouts

    func fetchAssetCheckouts() async throws -> [AssetCheckout] {
        try await supabase.from("asset_checkouts")
            .select().order("checked_out_at", ascending: false).execute().value
    }

    func insertAssetCheckout(_ checkout: AssetCheckout) async throws {
        try await supabase.from("asset_checkouts").insert(AssetCheckoutInsert(checkout)).execute()
    }

    func updateAssetCheckout(_ checkout: AssetCheckout) async throws {
        try await supabase.from("asset_checkouts").update(AssetCheckoutUpdate(checkout))
            .eq("id", value: checkout.id).execute()
    }

    func deleteAssetCheckout(id: String) async throws {
        try await supabase.from("asset_checkouts").delete().eq("id", value: id).execute()
    }

    // MARK: - Asset Service Records

    func fetchAssetServiceRecords() async throws -> [AssetServiceRecord] {
        try await supabase.from("asset_service_records")
            .select().order("created_at", ascending: false).execute().value
    }

    func insertAssetServiceRecord(_ record: AssetServiceRecord) async throws {
        try await supabase.from("asset_service_records").insert(AssetServiceRecordInsert(record)).execute()
    }

    func updateAssetServiceRecord(_ record: AssetServiceRecord) async throws {
        try await supabase.from("asset_service_records").update(AssetServiceRecordUpdate(record))
            .eq("id", value: record.id).execute()
    }

    func deleteAssetServiceRecord(id: String) async throws {
        try await supabase.from("asset_service_records").delete().eq("id", value: id).execute()
    }

    // MARK: - Asset Maintenance Tasks

    func fetchAssetMaintenanceTasks() async throws -> [AssetMaintenanceTask] {
        try await supabase.from("asset_maintenance_tasks")
            .select().order("sort_order", ascending: true).execute().value
    }

    func insertAssetMaintenanceTask(_ task: AssetMaintenanceTask) async throws {
        try await supabase.from("asset_maintenance_tasks").insert(AssetMaintenanceTaskInsert(task)).execute()
    }

    func updateAssetMaintenanceTask(_ task: AssetMaintenanceTask) async throws {
        try await supabase.from("asset_maintenance_tasks").update(AssetMaintenanceTaskUpdate(task))
            .eq("id", value: task.id).execute()
    }

    func deleteAssetMaintenanceTask(id: String) async throws {
        try await supabase.from("asset_maintenance_tasks").delete().eq("id", value: id).execute()
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

// MARK: - Pool encode types

private struct PoolInsert: Encodable {
    let id, name, type: String
    let isActive: Bool
    let notes: String?
    let sortOrder: Int
    let createdAt, updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case id, name, type, notes
        case isActive  = "is_active"
        case sortOrder = "sort_order"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
    init(_ p: CampPool) {
        id = p.id; name = p.name; type = p.type.rawValue
        isActive = p.isActive; notes = p.notes; sortOrder = p.sortOrder
        createdAt = p.createdAt; updatedAt = p.updatedAt
    }
}

private struct PoolUpdate: Encodable {
    let name, type: String
    let isActive: Bool
    let notes: String?
    let sortOrder: Int
    let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case name, type, notes
        case isActive  = "is_active"
        case sortOrder = "sort_order"
        case updatedAt = "updated_at"
    }
    init(_ p: CampPool) {
        name = p.name; type = p.type.rawValue
        isActive = p.isActive; notes = p.notes; sortOrder = p.sortOrder
        updatedAt = Date()
    }
}

private struct ChemReadingUpdate: Encodable {
    let readingTime: Date
    let poolStatus: String
    let freeChlorine, ph, alkalinity, cyanuricAcid, waterTemp: Double
    let calciumHardness: Double?
    let correctiveAction: String?
    enum CodingKeys: String, CodingKey {
        case freeChlorine     = "free_chlorine"; case ph; case alkalinity
        case cyanuricAcid     = "cyanuric_acid"; case waterTemp = "water_temp"
        case calciumHardness  = "calcium_hardness"
        case readingTime      = "reading_time"
        case correctiveAction = "corrective_action"
        case poolStatus       = "pool_status"
    }
    init(_ r: ChemicalReading) {
        readingTime = r.readingTime; poolStatus = r.poolStatus.rawValue
        freeChlorine = r.freeChlorine; ph = r.ph; alkalinity = r.alkalinity
        cyanuricAcid = r.cyanuricAcid; waterTemp = r.waterTemp
        calciumHardness = r.calciumHardness; correctiveAction = r.correctiveAction
    }
}

private struct ChemReadingInsert: Encodable {
    let id, poolId, loggedById, loggedByName, poolStatus: String
    let readingTime: Date
    let freeChlorine, ph, alkalinity, cyanuricAcid, waterTemp: Double
    let calciumHardness: Double?
    let correctiveAction: String?
    let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id
        case poolId           = "pool_id"
        case freeChlorine     = "free_chlorine"; case ph; case alkalinity
        case cyanuricAcid     = "cyanuric_acid"; case waterTemp = "water_temp"
        case calciumHardness  = "calcium_hardness"
        case readingTime      = "reading_time"
        case loggedById       = "logged_by_id"; case loggedByName = "logged_by_name"
        case correctiveAction = "corrective_action"; case poolStatus = "pool_status"
        case createdAt        = "created_at"
    }
    init(_ r: ChemicalReading) {
        id = r.id; poolId = r.poolId
        readingTime = r.readingTime; loggedById = r.loggedById
        loggedByName = r.loggedByName; poolStatus = r.poolStatus.rawValue
        freeChlorine = r.freeChlorine; ph = r.ph; alkalinity = r.alkalinity
        cyanuricAcid = r.cyanuricAcid; waterTemp = r.waterTemp
        calciumHardness = r.calciumHardness; correctiveAction = r.correctiveAction
        createdAt = r.createdAt
    }
}

private struct EquipmentInsert: Encodable {
    let id, poolId, name, type, status, statusDetail: String
    let lastServiced, nextServiceDue, vendor, specs: String?
    let createdAt, updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case id
        case poolId       = "pool_id"
        case name, type, status
        case statusDetail   = "status_detail"; case lastServiced = "last_serviced"
        case nextServiceDue = "next_service_due"; case vendor; case specs
        case createdAt = "created_at"; case updatedAt = "updated_at"
    }
    init(_ e: PoolEquipment) {
        id = e.id; poolId = e.poolId; name = e.name; type = e.type.rawValue
        status = e.status.rawValue; statusDetail = e.statusDetail
        lastServiced = e.lastServiced; nextServiceDue = e.nextServiceDue
        vendor = e.vendor; specs = e.specs; createdAt = e.createdAt; updatedAt = e.updatedAt
    }
}

private struct EquipmentUpdate: Encodable {
    let name, type, status, statusDetail: String
    let lastServiced, nextServiceDue, vendor, specs: String?
    let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case name, type, status
        case statusDetail = "status_detail"; case lastServiced = "last_serviced"
        case nextServiceDue = "next_service_due"; case vendor; case specs
        case updatedAt = "updated_at"
    }
    init(_ e: PoolEquipment) {
        name = e.name; type = e.type.rawValue; status = e.status.rawValue
        statusDetail = e.statusDetail; lastServiced = e.lastServiced
        nextServiceDue = e.nextServiceDue; vendor = e.vendor; specs = e.specs
        updatedAt = Date()
    }
}

private struct ServiceLogInsert: Encodable {
    let id, poolId, serviceType, datePerformed, performedBy: String
    let equipmentId, notes, nextServiceDue: String?
    let cost: Double?
    let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id
        case poolId       = "pool_id"
        case equipmentId  = "equipment_id"; case serviceType = "service_type"
        case datePerformed = "date_performed"; case performedBy = "performed_by"
        case notes; case cost; case nextServiceDue = "next_service_due"
        case createdAt = "created_at"
    }
    init(_ e: PoolServiceLog) {
        id = e.id; poolId = e.poolId; equipmentId = e.equipmentId
        serviceType = e.serviceType.rawValue; datePerformed = e.datePerformed
        performedBy = e.performedBy; notes = e.notes; cost = e.cost
        nextServiceDue = e.nextServiceDue; createdAt = e.createdAt
    }
}

private struct ServiceLogUpdate: Encodable {
    let equipmentId: String?
    let serviceType, datePerformed, performedBy: String
    let notes, nextServiceDue: String?
    let cost: Double?
    let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case equipmentId  = "equipment_id"; case serviceType = "service_type"
        case datePerformed = "date_performed"; case performedBy = "performed_by"
        case notes; case cost; case nextServiceDue = "next_service_due"
        case updatedAt = "updated_at"
    }
    init(_ e: PoolServiceLog) {
        equipmentId = e.equipmentId; serviceType = e.serviceType.rawValue
        datePerformed = e.datePerformed; performedBy = e.performedBy
        notes = e.notes; cost = e.cost; nextServiceDue = e.nextServiceDue
        updatedAt = Date()
    }
}

private struct InspectionUpdate: Encodable {
    let status, lastCompleted, nextDue: String?
    let history: [String]; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case status; case lastCompleted = "last_completed"; case nextDue = "next_due"
        case history; case updatedAt = "updated_at"
    }
    init(_ i: PoolInspection) {
        status = i.status.rawValue; lastCompleted = i.lastCompleted; nextDue = i.nextDue
        history = i.history; updatedAt = Date()
    }
}

private struct InspectionLogInsert: Encodable {
    let id, poolId, inspectionDate, conductedBy, result: String
    let inspectionId, notes, nextDue: String?
    let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id
        case poolId         = "pool_id"
        case inspectionId   = "inspection_id"
        case inspectionDate = "inspection_date"; case conductedBy = "conducted_by"
        case result; case notes; case nextDue = "next_due"; case createdAt = "created_at"
    }
    init(_ e: PoolInspectionLog) {
        id = e.id; poolId = e.poolId; inspectionId = e.inspectionId
        inspectionDate = e.inspectionDate; conductedBy = e.conductedBy
        result = e.result.rawValue; notes = e.notes; nextDue = e.nextDue; createdAt = e.createdAt
    }
}

private struct InspectionLogUpdate: Encodable {
    let inspectionId, inspectionDate, conductedBy, result: String?
    let notes, nextDue: String?
    enum CodingKeys: String, CodingKey {
        case inspectionId = "inspection_id"; case inspectionDate = "inspection_date"
        case conductedBy = "conducted_by"; case result; case notes; case nextDue = "next_due"
    }
    init(_ e: PoolInspectionLog) {
        inspectionId = e.inspectionId; inspectionDate = e.inspectionDate
        conductedBy = e.conductedBy; result = e.result.rawValue
        notes = e.notes; nextDue = e.nextDue
    }
}

private struct SeasonalTaskInsert: Encodable {
    let id, poolId, title, phase: String
    let detail, completedBy, completedDate: String?
    let isComplete: Bool; let assignees: [String]; let sortOrder: Int
    let createdAt, updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case id
        case poolId        = "pool_id"
        case title, detail, phase
        case isComplete    = "is_complete"; case completedBy = "completed_by"
        case completedDate = "completed_date"; case assignees
        case sortOrder     = "sort_order"; case createdAt = "created_at"; case updatedAt = "updated_at"
    }
    init(_ t: PoolSeasonalTask) {
        id = t.id; poolId = t.poolId; title = t.title; detail = t.detail; phase = t.phase.rawValue
        isComplete = t.isComplete; completedBy = t.completedBy; completedDate = t.completedDate
        assignees = t.assignees; sortOrder = t.sortOrder; createdAt = t.createdAt; updatedAt = t.updatedAt
    }
}

private struct SeasonalTaskUpdate: Encodable {
    let title, phase: String; let detail: String?
    let assignees: [String]; let sortOrder: Int; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case title, detail, phase, assignees
        case sortOrder = "sort_order"; case updatedAt = "updated_at"
    }
    init(_ t: PoolSeasonalTask) {
        title = t.title; detail = t.detail; phase = t.phase.rawValue
        assignees = t.assignees; sortOrder = t.sortOrder; updatedAt = Date()
    }
}

private struct SeasonalTaskToggle: Encodable {
    let isComplete: Bool; let completedBy, completedDate: String?; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case isComplete = "is_complete"; case completedBy = "completed_by"
        case completedDate = "completed_date"; case updatedAt = "updated_at"
    }
    init(_ t: PoolSeasonalTask) {
        isComplete = t.isComplete; completedBy = t.completedBy
        completedDate = t.completedDate; updatedAt = Date()
    }
}

// MARK: - Asset encode types

private struct AssetInsert: Encodable {
    let id, name, category, subtype, storageLocation, status: String
    let make, model, serialNumber, licensePlate, registrationExpiry: String?
    let year: Int?
    let currentOdometer, currentHours: Double?
    let tracksOdometer, tracksHours, isActive: Bool
    let notes: String?
    let hullId, uscgRegistration, uscgRegistrationExpiry, motorType: String?
    let capacity: Int?
    let hasLifejackets: Bool?
    let lifejacketCount: Int?
    let createdAt, updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case id, name, category, subtype, make, model, year, notes, status, capacity
        case serialNumber           = "serial_number"
        case licensePlate           = "license_plate"
        case registrationExpiry     = "registration_expiry"
        case storageLocation        = "storage_location"
        case currentOdometer        = "current_odometer"
        case currentHours           = "current_hours"
        case tracksOdometer         = "tracks_odometer"
        case tracksHours            = "tracks_hours"
        case isActive               = "is_active"
        case hullId                 = "hull_id"
        case uscgRegistration       = "uscg_registration"
        case uscgRegistrationExpiry = "uscg_registration_expiry"
        case motorType              = "motor_type"
        case hasLifejackets         = "has_lifejackets"
        case lifejacketCount        = "lifejacket_count"
        case createdAt              = "created_at"
        case updatedAt              = "updated_at"
    }
    init(_ a: CampAsset) {
        id = a.id; name = a.name; category = a.category.rawValue; subtype = a.subtype
        storageLocation = a.storageLocation; status = a.status.rawValue
        make = a.make; model = a.model; year = a.year; serialNumber = a.serialNumber
        licensePlate = a.licensePlate; registrationExpiry = a.registrationExpiry
        currentOdometer = a.currentOdometer; currentHours = a.currentHours
        tracksOdometer = a.tracksOdometer; tracksHours = a.tracksHours
        isActive = a.isActive; notes = a.notes; hullId = a.hullId
        uscgRegistration = a.uscgRegistration; uscgRegistrationExpiry = a.uscgRegistrationExpiry
        motorType = a.motorType; capacity = a.capacity
        hasLifejackets = a.hasLifejackets; lifejacketCount = a.lifejacketCount
        createdAt = a.createdAt; updatedAt = a.updatedAt
    }
}

private struct AssetUpdate: Encodable {
    let name, category, subtype, storageLocation, status: String
    let make, model, serialNumber, licensePlate, registrationExpiry: String?
    let year: Int?
    let currentOdometer, currentHours: Double?
    let tracksOdometer, tracksHours, isActive: Bool
    let notes: String?
    let hullId, uscgRegistration, uscgRegistrationExpiry, motorType: String?
    let capacity: Int?
    let hasLifejackets: Bool?
    let lifejacketCount: Int?
    let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case name, category, subtype, make, model, year, notes, status, capacity
        case serialNumber           = "serial_number"
        case licensePlate           = "license_plate"
        case registrationExpiry     = "registration_expiry"
        case storageLocation        = "storage_location"
        case currentOdometer        = "current_odometer"
        case currentHours           = "current_hours"
        case tracksOdometer         = "tracks_odometer"
        case tracksHours            = "tracks_hours"
        case isActive               = "is_active"
        case hullId                 = "hull_id"
        case uscgRegistration       = "uscg_registration"
        case uscgRegistrationExpiry = "uscg_registration_expiry"
        case motorType              = "motor_type"
        case hasLifejackets         = "has_lifejackets"
        case lifejacketCount        = "lifejacket_count"
        case updatedAt              = "updated_at"
    }
    init(_ a: CampAsset) {
        name = a.name; category = a.category.rawValue; subtype = a.subtype
        storageLocation = a.storageLocation; status = a.status.rawValue
        make = a.make; model = a.model; year = a.year; serialNumber = a.serialNumber
        licensePlate = a.licensePlate; registrationExpiry = a.registrationExpiry
        currentOdometer = a.currentOdometer; currentHours = a.currentHours
        tracksOdometer = a.tracksOdometer; tracksHours = a.tracksHours
        isActive = a.isActive; notes = a.notes; hullId = a.hullId
        uscgRegistration = a.uscgRegistration; uscgRegistrationExpiry = a.uscgRegistrationExpiry
        motorType = a.motorType; capacity = a.capacity
        hasLifejackets = a.hasLifejackets; lifejacketCount = a.lifejacketCount
        updatedAt = Date()
    }
}

private struct AssetCheckoutInsert: Encodable {
    let id, assetId, checkedOutBy, purpose, loggedBy: String
    let checkedOutAt, expectedReturnAt: Date
    let startOdometer, endOdometer, startHours, endHours: Double?
    let fuelLevelOut, fuelLevelIn: String?
    let checkoutNotes, returnNotes, returnCondition: String?
    let returnedAt: Date?
    let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id, purpose
        case assetId          = "asset_id"
        case checkedOutBy     = "checked_out_by"
        case checkedOutAt     = "checked_out_at"
        case expectedReturnAt = "expected_return_at"
        case returnedAt       = "returned_at"
        case startOdometer    = "start_odometer"
        case endOdometer      = "end_odometer"
        case startHours       = "start_hours"
        case endHours         = "end_hours"
        case fuelLevelOut     = "fuel_level_out"
        case fuelLevelIn      = "fuel_level_in"
        case checkoutNotes    = "checkout_notes"
        case returnNotes      = "return_notes"
        case returnCondition  = "return_condition"
        case loggedBy         = "logged_by"
        case createdAt        = "created_at"
    }
    init(_ c: AssetCheckout) {
        id = c.id; assetId = c.assetId; checkedOutBy = c.checkedOutBy
        purpose = c.purpose; loggedBy = c.loggedBy
        checkedOutAt = c.checkedOutAt; expectedReturnAt = c.expectedReturnAt
        returnedAt = c.returnedAt
        startOdometer = c.startOdometer; endOdometer = c.endOdometer
        startHours = c.startHours; endHours = c.endHours
        fuelLevelOut = c.fuelLevelOut?.rawValue; fuelLevelIn = c.fuelLevelIn?.rawValue
        checkoutNotes = c.checkoutNotes; returnNotes = c.returnNotes
        returnCondition = c.returnCondition?.rawValue; createdAt = c.createdAt
    }
}

private struct AssetCheckoutUpdate: Encodable {
    let checkedOutBy, purpose: String
    let expectedReturnAt: Date
    let returnedAt: Date?
    let endOdometer, endHours: Double?
    let fuelLevelIn: String?
    let checkoutNotes, returnNotes, returnCondition: String?
    enum CodingKeys: String, CodingKey {
        case purpose
        case checkedOutBy     = "checked_out_by"
        case expectedReturnAt = "expected_return_at"
        case returnedAt       = "returned_at"
        case endOdometer      = "end_odometer"
        case endHours         = "end_hours"
        case fuelLevelIn      = "fuel_level_in"
        case checkoutNotes    = "checkout_notes"
        case returnNotes      = "return_notes"
        case returnCondition  = "return_condition"
    }
    init(_ c: AssetCheckout) {
        checkedOutBy = c.checkedOutBy; purpose = c.purpose
        expectedReturnAt = c.expectedReturnAt; returnedAt = c.returnedAt
        endOdometer = c.endOdometer; endHours = c.endHours
        fuelLevelIn = c.fuelLevelIn?.rawValue
        checkoutNotes = c.checkoutNotes; returnNotes = c.returnNotes
        returnCondition = c.returnCondition?.rawValue
    }
}

private struct AssetServiceRecordInsert: Encodable {
    let id, assetId, serviceType, datePerformed, performedBy: String
    let vendor, description: String?
    let odometerAtService, hoursAtService, cost: Double?
    let nextServiceDate: String?
    let nextServiceOdometer, nextServiceHours: Double?
    let isInspection: Bool
    let createdAt: Date
    enum CodingKeys: String, CodingKey {
        case id, description, vendor, cost
        case assetId             = "asset_id"
        case serviceType         = "service_type"
        case datePerformed       = "date_performed"
        case performedBy         = "performed_by"
        case odometerAtService   = "odometer_at_service"
        case hoursAtService      = "hours_at_service"
        case nextServiceDate     = "next_service_date"
        case nextServiceOdometer = "next_service_odometer"
        case nextServiceHours    = "next_service_hours"
        case isInspection        = "is_inspection"
        case createdAt           = "created_at"
    }
    init(_ r: AssetServiceRecord) {
        id = r.id; assetId = r.assetId; serviceType = r.serviceType.rawValue
        datePerformed = r.datePerformed; performedBy = r.performedBy
        vendor = r.vendor; description = r.description
        odometerAtService = r.odometerAtService; hoursAtService = r.hoursAtService
        cost = r.cost; nextServiceDate = r.nextServiceDate
        nextServiceOdometer = r.nextServiceOdometer; nextServiceHours = r.nextServiceHours
        isInspection = r.isInspection; createdAt = r.createdAt
    }
}

private struct AssetServiceRecordUpdate: Encodable {
    let serviceType, datePerformed, performedBy: String
    let vendor, description: String?
    let odometerAtService, hoursAtService, cost: Double?
    let nextServiceDate: String?
    let nextServiceOdometer, nextServiceHours: Double?
    let isInspection: Bool
    enum CodingKeys: String, CodingKey {
        case description, vendor, cost
        case serviceType         = "service_type"
        case datePerformed       = "date_performed"
        case performedBy         = "performed_by"
        case odometerAtService   = "odometer_at_service"
        case hoursAtService      = "hours_at_service"
        case nextServiceDate     = "next_service_date"
        case nextServiceOdometer = "next_service_odometer"
        case nextServiceHours    = "next_service_hours"
        case isInspection        = "is_inspection"
    }
    init(_ r: AssetServiceRecord) {
        serviceType = r.serviceType.rawValue; datePerformed = r.datePerformed
        performedBy = r.performedBy; vendor = r.vendor; description = r.description
        odometerAtService = r.odometerAtService; hoursAtService = r.hoursAtService
        cost = r.cost; nextServiceDate = r.nextServiceDate
        nextServiceOdometer = r.nextServiceOdometer; nextServiceHours = r.nextServiceHours
        isInspection = r.isInspection
    }
}

private struct AssetMaintenanceTaskInsert: Encodable {
    let id, assetId, phase, title: String
    let detail, completedBy, completedDate: String?
    let isComplete: Bool; let sortOrder: Int
    let createdAt, updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case id, phase, title, detail
        case assetId       = "asset_id"
        case isComplete    = "is_complete"
        case completedBy   = "completed_by"
        case completedDate = "completed_date"
        case sortOrder     = "sort_order"
        case createdAt     = "created_at"
        case updatedAt     = "updated_at"
    }
    init(_ t: AssetMaintenanceTask) {
        id = t.id; assetId = t.assetId; phase = t.phase.rawValue; title = t.title
        detail = t.detail; completedBy = t.completedBy; completedDate = t.completedDate
        isComplete = t.isComplete; sortOrder = t.sortOrder
        createdAt = t.createdAt; updatedAt = t.updatedAt
    }
}

private struct AssetMaintenanceTaskUpdate: Encodable {
    let phase, title: String; let detail, completedBy, completedDate: String?
    let isComplete: Bool; let sortOrder: Int; let updatedAt: Date
    enum CodingKeys: String, CodingKey {
        case phase, title, detail
        case isComplete    = "is_complete"
        case completedBy   = "completed_by"
        case completedDate = "completed_date"
        case sortOrder     = "sort_order"
        case updatedAt     = "updated_at"
    }
    init(_ t: AssetMaintenanceTask) {
        phase = t.phase.rawValue; title = t.title; detail = t.detail
        completedBy = t.completedBy; completedDate = t.completedDate
        isComplete = t.isComplete; sortOrder = t.sortOrder; updatedAt = Date()
    }
}
