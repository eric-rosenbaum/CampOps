import Foundation
import Supabase

// MARK: - Singleton client
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        guard
            let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let supabaseURL = URL(string: url)
        else {
            fatalError("Supabase credentials missing. Add SUPABASE_URL and SUPABASE_ANON_KEY to Info.plist (or Supabase.plist merged into build settings).")
        }
        client = SupabaseClient(supabaseURL: supabaseURL, supabaseKey: key)
    }
}

// MARK: - ISO decoder shared across the app
extension JSONDecoder {
    static let supabase: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let str = try decoder.singleValueContainer().decode(String.self)
            // Try full ISO-8601 with fractional seconds (Supabase default)
            let isoFull = ISO8601DateFormatter()
            isoFull.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFull.date(from: str) { return date }
            // Fallback without fractional seconds
            let isoShort = ISO8601DateFormatter()
            isoShort.formatOptions = [.withInternetDateTime]
            if let date = isoShort.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Cannot decode date: \(str)"
            )
        }
        return d
    }()
}

extension JSONEncoder {
    static let supabase: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}
