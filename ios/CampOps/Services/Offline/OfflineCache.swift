import Foundation
import Supabase

/// The last-known state of the camp, on disk, so the app has something to show when there is no
/// signal at all.
///
/// **Why files and not UserDefaults.** A camp's `issues` table alone runs to hundreds of rows
/// with activity and location arrays on each; `locations` is a whole tree. UserDefaults is a
/// property list loaded into memory in one piece at launch and rewritten in one piece on every
/// change - it is for preferences, and putting megabytes of camp data in it slows launch and
/// invites the plist to be dropped wholesale. One JSON file per table is boring, debuggable
/// (you can `cat` it), and lets a single table be rewritten without touching the rest.
///
/// **Why not a database.** SQLite via GRDB or SwiftData would be a better store, but adding an
/// SPM package means an Xcode project edit, and SwiftData means a model layer parallel to the
/// Codable structs the app already has. Neither is worth it for a keyed snapshot that is only
/// ever read whole.
///
/// Rows are stored as the server's own JSON, keyed by row id, not as app models. That means a
/// cache written by today's build still decodes after `Issue` gains a field tomorrow, and it
/// means tombstones and partial upserts are O(1) dictionary work.
actor OfflineCache {
    static let shared = OfflineCache()

    private let fm = FileManager.default
    private let root: URL

    /// "campId/table" -> (row id -> row). Loaded lazily, held in memory, flushed on change.
    private var tables: [String: SyncRow] = [:]
    /// Tables whose file has been read at least once this launch.
    private var loadedTables: Set<String> = []
    /// campId -> watermark. `sync_pull`'s `server_time` from the last successful apply.
    private var watermarks: [String: String] = [:]
    private var loadedMeta: Set<String> = []

    init() {
        let base = (try? FileManager.default.url(for: .applicationSupportDirectory,
                                                 in: .userDomainMask,
                                                 appropriateFor: nil,
                                                 create: true))
            ?? URL.temporaryDirectory
        root = base.appendingPathComponent("CampCommand/OfflineCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    // MARK: - Reading

    /// Every cached row for a table, in no particular order.
    func rows(of table: String, campId: String) -> [SyncJSON] {
        load(table: table, campId: campId)
        return Array((tables[key(table, campId)] ?? [:]).values)
    }

    func row(id: String, table: String, campId: String) -> SyncJSON? {
        load(table: table, campId: campId)
        return tables[key(table, campId)]?[id]
    }

    func isEmpty(table: String, campId: String) -> Bool {
        load(table: table, campId: campId)
        return (tables[key(table, campId)] ?? [:]).isEmpty
    }

    // MARK: - Writing

    /// Merge a pull's rows into a table. Rows are keyed by `id`, so a row that came back
    /// changed replaces its old copy and a row that is new is added; rows the delta did not
    /// mention are left exactly as they were.
    func merge(rows: [SyncJSON], into table: String, campId: String) {
        guard !rows.isEmpty else { return }
        load(table: table, campId: campId)
        let k = key(table, campId)
        var current = tables[k] ?? [:]

        if SyncTable.unkeyed.contains(table) {
            // No id to key on (work_routing is three rows). Replace wholesale; a delta for it
            // is always the complete set.
            current = [:]
            for (index, row) in rows.enumerated() { current[String(index)] = row }
        } else {
            for row in rows {
                guard let id = row.objectValue?["id"]?.stringValue else { continue }
                current[id] = row
            }
        }

        tables[k] = current
        persist(table: table, campId: campId)
    }

    /// Lay a queued local change on top of the cached row.
    ///
    /// This is what makes an offline tap look like it worked: the person marks a work order
    /// resolved with no signal, the mutation goes in the queue, and the same fields are written
    /// into the cache so every screen reading the cache shows "resolved" immediately. When the
    /// push eventually lands, the next pull overwrites this with the server's version, which by
    /// then says the same thing.
    func overlay(_ fields: SyncRow, table: String, campId: String) {
        guard let id = fields["id"]?.stringValue else { return }
        load(table: table, campId: campId)
        let k = key(table, campId)
        var current = tables[k] ?? [:]
        var merged = current[id]?.objectValue ?? [:]
        for (column, value) in fields { merged[column] = value }
        current[id] = .object(merged)
        tables[k] = current
        persist(table: table, campId: campId)
    }

    func removeRow(id: String, table: String, campId: String) {
        load(table: table, campId: campId)
        let k = key(table, campId)
        guard tables[k]?[id] != nil else { return }
        tables[k]?[id] = nil
        persist(table: table, campId: campId)
    }

    /// Apply a pull's `deleted` list. See `Tombstone` for why this is not optional.
    func applyTombstones(_ tombstones: [Tombstone], campId: String) {
        let byTable = Dictionary(grouping: tombstones, by: \.table)
        for (table, stones) in byTable {
            load(table: table, campId: campId)
            let k = key(table, campId)
            guard var current = tables[k] else { continue }
            var changed = false
            for stone in stones where current[stone.id] != nil {
                current[stone.id] = nil
                changed = true
            }
            guard changed else { continue }
            tables[k] = current
            persist(table: table, campId: campId)
        }
    }

    // MARK: - Watermark

    /// The `server_time` from the last successfully applied pull, or nil for "never synced".
    func watermark(campId: String) -> String? {
        loadMeta(campId: campId)
        return watermarks[campId]
    }

    /// Set only AFTER a pull has been fully applied. Moving the watermark first and crashing
    /// half way through the apply would skip that delta forever.
    func setWatermark(_ value: String?, campId: String) {
        loadMeta(campId: campId)
        watermarks[campId] = value
        persistMeta(campId: campId)
    }

    // MARK: - Resetting

    /// Throw the whole camp's snapshot away. Called on `full_resync_required` and on sign-out.
    ///
    /// Note this deliberately does NOT touch the mutation queue: unsent work belongs to the
    /// person who typed it, not to the cache, and a stale watermark is no reason to drop it.
    func clearAll(campId: String) {
        for table in SyncTable.pullable {
            tables[key(table, campId)] = nil
            loadedTables.remove(key(table, campId))
        }
        watermarks[campId] = nil
        loadedMeta.remove(campId)
        try? fm.removeItem(at: campDirectory(campId))
    }

    // MARK: - Disk

    private func key(_ table: String, _ campId: String) -> String { "\(campId)/\(table)" }

    private func campDirectory(_ campId: String) -> URL {
        root.appendingPathComponent(campId, isDirectory: true)
    }

    private func fileURL(table: String, campId: String) -> URL {
        campDirectory(campId).appendingPathComponent("\(table).json")
    }

    private func load(table: String, campId: String) {
        let k = key(table, campId)
        guard !loadedTables.contains(k) else { return }
        loadedTables.insert(k)
        guard let data = try? Data(contentsOf: fileURL(table: table, campId: campId)),
              let decoded = try? SyncJSON.syncDecoder.decode(SyncRow.self, from: data)
        else { return }
        tables[k] = decoded
    }

    private func loadMeta(campId: String) {
        guard !loadedMeta.contains(campId) else { return }
        loadedMeta.insert(campId)
        let url = campDirectory(campId).appendingPathComponent("meta.json")
        guard let data = try? Data(contentsOf: url),
              let decoded = try? SyncJSON.syncDecoder.decode([String: String].self, from: data)
        else { return }
        watermarks[campId] = decoded["watermark"]
    }

    private func persist(table: String, campId: String) {
        guard let rows = tables[key(table, campId)],
              let data = try? SyncJSON.syncEncoder.encode(rows) else { return }
        write(data, to: fileURL(table: table, campId: campId))
    }

    private func persistMeta(campId: String) {
        var meta: [String: String] = [:]
        if let watermark = watermarks[campId] { meta["watermark"] = watermark }
        guard let data = try? SyncJSON.syncEncoder.encode(meta) else { return }
        write(data, to: campDirectory(campId).appendingPathComponent("meta.json"))
    }

    /// Atomic write.
    ///
    /// The failure being avoided is a phone that dies (or is force-quit by iOS for memory) part
    /// way through rewriting a table file: what is left on disk is half a JSON document, which
    /// fails to decode on next launch and silently costs the user their whole offline cache for
    /// that table. Writing a temp file first and swapping it in means the file on disk is
    /// always one complete document - either the old one or the new one.
    private func write(_ data: Data, to url: URL) {
        let directory = url.deletingLastPathComponent()
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true)
        excludeFromBackup(directory)

        guard fm.fileExists(atPath: url.path) else {
            // Nothing to replace yet. Foundation's `.atomic` does the same temp-then-rename
            // dance and is the only option when there is no original to swap against.
            try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return
        }

        let temp = directory.appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
        do {
            try data.write(to: temp, options: [.completeFileProtectionUntilFirstUserAuthentication])
            _ = try fm.replaceItemAt(url, withItemAt: temp)
        } catch {
            try? fm.removeItem(at: temp)
            // Last resort: an atomic overwrite. Still never leaves a torn file.
            try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The snapshot is re-derivable from the server, so there is no reason to carry it in the
    /// user's iCloud backup or to restore it onto a new phone. (The mutation QUEUE is a
    /// different matter - that is unsent work, and it is deliberately left backed up.)
    private func excludeFromBackup(_ url: URL) {
        var url = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }
}
