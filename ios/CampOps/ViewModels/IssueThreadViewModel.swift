import Combine
import Foundation

/// The notes and steps on one work order.
///
/// This is the second of the two things a crew does while walking (the first being closing the
/// work order itself), and both of its writes go through the mutation queue rather than
/// straight to PostgREST. That is the whole difference between a checklist that works in a
/// cabin with no bars and one that silently does nothing.
///
/// Reads still prefer the network, because a thread is small and fresh is better. When the
/// fetch fails, it falls back to the offline cache instead of showing an empty list - an empty
/// list reads as "there are no notes", which is a different and wrong statement.
@MainActor
final class IssueThreadViewModel: ObservableObject {
    @Published private(set) var comments: [IssueComment] = []
    @Published private(set) var checklist: [IssueChecklistItem] = []
    @Published private(set) var isLoading = false
    /// True when what is on screen came off the disk rather than the server.
    @Published private(set) var isShowingCachedCopy = false
    @Published var errorMessage: String?

    let issueId: String
    private var campId: String { AuthManager.shared.currentCamp?.id ?? "" }

    init(issueId: String) { self.issueId = issueId }

    var doneCount: Int { checklist.filter(\.isDone).count }
    var hasChecklist: Bool { !checklist.isEmpty }

    // MARK: - Loading

    func load() async {
        isLoading = true
        defer { isLoading = false }
        await refresh()
    }

    func refresh() async {
        do {
            async let remoteComments = DataService.shared.fetchIssueComments(issueId: issueId)
            async let remoteChecklist = DataService.shared.fetchIssueChecklist(issueId: issueId)
            comments = try await remoteComments.filter { $0.deletedAt == nil }
            checklist = try await remoteChecklist
            isShowingCachedCopy = false
            errorMessage = nil
            await SyncEngine.shared.cacheFetched(comments, table: SyncTable.issueComments)
            await SyncEngine.shared.cacheFetched(checklist, table: SyncTable.issueChecklistItems)
        } catch {
            let campId = campId
            guard !campId.isEmpty else { return }
            let cachedComments = await OfflineReads.comments(issueId: issueId, campId: campId)
            let cachedChecklist = await OfflineReads.checklist(issueId: issueId, campId: campId)
            // Only claim to be showing a cached copy if there was in fact something cached; an
            // empty cache and a failed fetch are the same picture, and pretending otherwise
            // tells the user the work order genuinely has no notes.
            if !cachedComments.isEmpty || !cachedChecklist.isEmpty {
                comments = cachedComments
                checklist = cachedChecklist
                isShowingCachedCopy = true
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Writing

    /// Post a note. Appears immediately, goes out when there is signal.
    func postComment(_ body: String, by user: CampUser, visibleToReporter: Bool = false) async {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let comment = IssueComment(
            issueId: issueId,
            authorId: user.id,
            authorName: user.name,
            body: text,
            visibleToReporter: visibleToReporter
        )
        // Optimistic, and NOT rolled back if the push fails. The queue owns delivery now: a
        // failure surfaces in the sync pill with the note's text intact, rather than the note
        // vanishing out from under the person who wrote it.
        comments.append(comment)
        Haptics.success()
        await SyncEngine.shared.queueCommentCreate(comment)
    }

    /// Tick or un-tick a step.
    func toggle(_ item: IssueChecklistItem, by user: CampUser) async {
        guard let index = checklist.firstIndex(where: { $0.id == item.id }) else { return }
        let done = !checklist[index].isDone

        checklist[index].isDone = done
        checklist[index].doneBy = done ? user.id : nil
        checklist[index].doneByName = done ? user.name : nil
        checklist[index].doneAt = done ? Date() : nil
        Haptics.tap()

        await SyncEngine.shared.queueChecklistTick(checklist[index], done: done, by: user)
    }

    /// Add a step from the field.
    func addStep(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let item = IssueChecklistItem(
            issueId: issueId,
            position: (checklist.map(\.position).max() ?? -1) + 1,
            text: trimmed
        )
        checklist.append(item)
        await SyncEngine.shared.queueChecklistItemCreate(item)
    }
}
