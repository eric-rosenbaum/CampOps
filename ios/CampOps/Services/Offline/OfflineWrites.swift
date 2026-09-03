import Foundation
import Supabase

/// The bridge between the app's models and the column dictionaries the sync RPCs speak.
///
/// Every function here builds a PARTIAL payload - the row id plus only the columns the action
/// actually changes - except the three `create` helpers, which have to send a whole row because
/// the server's upsert has no existing row to fall back on. See the conflict policy on
/// `SyncEngine` for why partial is the default.
///
/// Note what is NOT in any of these payloads: `updated_at`. `issues` and `checklist_tasks` both
/// carry a trigger that stamps it server-side, which is the right place for it - a phone whose
/// clock is a day out should not get to claim its edit is the newest one.

nonisolated enum SyncTimestamp {
    /// Postgres-friendly ISO8601 with fractional seconds, in UTC.
    static func string(_ date: Date) -> String {
        formatter.string(from: date)
    }

    private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()
}

nonisolated private extension Optional where Wrapped == String {
    var json: SyncJSON { self.map { SyncJSON.string($0) } ?? .null }
}

// MARK: - Queueing writes

extension SyncEngine {

    // MARK: Issues

    /// Moving a work order along: in progress, resolved, back to assigned.
    func queueIssueStatus(issueId: String, title: String, status: IssueStatus) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: ["status": .string(status.rawValue)],
            summary: "\(status.displayName): \(title)"
        )
    }

    /// Closing a work order. This is the action the whole offline layer exists for: the tap a
    /// maintenance lead makes standing in front of the thing they just fixed, three ridges away
    /// from the nearest bar of signal.
    func queueIssueResolution(issueId: String, title: String, actualCost: Double?) async {
        var fields: SyncRow = ["status": .string(IssueStatus.resolved.rawValue)]
        fields["actual_cost"] = actualCost.map { SyncJSON.double($0) } ?? .null
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: fields,
            summary: "Resolved: \(title)"
        )
    }

    func queueIssueAssignment(issueId: String, title: String, assigneeId: String?, status: IssueStatus) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: [
                "assignee_id": assigneeId.json,
                "status": .string(status.rawValue),
            ],
            summary: assigneeId == nil ? "Unassigned: \(title)" : "Assigned: \(title)"
        )
    }

    /// The audit line that goes with any of the above. Queued separately so that a rejected
    /// activity row cannot stop the status change itself from landing - `sync_push` applies
    /// mutations one at a time, so ten good ones survive an eleventh being refused.
    func queueIssueActivity(_ entry: ActivityEntry, issueId: String) async {
        await enqueue(
            table: SyncTable.issueActivity,
            rowId: entry.id,
            fields: [
                "issue_id": .string(issueId),
                "user_id": entry.userId.json,
                "user_name": .string(entry.userName),
                "action": .string(entry.action),
                "created_at": .string(SyncTimestamp.string(entry.createdAt)),
            ],
            summary: entry.action
        )
    }

    // MARK: Comments

    /// A new note. Full payload: the row does not exist server-side yet.
    func queueCommentCreate(_ comment: IssueComment) async {
        await enqueue(
            table: SyncTable.issueComments,
            rowId: comment.id,
            fields: [
                "issue_id": .string(comment.issueId),
                "author_id": comment.authorId.json,
                "author_name": .string(comment.authorName),
                "body": .string(comment.body),
                "photo_urls": .array(comment.photoUrls.map { .string($0) }),
                "visible_to_reporter": .bool(comment.visibleToReporter),
                "created_at": .string(SyncTimestamp.string(comment.createdAt)),
            ],
            summary: "Comment: \(comment.body.prefix(40))"
        )
    }

    // MARK: Issue checklist

    /// Ticking (or un-ticking) a step. Partial by design, so two people working the same work
    /// order from two phones do not overwrite each other's ticks on other steps.
    func queueChecklistTick(_ item: IssueChecklistItem, done: Bool, by user: CampUser) async {
        var fields: SyncRow = ["is_done": .bool(done)]
        if done {
            fields["done_by"] = .string(user.id)
            fields["done_by_name"] = .string(user.name)
            fields["done_at"] = .string(SyncTimestamp.string(Date()))
        } else {
            fields["done_by"] = .null
            fields["done_by_name"] = .null
            fields["done_at"] = .null
        }
        await enqueue(
            table: SyncTable.issueChecklistItems,
            rowId: item.id,
            fields: fields,
            summary: (done ? "Ticked: " : "Un-ticked: ") + item.text
        )
    }

    func queueChecklistItemCreate(_ item: IssueChecklistItem) async {
        await enqueue(
            table: SyncTable.issueChecklistItems,
            rowId: item.id,
            fields: [
                "issue_id": .string(item.issueId),
                "position": .integer(item.position),
                "text": .string(item.text),
                "note": item.note.json,
                "requires_photo": .bool(item.requiresPhoto),
                "is_done": .bool(item.isDone),
                "created_at": .string(SyncTimestamp.string(item.createdAt)),
            ],
            summary: "Added step: \(item.text)"
        )
    }

    // MARK: Pre/post season tasks

    func queueTaskStatus(taskId: String, title: String, status: ChecklistStatus) async {
        await enqueue(
            table: SyncTable.checklistTasks,
            rowId: taskId,
            fields: ["status": .string(status.rawValue)],
            summary: "\(status.displayName): \(title)"
        )
    }

    func queueTaskAssignment(taskId: String, title: String, assigneeId: String?, status: ChecklistStatus?) async {
        var fields: SyncRow = ["assignee_id": assigneeId.json]
        if let status { fields["status"] = .string(status.rawValue) }
        await enqueue(
            table: SyncTable.checklistTasks,
            rowId: taskId,
            fields: fields,
            summary: assigneeId == nil ? "Unassigned: \(title)" : "Assigned: \(title)"
        )
    }
}

