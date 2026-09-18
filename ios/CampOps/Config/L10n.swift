import SwiftUI
import Foundation
import Combine
import os

// MARK: - The three languages

/// The languages the phone speaks. Stored on `profiles.preferred_language`, which the web reads
/// too, so a crew member who picks Español on a laptop is not greeted in English on the phone.
nonisolated enum AppLanguage: String, CaseIterable, Identifiable, Sendable {
    case en, es, he

    var id: String { rawValue }

    /// Each option is written in its own script. A Spanish speaker scanning a list that says
    /// "Spanish" in English has to already read English to find their way out of it.
    var nativeName: String {
        switch self {
        case .en: return "English"
        case .es: return "Español"
        case .he: return "עברית"
        }
    }

    var isRightToLeft: Bool { self == .he }

    var layoutDirection: LayoutDirection { isRightToLeft ? .rightToLeft : .leftToRight }

    /// The language a BCP-47 identifier names, when it is one of ours. "es-MX" is Spanish,
    /// "iw" is the old code for Hebrew that some devices still report.
    static func matching(_ identifier: String?) -> AppLanguage? {
        guard let identifier else { return nil }
        let code = identifier.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init)
        switch code {
        case "en": return .en
        case "es": return .es
        case "he", "iw": return .he
        default: return nil
        }
    }

    /// The first of the device's own languages that we speak, or nil when it speaks none of them.
    static var device: AppLanguage? {
        Locale.preferredLanguages.lazy.compactMap { matching($0) }.first
    }
}

// MARK: - Looking strings up

/// Strings in the language the person chose in the app, not the one iOS was set to.
///
/// SwiftUI's `Text("literal")` resolves against the `\.locale` the app root sets, but a string
/// built in code -- a status label, an error message, "3 changes waiting" -- goes through
/// `Bundle.main`, which only ever answers in the device language. Before this, choosing Español
/// in the app translated the buttons and left every label the code assembled in English.
/// Everything built in code resolves here instead, against the chosen language's `.lproj`.
///
/// Readable from any isolation domain: the offline layer and the error types build messages
/// off the main actor.
nonisolated enum L10n {
    private struct State: Sendable {
        var language: AppLanguage
        var bundle: Bundle
        var locale: Locale
    }

    private static let state = OSAllocatedUnfairLock(initialState: makeState(for: LanguageStore.initialLanguage))

    static var language: AppLanguage { state.withLock { $0.language } }
    static var bundle: Bundle { state.withLock { $0.bundle } }
    /// The locale every date, time and number on screen is formatted with.
    static var locale: Locale { state.withLock { $0.locale } }

    /// A calendar speaking the chosen language, for weekday names.
    static var calendar: Calendar {
        var cal = Calendar.current
        cal.locale = locale
        return cal
    }

    static func activate(_ language: AppLanguage) {
        let next = makeState(for: language)
        state.withLock { $0 = next }
    }

    /// The translation of `key`, with `args` substituted. The key is the English text, so a key
    /// the catalog has never heard of still reads correctly -- in English.
    ///
    /// Counts go through the catalog's plural variations: the format that comes back from a
    /// `.stringsdict` entry picks "1 change" or "3 changes" (or Hebrew's dual) itself.
    static func tr(_ key: String, _ args: CVarArg...) -> String {
        let format = bundle.localizedString(forKey: key, value: key, table: nil)
        guard !args.isEmpty else { return format }
        return String(format: format, locale: locale, arguments: args)
    }

    private static func makeState(for language: AppLanguage) -> State {
        // The compiled catalog lays each language out as `<code>.lproj`. English may have no
        // folder of its own when a string has no English override; the main bundle answers
        // with the key, which is the English text.
        let bundle = Bundle.main.path(forResource: language.rawValue, ofType: "lproj")
            .flatMap(Bundle.init(path:)) ?? .main
        return State(language: language, bundle: bundle, locale: makeLocale(for: language))
    }

    /// The chosen language with the device's region, so an English speaker in Canada still gets
    /// Canadian dates.
    ///
    /// Spanish and Hebrew are pinned to a 24-hour clock. Camps in both run on it, and "2:30 p. m."
    /// on a work order due time read as a mistranslation to every crew lead who saw it.
    private static func makeLocale(for language: AppLanguage) -> Locale {
        var components = Locale.Components(locale: Locale.current)
        components.languageComponents = Locale.Language.Components(languageCode: .init(language.rawValue))
        if language != .en {
            components.hourCycle = .zeroToTwentyThree
        }
        return Locale(components: components)
    }
}

// MARK: - Choosing one

/// The chosen language, observed by the app root.
///
/// Changing it swaps the environment locale and layout direction at the root and rebuilds the
/// signed-in shell (see `ContentView`), so every screen re-reads its strings. No trip to iOS
/// Settings, and no relaunch: a crew lead handing the phone to a new hire can switch it for them.
@MainActor
final class LanguageStore: ObservableObject {
    static let shared = LanguageStore()

    @Published private(set) var language: AppLanguage

    nonisolated private static let storageKey = "campcommand.language"

    /// What to speak before anyone has signed in: whatever this phone chose last, else the
    /// device's own language when we have it, else English.
    nonisolated static var initialLanguage: AppLanguage {
        if let saved = UserDefaults.standard.string(forKey: storageKey),
           let language = AppLanguage(rawValue: saved) {
            return language
        }
        return AppLanguage.device ?? .en
    }

    private init() {
        language = L10n.language
    }

    var locale: Locale { L10n.locale }

    /// Switch the app's language.
    ///
    /// - Parameter remember: also write it to the signed-in person's profile, so the web and
    ///   their next phone agree. False when the value just came FROM the profile.
    func choose(_ next: AppLanguage, remember: Bool = true) {
        if next != language {
            L10n.activate(next)
            UserDefaults.standard.set(next.rawValue, forKey: Self.storageKey)
            // Also iOS's own per-app language, which only takes effect on the next launch. It is
            // what makes the system's pieces -- the date picker's month names, the keyboard's
            // Done, the photo library sheet -- agree with the app after a relaunch.
            UserDefaults.standard.set([next.rawValue], forKey: "AppleLanguages")
            // Before publishing: the rebuilt shell creates its bars as soon as `language` moves.
            CampCommandApp.applyChrome(for: next)
            language = next
        }
        guard remember else { return }
        Task { await AuthManager.shared.savePreferredLanguage(next) }
    }
}

// MARK: - Screens that stay English

extension View {
    /// Pool, Assets and Building are not translated yet. Under Hebrew they would otherwise be
    /// mirrored around English text -- chevrons pointing into the labels, numbers on the wrong
    /// side of their units -- which is worse than either language done properly.
    func untranslated() -> some View {
        environment(\.layoutDirection, .leftToRight)
            .environment(\.locale, Locale(identifier: "en"))
    }
}
