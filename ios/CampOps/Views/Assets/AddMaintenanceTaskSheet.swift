import SwiftUI

struct AddMaintenanceTaskSheet: View {
    @Environment(\.dismiss) private var dismiss

    let assetId: String
    let defaultPhase: AssetMaintenancePhase
    let editing: AssetMaintenanceTask?
    let sortOrder: Int
    let onSave: (AssetMaintenanceTask) async -> Void

    @State private var phase: AssetMaintenancePhase = .preSeason
    @State private var title = ""
    @State private var detail = ""

    var canSave: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("Phase") {
                    Picker("Phase", selection: $phase) {
                        ForEach(AssetMaintenancePhase.allCases) { p in
                            Text(p.displayName).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    TextField("Task title", text: $title)
                } header: {
                    Text("Title *")
                }

                Section("Detail (optional)") {
                    TextField("Additional details…", text: $detail, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle(editing != nil ? "Edit Task" : "Add Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await onSave(buildTask())
                            dismiss()
                        }
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear {
                if let t = editing {
                    phase = t.phase
                    title = t.title
                    detail = t.detail ?? ""
                } else {
                    phase = defaultPhase
                }
            }
        }
    }

    private func buildTask() -> AssetMaintenanceTask {
        let now = Date()
        return AssetMaintenanceTask(
            id: editing?.id ?? UUID().uuidString,
            assetId: assetId,
            phase: phase,
            title: title.trimmingCharacters(in: .whitespaces),
            detail: detail.isEmpty ? nil : detail,
            isComplete: editing?.isComplete ?? false,
            completedBy: editing?.completedBy,
            completedDate: editing?.completedDate,
            sortOrder: editing?.sortOrder ?? sortOrder,
            createdAt: editing?.createdAt ?? now,
            updatedAt: now
        )
    }
}
