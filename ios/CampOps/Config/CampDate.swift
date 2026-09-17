import Foundation

/// Camp-local calendar days.
///
/// `YYYY-MM-DD` in this product means a day on the camp's wall calendar, never an instant. The
/// web has had `toDateStr` / `todayStr` / `parseDateStr` for this since a run of bugs where
/// `toISOString().slice(0,10)` turned an evening in Vancouver into tomorrow. The phone needs the
/// same vocabulary, and needs it more: a device carried between time zones (a director flying
/// home) must still agree with the board about which day a job is due.
///
/// Clock times are a separate column for the same reason, and are stored as `HH:mm:ss`.
enum CampDate {
    /// Formats a `Date` as a camp-local day string, using the device's calendar.
    static func dayString(_ date: Date = Date()) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Today, as the camp would write it.
    static func today() -> String { dayString() }

    /// The day `days` from today, for the quick due-date buttons.
    static func day(offsetByDays days: Int) -> String {
        dayString(Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date())
    }

    /// Parses `YYYY-MM-DD` into local noon.
    ///
    /// Noon rather than midnight so that a daylight-saving shift, which moves midnight by an
    /// hour, cannot roll the date backwards into the previous day.
    static func date(from day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var c = DateComponents()
        c.year = parts[0]; c.month = parts[1]; c.day = parts[2]; c.hour = 12
        return Calendar.current.date(from: c)
    }

    /// `HH:mm:ss` (what the `time` column holds) rendered as the phone's own clock format.
    static func timeLabel(_ time: String) -> String? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        var c = DateComponents()
        c.hour = parts[0]; c.minute = parts[1]
        guard let d = Calendar.current.date(from: c) else { return nil }
        return d.formatted(.dateTime.hour().minute())
    }

    /// "Today", "Tomorrow", "Mon 3 Jun" -- with the clock time appended when there is one.
    static func friendly(day: String, time: String? = nil) -> String {
        guard let date = date(from: day) else { return day }
        let cal = Calendar.current
        let base: String
        if cal.isDateInToday(date) { base = "Today" }
        else if cal.isDateInTomorrow(date) { base = "Tomorrow" }
        else if cal.isDateInYesterday(date) { base = "Yesterday" }
        else { base = date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) }
        guard let time, let clock = timeLabel(time) else { return base }
        return "\(base), \(clock)"
    }

    /// The `HH:mm:ss` string for a picked time, which is what the `due_time` column wants.
    static func timeString(from date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d:00", c.hour ?? 0, c.minute ?? 0)
    }
}
