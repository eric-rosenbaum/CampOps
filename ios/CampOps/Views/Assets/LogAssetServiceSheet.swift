import SwiftUI

struct LogAssetServiceSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let asset: CampAsset
    let editing: AssetServiceRecord?
    let onSave: (AssetServiceRecord) async -> Void

    @State private var serviceType: AssetServiceType = .oilChange
    @State private var datePerformed: String = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }()
    @State private var performedBy = ""
    @State private var vendor = ""
    @State private var description = ""
    @State private var odometerText = ""
    @State private var hoursText = ""
    @State private var costText = ""
    @State private var nextServiceDate = ""
    @State private var nextOdometerText = ""
    @State private var nextHoursText = ""

    var availableTypes: [AssetServiceType] { AssetServiceType.types(for: asset.category) }
    var canSave: Bool { !performedBy.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("Service") {
                    Picker("Service type", selection: $serviceType) {
                        ForEach(availableTypes, id: \.rawValue) { t in
                            Text(t.displayName).tag(t)
                        }
                    }
                    HStack {
                        Text("Date performed")
                        Spacer()
                        TextField("YYYY-MM-DD", text: $datePerformed)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 130)
                    }
                }

                Section {
                    TextField("Tom H., AquaPro…", text: $performedBy)
                } header: {
                    Text("Performed by *")
                }

                Section("Vendor (optional)") {
                    TextField("Vendor name", text: $vendor)
                }

                if asset.tracksOdometer || asset.tracksHours {
                    Section("Readings at service") {
                        if asset.tracksOdometer {
                            HStack {
                                Text("Odometer")
                                Spacer()
                                TextField("0", text: $odometerText)
                                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 100)
                                Text("mi").foregroundStyle(.secondary)
                            }
                        }
                        if asset.tracksHours {
                            HStack {
                                Text("Hours")
                                Spacer()
                                TextField("0", text: $hoursText)
                                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 100)
                                Text("hrs").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Cost (optional)") {
                    HStack {
                        Text("$")
                        TextField("0.00", text: $costText).keyboardType(.decimalPad)
                    }
                }

                Section("Description / notes (optional)") {
                    TextField("Notes…", text: $description, axis: .vertical).lineLimit(2...4)
                }

                Section("Next service due (optional)") {
                    HStack {
                        Text("Date")
                        Spacer()
                        TextField("YYYY-MM-DD", text: $nextServiceDate)
                            .multilineTextAlignment(.trailing).frame(width: 130)
                    }
                    if asset.tracksOdometer {
                        HStack {
                            Text("Odometer")
                            Spacer()
                            TextField("miles", text: $nextOdometerText)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 100)
                        }
                    }
                    if asset.tracksHours {
                        HStack {
                            Text("Hours")
                            Spacer()
                            TextField("hrs", text: $nextHoursText)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 100)
                        }
                    }
                }
            }
            .navigationTitle(editing != nil ? "Edit Service Record" : "Log Service")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await onSave(buildRecord())
                            dismiss()
                        }
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear { populateFromEditing() }
        }
    }

    private func populateFromEditing() {
        if let r = editing {
            serviceType = r.serviceType
            datePerformed = r.datePerformed
            performedBy = r.performedBy
            vendor = r.vendor ?? ""
            description = r.description ?? ""
            odometerText = r.odometerAtService.map { String($0) } ?? ""
            hoursText = r.hoursAtService.map { String($0) } ?? ""
            costText = r.cost.map { String($0) } ?? ""
            nextServiceDate = r.nextServiceDate ?? ""
            nextOdometerText = r.nextServiceOdometer.map { String($0) } ?? ""
            nextHoursText = r.nextServiceHours.map { String($0) } ?? ""
        } else {
            serviceType = availableTypes.first ?? .other
            odometerText = asset.currentOdometer.map { String($0) } ?? ""
            hoursText = asset.currentHours.map { String($0) } ?? ""
        }
    }

    private func buildRecord() -> AssetServiceRecord {
        let now = Date()
        return AssetServiceRecord(
            id: editing?.id ?? UUID().uuidString,
            assetId: asset.id,
            serviceType: serviceType,
            datePerformed: datePerformed,
            performedBy: performedBy.trimmingCharacters(in: .whitespaces),
            vendor: vendor.isEmpty ? nil : vendor,
            description: description.isEmpty ? nil : description,
            odometerAtService: asset.tracksOdometer ? Double(odometerText) : nil,
            hoursAtService: asset.tracksHours ? Double(hoursText) : nil,
            cost: Double(costText),
            nextServiceDate: nextServiceDate.isEmpty ? nil : nextServiceDate,
            nextServiceOdometer: Double(nextOdometerText),
            nextServiceHours: Double(nextHoursText),
            isInspection: serviceType.isInspection,
            createdAt: editing?.createdAt ?? now
        )
    }
}
