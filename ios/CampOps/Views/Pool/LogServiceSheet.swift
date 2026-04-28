import SwiftUI

struct LogServiceSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let equipment: [PoolEquipment]
    var editing: PoolServiceLog? = nil
    let onSave: (PoolServiceLog) async -> Void
    var onUpdate: ((PoolServiceLog) async -> Void)? = nil
    var onDelete: ((String) async -> Void)? = nil

    @State private var selectedEquipmentId: String = ""
    @State private var serviceType: PoolServiceType = .routineMaintenance
    @State private var datePerformed: Date = Date()
    @State private var performedBy: String = ""
    @State private var notes: String = ""
    @State private var costText: String = ""
    @State private var nextServiceDue: Date = Date().addingTimeInterval(30 * 24 * 3600)
    @State private var hasNextService = false
    @State private var isSaving = false
    @State private var showingDeleteConfirm = false

    private var isEditing: Bool { editing != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Equipment") {
                    if equipment.isEmpty {
                        Text("No equipment added yet").foregroundColor(.secondary)
                    } else {
                        Picker("Equipment", selection: $selectedEquipmentId) {
                            Text("None / general").tag("")
                            ForEach(equipment) { e in
                                Text(e.name).tag(e.id)
                            }
                        }
                    }
                    Picker("Service type", selection: $serviceType) {
                        ForEach(PoolServiceType.allCases, id: \.self) { t in
                            Text(t.displayName).tag(t)
                        }
                    }
                }

                Section("Details") {
                    DatePicker("Date performed", selection: $datePerformed, displayedComponents: .date)
                    TextField("Performed by", text: $performedBy)
                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                }

                Section("Cost & follow-up") {
                    HStack {
                        Text("Cost")
                        Spacer()
                        TextField("$0.00", text: $costText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 100)
                    }
                    Toggle("Schedule next service", isOn: $hasNextService)
                    if hasNextService {
                        DatePicker("Next due", selection: $nextServiceDue, displayedComponents: .date)
                    }
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) { showingDeleteConfirm = true } label: {
                            HStack {
                                Spacer()
                                Text("Delete service record")
                                Spacer()
                            }
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit service record" : "Log service")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { prefill() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Save") { save() }
                        .disabled(performedBy.isEmpty || isSaving)
                }
            }
            .confirmationDialog("Delete this service record?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    guard let entry = editing else { return }
                    Task { await onDelete?(entry.id); dismiss() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This cannot be undone.")
            }
        }
    }

    private func prefill() {
        if let e = editing {
            selectedEquipmentId = e.equipmentId ?? ""
            serviceType = e.serviceType
            if let d = parseDate(e.datePerformed) { datePerformed = d }
            performedBy = e.performedBy
            notes = e.notes ?? ""
            costText = e.cost != nil ? String(format: "%.2f", e.cost!) : ""
            if let next = e.nextServiceDue, let d = parseDate(next) {
                hasNextService = true
                nextServiceDue = d
            }
        } else {
            performedBy = authManager.currentUser.name
        }
    }

    private func parseDate(_ s: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }

    private func save() {
        isSaving = true
        let entry = PoolServiceLog(
            id: editing?.id ?? UUID().uuidString,
            poolId: editing?.poolId ?? "",
            equipmentId: selectedEquipmentId.isEmpty ? nil : selectedEquipmentId,
            serviceType: serviceType,
            datePerformed: datePerformed.yyyyMMdd,
            performedBy: performedBy,
            notes: notes.isEmpty ? nil : notes,
            cost: Double(costText.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "")),
            nextServiceDue: hasNextService ? nextServiceDue.yyyyMMdd : nil,
            createdAt: editing?.createdAt ?? Date()
        )
        Task {
            if isEditing {
                await onUpdate?(entry)
            } else {
                await onSave(entry)
            }
            dismiss()
        }
    }
}
