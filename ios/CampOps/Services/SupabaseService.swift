import Foundation
import Supabase

final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        guard
            let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let supabaseURL = URL(string: url)
        else {
            fatalError("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Info.plist")
        }
        // The custom session is what stops a half-dead camp wifi socket from stalling a save
        // for a full minute. See NetworkService for the reasoning; without it the SDK uses
        // URLSession.shared, which allows 60s per request and never retries.
        client = SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: key,
            options: SupabaseClientOptions(
                global: SupabaseClientOptions.GlobalOptions(session: NetworkService.session)
            )
        )
    }
}
