import UIKit
import Supabase

final class PhotoService {
    static let shared = PhotoService()
    private var storage: StorageFileApi { SupabaseService.shared.client.storage.from("issue-photos") }

    private init() {}

    /// Upload a photo for an issue. Returns the public URL.
    func uploadPhoto(_ image: UIImage, issueId: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.8) else {
            throw PhotoError.compressionFailed
        }
        let path = issueId   // matches web app: single file per issue, path = issueId
        try await storage.upload(
            path,
            data: data,
            options: FileOptions(contentType: "image/jpeg", upsert: true)
        )
        let publicURL = try storage.getPublicURL(path: path)
        return publicURL.absoluteString
    }

    /// Delete a photo given its public URL.
    func deletePhoto(url: String) async throws {
        guard let path = extractPath(from: url) else { return }
        try await storage.remove(paths: [path])
    }

    private func extractPath(from url: String) -> String? {
        // URL format: https://<project>.supabase.co/storage/v1/object/public/issue-photos/<path>
        guard let range = url.range(of: "/issue-photos/") else { return nil }
        return String(url[range.upperBound...])
    }
}

enum PhotoError: LocalizedError {
    case compressionFailed

    var errorDescription: String? {
        switch self {
        case .compressionFailed: return "Could not compress the selected image."
        }
    }
}
