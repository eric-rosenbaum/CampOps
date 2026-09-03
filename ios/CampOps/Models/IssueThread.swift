import Foundation

// The two things a crew adds to a work order while they are standing in front of it: a note
// about what they found, and a tick against a step they finished. Both are `sync_push`-able
// tables, which is what lets them be done with no signal.

/// A note on a work order.
nonisolated struct IssueComment: Codable, Identifiable, Hashable {
    let id: String
    let issueId: String
    let authorId: String?
    let authorName: String
    var body: String
    var photoUrls: [String]
    /// Whether the person who reported the issue (who may be a camper's parent via the public
    /// form) is allowed to see this. Defaults false: internal by default.
    var visibleToReporter: Bool
    let createdAt: Date
    var editedAt: Date?
    var deletedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, body
        case issueId            = "issue_id"
        case authorId           = "author_id"
        case authorName         = "author_name"
        case photoUrls          = "photo_urls"
        case visibleToReporter  = "visible_to_reporter"
        case createdAt          = "created_at"
        case editedAt           = "edited_at"
        case deletedAt          = "deleted_at"
    }

    init(
        id: String = UUID().uuidString,
        issueId: String,
        authorId: String?,
        authorName: String,
        body: String,
        photoUrls: [String] = [],
        visibleToReporter: Bool = false,
        createdAt: Date = Date(),
        editedAt: Date? = nil,
        deletedAt: Date? = nil
    ) {
        self.id = id; self.issueId = issueId
        self.authorId = authorId; self.authorName = authorName
        self.body = body; self.photoUrls = photoUrls
        self.visibleToReporter = visibleToReporter
        self.createdAt = createdAt; self.editedAt = editedAt; self.deletedAt = deletedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id                = try c.decode(String.self, forKey: .id)
        issueId           = try c.decode(String.self, forKey: .issueId)
        authorId          = try? c.decodeIfPresent(String.self, forKey: .authorId)
        authorName        = (try? c.decode(String.self, forKey: .authorName)) ?? "Someone"
        body              = (try? c.decode(String.self, forKey: .body)) ?? ""
        photoUrls         = (try? c.decodeIfPresent([String].self, forKey: .photoUrls)) ?? []
        visibleToReporter = (try? c.decode(Bool.self, forKey: .visibleToReporter)) ?? false
        createdAt         = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
        editedAt          = try? c.decodeIfPresent(Date.self, forKey: .editedAt)
        deletedAt         = try? c.decodeIfPresent(Date.self, forKey: .deletedAt)
    }

    var initials: String {
        authorName.split(separator: " ").compactMap(\.first).prefix(2).map(String.init).joined().uppercased()
    }
}

/// One step on a work order's checklist.
nonisolated struct IssueChecklistItem: Codable, Identifiable, Hashable {
    let id: String
    let issueId: String
    var position: Int
    var text: String
    var note: String?
    var requiresPhoto: Bool
    var isDone: Bool
    var doneBy: String?
    var doneByName: String?
    var doneAt: Date?
    var photoUrl: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, position, text, note
        case issueId        = "issue_id"
        case requiresPhoto  = "requires_photo"
        case isDone         = "is_done"
        case doneBy         = "done_by"
        case doneByName     = "done_by_name"
        case doneAt         = "done_at"
        case photoUrl       = "photo_url"
        case createdAt      = "created_at"
    }

    init(
        id: String = UUID().uuidString,
        issueId: String,
        position: Int,
        text: String,
        note: String? = nil,
        requiresPhoto: Bool = false,
        isDone: Bool = false,
        doneBy: String? = nil,
        doneByName: String? = nil,
        doneAt: Date? = nil,
        photoUrl: String? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id; self.issueId = issueId
        self.position = position; self.text = text; self.note = note
        self.requiresPhoto = requiresPhoto
        self.isDone = isDone; self.doneBy = doneBy; self.doneByName = doneByName
        self.doneAt = doneAt; self.photoUrl = photoUrl; self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id            = try c.decode(String.self, forKey: .id)
        issueId       = try c.decode(String.self, forKey: .issueId)
        position      = (try? c.decode(Int.self, forKey: .position)) ?? 0
        text          = (try? c.decode(String.self, forKey: .text)) ?? ""
        note          = try? c.decodeIfPresent(String.self, forKey: .note)
        requiresPhoto = (try? c.decode(Bool.self, forKey: .requiresPhoto)) ?? false
        isDone        = (try? c.decode(Bool.self, forKey: .isDone)) ?? false
        doneBy        = try? c.decodeIfPresent(String.self, forKey: .doneBy)
        doneByName    = try? c.decodeIfPresent(String.self, forKey: .doneByName)
        doneAt        = try? c.decodeIfPresent(Date.self, forKey: .doneAt)
        photoUrl      = try? c.decodeIfPresent(String.self, forKey: .photoUrl)
        createdAt     = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
    }
}
