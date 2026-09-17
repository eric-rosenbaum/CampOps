import Foundation
import Supabase

final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    #if DEBUG
    /// `campcommand-staging`. A publishable anon key, which is public by design -- it grants
    /// nothing on its own, since every table is behind RLS.
    fileprivate static let stagingURL = "https://mvxnpofopbmljzpgnycg.supabase.co"
    fileprivate static let stagingAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eG5wb2ZvcGJtbGp6cGdueWNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3Nzk3NTYsImV4cCI6MjEwMzM1NTc1Nn0.mccdGaaWy0k_LZvvZNZsIiNkSWuE7oNpTFIVx8k2PEA"
    #endif

    /// Which backend this build is talking to. Read once, at startup.
    static private(set) var environmentName = "production"

    private init() {
        guard
            var url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            var key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String
        else {
            fatalError("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Info.plist")
        }

        // The shipped app points at production, deliberately and always. But every change to
        // this app has until now had to be tested against production too, because there was no
        // other way to run it -- which means the only safe place to try a new write path was a
        // customer's live camp. A debug build can be pointed at staging instead, either with
        // the `-staging` launch argument or by running the Staging scheme.
        //
        // Compiled out of release entirely, so a shipped build cannot be talked into it.
        #if DEBUG
        let wantsStaging = ProcessInfo.processInfo.arguments.contains("-staging")
            || ProcessInfo.processInfo.environment["CAMPOPS_ENV"] == "staging"
        if wantsStaging {
            url = Self.stagingURL
            key = Self.stagingAnonKey
            Self.environmentName = "staging"
        }
        #endif

        guard let supabaseURL = URL(string: url) else {
            fatalError("SUPABASE_URL is not a URL")
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
