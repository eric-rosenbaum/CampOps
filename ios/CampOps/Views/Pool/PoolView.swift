import SwiftUI

enum PoolTab: Equatable { case chemical, equipment, inspections, seasonal }

struct PoolView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: PoolViewModel
    @State private var activeTab: PoolTab = .chemical
    @State private var showingLogReading    = false
    @State private var showingAddEquipment  = false
    @State private var showingLogService    = false
    @State private var showingLogInspection = false
    @State private var addTaskPhase: SeasonalPhase? = nil
    @State private var showingScanStrip = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Pool selector header
                poolSelectorHeader

                // Content area
                if vm.activePoolId == nil {
                    AllPoolsOverview(vm: vm, onSelectPool: { pool in
                        vm.activePoolId = pool.id
                        resetTabForPool(pool)
                    })
                } else {
                    poolDetailContent
                }
            }
            .navigationTitle(vm.activePool?.name ?? "All Pools")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) { UserMenuButton() }
                if vm.activePoolId != nil {
                    ToolbarItem(placement: .primaryAction) { addButton }
                }
            }
        }
        .sheet(isPresented: $showingLogReading) {
            LogReadingSheet(poolId: vm.activePoolId ?? "", onSave: { await vm.addReading($0) })
                .environmentObject(authManager)
        }
        .sheet(isPresented: $showingScanStrip) {
            ScanStripSheet(poolId: vm.activePoolId ?? "", onSave: { await vm.addReading($0) })
                .environmentObject(authManager)
        }
        .sheet(isPresented: $showingAddEquipment) {
            AddEquipmentSheet(poolId: vm.activePoolId ?? "", onSave: { await vm.addEquipment($0) })
        }
        .sheet(isPresented: $showingLogService) {
            LogServiceSheet(equipment: vm.filteredEquipment) { await vm.addServiceLog($0) }
                .environmentObject(authManager)
        }
        .sheet(isPresented: $showingLogInspection) {
            LogInspectionSheet(
                poolId: vm.activePoolId ?? "",
                inspections: vm.filteredInspections,
                editing: nil,
                onAdd: { entry in await vm.addInspectionLog(entry) },
                onDelete: { _ in }
            )
            .environmentObject(authManager)
        }
        .sheet(item: $addTaskPhase) { phase in
            SeasonalTaskSheet(
                poolId: vm.activePoolId ?? "",
                editing: nil,
                defaultPhase: phase,
                onAdd: { task in await vm.addSeasonalTask(task) },
                onSave: { task in await vm.updateSeasonalTask(task) }
            )
        }
        .task { await vm.load() }
    }

    // MARK: - Pool selector header

    var poolSelectorHeader: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                PoolSelectorTab(title: "All Pools", isSelected: vm.activePoolId == nil) {
                    vm.activePoolId = nil
                }
                ForEach(vm.pools.filter { $0.isActive }.sorted { $0.sortOrder < $1.sortOrder }) { pool in
                    PoolSelectorTab(
                        title: pool.name,
                        icon: pool.type.icon,
                        isSelected: vm.activePoolId == pool.id
                    ) {
                        vm.activePoolId = pool.id
                        resetTabForPool(pool)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Color(.systemBackground))
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    // MARK: - Pool detail content (tabs)

    @ViewBuilder
    var poolDetailContent: some View {
        let isChemical = vm.activePool?.type.isChemical ?? true
        let tabs: [PoolTab] = isChemical
            ? [.chemical, .equipment, .inspections, .seasonal]
            : [.equipment, .inspections, .seasonal]

        // Ensure activeTab is valid for this pool type
        let resolvedTab = tabs.contains(activeTab) ? activeTab : tabs[0]

        VStack(spacing: 0) {
            Picker("Tab", selection: Binding(
                get: { resolvedTab },
                set: { activeTab = $0 }
            )) {
                ForEach(tabs, id: \.self) { tab in
                    Text(tabLabel(tab)).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(Color(.systemGroupedBackground))

            Divider()

            switch resolvedTab {
            case .chemical:
                ChemicalLogView()
            case .equipment:
                EquipmentView(showingLogService: $showingLogService)
            case .inspections:
                InspectionsView()
            case .seasonal:
                SeasonalChecklistView(addTaskPhase: $addTaskPhase)
            }
        }
    }

    private func tabLabel(_ tab: PoolTab) -> String {
        switch tab {
        case .chemical:    return "Chemical"
        case .equipment:   return "Equipment"
        case .inspections: return "Inspections"
        case .seasonal:    return "Seasonal"
        }
    }

    private func resetTabForPool(_ pool: CampPool) {
        let isChemical = pool.type.isChemical
        let tabs: [PoolTab] = isChemical
            ? [.chemical, .equipment, .inspections, .seasonal]
            : [.equipment, .inspections, .seasonal]
        if !tabs.contains(activeTab) {
            activeTab = tabs[0]
        }
    }

    // MARK: - Add button (per tab, pool-detail context)

    @ViewBuilder
    private var addButton: some View {
        let isChemical = vm.activePool?.type.isChemical ?? true
        let resolvedTab: PoolTab = {
            let tabs: [PoolTab] = isChemical
                ? [.chemical, .equipment, .inspections, .seasonal]
                : [.equipment, .inspections, .seasonal]
            return tabs.contains(activeTab) ? activeTab : tabs[0]
        }()

        switch resolvedTab {
        case .chemical:
            Menu {
                Button { showingScanStrip = true } label: {
                    Label("Scan test strip", systemImage: "camera.viewfinder")
                }
                Button { showingLogReading = true } label: {
                    Label("Manual entry", systemImage: "pencil")
                }
            } label: { Image(systemName: "plus") }
        case .equipment:
            Menu {
                Button("Add equipment") { showingAddEquipment = true }
                Button("Log service")   { showingLogService = true }
            } label: { Image(systemName: "plus") }
        case .inspections:
            Button { showingLogInspection = true } label: { Image(systemName: "plus") }
        case .seasonal:
            if authManager.can.managePoolChecklist {
                Button { addTaskPhase = .opening } label: { Image(systemName: "plus") }
            } else {
                EmptyView()
            }
        }
    }
}

// MARK: - Pool selector tab pill

struct PoolSelectorTab: View {
    let title: String
    var icon: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 12))
                }
                Text(title)
                    .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
            }
            .foregroundColor(isSelected ? .white : Color.forest.opacity(0.6))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(isSelected ? Color.sage : Color(.systemGray6))
            .clipShape(Capsule())
        }
    }
}
