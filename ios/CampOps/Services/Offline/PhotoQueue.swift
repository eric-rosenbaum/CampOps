import UIKit

/// Photos taken where there is no signal.
///
/// The offline layer made every typed field survive a dead zone, and then the camera -- the one
/// input a phone has that a laptop does not -- still required a working connection, because an
/// upload is a network call with no queue behind it. A photo of the broken thing is often the
/// whole report, and the buildings where things break are exactly the buildings with no bars.
///
/// So: the image is written to disk immediately and the work order is saved without it. When the
/// connection comes back the file is uploaded and a `photo_url` mutation is queued through the
/// same `sync_push` path as everything else. The person sees the photo on the card the whole
/// time, because the local file is displayed until the remote URL exists.
///
/// Files live in Application Support, excluded from iCloud backup: they are a staging area, not
/// the user's photo library, and a half-uploaded queue restored onto a new phone would upload
/// photos to work orders that phone cannot see.
actor PhotoQueue {
    static let shared = PhotoQueue()

    /// What a queued photo is for. A work order's single photo, or one of a message's several.
    enum Target: Codable, Sendable {
        case workOrder(issueId: String)
        case comment(commentId: String, issueId: String)
        /// A step that asked for a photo. Its own case, not a comment: the URL belongs on
        /// `issue_checklist_items.photo_url`, and sending it to the comments table instead
        /// writes a row nobody will ever see.
        case checklistStep(itemId: String, issueId: String)
    }

    struct PendingPhoto: Codable, Sendable, Identifiable {
        let id: String
        let campId: String
        let target: Target
        /// Filename inside the queue directory, not a full path: the container's location
        /// changes between launches and an absolute path recorded today is wrong tomorrow.
        let fileName: String
        let createdAt: Date
        var attemptCount: Int = 0
        var lastError: String?
    }

    private var pending: [PendingPhoto] = []
    private var isDraining = false
    private var loaded = false

    private var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PhotoQueue", isDirectory: true)
        if !FileManager.default.fileExists(atPath: base.path) {
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            var url = base
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
        }
        return base
    }

    private var manifest: URL { directory.appendingPathComponent("queue.json") }

    // MARK: - Enqueue

    /// Writes the image to disk and returns the local file URL to show until it uploads.
    @discardableResult
    func enqueue(_ image: UIImage, campId: String, target: Target) -> URL? {
        load()
        guard let data = image.jpegData(compressionQuality: 0.8) else { return nil }
        let id = UUID().uuidString
        let fileName = "\(id).jpg"
        let url = directory.appendingPathComponent(fileName)
        do { try data.write(to: url) } catch { return nil }
        pending.append(PendingPhoto(id: id, campId: campId, target: target,
                                    fileName: fileName, createdAt: Date()))
        save()
        return url
    }

    /// The local file standing in for a photo that has not uploaded yet.
    func localURL(for target: Target) -> URL? {
        load()
        let match = pending.last { pending in
            switch (pending.target, target) {
            case let (.workOrder(a), .workOrder(b)): return a == b
            case let (.comment(a, _), .comment(b, _)): return a == b
            case let (.checklistStep(a, _), .checklistStep(b, _)): return a == b
            default: return false
            }
        }
        return match.map { directory.appendingPathComponent($0.fileName) }
    }

    var count: Int {
        load()
        return pending.count
    }

    // MARK: - Draining

    /// Uploads what it can, then queues the column write for each one that lands.
    ///
    /// Called by `SyncEngine` on the same triggers as a push: connectivity returning, the app
    /// coming to the foreground, the periodic timer. A failure here is never fatal -- the file
    /// stays on disk and the next drain tries again.
    func drain(campId: String) async {
        load()
        guard !isDraining, !pending.isEmpty else { return }
        isDraining = true
        defer { isDraining = false }

        for photo in pending where photo.campId == campId {
            let fileURL = directory.appendingPathComponent(photo.fileName)
            guard let data = try? Data(contentsOf: fileURL),
                  let image = UIImage(data: data) else {
                // The file is gone; there is nothing left to upload and nothing to retry.
                remove(photo.id)
                continue
            }

            do {
                let issueId: String
                switch photo.target {
                case let .workOrder(id): issueId = id
                case let .comment(_, id): issueId = id
                case let .checklistStep(_, id): issueId = id
                }
                let url = try await PhotoService.shared.uploadPhoto(image, issueId: issueId)
                await attach(url: url, to: photo.target)
                remove(photo.id)
            } catch {
                note(error: error.localizedDescription, on: photo.id)
            }
        }
    }

    private func attach(url: String, to target: Target) async {
        switch target {
        case let .workOrder(issueId):
            await SyncEngine.shared.queueIssuePhoto(issueId: issueId, url: url)
        case let .comment(commentId, _):
            // A message can carry several photos, so the whole array is rewritten from what has
            // landed so far rather than appended to blind.
            await SyncEngine.shared.queueCommentPhotos(commentId: commentId, urls: [url])
        case let .checklistStep(itemId, _):
            await SyncEngine.shared.queueChecklistPhoto(itemId: itemId, url: url)
        }
    }

    // MARK: - Persistence

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let data = try? Data(contentsOf: manifest),
              let rows = try? JSONDecoder().decode([PendingPhoto].self, from: data) else { return }
        pending = rows
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(pending) else { return }
        try? data.write(to: manifest)
    }

    private func remove(_ id: String) {
        if let photo = pending.first(where: { $0.id == id }) {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(photo.fileName))
        }
        pending.removeAll { $0.id == id }
        save()
    }

    private func note(error: String, on id: String) {
        guard let idx = pending.firstIndex(where: { $0.id == id }) else { return }
        pending[idx].attemptCount += 1
        pending[idx].lastError = error
        save()
    }
}
