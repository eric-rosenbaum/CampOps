import Foundation
import Combine
import Network
import Supabase

@MainActor
final class SyncService: ObservableObject {
    static let shared = SyncService()
    @Published var isOnline = true
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "dev.campops.network")
    private var channel: RealtimeChannelV2?
    private init() { startNetworkMonitor() }

    private func startNetworkMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { self?.isOnline = path.status == .satisfied }
        }
        monitor.start(queue: monitorQueue)
    }

    func subscribeToChanges(onIssueChange: @escaping () async -> Void,
                            onTaskChange: @escaping () async -> Void,
                            onPoolChange: (() async -> Void)? = nil,
                            onAssetChange: (() async -> Void)? = nil) async {
        let ch = await SupabaseService.shared.client.realtimeV2.channel("db-changes")
        channel = ch

        let issueStream      = await ch.postgresChange(AnyAction.self, schema: "public", table: "issues")
        let taskStream       = await ch.postgresChange(AnyAction.self, schema: "public", table: "checklist_tasks")
        let chemStream       = await ch.postgresChange(AnyAction.self, schema: "public", table: "pool_chemical_readings")
        let equipStream      = await ch.postgresChange(AnyAction.self, schema: "public", table: "pool_equipment")
        let inspStream       = await ch.postgresChange(AnyAction.self, schema: "public", table: "pool_inspections")
        let seasonalStream   = await ch.postgresChange(AnyAction.self, schema: "public", table: "pool_seasonal_tasks")
        let assetStream      = await ch.postgresChange(AnyAction.self, schema: "public", table: "camp_assets")
        let checkoutStream   = await ch.postgresChange(AnyAction.self, schema: "public", table: "asset_checkouts")
        let serviceStream    = await ch.postgresChange(AnyAction.self, schema: "public", table: "asset_service_records")
        let maintStream      = await ch.postgresChange(AnyAction.self, schema: "public", table: "asset_maintenance_tasks")

        await ch.subscribe()

        Task { for await _ in issueStream    { await onIssueChange() } }
        Task { for await _ in taskStream     { await onTaskChange()  } }
        Task { for await _ in chemStream     { if let f = onPoolChange  { await f() } } }
        Task { for await _ in equipStream    { if let f = onPoolChange  { await f() } } }
        Task { for await _ in inspStream     { if let f = onPoolChange  { await f() } } }
        Task { for await _ in seasonalStream { if let f = onPoolChange  { await f() } } }
        Task { for await _ in assetStream    { if let f = onAssetChange { await f() } } }
        Task { for await _ in checkoutStream { if let f = onAssetChange { await f() } } }
        Task { for await _ in serviceStream  { if let f = onAssetChange { await f() } } }
        Task { for await _ in maintStream    { if let f = onAssetChange { await f() } } }
    }

    func unsubscribe() async {
        await channel?.unsubscribe()
        channel = nil
    }
}
