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
        client = SupabaseClient(supabaseURL: supabaseURL, supabaseKey: key)
    }
}
