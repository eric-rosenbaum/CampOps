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
            summary: L10n.tr("%1$@: %2$@", status.displayName, title)
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
            summary: L10n.tr("Done: %@", title)
        )
    }

    /// Handing a job to a person, to a crew, or to nobody.
    ///
    /// Both assignee columns always travel together, even when only one of them changed. A job
    /// sits with a person or with a crew and never both (`issues_one_assignee`), so naming a
    /// person without clearing the crew is a write the database refuses -- which on the web is
    /// still a live bug where "Take it" on a crew-held job fails into the console.
    func queueIssueAssignment(
        issueId: String, title: String,
        assigneeId: String?, assigneeGroupId: String? = nil,
        status: IssueStatus
    ) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: [
                "assignee_id": assigneeId.json,
                "assignee_group_id": assigneeGroupId.json,
                "status": .string(status.rawValue),
            ],
            summary: assigneeId == nil && assigneeGroupId == nil
                ? L10n.tr("Unassigned: %@", title) : L10n.tr("Assigned: %@", title)
        )
    }

    /// A whole work order, logged on a phone.
    ///
    /// Full payload, because the row does not exist server-side yet -- and it may not for some
    /// time. This is the write the offline layer exists for: somebody standing in a cabin with
    /// no signal types what is wrong, and it is a real row with a real id the moment they do.
    ///
    /// What is deliberately absent: `assigned_at`, `resolved_at`, `updated_at`. All three are
    /// stamped by the server, and a phone whose clock is a day out must not get to claim
    /// otherwise.
    func queueIssueCreate(_ issue: Issue) async {
        var fields: SyncRow = [
            "title": .string(issue.title),
            "description": issue.description.json,
            "locations": .array(issue.locations.map { .string($0) }),
            "location_ids": .array(issue.locationIds.map { .string($0) }),
            "priority": .string(issue.priority.rawValue),
            "status": .string(issue.status.rawValue),
            "assignee_id": issue.assigneeId.json,
            "assignee_group_id": issue.assigneeGroupId.json,
            "reported_by_id": issue.reportedById.json,
            "trade": .string(issue.trade),
            "asset_id": issue.assetId.json,
            "vendor_id": issue.vendorId.json,
            "due_date": issue.dueDate.json,
            "due_time": issue.dueTime.json,
            "photo_url": issue.photoUrl.json,
            "source": .string((issue.source ?? .ios).rawValue),
            "created_at": .string(SyncTimestamp.string(issue.createdAt)),
        ]
        if let cost = issue.actualCost { fields["actual_cost"] = .double(cost) }
        await enqueue(
            table: SyncTable.issues,
            rowId: issue.id,
            fields: fields,
            summary: L10n.tr("Logged: %@", issue.title)
        )
    }

    /// An edit to a work order that already exists. Partial: only what the form can change.
    func queueIssueEdit(_ issue: Issue) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issue.id,
            fields: [
                "title": .string(issue.title),
                "description": issue.description.json,
                "locations": .array(issue.locations.map { .string($0) }),
                "location_ids": .array(issue.locationIds.map { .string($0) }),
                "priority": .string(issue.priority.rawValue),
                "trade": .string(issue.trade),
                "asset_id": issue.assetId.json,
                "vendor_id": issue.vendorId.json,
                "due_date": issue.dueDate.json,
                "due_time": issue.dueTime.json,
                "photo_url": issue.photoUrl.json,
            ],
            summary: L10n.tr("Edited: %@", issue.title)
        )
    }

    /// The contractor a job is waiting on.
    func queueIssueVendor(issueId: String, title: String, vendorId: String?) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: ["vendor_id": vendorId.json],
            summary: L10n.tr("Vendor set: %@", title)
        )
    }

    /// Time spent, entered when closing out.
    func queueIssueMinutes(issueId: String, title: String, minutes: Int?) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: ["minutes_spent": minutes.map { SyncJSON.integer($0) } ?? .null],
            summary: L10n.tr("Time logged: %@", title)
        )
    }

    /// Attaches a photo that finished uploading after the fact. See `PhotoQueue`.
    func queueIssuePhoto(issueId: String, url: String) async {
        await enqueue(
            table: SyncTable.issues,
            rowId: issueId,
            fields: ["photo_url": .string(url)],
            summary: L10n.tr("Photo attached")
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
            summary: entry.displayAction
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
                "mentions": .array(comment.mentions.map { .string($0) }),
                "created_at": .string(SyncTimestamp.string(comment.createdAt)),
            ],
            summary: L10n.tr("Note: %@", String(comment.body.prefix(40)))
        )
    }

    /// The photo a step asked for, once it has uploaded.
    func queueChecklistPhoto(itemId: String, url: String) async {
        await enqueue(
            table: SyncTable.issueChecklistItems,
            rowId: itemId,
            fields: ["photo_url": .string(url)],
            summary: L10n.tr("Photo attached to a step")
        )
    }

    /// Photos that finished uploading after the message was already sent.
    func queueCommentPhotos(commentId: String, urls: [String]) async {
        await enqueue(
            table: SyncTable.issueComments,
            rowId: commentId,
            fields: ["photo_urls": .array(urls.map { .string($0) })],
            summary: L10n.tr("Photo attached to a message")
        )
    }

    // MARK: Issue checklist

    /// Ticking (or un-ticking) a step. Partial by design, so two people working the same work
    /// order from two phones do not overwrite each other's ticks on other steps.
    ///
    /// Note what this does NOT do: resolve the work order when the last step is ticked. A
    /// database trigger (`checklist_close_issue`) already does that, and a client that also
    /// closes it races the trigger and writes a status the server is about to write anyway.
    func queueChecklistTick(_ item: IssueChecklistItem, done: Bool, by user: CampUser,
                            photoUrl: String? = nil) async {
        var fields: SyncRow = ["is_done": .bool(done)]
        if let photoUrl { fields["photo_url"] = .string(photoUrl) }
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
            summary: done ? L10n.tr("Ticked: %@", item.text) : L10n.tr("Un-ticked: %@", item.text)
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
            summary: L10n.tr("Added step: %@", item.text)
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

    static func comments(issueId: String, campId: String) async -> [IssueComment] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.issueComments, campId: campId)
        return decode(IssueComment.self, raw)
            .filter { $0.issueId == issueId && $0.deletedAt == nil }
            .sorted { $0.createdAt < $1.createdAt }
    }

    /// Crews, vendors and routines all arrive through `sync_pull`, so every Campground screen
    /// -- including the one a sticker opens -- can render with no signal at all.
    static func vendors(campId: String) async -> [ServiceVendor] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.serviceVendors, campId: campId)
        return decode(ServiceVendor.self, raw).sorted { $0.name < $1.name }
    }

    static func schedules(campId: String) async -> [WorkSchedule] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.workSchedules, campId: campId)
        return decode(WorkSchedule.self, raw).filter(\.isActive)
    }

    static func routing(campId: String) async -> [WorkRouting] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.workRouting, campId: campId)
        return decode(WorkRouting.self, raw)
    }

    static func checklist(issueId: String, campId: String) async -> [IssueChecklistItem] {
        let raw = await OfflineCache.shared.rows(of: SyncTable.issueChecklistItems, campId: campId)
        return decode(IssueChecklistItem.self, raw)
            .filter { $0.issueId == issueId }
            .sorted { ($0.position, $0.createdAt) < ($1.position, $1.createdAt) }
    }
}
