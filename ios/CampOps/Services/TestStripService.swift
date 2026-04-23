import UIKit
import Supabase

// MARK: - Brand

enum StripBrand: String, CaseIterable, Identifiable {
    case aquachek   = "AquaChek"
    case taylor     = "Taylor"
    case hth        = "HTH"
    case inTheSwim  = "In The Swim"
    case poolMaster = "Pool Master"
    case lamotte    = "LaMotte"
    case other      = "Other"
    var id: String { rawValue }
}

// MARK: - Result types

struct ScanValue {
    let value: Double
    let confidence: Double
    var isLowConfidence: Bool { confidence < 0.65 }
}

struct StripScanResult {
    var freeChlorine: ScanValue?
    var ph: ScanValue?
    var alkalinity: ScanValue?
    var cyanuricAcid: ScanValue?
    var calciumHardness: ScanValue?
    var notes: String?
}

// MARK: - Errors

enum StripScanError: LocalizedError {
    case notReadable(String)
    case network
    case parse

    var errorDescription: String? {
        switch self {
        case .notReadable(let msg): return msg
        case .network: return "Could not reach the server. Check your connection and try again."
        case .parse:   return "Received an unexpected response from the server."
        }
    }
}

// MARK: - Service

final class TestStripService {
    static let shared = TestStripService()

    private var storage: StorageFileApi {
        SupabaseService.shared.client.storage.from("strip-photos")
    }

    private init() {}

    func analyzeStrip(image: UIImage, brand: StripBrand) async throws -> StripScanResult {
        let compressed = resized(image, maxWidth: 800)
        guard let jpeg = compressed.jpegData(compressionQuality: 0.85) else {
            throw StripScanError.parse
        }

        guard
            let baseURL = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let anonKey = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let url = URL(string: "\(baseURL)/functions/v1/analyze-test-strip")
        else { throw StripScanError.network }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "imageBase64": jpeg.base64EncodedString(),
            "stripBrand": brand.rawValue,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw StripScanError.network
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw StripScanError.parse
        }

        if let readable = json["readable"] as? Bool, !readable {
            throw StripScanError.notReadable(json["error"] as? String ?? "Could not read the test strip.")
        }

        return StripScanResult(
            freeChlorine:    parseScanValue(json["free_chlorine"]),
            ph:              parseScanValue(json["ph"]),
            alkalinity:      parseScanValue(json["alkalinity"]),
            cyanuricAcid:    parseScanValue(json["cyanuric_acid"]),
            calciumHardness: parseScanValue(json["calcium_hardness"]),
            notes:           json["notes"] as? String
        )
    }

    func uploadStripPhoto(_ image: UIImage, readingId: String) async throws -> String {
        let compressed = resized(image, maxWidth: 1200)
        guard let data = compressed.jpegData(compressionQuality: 0.8) else {
            throw PhotoError.compressionFailed
        }
        let path = "\(readingId).jpg"
        try await storage.upload(path, data: data,
            options: FileOptions(contentType: "image/jpeg", upsert: true))
        return try storage.getPublicURL(path: path).absoluteString
    }

    // MARK: - Helpers

    private func parseScanValue(_ raw: Any?) -> ScanValue? {
        guard let dict = raw as? [String: Any] else { return nil }
        let val: Double
        if let d = dict["value"] as? Double { val = d }
        else if let i = dict["value"] as? Int { val = Double(i) }
        else { return nil }
        guard let conf = dict["confidence"] as? Double else { return nil }
        return ScanValue(value: val, confidence: conf)
    }

    private func resized(_ image: UIImage, maxWidth: CGFloat) -> UIImage {
        guard image.size.width > maxWidth else { return image }
        let scale = maxWidth / image.size.width
        let newSize = CGSize(width: maxWidth, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
