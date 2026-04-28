import SwiftUI

struct LogInspectionSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let poolId: String
    let inspections: [PoolInspection]
    let editing: PoolInspectionLog?
    var preselectedId: String? = nil
    let onAdd: (PoolInspectionLog) async -> Void
    let onDelete: (String) async -> Void
    var onUpdate: ((PoolInspectionLog) async -> Void)? = nil

    @State private var selectedId: String = ""
    @State private var inspectionDate: Date = Date()
    @State private var conductedBy: String = ""
    @State private var result: InspectionResult = .passed
    @State private var notes: String = ""
    @State private var nextDue: Date = Date().addingTimeInterval(90 * 24 * 3600)
    @State private var hasNextDue = false
    @State private var isSaving = false
    @State private var showingDeleteConfirm = false

    private let hardcodedOptions: [(id: String, name: String)] = [
        ("health_dept",       "Health dept. water quality"),
        ("aca_waterfront",    "ACA waterfront safety"),
        ("equipment_monthly", "Pool equipment monthly service"),
        ("lifeguard_cert",    "Lifeguard certification verification"),
        ("pre_season",        "Pre-season pool opening"),
        ("end_of_season",     "End-of-season closing"),
        ("other",             "Other"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Inspection") {
                    Picker("Type", selection: $selectedId) {
                        Text("— Not specified —").tag("")
                        ForEach(inspections) { i in Text(i.name).tag(i.id) }
                        ForEach(hardcodedOptions, id: \.id) { opt in
                            Text(opt.name).tag(opt.id)
                        }
                    }
                    DatePicker("Date", selection: $inspectionDate, displayedComponents: .date)
                    TextField("Conducted by", text: $conductedBy)
                }

                Section("Result") {
                    Picker("Result", selection: $result) {
                        ForEach(InspectionResult.allCases, id: \.self) { r in
                            Text(r.displayName).tag(r)
                        }
                    }
                    .pickerStyle(.menu)
                    TextField("Notes / findings (optional)", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Follow-up") {
                    Toggle("Set next inspection due", isOn: $hasNextDue)
                    if hasNextDue {
                        DatePicker("Next due", selection: $nextDue, displayedComponents: .date)
                    }
                }

                if editing != nil {
                    Section {
                        Button("Delete record", role: .destructive) { showingDeleteConfirm = true }
                    }
                }
            }
            .navigationTitle(editing == nil ? "Log inspection" : "Edit inspection record")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { setupInitialValues() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Save" : "Update") { save() }
                        .disabled(conductedBy.isEmpty || isSaving)
                }
            }
            .confirmationDialog("Delete this record?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let entry = editing {
                        Task { await onDelete(entry.id); dismiss() }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func setupInitialValues() {
        conductedBy = authManager.currentUser.name
        if let e = editing {
            selectedId = e.inspectionId ?? ""
            if let d = e.inspectionDate.asLocalDate { inspectionDate = d }
            conductedBy = e.conductedBy
            result = e.result
            notes = e.notes ?? ""
            if let next = e.nextDue, let d = next.asLocalDate {
                nextDue = d; hasNextDue = true
            }
        } else if let pre = preselectedId {
            selectedId = pre
        }
    }

    private func save() {
        isSaving = true
        let entry = PoolInspectionLog(
            id: editing?.id ?? UUID().uuidString,
            poolId: editing?.poolId ?? poolId,
            inspectionId: selectedId.isEmpty ? nil : selectedId,
            inspectionDate: inspectionDate.yyyyMMdd,
            conductedBy: conductedBy,
            result: result,
            notes: notes.isEmpty ? nil : notes,
            nextDue: hasNextDue ? nextDue.yyyyMMdd : nil,
            createdAt: editing?.createdAt ?? Date()
        )
        Task {
            if editing != nil {
                await onUpdate?(entry)
            } else {
                await onAdd(entry)
            }
            dismiss()
        }
    }
}
