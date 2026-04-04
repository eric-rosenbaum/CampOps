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

extension Date {
    var relativeDisplay: String {
        let now = Date()
        let diff = now.timeIntervalSince(self)
        let minutes = Int(diff / 60)
        let hours = Int(diff / 3600)

        if diff < 60 { return "just now" }
        if minutes < 60 { return "\(minutes) min\(minutes == 1 ? "" : "s") ago" }
        if hours < 24 { return "\(hours) hr\(hours == 1 ? "" : "s") ago" }

        let cal = Calendar.current
        if cal.isDateInYesterday(self) { return "Yesterday" }
        if let week = cal.dateInterval(of: .weekOfYear, for: now), week.contains(self) {
            return formatted(.dateTime.weekday(.wide))
        }
        return formatted(.dateTime.month(.abbreviated).day())
    }

    var timeDisplay: String {
        formatted(.dateTime.hour().minute())
    }

    var dateTimeDisplay: String {
        formatted(.dateTime.month(.abbreviated).day().year().hour().minute())
    }

    var dateOnlyDisplay: String {
        formatted(.dateTime.month(.abbreviated).day().year())
    }
}

extension String {
    /// Parse a "yyyy-MM-dd" date string to a Date
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
        if days < 0 { return ("Overdue \(abs(days)) day\(abs(days) == 1 ? "" : "s")", true) }
        if days == 0 { return ("Due today", false) }
        if days == 1 { return ("Due tomorrow", false) }
        return ("Due in \(days) days", false)
    }
}
