import Combine
import Foundation
import Network
import Supabase
import UIKit

/// The coordinator that gets a person's work off the phone and the camp's changes onto it.
///
/// It owns three things: whether the network is reachable, when to try, and what to do when a
/// try fails. Everything durable lives in `MutationQueue` and `OfflineCache`; this type is the
/// policy layer over them, and it publishes just enough for the UI to be honest about what is
/// and is not saved.
///
/// ## Conflict policy
///
/// `sync_push` upserts, so the last write to reach the server wins. That is the right default
/// for the work this app actually does - a status moving to resolved, an assignment changing
/// hands, a comment being added - because those are either idempotent or additive, and because
/// the person standing in front of the broken thing generally does know better than the row
/// written an hour ago.
///
/// Two things make it safe to keep that default:
///
/// 1. **Updates push only the columns the person actually changed.** Closing a work order sends
///    `{id, status}`, not the whole row. So two people editing different fields of the same
///    issue from two phones both get their change; last-write-wins applies per column, not per
///    row, and nobody's edit is collateral damage for somebody else's.
///
/// 2. **A conflict is never silent.** After every pull, any queued-but-unsent mutation whose
///    columns now differ on the server is flagged `conflictDetected`. The mutation STAYS
///    QUEUED - it will still land, and it will still win - but the UI can tell the person that
///    what they typed is about to overwrite something newer. Discarding a field a human typed
///    because a row changed underneath them is not a tradeoff this app gets to make quietly;
///    the only code path that drops queued work is the user explicitly choosing to discard it.
///
/// Timestamp columns are excluded from that comparison, because the server and the device
/// format them differently and every single row would otherwise read as a conflict. `updated_at`
/// is not sent at all: `issues` and `checklist_tasks` have triggers that stamp it server-side,
/// which is correct - a phone that has been off for a week and woken up with a wrong clock
/// should not get to decide what "most recent" means.
@MainActor
final class SyncEngine: ObservableObject {
    static let shared = SyncEngine()

    // MARK: - Published state

    /// A usable network path exists. Not a promise that Supabase is reachable.
    @Published private(set) var isOnline = true
    /// A push or pull is in flight.
    @Published private(set) var isSyncing = false
    /// Writes still owed to the server that are expected to succeed.
    @Published private(set) var pendingCount = 0
    /// Writes that will not be retried on their own. A person has to decide.
    @Published private(set) var failures: [PendingMutation] = []
    /// Queued writes that are about to overwrite a newer server value.
    @Published private(set) var conflictCount = 0
    @Published private(set) var lastSyncedAt: Date?
    /// Set when a pull fails, so the UI can distinguish "nothing to send" from "cannot reach".
    @Published private(set) var lastPullError: String?

    /// The single value the UI switches on.
    var state: SyncState {
        if !failures.isEmpty { return .failed(failures) }
        if isSyncing         { return .syncing }
        if !isOnline         { return .offline }
        if pendingCount > 0  { return .pendingCount(pendingCount) }
        return .online
    }

    /// True when there is anything at all worth putting on screen.
    var hasSomethingToReport: Bool {
        !failures.isEmpty || isSyncing || !isOnline || pendingCount > 0
    }

    // MARK: - Dependencies

    private var client: SupabaseClient { SupabaseService.shared.client }
    private let queue = MutationQueue.shared
    private let cache = OfflineCache.shared

