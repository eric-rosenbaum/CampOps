import Foundation
import Supabase

// The vocabulary shared by the three pieces of the offline layer: OfflineCache (what we last
// saw), MutationQueue (what we still owe the server) and SyncEngine (the thing that reconciles
// the two).
//
// Everything here is expressed in the server's own terms - snake_case column dictionaries -
// rather than in app models, deliberately. A queued mutation has to survive an app update that
// changes `Issue`, and it has to be replayable months later by a version of the app that no
// longer has the struct it was created from. Column names are the stable contract; Swift types
// are not.

// MARK: - JSON

/// The JSON box used for cached rows and queued payloads.
///
/// This is supabase-swift's own `AnyJSON`, not a hand-rolled equivalent, so a value round-trips
/// through disk and back onto the wire with exactly the encoder/decoder the PostgREST client
/// uses. It also keeps integers and doubles apart, which matters: re-encoding an `int` column's
/// `0` as `0.0` makes Postgres reject the whole mutation.
typealias SyncJSON = AnyJSON

/// A row, or a partial row, as column-name -> value.
typealias SyncRow = JSONObject

nonisolated extension SyncJSON {
    /// The encoder/decoder pair PostgREST itself uses. Notably it understands Postgres
    /// timestamps, so a row pulled from `sync_pull` and parked on disk still decodes into a
    /// model with `Date` fields later.
    static var syncDecoder: JSONDecoder { AnyJSON.decoder }
    static var syncEncoder: JSONEncoder { AnyJSON.encoder }
}

// MARK: - Tables

/// The tables the two sync RPCs know about. These lists mirror `sync_pull` and `sync_push`
/// exactly; sending anything else back gets `"table not syncable"` and a permanent failure.
nonisolated enum SyncTable {
    static let issues                 = "issues"
    static let issueComments          = "issue_comments"
    static let issueChecklistItems    = "issue_checklist_items"
    static let issueActivity          = "issue_activity"
    static let checklistTasks         = "checklist_tasks"
    static let locations              = "locations"
    static let campAssets             = "camp_assets"
    static let assetCheckouts         = "asset_checkouts"
    static let assetServiceRecords    = "asset_service_records"
    static let assetMaintenanceTasks  = "asset_maintenance_tasks"
    static let pools                  = "pools"
    static let poolChemicalReadings   = "pool_chemical_readings"
    static let poolEquipment          = "pool_equipment"
    static let poolServiceLog         = "pool_service_log"
    static let poolSeasonalTasks      = "pool_seasonal_tasks"
    static let poolInspections        = "pool_inspections"
    static let poolInspectionLog      = "pool_inspection_log"
    static let workSchedules          = "work_schedules"
    static let serviceVendors         = "service_vendors"
    static let workRouting            = "work_routing"
    static let buildingSeasonalTasks  = "building_seasonal_tasks"

    /// Everything `sync_pull` returns, in the order it returns it.
    static let pullable: [String] = [
        issues, issueComments, issueChecklistItems, checklistTasks, locations,
        campAssets, assetCheckouts, assetServiceRecords, assetMaintenanceTasks,
        pools, poolChemicalReadings, poolEquipment, poolServiceLog, poolSeasonalTasks,
        poolInspections, poolInspectionLog, workSchedules, serviceVendors, workRouting,
    ]

    /// Everything `sync_push` will accept. Queueing a write to anything else is a programming
    /// error, so `SyncEngine` refuses it up front rather than letting it rot in the queue.
    static let pushable: Set<String> = [
        issues, issueComments, issueChecklistItems, checklistTasks,
        poolChemicalReadings, poolInspectionLog, poolServiceLog, poolSeasonalTasks,
        assetCheckouts, assetServiceRecords, assetMaintenanceTasks,
        buildingSeasonalTasks, issueActivity,
    ]

    /// `work_routing` has no `id`, so it can be cached as a list but never keyed by row.
    static let unkeyed: Set<String> = [workRouting]
}

// MARK: - Mutations

nonisolated enum SyncOp: String, Codable, Sendable {
    case upsert
    case delete
}

