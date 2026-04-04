import Foundation
import Network
import Supabase

// MARK: - Network + Realtime manager
@MainActor
final class SyncService: ObservableObject {
    static let shared = SyncService()

    @Published var isOnline = true

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "dev.campops.network")
    private var realtimeChannel: RealtimeChannelV2?

    private init() {
        startNetworkMonitor()
    }

    // MARK: - Network monitoring

    private func startNetworkMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isOnline = path.status == .satisfied
            }
        }
        monitor.start(queue: monitorQueue)
    }

    // MARK: - Realtime subscriptions

    func subscribeToChanges(onIssueChange: @escaping () async -> Void, onTaskChange: @escaping () async -> Void) async {
        let channel = await SupabaseService.shared.client.realtimeV2.channel("db-changes")
        realtimeChannel = channel

        await channel.on(
            "postgres_changes",
            filter: ChannelFilter(event: "*", schema: "public", table: "issues")
        ) { _ in
            Task { await onIssueChange() }
        }

        await channel.on(
            "postgres_changes",
            filter: ChannelFilter(event: "*", schema: "public", table: "checklist_tasks")
        ) { _ in
            Task { await onTaskChange() }
        }

        await channel.subscribe()
    }

    func unsubscribe() async {
        await realtimeChannel?.unsubscribe()
        realtimeChannel = nil
    }
}
