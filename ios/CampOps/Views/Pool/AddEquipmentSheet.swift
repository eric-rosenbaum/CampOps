import SwiftUI

struct AddEquipmentSheet: View {
    @Environment(\.dismiss) private var dismiss

    var editing: PoolEquipment? = nil
    let onSave: (PoolEquipment) async -> Void
    var onDelete: ((String) async -> Void)? = nil

    @State private var name: String = ""
    @State private var type: EquipmentType = .pump
    @State private var status: EquipmentStatus = .ok
    @State private var statusDetail: String = ""
    @State private var vendor: String = ""
    @State private var specs: String = ""
    @State private var lastServiced: Date = Date()
    @State private var hasLastServiced = false
    @State private var nextServiceDue: Date = Date().addingTimeInterval(30 * 24 * 3600)
    @State private var hasNextService = false
    @State private var isSaving = false
    @State private var showingDeleteConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Equipment") {
                    TextField("Name (e.g. Main circulation pump)", text: $name)
                    Picker("Type", selection: $type) {
                        ForEach(EquipmentType.allCases, id: \.self) { t in
                            Label(t.displayName, systemImage: t.icon).tag(t)
                        }
                    }
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach([EquipmentStatus.ok, .warn, .alert], id: \.self) { s in
                            Text(s.displayName).tag(s)
                        }
                    }
                    TextField("Status detail (optional)", text: $statusDetail)
                }

                Section("Service schedule") {
                    Toggle("Last serviced", isOn: $hasLastServiced)
                    if hasLastServiced {
                        DatePicker("Date", selection: $lastServiced, displayedComponents: .date)
                    }
                    Toggle("Next service due", isOn: $hasNextService)
                    if hasNextService {
                        DatePicker("Date", selection: $nextServiceDue, displayedComponents: .date)
                    }
                }

                Section("Details (optional)") {
                    TextField("Vendor / manufacturer", text: $vendor)
                    TextField("Specs / model number", text: $specs)
                }

                if editing != nil {
                    Section {
                        Button("Delete equipment", role: .destructive) { showingDeleteConfirm = true }
                    }
                }
            }
            .navigationTitle(editing == nil ? "Add equipment" : "Edit equipment")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let e = editing {
                    name = e.name
                    type = e.type
                    status = e.status
                    statusDetail = e.statusDetail
                    vendor = e.vendor ?? ""
                    specs = e.specs ?? ""
                    if let ls = e.lastServiced, let d = ls.asLocalDate {
                        lastServiced = d; hasLastServiced = true
                    }
                    if let ns = e.nextServiceDue, let d = ns.asLocalDate {
                        nextServiceDue = d; hasNextService = true
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Add" : "Save") { save() }
                        .disabled(name.isEmpty || isSaving)
                }
            }
            .confirmationDialog("Delete this equipment?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let e = editing {
                        Task { await onDelete?(e.id); dismiss() }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func save() {
        isSaving = true
        let now = Date()
        let equip = PoolEquipment(
            id: editing?.id ?? UUID().uuidString,
            name: name,
            type: type,
            status: status,
            statusDetail: statusDetail,
            lastServiced: hasLastServiced ? lastServiced.yyyyMMdd : nil,
            nextServiceDue: hasNextService ? nextServiceDue.yyyyMMdd : nil,
            vendor: vendor.isEmpty ? nil : vendor,
            specs: specs.isEmpty ? nil : specs,
            createdAt: editing?.createdAt ?? now,
            updatedAt: now
        )
        Task { await onSave(equip); dismiss() }
    }
}
