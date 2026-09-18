import SwiftUI

/// Something a person typed, shown in the reader's language, one tap from the original.
///
/// For the places where the words matter enough to check: a work order's title and description
/// on its own screen, and every note in its timeline. The line underneath says the text was
/// translated and from what, because a translation that passes itself off as what somebody wrote
/// is how a crew ends up arguing over words nobody said.
struct TranslatedText: View {
    let source: TranslationSource
    let id: String
    let field: String
    let original: String
    var font: Font = .campBody
    var color: Color = .forest

    @ObservedObject private var store = ContentTranslations.shared
    @State private var showingOriginal = false

    var body: some View {
        let translation = store.translation(source, id: id, field: field, original: original)
        VStack(alignment: .leading, spacing: 3) {
            Text(showingOriginal || translation == nil ? original : translation!.text)
                .font(font)
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let translation {
                Button {
                    showingOriginal.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "globe")
                        Text(showingOriginal
                             ? L10n.tr("Original · Show translation")
                             : L10n.tr("%@ · Show original", translation.fromLabel))
                    }
                    .font(.campMicro)
                    .foregroundStyle(Color.forest.opacity(0.5))
                }
                .buttonStyle(.plain)
            }
        }
        .task(id: original) {
            store.request(source, id: id, field: field, original: original)
        }
    }
}

/// A translated line for a list row: no toggle, a small globe so the reader knows these are not
/// the words that were typed. The original is one tap away, on the work order itself.
struct TranslatedLine: View {
    let source: TranslationSource
    let id: String
    let field: String
    let original: String

    @ObservedObject private var store = ContentTranslations.shared

    var body: some View {
        let translation = store.translation(source, id: id, field: field, original: original)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(translation?.text ?? original)
            if translation != nil {
                Image(systemName: "globe")
                    .font(.system(size: 9))
                    .foregroundStyle(Color.forest.opacity(0.35))
                    .accessibilityLabel(L10n.tr("Translated"))
            }
        }
        .task(id: original) {
            store.request(source, id: id, field: field, original: original)
        }
    }
}
