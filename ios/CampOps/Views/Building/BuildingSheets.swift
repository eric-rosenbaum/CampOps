import SwiftUI

// MARK: - Sheet routing

enum BuildingSheetRoute: Identifiable {
    case addBuilding
    case editBuilding(Building)
    case addRoom(buildingId: String)
    case editRoom(BuildingRoom)
    case addComponent(buildingId: String, roomId: String?, system: BuildingSystem)
    case editComponent(BuildingComponent)
    case addCircuit(panelId: String)
    case editCircuit(BuildingCircuit)
    case flag(BuildingComponent)
    case addSeasonal(phase: SeasonalPhase)
    case editSeasonal(BuildingSeasonalTask)

    var id: String {
        switch self {
        case .addBuilding: return "addBuilding"
        case .editBuilding(let b): return "editBuilding-\(b.id)"
        case .addRoom(let id): return "addRoom-\(id)"
        case .editRoom(let r): return "editRoom-\(r.id)"
        case .addComponent(let b, let r, let s): return "addComp-\(b)-\(r ?? "nil")-\(s.rawValue)"
        case .editComponent(let c): return "editComp-\(c.id)"
        case .addCircuit(let p): return "addCircuit-\(p)"
        case .editCircuit(let c): return "editCircuit-\(c.id)"
        case .flag(let c): return "flag-\(c.id)"
        case .addSeasonal(let p): return "addSeasonal-\(p.rawValue)"
        case .editSeasonal(let t): return "editSeasonal-\(t.id)"
        }
    }
}

@ViewBuilder
func buildingSheet(_ route: BuildingSheetRoute) -> some View {
    switch route {
    case .addBuilding:                          AddBuildingSheet()
    case .editBuilding(let b):                  AddBuildingSheet(editing: b)
    case .addRoom(let id):                       AddRoomSheet(buildingId: id)
    case .editRoom(let r):                        AddRoomSheet(buildingId: r.buildingId, editing: r)
    case .addComponent(let b, let r, let s):     AddComponentSheet(buildingId: b, defaultRoomId: r, defaultSystem: s)
    case .editComponent(let c):                  AddComponentSheet(buildingId: c.buildingId, editing: c)
    case .addCircuit(let p):                     AddCircuitSheet(panelId: p)
    case .editCircuit(let c):                    AddCircuitSheet(panelId: c.panelId, editing: c)
    case .flag(let c):                           FlagComponentSheet(component: c)
    case .addSeasonal(let p):                    BuildingSeasonalTaskSheet(defaultPhase: p)
    case .editSeasonal(let t):                   BuildingSeasonalTaskSheet(editing: t)
    }
}

// MARK: - Add / edit building

struct AddBuildingSheet: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    var editing: Building? = nil

    @State private var name = ""
    @State private var type: BuildingType = .cabin
    @State private var locationLabel = ""
    @State private var water = ""
    @State private var panel = ""
    @State private var gas = ""
    @State private var yearBuilt = ""
    @State private var notes = ""
    @State private var showDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Building") {
                    TextField("Name (e.g. Cabin 7, Main Bathhouse)", text: $name)
                    Picker("Type", selection: $type) {
                        ForEach(BuildingType.allCases) { Text($0.displayName).tag($0) }
                    }
                    TextField("Location / area (optional)", text: $locationLabel)
                }
                Section("Emergency reference") {
                    TextField("Main water shutoff", text: $water)
                    TextField("Main electrical panel", text: $panel)
                    TextField("Gas shutoff", text: $gas)
                }
                Section("Details") {
                    TextField("Year built (optional)", text: $yearBuilt).keyboardType(.numberPad)
                    TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(2...4)
                }
                if editing != nil {
                    Section {
                        Button("Delete building", role: .destructive) { showDelete = true }
                    }
                }
            }
            .navigationTitle(editing == nil ? "Add building" : "Edit building")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear(perform: populate)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Add" : "Save") { save() }.disabled(name.isEmpty)
                }
            }
            .confirmationDialog("Delete this building and all its rooms and components?", isPresented: $showDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let e = editing { Task { await vm.deleteBuilding(id: e.id); dismiss() } }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func populate() {
        guard let e = editing else { return }
        name = e.name; type = e.type; locationLabel = e.locationLabel ?? ""
        water = e.mainWaterShutoff ?? ""; panel = e.mainElectricalPanel ?? ""; gas = e.mainGasShutoff ?? ""
        yearBuilt = e.yearBuilt.map(String.init) ?? ""; notes = e.notes ?? ""
    }

    private func save() {
        let now = Date()
        func opt(_ s: String) -> String? { s.isEmpty ? nil : s }
        let b = Building(
            id: editing?.id ?? UUID().uuidString,
            name: name, type: type, locationLabel: opt(locationLabel),
            mainWaterShutoff: opt(water), mainElectricalPanel: opt(panel), mainGasShutoff: opt(gas),
            yearBuilt: Int(yearBuilt), notes: opt(notes),
            sortOrder: editing?.sortOrder ?? vm.buildings.count,
            createdAt: editing?.createdAt ?? now, updatedAt: now
        )
        Task { editing == nil ? await vm.addBuilding(b) : await vm.updateBuilding(b); dismiss() }
    }
}

