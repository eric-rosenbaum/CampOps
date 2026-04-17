import SwiftUI

struct FlagIssueSheet: View {
    @EnvironmentObject private var vm: PoolViewModel
    @Environment(\.dismiss) private var dismiss

    let equipment: PoolEquipment

    @State private var severity: EquipmentStatus = .warn
    @State private var detail: String = ""
    @State private var isSaving = false

    private var hasExistingIssue: Bool {
        equipment.status == .warn || equipment.status == .alert
    }

    var body: some View {
        NavigationStack {
            Form {
                if hasExistingIssue {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Current issue").font(.caption).foregroundColor(.secondary)
                            Text(equipment.statusDetail.isEmpty ? "No detail recorded" : equipment.statusDetail)
                                .font(.subheadline).foregroundColor(.primary)
                        }
                        .padding(.vertical, 2)
                    }
                }

                Section("Severity") {
                    Picker("Severity", selection: $severity) {
                        Text("Warning — service needed soon").tag(EquipmentStatus.warn)
                        Text("Alert — out of service / needs repair").tag(EquipmentStatus.alert)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section("Issue description") {
                    TextField("Describe the issue…", text: $detail, axis: .vertical)
                        .lineLimit(3...6)
                }

                if hasExistingIssue {
                    Section {
                        Button {
                            clearIssue()
                        } label: {
                            HStack {
                                Spacer()
                                Text("Clear issue — mark operational")
                                    .foregroundColor(.green)
                                Spacer()
                            }
                        }
                    }
                }
            }
            .navigationTitle(hasExistingIssue ? "Edit issue — \(equipment.name)" : "Flag issue — \(equipment.name)")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if hasExistingIssue {
                    severity = equipment.status
                    detail = equipment.statusDetail
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(hasExistingIssue ? "Update" : "Flag") { saveIssue() }
                        .disabled(detail.isEmpty || isSaving)
                }
            }
        }
    }

    private func saveIssue() {
        isSaving = true
        var updated = equipment
        updated.status = severity
        updated.statusDetail = detail
        updated.updatedAt = Date()
        Task { await vm.updateEquipment(updated); dismiss() }
    }

    private func clearIssue() {
        var updated = equipment
        updated.status = .ok
        updated.statusDetail = "Normal"
        updated.updatedAt = Date()
        Task { await vm.updateEquipment(updated); dismiss() }
    }
}
