import SwiftUI

// MARK: - Root

struct BuildingView: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @State private var sheet: BuildingSheetRoute?

    var body: some View {
        NavigationStack {
            Group {
                if vm.buildings.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(vm.sortedBuildings) { building in
                            NavigationLink {
                                BuildingDetailView(buildingId: building.id)
                            } label: {
                                BuildingRow(building: building)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .campCanvas()
            .refreshable { await vm.refresh() }
            .navigationTitle("Building Systems")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        NavigationLink { ElectricalListView() } label: { Label("Panels & circuits", systemImage: "powerplug.fill") }
                        NavigationLink { PlumbingListView() } label: { Label("Shutoff valves", systemImage: "gauge.with.dots.needle.bottom.50percent") }
                        NavigationLink { BuildingSeasonalView() } label: { Label("Seasonal checklist", systemImage: "calendar") }
                    } label: {
                        Image(systemName: "line.3.horizontal")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { sheet = .addBuilding } label: { Image(systemName: "plus") }
                }
            }
            .sheet(item: $sheet) { route in buildingSheet(route) }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No buildings yet", systemImage: "building.2")
                .font(.campSection)
        } description: {
            Text("Add your cabins, bathhouses and utility buildings, then map their electrical and plumbing room by room.")
                .font(.campBody)
        } actions: {
            Button("Add your first building") { sheet = .addBuilding }
                .font(.campBodySemibold)
                .foregroundStyle(Color.sage)
        }
    }
}

// MARK: - Building row

struct BuildingRow: View {
    @EnvironmentObject private var vm: BuildingViewModel
    let building: Building

    var body: some View {
        let comps = vm.components(for: building.id)
        let elec = comps.filter { $0.system == .electrical }.count
        let plumb = comps.filter { $0.system == .plumbing }.count
        let flagged = comps.filter { $0.status != .operational }.count
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "building.2.fill").foregroundColor(.forest)
                Text(building.name).font(.campSection)
                Spacer()
                if !comps.isEmpty { StatusDotLabel(status: vm.status(for: building.id)) }
            }
            HStack(spacing: 10) {
                Text(building.type.displayName).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                Label("\(elec)", systemImage: "bolt.fill").font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
                Label("\(plumb)", systemImage: "drop.fill").font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
                if flagged > 0 {
                    Text("\(flagged) flagged").font(.campMicro).foregroundColor(.amberText)
                }
            }
            if let w = building.mainWaterShutoff, !w.isEmpty {
                Label("Water: \(w)", systemImage: "drop").font(.campMicro).foregroundStyle(Color.forest.opacity(0.55)).lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Building detail

struct BuildingDetailView: View {
    @EnvironmentObject private var vm: BuildingViewModel
    let buildingId: String
    @State private var sheet: BuildingSheetRoute?

    private var building: Building? { vm.buildings.first { $0.id == buildingId } }

    var body: some View {
        Group {
            if let building {
                List {
                    if hasEmergencyRef(building) {
                        Section("Emergency reference") {
                            emergencyRows(building)
                        }
                    }
                    ForEach(vm.rooms(for: building.id)) { room in
                        roomSection(building: building, roomId: room.id, name: room.name, subtitle: room.floor)
                    }
                    if !vm.components(roomId: nil, buildingId: building.id).isEmpty {
                        roomSection(building: building, roomId: nil, name: "Unassigned", subtitle: nil)
                    }
                    Section {
                        Button { sheet = .addRoom(buildingId: building.id) } label: {
                            Label("Add room", systemImage: "plus")
                        }
                        Button { sheet = .addComponent(buildingId: building.id, roomId: nil, system: .electrical) } label: {
                            Label("Add component", systemImage: "plus")
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .navigationTitle(building.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { sheet = .editBuilding(building) } label: { Image(systemName: "pencil") }
                    }
                }
                .sheet(item: $sheet) { route in buildingSheet(route) }
            } else {
                Text("Building not found").foregroundStyle(Color.forest.opacity(0.55))
            }
        }
    }

    private func hasEmergencyRef(_ b: Building) -> Bool {
        [b.mainWaterShutoff, b.mainElectricalPanel, b.mainGasShutoff].contains { ($0 ?? "").isEmpty == false }
    }

    @ViewBuilder
    private func emergencyRows(_ b: Building) -> some View {
        if let w = b.mainWaterShutoff, !w.isEmpty { refRow("drop.fill", "Water shutoff", w) }
        if let p = b.mainElectricalPanel, !p.isEmpty { refRow("powerplug.fill", "Main panel", p) }
        if let g = b.mainGasShutoff, !g.isEmpty { refRow("flame.fill", "Gas shutoff", g) }
    }

    private func refRow(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon).foregroundColor(.amberText).frame(width: 20)
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                Text(value).font(.campBody)
            }
        }
    }

    @ViewBuilder
    private func roomSection(building: Building, roomId: String?, name: String, subtitle: String?) -> some View {
        let comps = vm.components(roomId: roomId, buildingId: building.id)
        let elec = comps.filter { $0.system == .electrical }
        let plumb = comps.filter { $0.system == .plumbing }
        Section {
            if comps.isEmpty {
                Text("No components yet").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }
            ForEach(elec) { componentLink($0) }
            ForEach(plumb) { componentLink($0) }
            Menu {
                Button { sheet = .addComponent(buildingId: building.id, roomId: roomId, system: .electrical) } label: {
                    Label("Electrical", systemImage: "bolt.fill")
                }
                Button { sheet = .addComponent(buildingId: building.id, roomId: roomId, system: .plumbing) } label: {
                    Label("Plumbing", systemImage: "drop.fill")
                }
            } label: {
                Label("Add component", systemImage: "plus").font(.campMeta)
            }
        } header: {
            HStack {
                Text(name)
                if let s = subtitle, !s.isEmpty { Text("· \(s)").foregroundStyle(Color.forest.opacity(0.55)) }
                Spacer()
                if let roomId {
                    Button { sheet = .editRoom(roomById(roomId)) } label: { Image(systemName: "pencil").font(.campMicro) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func roomById(_ id: String) -> BuildingRoom {
        vm.rooms.first { $0.id == id } ?? BuildingRoom(id: id, buildingId: buildingId, name: "", floor: nil, notes: nil, sortOrder: 0, createdAt: Date(), updatedAt: Date())
    }

    private func componentLink(_ c: BuildingComponent) -> some View {
        NavigationLink { ComponentDetailView(componentId: c.id) } label: { ComponentRow(component: c) }
    }
}

// MARK: - Component row

struct ComponentRow: View {
    let component: BuildingComponent
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: BuildingTaxonomy.icon(for: component.type))
                .foregroundStyle(Color.forest.opacity(0.55)).frame(width: 22)
            Circle().fill(component.status.color).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(component.label)
                let sub = [BuildingTaxonomy.label(for: component.type), componentSummary(component), component.locationDetail ?? ""]
                    .filter { !$0.isEmpty }.joined(separator: " · ")
                if !sub.isEmpty { Text(sub).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55)).lineLimit(1) }
            }
        }
    }
}