// MARK: - Add / edit room

struct AddRoomSheet: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    let buildingId: String
    var editing: BuildingRoom? = nil

    @State private var name = ""
    @State private var floor = ""
    @State private var notes = ""
    @State private var showDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Room") {
                    TextField("Name (e.g. Shower room A, Kitchen)", text: $name)
                    TextField("Floor / level (optional)", text: $floor)
                    TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(2...4)
                }
                if editing != nil {
                    Section { Button("Delete room", role: .destructive) { showDelete = true } }
                }
            }
            .navigationTitle(editing == nil ? "Add room" : "Edit room")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let e = editing { name = e.name; floor = e.floor ?? ""; notes = e.notes ?? "" }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Add" : "Save") { save() }.disabled(name.isEmpty)
                }
            }
            .confirmationDialog("Delete this room? Its components will become unassigned.", isPresented: $showDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let e = editing { Task { await vm.deleteRoom(id: e.id); dismiss() } }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func save() {
        let now = Date()
        let r = BuildingRoom(
            id: editing?.id ?? UUID().uuidString, buildingId: buildingId,
            name: name, floor: floor.isEmpty ? nil : floor, notes: notes.isEmpty ? nil : notes,
            sortOrder: editing?.sortOrder ?? vm.rooms(for: buildingId).count,
            createdAt: editing?.createdAt ?? now, updatedAt: now
        )
        Task { editing == nil ? await vm.addRoom(r) : await vm.updateRoom(r); dismiss() }
    }
}

// MARK: - Add / edit component

