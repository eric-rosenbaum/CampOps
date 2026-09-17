import Foundation
import Combine

/// Everything the Campground module needs that is not a work order.
///
/// Crews, vendors, routines, routing defaults, checklist templates, per-issue access grants and
/// thread read state. All of it is reference data the web writes and the phone reads, and all of
/// it is loaded once per camp and then kept by the cache, so a location screen opened from a QR
/// sticker in a dead zone can still name the crew and the vendor.
@MainActor
final class CampgroundStore: ObservableObject {
    static let shared = CampgroundStore()

    @Published private(set) var vendors: [ServiceVendor] = []
    @Published private(set) var schedules: [WorkSchedule] = []
    @Published private(set) var routing: [WorkRouting] = []
    @Published private(set) var templates: [WorkChecklistTemplate] = []
    /// Work orders this person has been given access to one at a time.
    @Published private(set) var viewerGrants: Set<String> = []
    /// When this person last opened each thread, for the unread dot.
    @Published private(set) var readAt: [String: Date] = [:]

    private init() {}

    /// The crews a work order may belong to: active ones, in the camp's own order.
    var trades: [StaffGroup] { AuthManager.shared.crews.filter(\.isActive) }
    var tradeKeys: [String] { trades.map(\.key) }

    /// The camp's default crew for a new work order: the first one it listed.
    var defaultTradeKey: String { trades.first?.key ?? Trade.fallbackKey }

    func activeVendors() -> [ServiceVendor] { vendors.filter(\.isActive) }

    /// Templates offered for a crew, plus any that were written without one.
    func templates(for trade: String) -> [WorkChecklistTemplate] {
        templates.filter { $0.isActive && ($0.trade == trade || $0.trade.isEmpty) }
    }

    /// Routines that fire at a location, for the screen a sticker opens.
    func schedules(atLocation locationId: String) -> [WorkSchedule] {
        schedules.filter { $0.locationIds.contains(locationId) }
    }

    // MARK: - Loading

    /// Cache first, network second.
    ///
    /// The order matters on a phone: showing the crew list from disk immediately and correcting
    /// it a second later is the difference between a form that opens and a spinner in a cabin.
    func load(campId: String) async {
        vendors = await OfflineReads.vendors(campId: campId)
        schedules = await OfflineReads.schedules(campId: campId)
        routing = await OfflineReads.routing(campId: campId)
        await refresh()
    }

    func refresh() async {
        async let vendorRows = try? DataService.shared.fetchServiceVendors()
        async let scheduleRows = try? DataService.shared.fetchWorkSchedules()
        async let routingRows = try? DataService.shared.fetchWorkRouting()
        async let templateRows = try? DataService.shared.fetchChecklistTemplates()
        async let viewerRows = try? DataService.shared.fetchIssueViewers()

        if let rows = await vendorRows { vendors = rows }
        if let rows = await scheduleRows { schedules = rows.filter(\.isActive) }
        if let rows = await routingRows { routing = rows }
        if let rows = await templateRows { templates = rows }

        let me = AuthManager.shared.currentUser.id
        if let rows = await viewerRows {
            viewerGrants = Set(rows.filter { $0.userId == me }.map(\.issueId))
        }
        if let reads = try? await DataService.shared.fetchCommentReads(userId: me) {
            readAt = Dictionary(reads.map { ($0.issueId, $0.lastReadAt) },
                                uniquingKeysWith: { later, _ in later })
        }
    }

    /// Marks a thread read locally and, when there is signal, on the server.
    ///
    /// Local first and unconditionally: the dot is about what this person has looked at, and it
    /// should go out the moment they look, whether or not the write lands.
    func markRead(issueId: String) {
        readAt[issueId] = Date()
        let me = AuthManager.shared.currentUser.id
        guard !me.isEmpty else { return }
        Task {
            try? await DataService.shared.markThreadRead(issueId: issueId, userId: me)
        }
    }

    func clear() {
        vendors = []; schedules = []; routing = []; templates = []
        viewerGrants = []; readAt = [:]
    }
}
