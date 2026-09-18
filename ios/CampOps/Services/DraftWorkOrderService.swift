import UIKit
import Supabase

/// What the model read off the photo, before a person has confirmed any of it.
///
/// Every field is optional except the title, because a draft is a suggestion. The person is
/// standing in front of the thing; the model is looking at one photo of it.
struct WorkOrderDraft: Sendable {
    var title: String
    var description: String?
    var trade: String?
    var priority: Priority?
    var locationId: String?
    var assetId: String?
    var assigneeId: String?
    /// The model's own hedge, 0...1.
    var confidence: Double
    /// What it could not tell from the photo. Shown as prompts, never as errors.
    var questions: [String]

    /// Below this, the draft is offered as a starting point rather than an answer.
    ///
    /// The same threshold the pool strip scanner uses, and for the same reason: a confident
    /// wrong answer that someone taps past is worse than an empty form.
    static let lowConfidence = 0.65

    var isConfident: Bool { confidence >= Self.lowConfidence }
}

/// What was handed to the reader, so a failure can say which of them it could not use.
enum DraftInput {
    case photo, voice, both

    var noun: String {
        switch self {
        case .photo: return L10n.tr("that photo")
        case .voice: return L10n.tr("what you said")
        case .both:  return L10n.tr("the photo and what you said")
        }
    }
}

enum DraftError: LocalizedError {
    /// The model looked and could not tell. Carries its own sentence, which says why.
    case unreadable(String)
    /// The server refused, and said why: not a member, out of budget, nothing to read.
    case refused(String)
    case offline(DraftInput)
    /// Nothing was captured to send.
    case nothingToRead
    case failed(DraftInput)

    var errorDescription: String? {
        switch self {
        case let .unreadable(message): return message
        case let .refused(message): return message
        case let .offline(input):
            return L10n.tr("No signal, so %@ was not read. It is kept -- type what is wrong and it all sends when you are back in range.", input.noun)
        case .nothingToRead:
            return L10n.tr("There is nothing to read yet. Take a photo, or record what is wrong.")
        case let .failed(input):
            // Names what it was actually given. Being told a photo failed when you recorded
            // your voice is its own small mystery on top of whatever went wrong.
            return L10n.tr("Could not read %@. Try again, or just type it.", input.noun)
        }
    }
}

/// Reads a photo and a spoken sentence into a draft work order.
///
/// Calls the same `draft-work-order` edge function the web uses, so both platforms get the same
/// prompt, the same rules and the same server-side checks -- including the one that drops an
/// urgent priority back to normal when nothing in the photo justified it.
///
/// Unlike the pool strip scanner this goes through `functions.invoke` rather than a hand-built
/// request with the anon key: `draft-work-order` calls `auth.getUser()` and refuses a caller it
/// cannot identify, so the request has to carry this person's session, not the project key.
final class DraftWorkOrderService {
    static let shared = DraftWorkOrderService()
    private init() {}