struct AddComponentSheet: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    let buildingId: String
    var defaultRoomId: String? = nil
    var defaultSystem: BuildingSystem = .electrical
    var editing: BuildingComponent? = nil

    @State private var system: BuildingSystem = .electrical
    @State private var type = "outlet"
    @State private var label = ""
    @State private var roomId: String? = nil
    @State private var locationDetail = ""
    @State private var status: ComponentStatus = .operational
    @State private var statusDetail = ""
    @State private var notes = ""
    @State private var specValues: [String: String] = [:]
    @State private var specBools: [String: Bool] = [:]
    @State private var lastServiced = Date()
    @State private var hasLastServiced = false
    @State private var nextServiceDue = Date().addingTimeInterval(30 * 24 * 3600)
    @State private var hasNextService = false

    private var typeOptions: [ComponentTypeOption] { BuildingTaxonomy.options(for: system) }
    private var specs: [SpecField] { BuildingTaxonomy.specs(for: type) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("System", selection: $system) {
                        ForEach(BuildingSystem.allCases) { Text($0.displayName).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: system) { _, newSystem in
                        type = BuildingTaxonomy.options(for: newSystem).first?.value ?? type
                        specValues = [:]; specBools = [:]
                    }
                    Picker("Type", selection: $type) {
                        ForEach(typeOptions) { Text($0.label).tag($0.value) }
                    }
                    .onChange(of: type) { _, _ in specValues = [:]; specBools = [:] }
                    Picker("Room", selection: $roomId) {
                        Text("Unassigned").tag(String?.none)
                        ForEach(vm.rooms(for: buildingId)) { Text($0.name).tag(String?.some($0.id)) }
                    }
                }
                Section("Details") {
                    TextField("Label (e.g. North wall outlet)", text: $label)
                    TextField("Location detail (optional)", text: $locationDetail)
                }
                if !specs.isEmpty {
                    Section("Specs") {
                        ForEach(specs) { field in specField(field) }
                    }
                }
                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(ComponentStatus.allCases) { Text($0.displayName).tag($0) }
                    }
                    if status != .operational {
                        TextField("What's wrong (optional)", text: $statusDetail)
                    }
                }
                Section("Service") {
                    Toggle("Last serviced", isOn: $hasLastServiced)
                    if hasLastServiced { DatePicker("Date", selection: $lastServiced, displayedComponents: .date) }
                    Toggle("Next service due", isOn: $hasNextService)
                    if hasNextService { DatePicker("Date", selection: $nextServiceDue, displayedComponents: .date) }
                }
                Section { TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(2...4) }
            }
            .navigationTitle(editing == nil ? "Add component" : "Edit component")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear(perform: populate)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Add" : "Save") { save() }.disabled(label.isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private func specField(_ field: SpecField) -> some View {
        switch field.kind {
        case .bool:
            Toggle(field.label, isOn: Binding(
                get: { specBools[field.key] ?? false },
                set: { specBools[field.key] = $0 }))
        case .select:
            Picker(field.label, selection: Binding(
                get: { specValues[field.key] ?? "" },
                set: { specValues[field.key] = $0 })) {
                Text("—").tag("")
                ForEach(field.options, id: \.value) { Text($0.label).tag($0.value) }
            }
        case .number:
            TextField(field.label, text: Binding(
                get: { specValues[field.key] ?? "" },
                set: { specValues[field.key] = $0 })).keyboardType(.decimalPad)
        case .text:
            TextField(field.label, text: Binding(
                get: { specValues[field.key] ?? "" },
                set: { specValues[field.key] = $0 }))
        }
    }

    private func populate() {
        if let e = editing {
            system = e.system; type = e.type; label = e.label; roomId = e.roomId
            locationDetail = e.locationDetail ?? ""; status = e.status; statusDetail = e.statusDetail ?? ""
            notes = e.notes ?? ""
            for (k, v) in e.metadata {
                if let b = v.boolValue { specBools[k] = b } else { specValues[k] = v.displayString }
            }
            if let ls = e.lastServiced, let d = ls.asLocalDate { lastServiced = d; hasLastServiced = true }
            if let ns = e.nextServiceDue, let d = ns.asLocalDate { nextServiceDue = d; hasNextService = true }
        } else {
            system = defaultSystem
            type = BuildingTaxonomy.options(for: defaultSystem).first?.value ?? "outlet"
            roomId = defaultRoomId
        }
    }

    private func buildMetadata() -> [String: JSONValue] {
        var m: [String: JSONValue] = [:]
        for field in specs {
            switch field.kind {
            case .bool:
                if specBools[field.key] == true { m[field.key] = .bool(true) }
            case .number:
                if let s = specValues[field.key], !s.isEmpty, let d = Double(s) { m[field.key] = .number(d) }
            default:
                if let s = specValues[field.key], !s.isEmpty { m[field.key] = .string(s) }
            }
        }
        return m
    }

    private func save() {
        let now = Date()
        let c = BuildingComponent(
            id: editing?.id ?? UUID().uuidString, buildingId: buildingId, roomId: roomId,
            system: system, type: type, label: label,
            locationDetail: locationDetail.isEmpty ? nil : locationDetail,
            status: status, statusDetail: statusDetail.isEmpty ? nil : statusDetail,
            lastServiced: hasLastServiced ? lastServiced.yyyyMMdd : nil,
            nextServiceDue: hasNextService ? nextServiceDue.yyyyMMdd : nil,
            photoUrl: editing?.photoUrl, metadata: buildMetadata(),
            notes: notes.isEmpty ? nil : notes,
            sortOrder: editing?.sortOrder ?? vm.components(for: buildingId).count,
            createdAt: editing?.createdAt ?? now, updatedAt: now
        )
        Task { editing == nil ? await vm.addComponent(c) : await vm.updateComponent(c); dismiss() }
    }
}

// MARK: - Add / edit circuit (breaker)

