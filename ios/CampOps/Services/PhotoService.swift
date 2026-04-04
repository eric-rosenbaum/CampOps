import UIKit
import Supabase

final class PhotoService {
    static let shared = PhotoService()
    private var storage: StorageFileApi { SupabaseService.shared.client.storage.from("issue-photos") }
    private init() {}

    func uploadPhoto(_ image: UIImage, issueId: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.8) else {
            throw PhotoError.compressionFailed
        }
        try await storage.upload(issueId, data: data,
            options: FileOptions(contentType: "image/jpeg", upsert: true))
        return try storage.getPublicURL(path: issueId).absoluteString
    }

    func deletePhoto(url: String) async throws {
        guard let range = url.range(of: "/issue-photos/") else { return }
        let path = String(url[range.upperBound...])
        try await storage.remove(paths: [path])
    }
}

enum PhotoError: LocalizedError {
    case compressionFailed
    var errorDescription: String? { "Could not compress the selected image." }
}