/// One write the device owes the server.
///
/// **Why the id is chosen by the client.** `sync_push` records every mutation id it applies and
/// short-circuits on a repeat, returning `ok: true, duplicate: true`. That is what makes a
/// retry safe. Without it, "the request timed out" is genuinely ambiguous - the write may have
/// landed - and the only two options are to retry (and risk a second comment, a second service
/// record, a double-decremented count) or to give up (and lose the person's work). A stable id
/// minted on the device before the first attempt turns that ambiguity into a no-op, so the
/// queue can retry as many times as it likes across as many flaky sockets as it likes.
///
/// Note this is NOT the row's id. The row id lives in `payload["id"]`. One row can have several
/// mutations queued against it (tick the box, then add a note), and each needs its own identity.
nonisolated struct PendingMutation: Codable, Identifiable, Hashable, Sendable {
    /// Client-chosen, stable for the life of this mutation. See the type comment.
    let id: String
    let campId: String
    let table: String
    let op: SyncOp
    /// snake_case columns. Partial for updates - see `SyncEngine.enqueue` for why.
    var payload: SyncRow
    /// Plain-language description of what the person did, shown if this ever has to be
    /// surfaced as a failure. "Mutation 8f3a-..." is not something anyone can act on.
    let summary: String
    let createdAt: Date

    /// Bumped before each push attempt, not after, so a push that crashes the app still
    /// counts. Otherwise a poison mutation retries forever in a crash loop.
    var attemptCount: Int = 0
    var lastError: String?
    /// The server looked at this and said no. Distinct from a transport failure: the same
    /// payload will be rejected the same way forever, so there is no point retrying it on a
    /// timer. It goes straight to the user.
    var isRejected: Bool = false
    /// A pull returned a different value for a field this mutation also changes. The mutation
    /// stays queued and will still win, but the UI can say so. See `SyncEngine.detectConflicts`.
    var conflictDetected: Bool = false

    /// The row this mutation targets, when it has one.
    var rowId: String? { payload["id"]?.stringValue }

    /// A transport failure this many times running means something is wrong that waiting will
    /// not fix - a payload the server hangs up on, a row whose RLS policy now refuses us. Stop
    /// burning battery and show it to a person.
    static let maxTransportAttempts = 8

    var hasFailedPermanently: Bool {
        isRejected || attemptCount >= Self.maxTransportAttempts
    }

    /// The shape `sync_push` expects in `p_mutations`.
    var wireForm: SyncJSON {
        .object([
            "id": .string(id),
            "op": .string(op.rawValue),
            "table": .string(table),
            "payload": .object(payload),
        ])
    }

    init(
        id: String = UUID().uuidString,
        campId: String,
        table: String,
        op: SyncOp,
        payload: SyncRow,
        summary: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.campId = campId
        self.table = table
        self.op = op
        self.payload = payload
        self.summary = summary
        self.createdAt = createdAt
    }

    // Hand-written so that adding a field in a future release cannot brick a queue file written
    // by the current one. A queue that fails to decode is a queue full of silently lost work,
    // which is the exact failure this whole layer exists to prevent, so every field added since
    // v1 decodes with a default.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id               = try c.decode(String.self, forKey: .id)
        campId           = try c.decode(String.self, forKey: .campId)
        table            = try c.decode(String.self, forKey: .table)
        op               = (try? c.decode(SyncOp.self, forKey: .op)) ?? .upsert
        payload          = (try? c.decode(SyncRow.self, forKey: .payload)) ?? [:]
        summary          = (try? c.decode(String.self, forKey: .summary)) ?? "Saved change"
        createdAt        = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
        attemptCount     = (try? c.decode(Int.self, forKey: .attemptCount)) ?? 0
        lastError        = try? c.decodeIfPresent(String.self, forKey: .lastError)
        isRejected       = (try? c.decode(Bool.self, forKey: .isRejected)) ?? false
        conflictDetected = (try? c.decode(Bool.self, forKey: .conflictDetected)) ?? false
    }
}

// MARK: - RPC results

/// One entry from `sync_push`'s `results` array.
nonisolated struct PushResult: Decodable, Sendable {
    let id: String
    let ok: Bool
    let duplicate: Bool
    let error: String?

    enum CodingKeys: String, CodingKey { case id, ok, duplicate, error }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // A malformed mutation comes back with a null id; treat it as unmatched rather than
        // crashing the whole drain.
        id        = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
        ok        = (try? c.decode(Bool.self, forKey: .ok)) ?? false
        duplicate = (try? c.decode(Bool.self, forKey: .duplicate)) ?? false
        error     = try? c.decodeIfPresent(String.self, forKey: .error)
    }
}

/// A row the server no longer has.
///
/// **Why tombstones exist at all.** A delta pull can only ever say "here is what changed"; a
/// deleted row has nothing left to report. Without a tombstone the device keeps showing an
/// issue that was deleted three weeks ago, and no amount of syncing removes it, because the
/// pull that would have removed it returns nothing about a row that no longer exists. So the
/// server keeps a 90-day record of deletions and the client replays them against its cache.
///
/// The 90 days is also why `full_resync_required` exists: past that window the tombstone log
/// has been trimmed, deletions are unknowable, and the only honest answer is to throw the cache
/// away and pull everything again.
nonisolated struct Tombstone: Decodable, Hashable, Sendable {
    let table: String
    let id: String
}

/// A decoded `sync_pull` response.
nonisolated struct SyncPullResult: Sendable {
    /// table name -> the rows it returned
    var tables: [String: [SyncJSON]] = [:]
    var deleted: [Tombstone] = []
    /// Kept as the server's own string and echoed back verbatim as the next `p_since`.
    /// Parsing it into a `Date` and re-formatting it would round the microseconds and quietly
    /// re-pull (or worse, skip) rows on the boundary.
    var serverTime: String?
    var fullResyncRequired: Bool = false

    init(json: SyncJSON) {
        guard let root = json.objectValue else { return }
        for table in SyncTable.pullable {
            tables[table] = root[table]?.arrayValue ?? []
        }
        if let raw = root["deleted"]?.arrayValue {
            deleted = raw.compactMap { entry in
                guard let obj = entry.objectValue,
                      let t = obj["table"]?.stringValue,
                      let i = obj["id"]?.stringValue else { return nil }
                return Tombstone(table: t, id: i)
            }
        }
        serverTime = root["server_time"]?.stringValue
        fullResyncRequired = root["full_resync_required"]?.boolValue ?? false
    }
}

// MARK: - State

/// What the UI is allowed to say about sync.
nonisolated enum SyncState: Equatable {
    /// Reachable, queue empty, nothing to report.
    case online
    /// No usable path to the network. Writes still work; they are being queued.
    case offline
    /// A push or pull is in flight right now.
    case syncing
    /// Reachable, but `n` writes are still waiting their turn (or their backoff).
    case pendingCount(Int)
    /// These will not be retried on their own. A person has to look at them.
    case failed([PendingMutation])
}

// MARK: - Errors

nonisolated enum SyncError: LocalizedError {
    case noCamp
    case notSyncable(String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .noCamp:               return "No camp is selected."
        case .notSyncable(let t):   return "\(t) cannot be synced from this device."
        case .badResponse:          return "The server sent a response the app could not read."
        }
    }
}