struct AddCircuitSheet: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    let panelId: String
    var editing: BuildingCircuit? = nil

    @State private var breakerNumber = ""
    @State private var amperage = ""
    @State private var isOn = true
    @State private var label = ""
    @State private var controls = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Breaker # (e.g. 7)", text: $breakerNumber)
                    TextField("Amperage (e.g. 20)", text: $amperage).keyboardType(.numberPad)
                    Toggle("On", isOn: $isOn)
                }
                Section {
                    TextField("Label (e.g. Cabin 7 outlets)", text: $label)
                    TextField("What it controls", text: $controls, axis: .vertical).lineLimit(2...3)
                }
            }
            .navigationTitle(editing == nil ? "Add breaker" : "Edit breaker")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let e = editing {
                    breakerNumber = e.breakerNumber ?? ""; amperage = e.amperage.map(String.init) ?? ""
                    isOn = e.isOn; label = e.label ?? ""; controls = e.controls ?? ""
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(editing == nil ? "Add" : "Save") { save() } }
            }
        }
    }

    private func save() {
        let now = Date()
        let c = BuildingCircuit(
            id: editing?.id ?? UUID().uuidString, panelId: panelId,
            breakerNumber: breakerNumber.isEmpty ? nil : breakerNumber,
            label: label.isEmpty ? nil : label, amperage: Int(amperage),
            controls: controls.isEmpty ? nil : controls, isOn: isOn,
            sortOrder: editing?.sortOrder ?? vm.circuits(panelId: panelId).count,
            createdAt: editing?.createdAt ?? now, updatedAt: now
        )
        Task { editing == nil ? await vm.addCircuit(c) : await vm.updateCircuit(c); dismiss() }
    }
}

// MARK: - Flag issue

struct FlagComponentSheet: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    let component: BuildingComponent

    @State private var severity: ComponentStatus = .needs_attention
    @State private var detail = ""
    @State private var createIssue = true

    private var alreadyFlagged: Bool { component.status != .operational }
    private var building: Building? { vm.buildings.first { $0.id == component.buildingId } }

    var body: some View {
        NavigationStack {
            Form {
                Section("Severity") {
                    Picker("Severity", selection: $severity) {
                        Text("Needs attention — service soon").tag(ComponentStatus.needs_attention)
                        Text("Out of service — needs repair").tag(ComponentStatus.out_of_service)
                    }
                    .pickerStyle(.inline).labelsHidden()
                }
                Section("What's wrong?") {
                    TextField("Describe the problem…", text: $detail, axis: .vertical).lineLimit(3...6)
                }
                Section {
                    Toggle(isOn: $createIssue) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Create a ticket in Issues & Repairs")
                            if let b = building {
                                Text("Location: \(b.locationLabel ?? b.name)").font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                }
                if alreadyFlagged {
                    Section {
                        Button("Clear issue — mark operational") { clear() }.foregroundColor(.green)
                    }
                }
            }
            .navigationTitle("Flag — \(component.label)")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if alreadyFlagged {
                    severity = component.status == .out_of_service ? .out_of_service : .needs_attention
                    detail = component.statusDetail ?? ""
                    createIssue = false
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(alreadyFlagged ? "Update" : "Flag") { save() }.disabled(detail.isEmpty)
                }
            }
        }
    }

    private func save() {
        var updated = component
        updated.status = severity
        updated.statusDetail = detail.isEmpty ? nil : detail
        updated.updatedAt = Date()
        let shouldCreate = createIssue
        Task {
            await vm.updateComponent(updated)
            if shouldCreate { await createTicket() }
            dismiss()
        }
    }

    private func createTicket() async {
        let user = AuthManager.shared.currentUser
        let b = building
        let where_ = [b?.name, component.roomId.flatMap { id in vm.rooms.first { $0.id == id }?.name }]
            .compactMap { $0 }.joined(separator: " · ")
        let id = UUID().uuidString
        let issue = Issue(
            id: id,
            title: "\(component.label) — \(BuildingTaxonomy.label(for: component.type))",
            description: [where_, detail].filter { !$0.isEmpty }.joined(separator: "\n"),
            locations: (b?.locationLabel ?? b?.name).map { [$0] } ?? [],
            priority: severity == .out_of_service ? .high : .normal,
            status: .unassigned,
            reportedById: user.id
        )
        do {
            try await DataService.shared.insertIssue(issue)
            let entry = ActivityEntry(id: UUID().uuidString, userId: user.id, userName: user.name,
                                      action: "Flagged from Building Systems by \(user.name)")
            try await DataService.shared.insertIssueActivity(entry, issueId: id)
        } catch {
            vm.errorMessage = error.localizedDescription
        }
    }

    private func clear() {
        var updated = component
        updated.status = .operational
        updated.statusDetail = nil
        updated.updatedAt = Date()
        Task { await vm.updateComponent(updated); dismiss() }
    }
}