// MARK: - Reading the cache

/// What a screen falls back to when the network fetch fails.
///
/// These are deliberately thin: the cache holds the server's own rows, so decoding them into a
/// model is the same work the PostgREST client does, with the same decoder. A row that will not
/// decode is skipped rather than failing the whole read.
@MainActor
enum OfflineReads {
    /// Rows that fail to decode are skipped rather than failing the whole read: one row written
    /// by a newer server with an enum case this build does not know about should cost the user
    /// that row, not the entire offline list.
    ///
    /// This runs on the main actor rather than inside `OfflineCache` because the app's model
    /// structs - and therefore their `Codable` conformances - are main-actor isolated under this
    /// project's default-isolation setting. The cache stays a dumb store of server JSON.
    private static func decode<T: Decodable>(_ type: T.Type, _ rows: [SyncJSON]) -> [T] {
        rows.compactMap { row in
            guard let data = try? SyncJSON.syncEncoder.encode(row) else { return nil }
            return try? SyncJSON.syncDecoder.decode(T.self, from: data)
        }
    }

    static func issues(campId: String) async -> [Issue] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.issues, campId: campId)
        // Activity is not one of the tables `sync_pull` returns, so a cached issue shows its
        // details and its status but an empty activity feed until the network comes back. That
        // is a visibly incomplete issue rather than a wrong one, which is the right trade.
        return decode(IssueDBRow.self, raw).map { $0.toIssue() }.sorted { $0.createdAt > $1.createdAt }
    }

    static func tasks(campId: String) async -> [ChecklistTask] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.checklistTasks, campId: campId)
        return decode(ChecklistTaskDBRow.self, raw).map { $0.toTask() }.sorted { $0.createdAt < $1.createdAt }
    }

    static func comments(issueId: String, campId: String) async -> [IssueComment] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.issueComments, campId: campId)
        return decode(IssueComment.self, raw)
            .filter { $0.issueId == issueId && $0.deletedAt == nil }
            .sorted { $0.createdAt < $1.createdAt }
    }

    static func checklist(issueId: String, campId: String) async -> [IssueChecklistItem] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.issueChecklistItems, campId: campId)
        return decode(IssueChecklistItem.self, raw)
            .filter { $0.issueId == issueId }
            .sorted { ($0.position, $0.createdAt) < ($1.position, $1.createdAt) }
    }
}
