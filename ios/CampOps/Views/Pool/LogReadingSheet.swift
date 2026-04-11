import SwiftUI

struct LogReadingSheet: View {
    @EnvironmentObject private var userManager: UserManager
    @Environment(\.dismiss) private var dismiss

    var editing: ChemicalReading? = nil
    let onSave: (ChemicalReading) async -> Void
    var onDelete: ((String) async -> Void)? = nil

    @State private var freeChlorine: Double = 2.0
    @State private var ph: Double = 7.4
    @State private var alkalinity: Double = 100
    @State private var cyanuricAcid: Double = 40
    @State private var waterTemp: Double = 76
    @State private var calciumHardness: Double? = nil
    @State private var calcHardnessText: String = ""
    @State private var timeOfDay: String = "Morning"
    @State private var poolStatus: PoolStatusValue = .openAllClear
    @State private var correctiveAction: String = ""
    @State private var isSaving = false
    @State private var showingDeleteConfirm = false

    private let timeOptions = ["Morning", "Midday", "Afternoon", "Evening"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Chemical levels") {
                    ReadingField(label: "Free chlorine (ppm)", value: $freeChlorine,
                                 status: chemStatus(field: .freeChlorine, value: freeChlorine),
                                 range: "Target: 1.0–3.0", step: 0.1, format: "%.1f")
                    ReadingField(label: "pH", value: $ph,
                                 status: chemStatus(field: .ph, value: ph),
                                 range: "Target: 7.2–7.8", step: 0.1, format: "%.1f")
                    ReadingField(label: "Alkalinity (ppm)", value: $alkalinity,
                                 status: chemStatus(field: .alkalinity, value: alkalinity),
                                 range: "Target: 80–120", step: 1, format: "%.0f")
                    ReadingField(label: "Cyanuric acid (ppm)", value: $cyanuricAcid,
                                 status: chemStatus(field: .cyanuricAcid, value: cyanuricAcid),
                                 range: "Target: 30–50", step: 1, format: "%.0f")
                    ReadingField(label: "Water temp (°F)", value: $waterTemp,
                                 status: chemStatus(field: .waterTemp, value: waterTemp),
                                 range: "Target: 68–82", step: 0.5, format: "%.1f")
                }

                Section("Details") {
                    Picker("Time of day", selection: $timeOfDay) {
                        ForEach(timeOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Pool status", selection: $poolStatus) {
                        ForEach(PoolStatusValue.allCases, id: \.self) { s in
                            Text(s.displayName).tag(s)
                        }
                    }
                    if editing == nil {
                        LabeledContent("Logged by") {
                            Text(userManager.currentUser.name).foregroundColor(.secondary)
                        }
                    } else if let e = editing {
                        LabeledContent("Logged by") {
                            Text(e.loggedByName).foregroundColor(.secondary)
                        }
                        LabeledContent("Date") {
                            Text(e.createdAt.dateOnlyDisplay).foregroundColor(.secondary)
                        }
                    }
                }

                Section("Notes (optional)") {
                    TextField("Corrective action taken, observations…", text: $correctiveAction, axis: .vertical)
                        .lineLimit(3...6)
                }

                if editing != nil {
                    Section {
                        Button("Delete reading", role: .destructive) { showingDeleteConfirm = true }
                    }
                }
            }
            .navigationTitle(editing == nil ? "Log reading" : "Edit reading")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let e = editing {
                    freeChlorine = e.freeChlorine
                    ph = e.ph
                    alkalinity = e.alkalinity
                    cyanuricAcid = e.cyanuricAcid
                    waterTemp = e.waterTemp
                    calciumHardness = e.calciumHardness
                    calcHardnessText = e.calciumHardness.map { String($0) } ?? ""
                    timeOfDay = e.timeOfDay
                    poolStatus = e.poolStatus
                    correctiveAction = e.correctiveAction ?? ""
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Save" : "Update") { save() }.disabled(isSaving)
                }
            }
            .confirmationDialog("Delete this reading?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
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
        let reading = ChemicalReading(
            id: editing?.id ?? UUID().uuidString,
            freeChlorine: freeChlorine, ph: ph, alkalinity: alkalinity,
            cyanuricAcid: cyanuricAcid, waterTemp: waterTemp,
            calciumHardness: Double(calcHardnessText),
            timeOfDay: timeOfDay,
            loggedById: editing?.loggedById ?? userManager.currentUser.id,
            loggedByName: editing?.loggedByName ?? userManager.currentUser.name,
            correctiveAction: correctiveAction.isEmpty ? nil : correctiveAction,
            poolStatus: poolStatus,
            createdAt: editing?.createdAt ?? Date()
        )
        Task {
            await onSave(reading)
            dismiss()
        }
    }
}

private struct ReadingField: View {
    let label: String
    @Binding var value: Double
    let status: ChemStatus
    let range: String
    let step: Double
    let format: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).foregroundColor(.primary)
                Spacer()
                Circle().fill(status.color).frame(width: 8, height: 8)
                Text(String(format: format, value))
                    .font(.subheadline.monospacedDigit().weight(.medium))
                    .foregroundColor(status.color)
                    .frame(width: 50, alignment: .trailing)
            }
            Stepper(value: $value, in: 0...999, step: step) { EmptyView() }
                .labelsHidden()
            Text(range).font(.caption2).foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }
}
