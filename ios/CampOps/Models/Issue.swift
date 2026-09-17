import Foundation

/// A work order.
///
/// The product calls this a work order and the table is called `issues`, and that mismatch is
/// deliberate on both platforms: the label and the route were renamed in the 2026-09-02 rework,
/// the table was not. Renaming a table thirteen surfaces read from is pure risk for zero
/// user-visible gain.
///
/// Every field the board has, the phone has. The one that is missing is `estimated_cost`, which
/// this app used to write to a column that has never existed -- see the note on `actualCost`.
struct Issue: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String?
    /// Canonical selected location ids (unified `locations` tree).
    var locationIds: [String]
    /// NAME snapshot of `locationIds`, kept in sync on write; used for display.
    var locations: [String]
    var priority: Priority
    var status: IssueStatus

    // MARK: Who has it
    //
    // A job sits with a person or with a crew, never both: the `issues_one_assignee` constraint
    // rejects a row with two. A job held by a crew is still `unassigned` -- nobody has taken it.
    var assigneeId: String?
    var assigneeGroupId: String?
    /// Null on public reports: the person who filed it has no account.
    var reportedById: String?

    /// The crew that does this kind of work. A `staff_groups.key` belonging to THIS camp -- a
    /// trigger rejects anything else. Sets a filter and a colour; it never grants or blocks.
    var trade: String

    // MARK: What it is about
    var assetId: String?
    var vendorId: String?
    /// Set when a routine generated this occurrence.
    var scheduleId: String?
    var retreatId: String?
    var retreatSpaceRequestId: String?

    // MARK: Closing it out
    /// Admin-only on both platforms.
    var actualCost: Double?
    var minutesSpent: Int?
    var photoUrl: String?

    // MARK: When it is due
    //
    // A camp-local calendar day, never an instant, which is why it is a `String` and why the
    // clock time lives in its own column.
    var dueDate: String?
    /// Camp-local clock time, `HH:mm:ss`, or nil for any time that day.
    var dueTime: String?

    // MARK: Where it came from
    var source: IssueSource?
    var isPublicReport: Bool
    var reporterName: String?
    var reporterContact: String?

    /// Stamped by database triggers. Never written from here: a client clock is the wrong
    /// source for a number the season review reports as fact.
    var assignedAt: Date?
    var resolvedAt: Date?

    let createdAt: Date
    var updatedAt: Date
    var activity: [ActivityEntry]

    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status, source, trade, activity
        case locationIds             = "location_ids"
        case assigneeId              = "assignee_id"
        case assigneeGroupId         = "assignee_group_id"
        case reportedById            = "reported_by_id"
        case assetId                 = "asset_id"
        case vendorId                = "vendor_id"
        case scheduleId              = "schedule_id"
        case retreatId               = "retreat_id"
        case retreatSpaceRequestId   = "retreat_space_request_id"
        case actualCost              = "actual_cost"
        case minutesSpent            = "minutes_spent"
        case photoUrl                = "photo_url"
        case dueDate                 = "due_date"
        case dueTime                 = "due_time"
        case isPublicReport          = "is_public_report"
        case reporterName            = "reporter_name"
        case reporterContact         = "reporter_contact"
        case assignedAt              = "assigned_at"
        case resolvedAt              = "resolved_at"
        case createdAt               = "created_at"
        case updatedAt               = "updated_at"
    }

    init(
        id: String = UUID().uuidString.lowercased(),
        title: String,
        description: String? = nil,
        locationIds: [String] = [],
        locations: [String] = [],
        priority: Priority = .normal,
        status: IssueStatus = .unassigned,
        assigneeId: String? = nil,
        assigneeGroupId: String? = nil,
        reportedById: String? = nil,
        trade: String = Trade.fallbackKey,
        assetId: String? = nil,
        vendorId: String? = nil,
        scheduleId: String? = nil,
        retreatId: String? = nil,
        retreatSpaceRequestId: String? = nil,
        actualCost: Double? = nil,
        minutesSpent: Int? = nil,
        photoUrl: String? = nil,
        dueDate: String? = nil,
        dueTime: String? = nil,
        source: IssueSource? = nil,
        isPublicReport: Bool = false,
        reporterName: String? = nil,
        reporterContact: String? = nil,
        assignedAt: Date? = nil,
        resolvedAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        activity: [ActivityEntry] = []
    ) {
        self.id = id; self.title = title; self.description = description
        self.locationIds = locationIds; self.locations = locations
        self.priority = priority; self.status = status
        self.assigneeId = assigneeId; self.assigneeGroupId = assigneeGroupId
        self.reportedById = reportedById; self.trade = trade
        self.assetId = assetId; self.vendorId = vendorId
        self.scheduleId = scheduleId; self.retreatId = retreatId
        self.retreatSpaceRequestId = retreatSpaceRequestId
        self.actualCost = actualCost; self.minutesSpent = minutesSpent
        self.photoUrl = photoUrl; self.dueDate = dueDate; self.dueTime = dueTime
        self.source = source; self.isPublicReport = isPublicReport
        self.reporterName = reporterName; self.reporterContact = reporterContact
        self.assignedAt = assignedAt; self.resolvedAt = resolvedAt
        self.createdAt = createdAt; self.updatedAt = updatedAt; self.activity = activity
    }

    static func == (lhs: Issue, rhs: Issue) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    // MARK: - Derived

    var reportedBy: CampUser? {
        reportedById.flatMap { id in AuthManager.shared.members.first { $0.id == id } }
    }
    var assignedTo: CampUser? {
        assigneeId.flatMap { id in AuthManager.shared.members.first { $0.id == id } }
    }
    /// The crew holding this job, when it is waiting with a crew rather than a person.
    var assignedCrew: StaffGroup? {
        assigneeGroupId.flatMap { id in AuthManager.shared.crews.first { $0.id == id } }
    }

    var isOpen: Bool { status.isOpen }

    /// Overdue against a camp-local day string, as `todayStr()` produces.
    func isOverdue(today: String) -> Bool {
        guard isOpen, let due = dueDate else { return false }
        return due < today
    }

    /// "Tue 3 Jun", or "Tue 3 Jun, 2:30 PM" when a clock time was set.
    var dueLabel: String? {
        guard let dueDate else { return nil }
        return CampDate.friendly(day: dueDate, time: dueTime)
    }

    /// Who it is with, in one line, for a card.
    var holderLabel: String {
        if let person = assignedTo { return person.name }
        if let crew = assignedCrew { return crew.name }
        return "Unassigned"
    }
}

