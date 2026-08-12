import SwiftUI

/// Searchable, category-grouped, tree-indented multi-select picker over the
/// unified `locations` tree. Scales to 150+ nodes:
///   • a search field flattens to matching rows (with breadcrumb path),
///   • otherwise rows are grouped into sections by category and indented by
///     their depth within that category.
///
/// Binds to canonical `location_ids`. Callers resolve the selected ids back to
/// display names (via `LocationStore`) when persisting.
struct LocationTreePicker: View {
    @Binding var selectedIds: [String]
    @ObservedObject private var store = LocationStore.shared
    @State private var search = ""

    var body: some View {
        List {
            if store.activeLocations.isEmpty {
                Text("No locations configured for this camp.")
                    .foregroundStyle(Color.forest.opacity(0.55))
            } else if isSearching {
                searchResults
            } else {
                treeSections
            }
        }
        .searchable(text: $search,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Search locations")
        .navigationTitle("Locations")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !selectedIds.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Clear") { selectedIds.removeAll() }
                }
            }
        }
    }

    private var isSearching: Bool {
        !search.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Search (flat, with breadcrumb)

    private var searchResults: some View {
        let q = search.lowercased()
        let matches = store.activeLocations
            .filter { $0.name.lowercased().contains(q) || store.path(of: $0.id).lowercased().contains(q) }
            .sorted { $0.name < $1.name }
        return Group {
            if matches.isEmpty {
                Text("No matches").foregroundStyle(Color.forest.opacity(0.55))
            } else {
                ForEach(matches) { loc in
                    row(loc, indent: 0, showBreadcrumb: true)
                }
            }
        }
    }

    // MARK: - Tree grouped by category

    private var treeSections: some View {
        ForEach(orderedCategories, id: \.key) { entry in
            Section(entry.title) {
                ForEach(entry.nodes, id: \.loc.id) { node in
                    row(node.loc, indent: node.indent, showBreadcrumb: false)
                }
            }
        }
    }

    /// Category sections (sorted), with an "Uncategorized" section last when
    /// needed. Each carries its ordered, indented nodes.
    private var orderedCategories: [(key: String, title: String, nodes: [(loc: Location, indent: Int)])] {
        let preorder = preorderNodes()
        var out: [(key: String, title: String, nodes: [(loc: Location, indent: Int)])] = []

        for cat in store.categories.sorted(by: { $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.name < $1.name }) {
            let nodes = preorder.filter { $0.loc.categoryId == cat.id }
                .map { (loc: $0.loc, indent: sameCategoryDepth($0.loc)) }
            if !nodes.isEmpty { out.append((key: cat.id, title: cat.name, nodes: nodes)) }
        }

        let uncategorized = preorder.filter { $0.loc.categoryId == nil || store.category($0.loc.categoryId) == nil }
            .map { (loc: $0.loc, indent: sameCategoryDepth($0.loc)) }
        if !uncategorized.isEmpty {
            out.append((key: "__uncat__", title: "Uncategorized", nodes: uncategorized))
        }
        return out
    }

    // MARK: - Tree traversal helpers

    private var activeIdSet: Set<String> { Set(store.activeLocations.map(\.id)) }

    /// Pre-order traversal of the whole active tree, carrying tree depth.
    private func preorderNodes() -> [(loc: Location, depth: Int)] {
        var result: [(loc: Location, depth: Int)] = []
        let ids = activeIdSet
        // Roots: no parent, or parent not present/active (orphans surface at top).
        let roots = store.activeLocations
            .filter { $0.parentId == nil || !ids.contains($0.parentId!) }
            .sorted { $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.name < $1.name }
        func walk(_ node: Location, _ depth: Int, _ seen: inout Set<String>) {
            guard !seen.contains(node.id) else { return }
            seen.insert(node.id)
            result.append((node, depth))
            for child in store.children(of: node.id) { walk(child, depth + 1, &seen) }
        }
        var seen = Set<String>()
        for r in roots { walk(r, 0, &seen) }
        return result
    }

    /// Indent within a category section = number of ancestors sharing the same
    /// category (so parent/child in one category nest cleanly).
    private func sameCategoryDepth(_ loc: Location) -> Int {
        let cat = loc.categoryId
        var count = 0
        var current = loc.parentId.flatMap { store.location($0) }
        var guardSet = Set<String>()
        while let node = current, !guardSet.contains(node.id) {
            guardSet.insert(node.id)
            if node.categoryId == cat { count += 1 }
            current = node.parentId.flatMap { store.location($0) }
        }
        return count
    }

    // MARK: - Row

    @ViewBuilder
    private func row(_ loc: Location, indent: Int, showBreadcrumb: Bool) -> some View {
        let isSelected = selectedIds.contains(loc.id)
        Button {
            if isSelected { selectedIds.removeAll { $0 == loc.id } }
            else { selectedIds.append(loc.id) }
        } label: {
            HStack(spacing: 8) {
                if indent > 0 {
                    Rectangle().fill(Color.clear)
                        .frame(width: CGFloat(indent) * 16, height: 1)
                }
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(loc.name).foregroundColor(.primary)
                        if loc.isDorm {
                            Image(systemName: "bed.double.fill")
                                .font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
                        }
                    }
                    if showBreadcrumb, let parentId = loc.parentId, store.location(parentId) != nil {
                        Text(store.path(of: parentId))
                            .font(.campMicro).foregroundStyle(Color.forest.opacity(0.55)).lineLimit(1)
                    }
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark").foregroundColor(.sage)
                }
            }
        }
    }
}
