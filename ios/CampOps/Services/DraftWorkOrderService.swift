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

enum DraftError: LocalizedError {
    case unreadable(String)
    case offline
    case failed

    var errorDescription: String? {
        switch self {
        case let .unreadable(message): return message
        case .offline:
            return "No signal, so nothing was read. The photo is attached -- type what is wrong and it will send when you are back in range."
        case .failed:
            return "Could not read that photo. Try again, or just type it."
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
        guard image != nil || !(transcript ?? "").isEmpty else { throw DraftError.failed }

        // The camp travels at the body root, where the function looks for it first. It checks
        // membership and spends an hourly budget before it calls the model, and both need to
        // know whose camp this is -- a signed-in caller is not by itself a reason to spend.
        guard let campId = AuthManager.shared.currentCamp?.id else { throw DraftError.failed }
        var body: [String: Any] = ["campId": campId, "context": context.payload]
        if let image {
            let compressed = resized(image, maxWidth: 1000)
            guard let jpeg = compressed.jpegData(compressionQuality: 0.85) else {
                throw DraftError.failed
            }
            // A data: URL rather than bare base64, so the media type survives the trip and the
            // function does not have to sniff magic bytes to work out what it was sent.
            body["imageBase64"] = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        }
        if let transcript, !transcript.isEmpty { body["transcript"] = transcript }

        let data = try JSONSerialization.data(withJSONObject: body)

        let response: Data
        do {
            response = try await SupabaseService.shared.client.functions.invoke(
                "draft-work-order",
                options: FunctionInvokeOptions(body: data)
            )
        } catch {
            throw SyncEngine.shared.isOnline ? DraftError.failed : DraftError.offline
        }

        guard let json = try? JSONSerialization.jsonObject(with: response) as? [String: Any] else {
            throw DraftError.failed
        }
        if let readable = json["readable"] as? Bool, !readable {
            throw DraftError.unreadable(json["error"] as? String
                ?? "That photo doesn't show enough to go on.")
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
