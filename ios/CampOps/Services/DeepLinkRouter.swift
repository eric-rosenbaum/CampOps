import Foundation
import Combine
import Supabase
import PostgREST

/// A sticker scanned into the app.
///
/// The web page at `/l/<token>` is the fallback, not the destination. When someone with the app
/// installed points their camera at a cabin door, iOS matches the universal link against the
/// `applinks:` entitlement and hands the URL here instead of opening Safari — so the crew get
/// the work on that cabin, and guests (who have no app) get the report form on the web.
///
/// The token is resolved server-side by `get_qr_target`, the same RPC the web uses, rather than
/// matched against the locations already in memory: a scan can happen on a cold launch before
/// anything has loaded, and it can name a location that was added since the last sync.
@MainActor
final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()

    struct ScannedTarget: Equatable {
        let campId: String
        let campName: String
        /// "location" or "asset".
        let kind: String
        let targetId: String
        let targetName: String
    }

    /// Set when a sticker resolves; cleared by whoever acts on it. A published value rather than
    /// a callback so a link that arrives during launch still routes once the UI exists.
    @Published var pending: ScannedTarget?
    /// Shown while the token is in flight, and after a failure. Both are brief and both matter:
    /// standing in a doorway watching nothing happen is how people decide the app is broken.
    @Published var isResolving = false
    @Published var failure: String?

    private init() {}

    /// Accepts both doors: the universal link `https://<host>/l/<token>` (and `/hub/<token>`,
    /// which is where the web sends a signed-in member), and `campcommand://l/<token>`, which is
    /// registered so a link can still open the app on a device where iOS has been told to keep
    /// this domain in Safari.
    func handle(_ url: URL) {
        guard let token = Self.token(in: url) else { return }
        Task { await resolve(token) }
    }

    static func token(in url: URL) -> String? {
        let parts = url.path.split(separator: "/").map(String.init)
        // campcommand://l/<token> puts "l" in the host and the token in the path.
        if let host = url.host, host == "l" || host == "hub" {
            return parts.first
        }
        guard parts.count >= 2, parts[0] == "l" || parts[0] == "hub" else { return nil }
        return parts[1]
    }

    private func resolve(_ token: String) async {
        isResolving = true
        failure = nil
        defer { isResolving = false }
        do {
            let rows: [QrTargetRow] = try await SupabaseService.shared.client
                .rpc("get_qr_target", params: ["p_token": token])
                .execute()
                .value
            guard let row = rows.first else {
                failure = "That sticker is not recognised. It may have been reprinted."
                return
            }
            // Signed in somewhere else. Silently showing another camp's work would be a leak,
            // and silently showing nothing reads as a bug, so it says which camp it belongs to.
            if let campId = AuthManager.shared.currentCamp?.id, campId != row.camp_id {
                failure = "That sticker belongs to \(row.camp_name). You are signed in to another camp."
                return
            }
            pending = ScannedTarget(
                campId: row.camp_id, campName: row.camp_name,
                kind: row.kind ?? "location", targetId: row.target_id, targetName: row.target_name
            )
        } catch {
            failure = "Could not open that sticker. Check your signal and try again."
        }
    }

    private struct QrTargetRow: Decodable {
        let camp_id: String
        let camp_name: String
        let kind: String?
        let target_id: String
        let target_name: String
    }
}
