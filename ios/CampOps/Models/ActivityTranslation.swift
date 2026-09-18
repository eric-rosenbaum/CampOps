import Foundation

/// Activity history, read in the reader's language.
///
/// `issue_activity.action` is stored as an English sentence and has to stay one: the season
/// review reads it back in SQL with `ilike '%resolved%'`, and the web writes the same sentences.
/// So the phone keeps WRITING English (see `IssueStatus.activityWord`) and translates at display
/// time, by recognising the sentence shapes the apps write and re-saying them. A sentence nobody
/// taught this file is shown as it was stored -- English, but never wrong.
///
/// This is the Swift twin of `translateActivity` in src/i18n/activity.ts: the same shapes, in the
/// same order, first match wins, and the same Spanish and Hebrew wording, so a timeline reads the
/// same on the phone and the laptop. Keep the two in step.
enum ActivityTranslation {
    private struct Shape {
        /// The catalog key, which is also the English format.
        let key: String
        let regex: NSRegularExpression
        /// Capture names, in the order the format's positional arguments take them.
        let args: [String]
    }

    private static func shape(_ key: String, _ pattern: String, _ args: [String] = []) -> Shape {
        // A pattern that fails to compile is a typo in this file, found on first launch.
        // swiftlint:disable:next force_try
        Shape(key: key, regex: try! NSRegularExpression(pattern: "^" + pattern + "$"), args: args)
    }

    private static let shapes: [Shape] = [
        shape("Marked resolved by %1$@, actual cost %2$@",
              #"Marked resolved by (?<name>.+), actual cost (?<cost>\$[\d,.]+)"#, ["name", "cost"]),
        shape("Marked resolved by %@", #"Marked (?:resolved|complete) by (?<name>.+)"#, ["name"]),
        shape("Resolved, actual cost %@", #"Resolved, actual cost (?<cost>\$[\d,.]+)"#, ["cost"]),
        shape("Resolved", #"Resolved"#),
        shape("Status changed to “%1$@” by %2$@", #"Status changed to (?<status>.+?) by (?<name>.+)"#, ["status", "name"]),
        shape("Changed status to “%@”", #"Changed status to (?<status>.+)"#, ["status"]),
        shape("Assigned to %1$@ by %2$@", #"Assigned to (?<assignee>.+?) by (?<name>.+)"#, ["assignee", "name"]),
        shape("Assigned to %@", #"Assigned to (?<assignee>.+)"#, ["assignee"]),
        shape("Handed to %1$@ by %2$@", #"Handed to (?<crew>.+?) by (?<name>.+)"#, ["crew", "name"]),
        shape("Sent to %@", #"Sent to (?<crew>.+)"#, ["crew"]),
        shape("Unassigned by %@", #"Unassigned by (?<name>.+)"#, ["name"]),
        shape("Unassigned (activity)", #"Unassigned"#),
        shape("Logged by %@", #"(?:Issue |Task )?[Ll]ogged by (?<name>.+)"#, ["name"]),
        shape("Logged this", #"Logged (?:this|issue)"#),
        shape("Edited by %@", #"(?:Issue )?[Ee]dited by (?<name>.+)"#, ["name"]),
        shape("Edited the details", #"Edited (?:the|issue|task) details"#),
        shape("Reopened by %@", #"Reopened by (?<name>.+)"#, ["name"]),
        shape("Reopened this", #"Reopened this"#),
        shape("Flagged from Building Systems by %@", #"Flagged from Building Systems by (?<name>.+)"#, ["name"]),
        shape("Auto-created from recurring issue", #"Auto-created from recurring issue"#),
        shape("Added task", #"Added task"#),
        shape("Cleared the vendor", #"Cleared the vendor"#),
        shape("Waiting on %@", #"Waiting on (?<vendor>.+)"#, ["vendor"]),
        shape("Called in %@", #"Called in (?<vendor>.+)"#, ["vendor"]),
        shape("%1$@ set this to “%2$@”", #"(?<name>.+?) set this to (?<status>.+)"#, ["name", "status"]),
        shape("%@ marked this done", #"(?<name>.+?) marked this done"#, ["name"]),
        shape("%@ undid closing this", #"(?<name>.+?) undid closing this"#, ["name"]),
        shape("%@ took this on", #"(?<name>.+?) took this (?:on|issue|task)"#, ["name"]),
        shape("%@ put this back", #"(?<name>.+?) put this back"#, ["name"]),
        shape("%@ unassigned themselves", #"(?<name>.+?) unassigned themselves"#, ["name"]),
        shape("%@ removed the vendor", #"(?<name>.+?) removed the vendor"#, ["name"]),
        shape("%1$@ recorded that %2$@ did this", #"(?<name>.+?) recorded that (?<vendor>.+) did this"#, ["name", "vendor"]),
        shape("%1$@ sent this to %2$@", #"(?<name>.+?) sent this to (?<vendor>.+)"#, ["name", "vendor"]),
    ]

    /// Status words as they appear inside stored sentences, normalised to lower case with
    /// underscores as spaces. Covers the raw enum, the web's old `replace('_', ' ')` -- which
    /// replaced only the FIRST underscore, so "waiting on_vendor" -- both platforms' English
    /// labels, and the older "Resolved".
    private static let statusWords: [String: IssueStatus] = [
        "unassigned": .unassigned,
        "assigned": .assigned,
        "in progress": .inProgress,
        "waiting on vendor": .waitingOnVendor,
        "waiting on a vendor": .waitingOnVendor,
        "waiting on part": .waitingOnPart,
        "waiting on a part": .waitingOnPart,
        "done": .resolved,
        "resolved": .resolved,
    ]

    private static func status(from word: String) -> IssueStatus? {
        let norm = word.trimmingCharacters(in: .whitespaces).lowercased()
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ").joined(separator: " ")
        return statusWords[norm]
    }

    /// The stored sentence in the reader's language. English is returned exactly as stored: it
    /// already is English, and rewording it would make the history disagree with the database.
    static func translate(_ action: String, into language: AppLanguage = L10n.language) -> String {
        guard language != .en, !action.isEmpty else { return action }
        let text = action.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = NSRange(text.startIndex..., in: text)
        for shape in shapes {
            guard let match = shape.regex.firstMatch(in: text, range: range) else { continue }
            var values: [String] = []
            for name in shape.args {
                let r = match.range(withName: name)
                guard r.location != NSNotFound, let swiftRange = Range(r, in: text) else { return action }
                var value = String(text[swiftRange])
                if name == "status" {
                    // An unknown status word means some writer stored a label nobody can read
                    // back; the whole sentence stays as stored rather than half-translated.
                    guard let status = status(from: value) else { return action }
                    value = status.displayName
                }
                values.append(value)
            }
            let format = L10n.bundle.localizedString(forKey: shape.key, value: shape.key, table: nil)
            return String(format: format, locale: L10n.locale, arguments: values)
        }
        return action
    }
}
