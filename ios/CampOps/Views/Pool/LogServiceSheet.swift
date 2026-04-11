import SwiftUI

struct LogServiceSheet: View {
    @EnvironmentObject private var userManager: UserManager
    @Environment(\.dismiss) private var dismiss

    let equipment: [PoolEquipment]
    let onSave: (PoolServiceLog) async -> Void

    @State private var selectedEquipmentId: String = ""
    @State private var serviceType: PoolServiceType = .routineMaintenance
    @State private var datePerformed: Date = Date()
    @State private var performedBy: String = ""
    @State private var notes: String = ""
    @State private var costText: String = ""
    @State private var nextServiceDue: Date = Date().addingTimeInterval(30 * 24 * 3600)
    @State private var hasNextService = false
    @State private var isSaving = false

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
            }
            .navigationTitle("Log service")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { performedBy = userManager.currentUser.name }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(performedBy.isEmpty || isSaving)
                }
            }
        }
    }

    private func save() {
        isSaving = true
        let entry = PoolServiceLog(
            id: UUID().uuidString,
            equipmentId: selectedEquipmentId.isEmpty ? nil : selectedEquipmentId,
            serviceType: serviceType,
            datePerformed: datePerformed.yyyyMMdd,
            performedBy: performedBy,
            notes: notes.isEmpty ? nil : notes,
            cost: Double(costText),
            nextServiceDue: hasNextService ? nextServiceDue.yyyyMMdd : nil,
            createdAt: Date()
        )
        Task { await onSave(entry); dismiss() }
    }
}
