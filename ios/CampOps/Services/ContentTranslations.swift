import Foundation
import Combine
import Supabase

// What other people typed, in this reader's language.
//
// A work order typed in Spanish is read in English by the director, and the other way round.
// Translations are made on the server (the `translate-content` edge function) and stored beside
// the original in `content_translations`; nothing here ever overwrites what somebody wrote, and
// every edit field still edits the original.
//
// The one rule every screen leans on: a row is CURRENT only while its `source_text` is exactly
// the field's text today. Edit a title and the old translation stops matching, so the screen
// falls back to the original rather than showing a translation of words that are gone.

/// The tables whose text can be translated. Raw values are the table names the contract uses.
nonisolated enum TranslationSource: String, Sendable {
    case issues
    case issueComments = "issue_comments"
    case checklistItems = "issue_checklist_items"
}

/// One row of `content_translations`, as stored.
nonisolated struct ContentTranslationRow: Codable, Hashable, Sendable {
    let id: String
    let campId: String
    let sourceTable: String
    let sourceId: String
    let field: String
    /// The language of `text`.
    let lang: String
    /// The detected language of the original; nil when the model could not tell.
    let sourceLang: String?
    /// The original this translation was made from.
    let sourceText: String
    let text: String
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, field, lang, text
        case campId     = "camp_id"
        case sourceTable = "source_table"
        case sourceId   = "source_id"
        case sourceLang = "source_lang"
        case sourceText = "source_text"
        case updatedAt  = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Ids arrive as uuids from the server but have been strings since they were cached;
        // decoding either keeps one odd row from failing the whole list.
        id          = try c.decode(String.self, forKey: .id)
        campId      = try c.decode(String.self, forKey: .campId)
        sourceTable = try c.decode(String.self, forKey: .sourceTable)
        sourceId    = try c.decode(String.self, forKey: .sourceId)
        field       = try c.decode(String.self, forKey: .field)
        lang        = try c.decode(String.self, forKey: .lang)
        sourceLang  = try? c.decodeIfPresent(String.self, forKey: .sourceLang)
        sourceText  = (try? c.decode(String.self, forKey: .sourceText)) ?? ""
        text        = (try? c.decode(String.self, forKey: .text)) ?? ""
        updatedAt   = try? c.decodeIfPresent(Date.self, forKey: .updatedAt)
    }
}

/// A translation worth showing: current, and actually in another language.
struct Translation: Equatable {
    let text: String
    /// Where it came from, for "Translated from Spanish". Nil when unknown.
    let sourceLanguage: String?

    /// "Translated from Spanish", in the reader's language.
    var fromLabel: String {
        switch AppLanguage.matching(sourceLanguage) {
        case .en: return L10n.tr("Translated from English")
        case .es: return L10n.tr("Translated from Spanish")
        case .he: return L10n.tr("Translated from Hebrew")
        case nil: return L10n.tr("Translated")
        }
    }
}

@MainActor
final class ContentTranslations: ObservableObject {
    static let shared = ContentTranslations()

    /// Bumped whenever the rows change, so views reading through `translation(...)` re-render.
    @Published private(set) var revision = 0

    /// Rows in the reader's language, keyed "table|id|field".
    private var rows: [String: ContentTranslationRow] = [:]
    private var campId: String?
    private var language: AppLanguage = .en
    /// The newest `updated_at` seen, so a refresh asks only for what changed since.
    private var watermark: Date?

    /// Rows waiting to be asked for, keyed "table|id".
    private var wanted: [String: (source: TranslationSource, id: String)] = [:]
    /// What has already been asked for this session, keyed by table, id, field and the text it
    /// was asked about. A row the function could not translate must not be re-requested on
    /// every scroll past it.
    private var asked: Set<String> = []
    private var flushTask: Task<Void, Never>?

    private var supabase: SupabaseClient { SupabaseService.shared.client }

    private init() {}

    // MARK: - Reading

    /// The translation to show for a field, or nil to show the original.
    ///
    /// Nil when there is no row, when the row was made from text that has since been edited, or
    /// when the original was already in the reader's language.
    func translation(_ source: TranslationSource, id: String, field: String, original: String) -> Translation? {
        guard !original.isEmpty,
              let row = rows[Self.key(source.rawValue, id, field)],
              row.sourceText == original,
              row.text != original,
              !row.text.isEmpty
        else { return nil }
        if let from = row.sourceLang, AppLanguage.matching(from) == language { return nil }
        return Translation(text: row.text, sourceLanguage: row.sourceLang)
    }

    /// The text to show: the current translation when there is one, else the original.
    func display(_ source: TranslationSource, id: String, field: String, original: String) -> String {
        translation(source, id: id, field: field, original: original)?.text ?? original
    }

    /// Both texts, for search: somebody who reads the Spanish translation should be able to
    /// find the work order by the words they read, and by the words that were typed.
    func searchable(_ source: TranslationSource, id: String, field: String, original: String) -> String {
        guard let t = translation(source, id: id, field: field, original: original) else { return original }
        return original + "\n" + t.text
    }

    // MARK: - Loading

    /// Cache first, then the network, for one camp in one language.
    ///
    /// The cache is what makes a translated board readable in a pump house with no signal, the
    /// same as the board itself.
    func load(campId: String, language: AppLanguage) async {
        let changed = campId != self.campId || language != self.language
        self.campId = campId
        self.language = language
        if changed {
            rows = [:]
            watermark = nil
            wanted = [:]
            asked = []
            let cached = await OfflineCache.shared.rows(of: SyncTable.contentTranslations, campId: campId)
            index(decode(cached))
        }
        await refresh()
    }

