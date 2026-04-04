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
                            onTaskChange: @escaping () async -> Void) async {
        let ch = await SupabaseService.shared.client.realtimeV2.channel("db-changes")
        channel = ch

        let issueStream = await ch.postgresChange(AnyAction.self, schema: "public", table: "issues")
        let taskStream  = await ch.postgresChange(AnyAction.self, schema: "public", table: "checklist_tasks")

        await ch.subscribe()

        Task { for await _ in issueStream { await onIssueChange() } }
        Task { for await _ in taskStream  { await onTaskChange()  } }
    }

    func unsubscribe() async {
        await channel?.unsubscribe()
        channel = nil
    }
}