struct StatusDotLabel: View {
    let status: ComponentStatus
    var body: some View {
        Text(status.displayName)
            .font(.campMicroMedium)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(status.bgColor).foregroundColor(status.color)
            .clipShape(Capsule())
    }
}

// MARK: - Component detail

struct ComponentDetailView: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    let componentId: String
    @State private var sheet: BuildingSheetRoute?
    @State private var showDeleteConfirm = false

    private var component: BuildingComponent? { vm.components.first { $0.id == componentId } }
    private var isPanel: Bool { component.map { $0.type == "breaker_panel" || $0.type == "sub_panel" } ?? false }

    var body: some View {
        Group {
            if let component {
                List {
                    Section {
                        HStack {
                            StatusDotLabel(status: component.status)
                            if let d = component.statusDetail, !d.isEmpty {
                                Text(d).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                            }
                        }
                        detailRow("Type", BuildingTaxonomy.label(for: component.type))
                        if let room = component.roomId.flatMap({ id in vm.rooms.first { $0.id == id } }) {
                            detailRow("Room", room.name)
                        }
                        if let l = component.locationDetail, !l.isEmpty { detailRow("Location", l) }
                        ForEach(BuildingTaxonomy.specs(for: component.type)) { field in
                            if let v = component.metadata[field.key], v != .null, !v.displayString.isEmpty {
                                detailRow(field.label, formatSpec(field, v))
                            }
                        }
                        if let ls = component.lastServiced { detailRow("Last serviced", ls.localDateDisplay) }
                        if let ns = component.nextServiceDue { detailRow("Next service", ns.localDateDisplay) }
                    }

                    if let notes = component.notes, !notes.isEmpty {
                        Section("Notes") { Text(notes).font(.campBody) }
                    }

                    if isPanel { panelScheduleSection(component) }

                    Section {
                        Button { sheet = .flag(component) } label: {
                            Label("Flag issue", systemImage: "flag").foregroundColor(.amberText)
                        }
                        Button { sheet = .editComponent(component) } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        Button(role: .destructive) { showDeleteConfirm = true } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .navigationTitle(component.label)
                .navigationBarTitleDisplayMode(.inline)
                .sheet(item: $sheet) { route in buildingSheet(route) }
                .confirmationDialog("Delete \"\(component.label)\"?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task { await vm.deleteComponent(id: component.id); dismiss() }
                    }
                    Button("Cancel", role: .cancel) {}
                }
            } else {
                Color.clear.onAppear { dismiss() }
            }
        }
    }

    @ViewBuilder
    private func panelScheduleSection(_ panel: BuildingComponent) -> some View {
        let circuits = vm.circuits(panelId: panel.id)
        Section {
            if circuits.isEmpty {
                Text("No breakers mapped yet").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }
            ForEach(circuits) { c in
                Button { sheet = .editCircuit(c) } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Text(c.breakerNumber ?? "–").font(.system(.subheadline, design: .monospaced))
                            .fontWeight(.semibold).foregroundStyle(Color.forest.opacity(0.55)).frame(width: 28, alignment: .trailing)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(c.label ?? c.controls ?? "Unlabeled").foregroundColor(.primary)
                            if let ctrl = c.controls, c.label != nil, !ctrl.isEmpty {
                                Text(ctrl).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                            }
                        }
                        Spacer()
                        if let a = c.amperage { Text("\(a)A").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55)) }
                        if !c.isOn { Text("OFF").font(.campMicro).foregroundColor(.priorityUrgent) }
                    }
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) { Task { await vm.deleteCircuit(id: c.id) } } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
            Button { sheet = .addCircuit(panelId: panel.id) } label: {
                Label("Add breaker", systemImage: "plus").font(.campMeta)
            }
        } header: { Text("Panel schedule") }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(Color.forest.opacity(0.55))
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
        .font(.campBody)
    }

    private func formatSpec(_ field: SpecField, _ v: JSONValue) -> String {
        if field.kind == .select { return field.options.first { $0.value == v.stringValue }?.label ?? v.displayString }
        return v.displayString
    }
}

