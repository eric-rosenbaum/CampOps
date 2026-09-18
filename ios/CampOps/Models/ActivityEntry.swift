import Foundation

struct ActivityEntry: Codable, Identifiable {
    let id: String
    let userId: String?
    let userName: String
    let action: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId    = "user_id"
        case userName  = "user_name"
        case action
        case createdAt = "created_at"
    }

    init(id: String, userId: String?, userName: String, action: String, createdAt: Date = Date()) {
        self.id = id
        self.userId = userId
        self.userName = userName
        self.action = action
        self.createdAt = createdAt
    }
}

extension ActivityEntry {
    /// What happened, in the reader's language. The stored sentence stays English; see
    /// `ActivityTranslation`.
    var displayAction: String { ActivityTranslation.translate(action) }
}

// Every date on screen is formatted in the language chosen in the app, not the device's. A
// `formatted()` with no locale reads the device, which is how a phone switched to Español kept
// saying "Tuesday" under a Spanish heading.
extension Date {
    var relativeDisplay: String {
        let now = Date()
        let diff = now.timeIntervalSince(self)
        let minutes = Int(diff / 60)
        let hours = Int(diff / 3600)

        if diff < 60 { return L10n.tr("just now") }
        if minutes < 60 { return L10n.tr("%lld min ago", minutes) }
        if hours < 24 { return L10n.tr("%lld hr ago", hours) }

        let cal = L10n.calendar
        if cal.isDateInYesterday(self) { return L10n.tr("Yesterday") }
        if let week = cal.dateInterval(of: .weekOfYear, for: now), week.contains(self) {
            return formatted(.dateTime.weekday(.wide).locale(L10n.locale))
        }
        return formatted(.dateTime.month(.abbreviated).day().locale(L10n.locale))
    }

    var timeDisplay: String {
        formatted(.dateTime.hour().minute().locale(L10n.locale))
    }

    var dateTimeDisplay: String {
        formatted(.dateTime.month(.abbreviated).day().year().hour().minute().locale(L10n.locale))
    }

    var dateOnlyDisplay: String {
        formatted(.dateTime.month(.abbreviated).day().year().locale(L10n.locale))
    }
}

extension String {
    var asLocalDate: Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: self)
    }

    var localDateDisplay: String {
        guard let d = asLocalDate else { return self }
        return d.dateOnlyDisplay
    }

    var relativeDueDate: (label: String, overdue: Bool) {
        guard let due = asLocalDate else { return (self, false) }
        let today = Calendar.current.startOfDay(for: Date())
        let dueDay = Calendar.current.startOfDay(for: due)
        let days = Calendar.current.dateComponents([.day], from: today, to: dueDay).day ?? 0
        if days < 0 { return (L10n.tr("Overdue %lld days", abs(days)), true) }
        if days == 0 { return (L10n.tr("Due today"), false) }
        if days == 1 { return (L10n.tr("Due tomorrow"), false) }
        return (L10n.tr("Due in %lld days", days), false)
    }
}
