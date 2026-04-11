import SwiftUI

enum PoolTab { case chemical, equipment, inspections, seasonal }

struct PoolView: View {
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var vm: PoolViewModel
    @State private var activeTab: PoolTab = .chemical
    @State private var showingLogReading    = false
    @State private var showingAddEquipment  = false
    @State private var showingLogService    = false
    @State private var showingLogInspection = false
    @State private var addTaskPhase: SeasonalPhase? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Tab", selection: $activeTab) {
                    Text("Chemical").tag(PoolTab.chemical)
                    Text("Equipment").tag(PoolTab.equipment)
                    Text("Inspections").tag(PoolTab.inspections)
                    Text("Seasonal").tag(PoolTab.seasonal)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(Color(.systemGroupedBackground))

                Divider()

                switch activeTab {
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
            .navigationTitle("Pool")
            .toolbar {
                ToolbarItem(placement: .primaryAction) { UserMenuButton() }
                ToolbarItem(placement: .primaryAction) { addButton }
            }
        }
        .sheet(isPresented: $showingLogReading) {
            LogReadingSheet(onSave: { await vm.addReading($0) })
                .environmentObject(userManager)
        }
        .sheet(isPresented: $showingAddEquipment) {
            AddEquipmentSheet(onSave: { await vm.addEquipment($0) })
        }
        .sheet(isPresented: $showingLogService) {
            LogServiceSheet(equipment: vm.equipment) { await vm.addServiceLog($0) }
                .environmentObject(userManager)
        }
        .sheet(isPresented: $showingLogInspection) {
            LogInspectionSheet(
                inspections: vm.inspections,
                editing: nil,
                onAdd: { entry in await vm.addInspectionLog(entry) },
                onDelete: { _ in }
            )
            .environmentObject(userManager)
        }
        .sheet(item: $addTaskPhase) { phase in
            SeasonalTaskSheet(
                editing: nil,
                defaultPhase: phase,
                onAdd: { task in await vm.addSeasonalTask(task) },
                onSave: { task in await vm.updateSeasonalTask(task) }
            )
        }
        .task { await vm.load() }
    }

    @ViewBuilder
    private var addButton: some View {
        switch activeTab {
        case .chemical:
            Button { showingLogReading = true } label: { Image(systemName: "plus") }
        case .equipment:
            Menu {
                Button("Add equipment") { showingAddEquipment = true }
                Button("Log service")   { showingLogService = true }
            } label: { Image(systemName: "plus") }
        case .inspections:
            Button { showingLogInspection = true } label: { Image(systemName: "plus") }
        case .seasonal:
            if userManager.can.managePoolChecklist {
                Button { addTaskPhase = .opening } label: { Image(systemName: "plus") }
            } else {
                EmptyView()
            }
        }
    }
}