// MARK: - Cross-building: Electrical

struct ElectricalListView: View {
    @EnvironmentObject private var vm: BuildingViewModel

    var body: some View {
        List {
            Section("Panels & breaker schedules") {
                if vm.panels.isEmpty {
                    Text("No panels mapped yet").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                }
                ForEach(vm.panels) { panel in
                    NavigationLink { ComponentDetailView(componentId: panel.id) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Image(systemName: "powerplug.fill").foregroundStyle(Color.forest.opacity(0.55))
                                Text(panel.label).fontWeight(.medium)
                            }
                            if let b = vm.buildings.first(where: { $0.id == panel.buildingId }) {
                                Text("\(b.name) · \(vm.circuits(panelId: panel.id).count) breakers")
                                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                            }
                        }
                    }
                }
            }
            crossSection(system: .electrical, title: "All electrical")
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Electrical")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func crossSection(system: BuildingSystem, title: String) -> some View {
        Section(title) {
            let comps = vm.components.filter { $0.system == system }
            if comps.isEmpty { Text("None recorded").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55)) }
            ForEach(comps) { c in
                NavigationLink { ComponentDetailView(componentId: c.id) } label: {
                    crossRow(c)
                }
            }
        }
    }

    private func crossRow(_ c: BuildingComponent) -> some View {
        HStack(spacing: 10) {
            Circle().fill(c.status.color).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(c.label)
                if let b = vm.buildings.first(where: { $0.id == c.buildingId }) {
                    Text(b.name).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                }
            }
        }
    }
}

// MARK: - Cross-building: Plumbing

struct PlumbingListView: View {
    @EnvironmentObject private var vm: BuildingViewModel

    var body: some View {
        List {
            Section {
                if vm.shutoffValves.isEmpty {
                    Text("No shutoff valves recorded yet").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                }
                ForEach(vm.shutoffValves) { v in
                    NavigationLink { ComponentDetailView(componentId: v.id) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Image(systemName: "gauge.with.dots.needle.bottom.50percent").foregroundStyle(Color.forest.opacity(0.55))
                                Text(v.label).fontWeight(.medium)
                            }
                            if let b = vm.buildings.first(where: { $0.id == v.buildingId }) {
                                Text(b.name).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                            }
                            if let loc = v.locationDetail, !loc.isEmpty {
                                Text(loc).font(.campBody)
                            }
                        }
                    }
                }
            } header: {
                Text("Shutoff valves")
            } footer: {
                Text("Where to cut the water in a hurry.")
            }

            Section("All plumbing") {
                let comps = vm.components.filter { $0.system == .plumbing }
                if comps.isEmpty { Text("None recorded").font(.campMeta).foregroundStyle(Color.forest.opacity(0.55)) }
                ForEach(comps) { c in
                    NavigationLink { ComponentDetailView(componentId: c.id) } label: {
                        HStack(spacing: 10) {
                            Circle().fill(c.status.color).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(c.label)
                                if let b = vm.buildings.first(where: { $0.id == c.buildingId }) {
                                    Text(b.name).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Plumbing")
        .navigationBarTitleDisplayMode(.inline)
    }
}