    /// Pulls rows changed since the last pull, in the reader's language. Quietly does nothing
    /// without signal: the cached rows are still on screen.
    func refresh() async {
        guard let campId, !campId.isEmpty else { return }
        let lang = language
        var fetched: [ContentTranslationRow] = []
        let pageSize = 1000
        var from = 0
        do {
            while true {
                var query = supabase.from(SyncTable.contentTranslations)
                    .select()
                    .eq("camp_id", value: campId)
                    .eq("lang", value: lang.rawValue)
                if let watermark {
                    // Overlapped by two minutes. The function stamps `updated_at` when it starts
                    // a batch and commits seconds later, so a row can land with a stamp older
                    // than one this phone already pulled; a strict `>` skipped such rows for
                    // good. Pulling a few twice is harmless -- they are keyed.
                    let since = watermark.addingTimeInterval(-120)
                    query = query.gt("updated_at", value: SyncTimestamp.string(since))
                }
                let page: [ContentTranslationRow] = try await query
                    .order("updated_at", ascending: true)
                    .range(from: from, to: from + pageSize - 1)
                    .execute()
                    .value
                fetched += page
                if page.count < pageSize { break }
                from += pageSize
            }
        } catch {
            return
        }
        // The language may have changed while the request was in flight; those rows belong to
        // the old reader and are dropped rather than shown.
        guard campId == self.campId, lang == language else { return }
        await absorb(fetched, campId: campId)
    }

    // MARK: - Asking for what is missing

    /// Notes that a field is on screen. When there is no current translation of it and the phone
    /// has signal, it is asked for, batched with whatever else scrolled into view.
    ///
    /// The server translates on write, so this is for what was written before a reader in this
    /// language joined the camp, or while the queue was behind.
    func request(_ source: TranslationSource, id: String, field: String, original: String) {
        guard campId != nil, !original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if let row = rows[Self.key(source.rawValue, id, field)], row.sourceText == original { return }
        let askKey = Self.key(source.rawValue, id, field) + "|" + original
        guard !asked.contains(askKey) else { return }
        asked.insert(askKey)
        wanted[source.rawValue + "|" + id] = (source, id)
        scheduleFlush()
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            // A moment's pause so a list scrolling into view becomes one request, not forty.
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    private func flush() async {
        guard SyncEngine.shared.isOnline, let campId, !wanted.isEmpty else { return }
        let refs = Array(wanted.values)
        wanted = [:]
        let lang = language

        // The function takes at most 50 refs a call.
        for start in stride(from: 0, to: refs.count, by: 50) {
            let batch = refs[start..<min(start + 50, refs.count)]
            let body: [String: Any] = [
                "refs": batch.map { ["source": $0.source.rawValue, "id": $0.id] },
                "lang": lang.rawValue,
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: body) else { continue }
            do {
                // The trailing closure hands back raw bytes; see DraftWorkOrderService for why
                // leaving it off decodes the reply as a base64 blob and throws.
                let reply = try await supabase.functions.invoke(
                    "translate-content",
                    options: FunctionInvokeOptions(
                        headers: ["Content-Type": "application/json"],
                        body: data
                    )
                ) { bytes, _ in bytes }
                let decoded = try SyncJSON.syncDecoder.decode(TranslateReply.self, from: reply)
                guard campId == self.campId else { return }
                await absorb(decoded.translations, campId: campId)
            } catch {
                // Not an error anybody can act on: the original is on screen, which is always a
                // true thing to show. But a batch of twenty titles can take the model longer
                // than the network layer's idle timeout, and the reply was lost after the server
                // had already written every row -- which then never reached the phone, because
                // each field was marked asked. So: forget the asks, and pull what was written.
                let prefixes = batch.map { "\($0.source.rawValue)|\($0.id)|" }
                asked = asked.filter { key in !prefixes.contains { key.hasPrefix($0) } }
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(10))
                    await self?.refresh()
                }
                continue
            }
        }
    }

    private struct TranslateReply: Decodable {
        let translations: [ContentTranslationRow]
    }

    // MARK: - Storage

    /// Every row goes to disk, whatever its language, so a switch back is instant offline too.
    /// Only the reader's language is indexed for display.
    private func absorb(_ incoming: [ContentTranslationRow], campId: String) async {
        guard !incoming.isEmpty else { return }
        index(incoming)
        if let data = try? SyncJSON.syncEncoder.encode(incoming),
           let json = try? SyncJSON.syncDecoder.decode([SyncJSON].self, from: data) {
            await OfflineCache.shared.merge(rows: json, into: SyncTable.contentTranslations, campId: campId)
        }
    }

    private func index(_ incoming: [ContentTranslationRow]) {
        var changed = false
        for row in incoming where AppLanguage.matching(row.lang) == language {
            let key = Self.key(row.sourceTable, row.sourceId, row.field)
            if let existing = rows[key], let a = existing.updatedAt, let b = row.updatedAt, a > b { continue }
            rows[key] = row
            changed = true
            if let stamp = row.updatedAt, watermark.map({ stamp > $0 }) ?? true { watermark = stamp }
        }
        if changed { revision += 1 }
    }

    private func decode(_ json: [SyncJSON]) -> [ContentTranslationRow] {
        json.compactMap { row in
            guard let data = try? SyncJSON.syncEncoder.encode(row) else { return nil }
            return try? SyncJSON.syncDecoder.decode(ContentTranslationRow.self, from: data)
        }
    }

    func clear() {
        rows = [:]; campId = nil; watermark = nil; wanted = [:]; asked = []
        flushTask?.cancel()
        revision += 1
    }

    private static func key(_ table: String, _ id: String, _ field: String) -> String {
        "\(table)|\(id)|\(field)"
    }
}
