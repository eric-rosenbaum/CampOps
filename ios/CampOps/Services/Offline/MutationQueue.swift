import Foundation
import Supabase

/// Every write the device still owes the server, in the order it was made.
///
/// **Why this is persisted on every single change, not on a timer or at background time.**
/// The queue is the only copy of work a person has already been told succeeded. A maintenance
/// lead taps Done on a work order in a dead zone, sees it go green, and puts the phone in their
/// pocket; if iOS then kills the app for memory - which it does, routinely, to a backgrounded
/// app - anything still only in RAM is gone, and the work order is open again next time they
/// look, with no error and no explanation. There is no acceptable window here: `enqueue` does
/// not return until the change is on disk. The cost is one small file write per tap, which is
/// nothing next to the cost of losing a tap.
///
/// **Why an actor.** Mutations arrive from view models on the main actor while the SyncEngine's
/// drain reads and rewrites the same array from a background task. An actor serialises that for
/// free, and - unlike a lock - makes the disk write part of the same critical section, so the
/// in-memory array and the file cannot disagree.
actor MutationQueue {
    static let shared = MutationQueue()

    private let fm = FileManager.default
    private let fileURL: URL
    private var items: [PendingMutation] = []
    private var loaded = false

    init() {
        let base = (try? FileManager.default.url(for: .applicationSupportDirectory,
                                                 in: .userDomainMask,
                                                 appropriateFor: nil,
                                                 create: true))
            ?? URL.temporaryDirectory
        let directory = base.appendingPathComponent("CampCommand", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appendingPathComponent("mutation-queue.json")
    }

    // MARK: - Reading

    func all(campId: String? = nil) -> [PendingMutation] {
        load()
        guard let campId else { return items }
        return items.filter { $0.campId == campId }
    }

    func count(campId: String) -> Int {
        all(campId: campId).count
    }

    /// Everything still worth sending: this camp's mutations that have not been rejected and
    /// have not exhausted their transport attempts.
    ///
    /// Order matters and is preserved. `sync_push` applies mutations one at a time in the order
    /// given, so "create the comment" has to reach the server before "edit the comment".
    func sendable(campId: String, limit: Int = 50) -> [PendingMutation] {
        load()
        return items
            .filter { $0.campId == campId && !$0.hasFailedPermanently }
            .prefix(limit)
            .map { $0 }
    }

    /// The ones a person has to deal with. Nothing here is retried on its own.
    func failed(campId: String) -> [PendingMutation] {
        load()
        return items.filter { $0.campId == campId && $0.hasFailedPermanently }
    }

    /// Queued-but-unsent mutations touching a given row, newest last. Used by conflict
    /// detection and by the optimistic overlay.
    func pendingFor(table: String, rowId: String, campId: String) -> [PendingMutation] {
        load()
        return items.filter { $0.campId == campId && $0.table == table && $0.rowId == rowId }
    }

    // MARK: - Writing

    func enqueue(_ mutation: PendingMutation) {
        load()
        items.append(mutation)
        persist()
    }

    /// Bumped before the push goes out, so a push that takes the app down with it still counts
    /// against the budget. See `PendingMutation.attemptCount`.
    func recordAttempt(ids: [String]) {
        load()
        let set = Set(ids)
        for index in items.indices where set.contains(items[index].id) {
            items[index].attemptCount += 1
        }
        persist()
    }

    /// The push itself failed - no signal, a dead socket, a 500. Nothing is known about whether
    /// these landed, and that is fine: the client-chosen mutation id makes the retry a no-op if
    /// they did.
    func recordTransportFailure(ids: [String], message: String) {
        load()
        let set = Set(ids)
        for index in items.indices where set.contains(items[index].id) {
            items[index].lastError = message
        }
        persist()
    }

    /// The server looked at this mutation and refused it. Retrying an identical payload gets an
    /// identical refusal, so it is marked rejected immediately rather than spending eight
    /// attempts discovering that.
    func recordRejection(id: String, message: String?) {
        load()
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].isRejected = true
        items[index].lastError = message ?? "The server rejected this change."
        persist()
    }

    func markConflict(ids: [String]) {
        load()
        guard !ids.isEmpty else { return }
        let set = Set(ids)
        var changed = false
        for index in items.indices where set.contains(items[index].id) && !items[index].conflictDetected {
            items[index].conflictDetected = true
            changed = true
        }
        if changed { persist() }
    }

    /// Applied successfully (or already applied - `duplicate: true` counts). Only now is it
    /// safe to forget.
    func remove(ids: [String]) {
        load()
        guard !ids.isEmpty else { return }
        let set = Set(ids)
        let before = items.count
        items.removeAll { set.contains($0.id) }
        if items.count != before { persist() }
    }

    /// The user asked to try a failed change again - typically after fixing whatever the server
    /// complained about, or just because they are back in signal.
    func resetForRetry(ids: [String]) {
        load()
        let set = Set(ids)
        for index in items.indices where set.contains(items[index].id) {
            items[index].attemptCount = 0
            items[index].isRejected = false
            items[index].lastError = nil
        }
        persist()
    }

    /// The user chose to abandon a change the server will not take. This is the ONLY path that
    /// drops a person's work, and it exists so that they make that call rather than the app
    /// making it silently on their behalf.
    func discard(id: String) {
        load()
        items.removeAll { $0.id == id }
        persist()
    }

    /// Sign-out / camp switch. Only that camp's work is dropped.
    func clear(campId: String) {
        load()
        items.removeAll { $0.campId == campId }
        persist()
    }

    // MARK: - Disk

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let data = try? Data(contentsOf: fileURL) else { return }
        do {
            items = try SyncJSON.syncDecoder.decode([PendingMutation].self, from: data)
        } catch {
            // A queue file that will not decode is a serious thing to shrug at, so keep it
            // rather than overwriting it: a person can still be told their work is stuck, and
            // the file can be recovered from the container. Starting empty and silently
            // clobbering it is how unsent work disappears without trace.
            let salvage = fileURL.deletingLastPathComponent()
                .appendingPathComponent("mutation-queue.corrupt-\(Int(Date().timeIntervalSince1970)).json")
            try? fm.moveItem(at: fileURL, to: salvage)
            items = []
        }
    }

    /// Same atomic write as the cache, for the same reason - a torn file here would cost unsent
    /// work rather than a re-fetchable snapshot, so if anything it matters more.
    private func persist() {
        guard let data = try? SyncJSON.syncEncoder.encode(items) else { return }
        let directory = fileURL.deletingLastPathComponent()
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true)

        guard fm.fileExists(atPath: fileURL.path) else {
            try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return
        }
        let temp = directory.appendingPathComponent(".mutation-queue.\(UUID().uuidString).tmp")
        do {
            try data.write(to: temp, options: [.completeFileProtectionUntilFirstUserAuthentication])
            _ = try fm.replaceItemAt(fileURL, withItemAt: temp)
        } catch {
            try? fm.removeItem(at: temp)
            try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }
}