    // MARK: - Connectivity

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "dev.campcommand.sync.path")
    private var monitorStarted = false

    // MARK: - Scheduling

    /// How often to try when there is nothing else prompting us. Long enough not to matter for
    /// battery, short enough that a phone sitting on a workbench catches up on its own.
    private static let tickInterval: TimeInterval = 60
    private static let baseBackoff: TimeInterval = 2
    private static let maxBackoff: TimeInterval = 300
    /// One `sync_push` carries at most this many mutations. The RPC applies them one at a time
    /// and returns a per-mutation result, so a big batch is safe, but a smaller one means a
    /// flaky connection makes partial progress instead of all-or-nothing progress.
    private static let pushBatchSize = 50

    private var campId: String?
    private var tickerTask: Task<Void, Never>?
    private var wakeTask: Task<Void, Never>?
    private var foregroundObserver: NSObjectProtocol?

    /// Push and pull back off INDEPENDENTLY, and that separation is load-bearing rather than
    /// tidiness. They fail for unrelated reasons - a pull can be broken by a server-side change
    /// to a table the device does not even use - and a shared backoff would let a permanently
    /// failing pull stretch the retry interval on the push out to five minutes, stranding work
    /// somebody is waiting on behind a read they do not care about. Getting the queue off the
    /// phone is the half that matters; it must never be held hostage by the other half.
    private enum Lane { case push, pull }
    private var pushFailures = 0
    private var pullFailures = 0
    private var pushNextAttemptAt: Date?
    private var pullNextAttemptAt: Date?

    private init() {}

    // MARK: - Lifecycle

    /// Point the engine at a camp and start syncing. Safe to call repeatedly; switching camps
    /// tears the old schedule down first.
    func start(campId: String) {
        guard !campId.isEmpty else { return }
        if self.campId == campId, tickerTask != nil { return }

        self.campId = campId
        resetBackoff()

        startPathMonitor()
        startTicker()
        observeForeground()

        Task {
            await refreshPublished()
            await syncNow(reason: .started)
        }
    }

    func stop() {
        tickerTask?.cancel(); tickerTask = nil
        wakeTask?.cancel(); wakeTask = nil
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
            self.foregroundObserver = nil
        }
        campId = nil
        pendingCount = 0
        failures = []
        conflictCount = 0
    }

    /// Sign-out. Drops both the snapshot and anything still queued for that camp, because the
    /// person signing out is no longer the person the queue was authorised as.
    func signOut(campId: String) async {
        stop()
        await queue.clear(campId: campId)
        await cache.clearAll(campId: campId)
    }

    private func startPathMonitor() {
        guard !monitorStarted else { return }
        monitorStarted = true
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = !self.isOnline
                self.isOnline = reachable
                // Coming back into signal is the single best moment to try: the radio is up,
                // the user is probably still holding the phone, and the backoff ladder that
                // built up while there was no path is meaningless now.
                if reachable && wasOffline {
                    self.resetBackoff()
                    await self.syncNow(reason: .becameReachable)
                }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    private func startTicker() {
        tickerTask?.cancel()
        tickerTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.tickInterval))
                guard !Task.isCancelled, let self else { return }
                await self.syncNow(reason: .timer)
            }
        }
    }

    private func observeForeground() {
        guard foregroundObserver == nil else { return }
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.syncNow(reason: .foreground)
            }
        }
    }

    // MARK: - Enqueueing work

    /// Queue a write and update the cache optimistically.
    ///
    /// `fields` is a PARTIAL row: the id plus only the columns this action changes. That is
    /// deliberate - see the conflict policy on this type. Creating a row is the exception and
    /// must pass every non-null column, because the server's upsert has nothing to fall back on
    /// when the row does not exist yet.
    @discardableResult
    func enqueue(
        table: String,
        op: SyncOp = .upsert,
        rowId: String,
        fields: SyncRow = [:],
        summary: String
    ) async -> Bool {
        guard let campId, !campId.isEmpty else { return false }
        guard SyncTable.pushable.contains(table) else {
            assertionFailure("\(table) is not in sync_push's allow-list; the mutation would be rejected.")
            return false
        }

        var payload = fields
        payload["id"] = .string(rowId)

        let mutation = PendingMutation(
            campId: campId,
            table: table,
            op: op,
            payload: payload,
            summary: summary
        )

        await queue.enqueue(mutation)

        // Reflect it locally straight away so every screen reading the cache agrees with what
        // the person just saw happen on screen.
        if op == .delete {
            await cache.removeRow(id: rowId, table: table, campId: campId)
        } else {
            await cache.overlay(payload, table: table, campId: campId)
        }

        await refreshPublished()
        Task { await self.syncNow(reason: .enqueued) }
        return true
    }

    // MARK: - Syncing

    enum SyncReason: String {
        case started, becameReachable, foreground, timer, enqueued, userRequested
    }

    /// Drain the queue, then pull. Cheap to call often; it bails on its own if there is nothing
    /// to do, something already in flight, or a backoff still running.
    func syncNow(reason: SyncReason, force: Bool = false) async {
        guard let campId, !campId.isEmpty else { return }
        guard !isSyncing else { return }
        guard isOnline else { return }

        let shouldPush = force || isDue(pushNextAttemptAt)
        let shouldPull = force || isDue(pullNextAttemptAt)
        guard shouldPush || shouldPull else { return }

        isSyncing = true
        defer { isSyncing = false }

        // Push first, because it is the half a person is waiting on.
        if shouldPush, await drainQueue(campId: campId) {
            pushFailures = 0
            pushNextAttemptAt = nil
            lastSyncedAt = Date()
        }
        if shouldPull, await pullChanges(campId: campId) {
            pullFailures = 0
            pullNextAttemptAt = nil
        }
        await refreshPublished()
    }

    private func isDue(_ date: Date?) -> Bool {
        guard let date else { return true }
        return Date() >= date
    }

    private func resetBackoff() {
        pushFailures = 0; pullFailures = 0
        pushNextAttemptAt = nil; pullNextAttemptAt = nil
    }

    /// User tapped "try again" on a failed change. Clears the rejection flags and ignores the
    /// backoff, because a person waiting on a button deserves an immediate attempt.
    func retryFailed() async {
        guard let campId else { return }
        let ids = await queue.failed(campId: campId).map(\.id)
        await queue.resetForRetry(ids: ids)
        resetBackoff()
        await refreshPublished()
        await syncNow(reason: .userRequested, force: true)
    }

    func retry(_ mutation: PendingMutation) async {
        await queue.resetForRetry(ids: [mutation.id])
        resetBackoff()
        await refreshPublished()
        await syncNow(reason: .userRequested, force: true)
    }

    /// The one path that throws a person's work away, and only because they said so.
    func discard(_ mutation: PendingMutation) async {
        await queue.discard(id: mutation.id)
        await refreshPublished()
    }

    // MARK: - Push

    /// - Returns: true if nothing went wrong at the transport level.
    ///
    /// Drains in a loop rather than one batch per call. A crew ticking five boxes in ten seconds
    /// fires five `syncNow`s, four of which bail because the first is still in flight; without
    /// the loop those four writes would sit until the next sixty-second tick, which is exactly
    /// the "did that go through?" feeling this layer exists to remove. Every iteration either
    /// removes mutations (applied) or excludes them (rejected), so the batch always shrinks and
    /// the loop always ends - the cap is belt and braces.
    private func drainQueue(campId: String) async -> Bool {
        for _ in 0..<20 {
            let ok = await drainOneBatch(campId: campId)
            guard ok else { return false }
            if await queue.sendable(campId: campId, limit: 1).isEmpty { return true }
        }
        return true
    }

    private func drainOneBatch(campId: String) async -> Bool {
        let batch = await queue.sendable(campId: campId, limit: Self.pushBatchSize)
        guard !batch.isEmpty else { return true }

        await queue.recordAttempt(ids: batch.map(\.id))

        do {
            let results = try await callPush(campId: campId, mutations: batch)
            var applied: [String] = []
            for result in results {
                if result.ok {
                    // `duplicate: true` means a previous attempt already landed this. That is a
                    // success, not a problem - it is the whole point of the client-chosen id.
                    applied.append(result.id)
                } else {
                    await queue.recordRejection(id: result.id, message: result.error)
                }
            }
            await queue.remove(ids: applied)

            // Anything in the batch the server said nothing about (it should not happen, but a
            // truncated response would look like this) simply stays queued and is retried.
            return true
        } catch {
            await queue.recordTransportFailure(ids: batch.map(\.id), message: error.localizedDescription)
            scheduleBackoff(.push)
            return false
        }
    }

    private func callPush(campId: String, mutations: [PendingMutation]) async throws -> [PushResult] {
        let params: SyncRow = [
            "p_camp_id": .string(campId),
            "p_mutations": .array(mutations.map(\.wireForm)),
        ]
        let data = try await client.rpc("sync_push", params: params).execute().data
        let json = try SyncJSON.syncDecoder.decode(SyncJSON.self, from: data)
        guard let results = json.objectValue?["results"]?.arrayValue else { throw SyncError.badResponse }
        let encoded = try SyncJSON.syncEncoder.encode(results)
        return try SyncJSON.syncDecoder.decode([PushResult].self, from: encoded)
    }

    // MARK: - Pull

    /// - Returns: true if the pull completed and was applied.
    private func pullChanges(campId: String) async -> Bool {
        do {
            let since = await cache.watermark(campId: campId)
            var result = try await callPull(campId: campId, since: since)

            if result.fullResyncRequired {
                // The device has been away longer than the server's 90-day tombstone window, so
                // the deletions it missed are simply not knowable any more. A delta would leave
                // it showing work that was deleted months ago, forever. Start over.
                await cache.clearAll(campId: campId)
                result = try await callPull(campId: campId, since: nil)
            }

            for (table, rows) in result.tables {
                await cache.merge(rows: rows, into: table, campId: campId)
            }
            await cache.applyTombstones(result.deleted, campId: campId)

            // Flag - but do not touch - queued work that the server has since moved under.
            await detectConflicts(result, campId: campId)
            // And put local unsent changes back on top, so the cache keeps showing the person
            // what they did rather than the server's older version of it.
            await reapplyPending(campId: campId)

            // Only now. Advancing the watermark before the apply would skip this delta forever
            // if the app died in between.
            await cache.setWatermark(result.serverTime, campId: campId)
            lastPullError = nil
            return true
        } catch {
            lastPullError = error.localizedDescription
            scheduleBackoff(.pull)
            return false
        }
    }

    private func callPull(campId: String, since: String?) async throws -> SyncPullResult {
        let params: SyncRow = [
            "p_camp_id": .string(campId),
            "p_since": since.map { SyncJSON.string($0) } ?? .null,
        ]
        let data = try await client.rpc("sync_pull", params: params).execute().data
        let json = try SyncJSON.syncDecoder.decode(SyncJSON.self, from: data)
        return SyncPullResult(json: json)
    }

    // MARK: - Conflicts

    /// Columns that are never worth comparing.
    ///
    /// `id` and `camp_id` are identity, not content. Everything ending in `_at` is a timestamp
    /// the server and the device spell differently ("+00:00" versus "Z", microseconds versus
    /// milliseconds), so comparing them literally would mark every row a conflict and the flag
    /// would mean nothing.
    private static let conflictIgnoredColumns: Set<String> = ["id", "camp_id"]

    private func detectConflicts(_ result: SyncPullResult, campId: String) async {
        let pending = await queue.all(campId: campId).filter { !$0.hasFailedPermanently }
        guard !pending.isEmpty else { return }

        var serverRows: [String: SyncRow] = [:]
        for (table, rows) in result.tables {
            for row in rows {
                guard let object = row.objectValue,
                      let id = object["id"]?.stringValue else { continue }
                serverRows["\(table)/\(id)"] = object
            }
        }

        var conflicted: [String] = []
        for mutation in pending where mutation.op == .upsert {
            guard let rowId = mutation.rowId,
                  let server = serverRows["\(mutation.table)/\(rowId)"] else { continue }

            for (column, localValue) in mutation.payload {
                if Self.conflictIgnoredColumns.contains(column) || column.hasSuffix("_at") { continue }
                guard let serverValue = server[column] else { continue }
                if serverValue != localValue {
                    conflicted.append(mutation.id)
                    break
                }
            }
        }
        await queue.markConflict(ids: conflicted)
    }

    /// Fold rows that arrived through an ordinary PostgREST fetch into the offline cache.
    ///
    /// `sync_pull` is not the app's only source of truth: the module screens still fetch their
    /// own data directly, and there is no reason for a successful fetch to leave the cache
    /// staler than the screen the person is looking at. Seeding here means the offline fallback
    /// has something to fall back TO from the first load with signal, rather than only after a
    /// pull has run.
    ///
    /// Models are re-encoded through the same encoder the wire uses, so what lands on disk is
    /// the same shape a pull would have written.
    func cacheFetched(_ models: [some Encodable], table: String) async {
        guard let campId, !campId.isEmpty else { return }
        guard let data = try? SyncJSON.syncEncoder.encode(models),
              let rows = try? SyncJSON.syncDecoder.decode([SyncJSON].self, from: data),
              !rows.isEmpty
        else { return }
        await cache.merge(rows: rows, into: table, campId: campId)
        // A fetch is the server's view; anything still queued locally is newer than that.
        await reapplyPending(campId: campId)
    }

    /// Re-assert every unsent local change over the freshly pulled rows.
    private func reapplyPending(campId: String) async {
        for mutation in await queue.all(campId: campId) where mutation.op == .upsert {
            await cache.overlay(mutation.payload, table: mutation.table, campId: campId)
        }
    }

    // MARK: - Backoff

    /// Exponential, jittered, capped at five minutes.
    ///
    /// The jitter matters more than it looks: a crew of six phones loses signal in the same
    /// valley and regains it on the same bend in the road, and without jitter all six retry on
    /// exactly the same second, forever, in lockstep. Spreading them stops a camp's whole crew
    /// arriving as one burst.
    private func scheduleBackoff(_ lane: Lane) {
        let failures: Int
        switch lane {
        case .push: pushFailures += 1; failures = pushFailures
        case .pull: pullFailures += 1; failures = pullFailures
        }
        let exponential = min(Self.baseBackoff * pow(2, Double(failures - 1)), Self.maxBackoff)
        let jittered = exponential * Double.random(in: 0.7...1.3)
        let next = Date().addingTimeInterval(jittered)
        switch lane {
        case .push: pushNextAttemptAt = next
        case .pull: pullNextAttemptAt = next
        }
        scheduleWake(after: jittered)
    }

    /// Wake up when the backoff expires rather than waiting for the next 60-second tick.
    private func scheduleWake(after delay: TimeInterval) {
        wakeTask?.cancel()
        wakeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, let self else { return }
            await self.syncNow(reason: .timer)
        }
    }

    // MARK: - Publishing

    private func refreshPublished() async {
        guard let campId else {
            pendingCount = 0; failures = []; conflictCount = 0
            return
        }
        let all = await queue.all(campId: campId)
        let failed = all.filter(\.hasFailedPermanently)
        failures = failed
        pendingCount = all.count - failed.count
        conflictCount = all.filter { $0.conflictDetected && !$0.hasFailedPermanently }.count
    }
}