    @MainActor
    func draft(image: UIImage?, transcript: String?, context: DraftContext) async throws -> WorkOrderDraft {
        guard image != nil || !(transcript ?? "").isEmpty else { throw DraftError.nothingToRead }
        let input: DraftInput = image != nil
            ? ((transcript ?? "").isEmpty ? .photo : .both)
            : .voice

        // The camp travels at the body root, where the function looks for it first. It checks
        // membership and spends an hourly budget before it calls the model, and both need to
        // know whose camp this is -- a signed-in caller is not by itself a reason to spend.
        guard let campId = AuthManager.shared.currentCamp?.id else { throw DraftError.failed(input) }
        // The reader's language rides along so the draft can come back in it. A crew lead who
        // speaks Spanish was otherwise handed an English title to correct.
        var body: [String: Any] = ["campId": campId, "context": context.payload, "lang": L10n.language.rawValue]
        if let image {
            let compressed = resized(image, maxWidth: 1000)
            guard let jpeg = compressed.jpegData(compressionQuality: 0.85) else {
                throw DraftError.failed(input)
            }
            // A data: URL rather than bare base64, so the media type survives the trip and the
            // function does not have to sniff magic bytes to work out what it was sent.
            body["imageBase64"] = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        }
        if let transcript, !transcript.isEmpty { body["transcript"] = transcript }

        let data = try JSONSerialization.data(withJSONObject: body)

        let response: Data
        do {
            // The trailing closure is what makes this hand back the raw bytes.
            //
            // Without it Swift picks `invoke<T: Decodable>` with T inferred as `Data`, and
            // `Data` decodes from a base64 STRING -- so the SDK tried to JSON-decode a work
            // order into a blob, threw `typeMismatch`, and the reply never reached this file.
            // Every AI draft from the phone failed that way, whatever the photo was of. The
            // pool strip scanner builds its own URLRequest, which is why it was unaffected.
            response = try await SupabaseService.shared.client.functions.invoke(
                "draft-work-order",
                options: FunctionInvokeOptions(
                    headers: ["Content-Type": "application/json"],
                    body: data
                )
            ) { bytes, _ in bytes }
        } catch let error as FunctionsError {
            // The server's own sentence, not a shrug.
            //
            // `functions.invoke` turns every non-2xx into an opaque `httpError`, so a refusal
            // that says exactly what is wrong -- "You do not have access to this camp", "That is
            // 20 AI drafts this hour" -- was arriving as "could not read that photo". The reply
            // body is right there; read it.
            if case let .httpError(_, data) = error,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = json["error"] as? String, !message.isEmpty {
                throw DraftError.refused(message)
            }
            throw SyncEngine.shared.isOnline ? DraftError.failed(input) : DraftError.offline(input)
        } catch {
            throw SyncEngine.shared.isOnline ? DraftError.failed(input) : DraftError.offline(input)
        }

        guard let json = try? JSONSerialization.jsonObject(with: response) as? [String: Any] else {
            throw DraftError.failed(input)
        }
        if let readable = json["readable"] as? Bool, !readable {
            throw DraftError.unreadable(json["error"] as? String
                ?? L10n.tr("That photo doesn't show enough to go on."))
        }

        return WorkOrderDraft(
            title: json["title"] as? String ?? "",
            description: json["description"] as? String,
            trade: json["trade"] as? String,
            priority: (json["priority"] as? String).flatMap { Priority(rawValue: $0) },
            locationId: json["locationId"] as? String,
            assetId: json["assetId"] as? String,
            assigneeId: json["assigneeId"] as? String,
            confidence: json["confidence"] as? Double ?? 0,
            questions: json["questions"] as? [String] ?? []
        )
    }

    private func resized(_ image: UIImage, maxWidth: CGFloat) -> UIImage {
        guard image.size.width > maxWidth else { return image }
        let scale = maxWidth / image.size.width
        let size = CGSize(width: maxWidth, height: image.size.height * scale)
        return UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

/// What the camp looks like, so the model names real things rather than inventing them.
///
/// The server re-checks every id against these lists, so sending them is not a convenience --
/// it is what stops a draft referring to a cabin that does not exist.
@MainActor
struct DraftContext {
    var locationId: String?
    var locationName: String?
    var assetId: String?
    var assetName: String?
    var trade: String?
    /// Titles of recent work orders, so the draft borrows the camp's own vocabulary.
    var recentTitles: [String] = []

    var payload: [String: Any] {
        var out: [String: Any] = [:]
        if let locationId { out["locationId"] = locationId }
        if let locationName { out["locationName"] = locationName }
        if let assetId { out["assetId"] = assetId }
        if let assetName { out["assetName"] = assetName }
        if let trade { out["trade"] = trade }
        out["recentTitles"] = Array(recentTitles.prefix(20))
        out["members"] = AuthManager.shared.members.map { ["id": $0.id, "name": $0.name] }
        out["locations"] = LocationStore.shared.locations.prefix(300).map {
            ["id": $0.id, "name": $0.name]
        }
        return out
    }
}
