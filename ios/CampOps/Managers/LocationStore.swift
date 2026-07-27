import Foundation
import Combine

/// Camp-scoped store for the unified `locations` tree + `location_categories`.
///
/// Shared reference data (like `AuthManager.members`) consumed across modules:
/// the issue / checklist location pickers read the tree here, and view models
/// resolve selected `location_ids` back into display names when saving.
@MainActor
final class LocationStore: ObservableObject {
    static let shared = LocationStore()

    @Published private(set) var locations: [Location] = []
    @Published private(set) var categories: [LocationCategory] = []
    @Published private(set) var isLoading = false

    private init() {}

    // MARK: - Loading

    func load() async {
        isLoading = true
        do {
            async let locs = DataService.shared.fetchLocations()
            async let cats = DataService.shared.fetchLocationCategories()
            let (l, c) = try await (locs, cats)
            locations = l
            categories = c
        } catch {
            // Non-fatal: pickers simply show an empty state.
            locations = []; categories = []
        }
        isLoading = false
    }

    func refresh() async { await load() }

    // MARK: - Derived / lookups

    var activeLocations: [Location] { locations.filter { $0.isActive } }

    private var byId: [String: Location] {
        Dictionary(uniqueKeysWithValues: locations.map { ($0.id, $0) })
    }

    func location(_ id: String) -> Location? { byId[id] }

    func category(_ id: String?) -> LocationCategory? {
        guard let id else { return nil }
        return categories.first { $0.id == id }
    }

    /// Direct children of a node (nil parent = tree roots), sorted for display.
    func children(of parentId: String?) -> [Location] {
        activeLocations
            .filter { $0.parentId == parentId }
            .sorted { $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.name < $1.name }
    }

    /// Depth of a node within the full tree (root = 0). Cycle-guarded.
    func depth(of id: String) -> Int {
        let map = byId
        var depth = 0
        var current = map[id]?.parentId
        var seen = Set<String>()
        while let pid = current, !seen.contains(pid), let node = map[pid] {
            seen.insert(pid)
            depth += 1
            current = node.parentId
        }
        return depth
    }

    /// Ancestor chain names + self, e.g. "Boys Side › Cabin 7 › Bunk Room".
    func path(of id: String, separator: String = " › ") -> String {
        let map = byId
        var parts: [String] = []
        var current: Location? = map[id]
        var seen = Set<String>()
        while let node = current, !seen.contains(node.id) {
            seen.insert(node.id)
            parts.insert(node.name, at: 0)
            current = node.parentId.flatMap { map[$0] }
        }
        return parts.joined(separator: separator)
    }

    // MARK: - id <-> name bridging (keeps the `locations` name snapshot in sync)

    /// Display names for the given ids, preserving order, skipping unknowns.
    func names(for ids: [String]) -> [String] {
        let map = byId
        return ids.compactMap { map[$0]?.name }
    }

    /// Best-effort reverse mapping of names -> ids (used when editing a legacy
    /// record that only has the `locations` name snapshot, no `location_ids`).
    func ids(forNames names: [String]) -> [String] {
        var byName: [String: String] = [:]
        for loc in activeLocations where byName[loc.name] == nil { byName[loc.name] = loc.id }
        return names.compactMap { byName[$0] }
    }
}