/// A row of the `issues` table, as it arrives from PostgREST or out of the offline cache.
///
/// Separate from `Issue` because `activity` is a second query, not a column, and because every
/// field here decodes defensively. A work order the server has and this build does not fully
/// understand must still appear on the board: the alternative -- which shipped -- is one
/// unfamiliar value failing the whole array decode and showing a crew an empty list.
struct IssueDBRow: Codable {
    let id: String
    var title: String
    var description: String?
    var locationIds: [String]
    var locations: [String]
    var priority: Priority
    var status: IssueStatus
    var assigneeId: String?
    var assigneeGroupId: String?
    var reportedById: String?
    var trade: String
    var assetId: String?
    var vendorId: String?
    var scheduleId: String?
    var retreatId: String?
    var retreatSpaceRequestId: String?
    var actualCost: Double?
    var minutesSpent: Int?
    var photoUrl: String?
    var dueDate: String?
    var dueTime: String?
    var source: IssueSource?
    var isPublicReport: Bool
    var reporterName: String?
    var reporterContact: String?
    var assignedAt: Date?
    var resolvedAt: Date?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, locations, priority, status, source, trade
        case locationIds           = "location_ids"
        case assigneeId            = "assignee_id"
        case assigneeGroupId       = "assignee_group_id"
        case reportedById          = "reported_by_id"
        case assetId               = "asset_id"
        case vendorId              = "vendor_id"
        case scheduleId            = "schedule_id"
        case retreatId             = "retreat_id"
        case retreatSpaceRequestId = "retreat_space_request_id"
        case actualCost            = "actual_cost"
        case minutesSpent          = "minutes_spent"
        case photoUrl              = "photo_url"
        case dueDate               = "due_date"
        case dueTime               = "due_time"
        case isPublicReport        = "is_public_report"
        case reporterName          = "reporter_name"
        case reporterContact       = "reporter_contact"
        case assignedAt            = "assigned_at"
        case resolvedAt            = "resolved_at"
        case createdAt             = "created_at"
        case updatedAt             = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id            = try c.decode(String.self, forKey: .id)
        title         = try c.decode(String.self, forKey: .title)
        description   = try? c.decodeIfPresent(String.self, forKey: .description)
        locationIds   = (try? c.decodeIfPresent([String].self, forKey: .locationIds)) ?? []
        locations     = (try? c.decodeIfPresent([String].self, forKey: .locations)) ?? []
        priority      = (try? c.decode(Priority.self, forKey: .priority)) ?? .normal
        status        = try c.decode(IssueStatus.self, forKey: .status)
        assigneeId    = try? c.decodeIfPresent(String.self, forKey: .assigneeId)
        assigneeGroupId = try? c.decodeIfPresent(String.self, forKey: .assigneeGroupId)
        // Null on every public report: the person who filed it has no account. Decoding this
        // as required is why a camp that used the QR stickers could not load its board.
        reportedById  = try? c.decodeIfPresent(String.self, forKey: .reportedById)
        trade         = (try? c.decodeIfPresent(String.self, forKey: .trade)) ?? Trade.fallbackKey
        assetId       = try? c.decodeIfPresent(String.self, forKey: .assetId)
        vendorId      = try? c.decodeIfPresent(String.self, forKey: .vendorId)
        scheduleId    = try? c.decodeIfPresent(String.self, forKey: .scheduleId)
        retreatId     = try? c.decodeIfPresent(String.self, forKey: .retreatId)
        retreatSpaceRequestId = try? c.decodeIfPresent(String.self, forKey: .retreatSpaceRequestId)
        actualCost    = try? c.decodeIfPresent(Double.self, forKey: .actualCost)
        minutesSpent  = try? c.decodeIfPresent(Int.self, forKey: .minutesSpent)
        photoUrl      = try? c.decodeIfPresent(String.self, forKey: .photoUrl)
        dueDate       = try? c.decodeIfPresent(String.self, forKey: .dueDate)
        dueTime       = try? c.decodeIfPresent(String.self, forKey: .dueTime)
        source        = try? c.decodeIfPresent(IssueSource.self, forKey: .source)
        isPublicReport = (try? c.decodeIfPresent(Bool.self, forKey: .isPublicReport)) ?? false
        reporterName  = try? c.decodeIfPresent(String.self, forKey: .reporterName)
        reporterContact = try? c.decodeIfPresent(String.self, forKey: .reporterContact)
        assignedAt    = try? c.decodeIfPresent(Date.self, forKey: .assignedAt)
        resolvedAt    = try? c.decodeIfPresent(Date.self, forKey: .resolvedAt)
        createdAt     = try c.decode(Date.self, forKey: .createdAt)
        updatedAt     = (try? c.decode(Date.self, forKey: .updatedAt)) ?? Date()
    }

    func toIssue(activity: [ActivityEntry] = []) -> Issue {
        Issue(id: id, title: title, description: description,
              locationIds: locationIds, locations: locations,
              priority: priority, status: status,
              assigneeId: assigneeId, assigneeGroupId: assigneeGroupId,
              reportedById: reportedById, trade: trade,
              assetId: assetId, vendorId: vendorId, scheduleId: scheduleId,
              retreatId: retreatId, retreatSpaceRequestId: retreatSpaceRequestId,
              actualCost: actualCost, minutesSpent: minutesSpent, photoUrl: photoUrl,
              dueDate: dueDate, dueTime: dueTime, source: source,
              isPublicReport: isPublicReport, reporterName: reporterName,
              reporterContact: reporterContact,
              assignedAt: assignedAt, resolvedAt: resolvedAt,
              createdAt: createdAt, updatedAt: updatedAt, activity: activity)
    }
}
