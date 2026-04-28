import SwiftUI

struct AddAssetSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let editing: CampAsset?
    let onSave: (CampAsset) async -> Void

    @State private var name = ""
    @State private var category: AssetCategory = .vehicle
    @State private var subtype = "truck"
    @State private var make = ""
    @State private var model = ""
    @State private var yearText = ""
    @State private var serialNumber = ""
    @State private var licensePlate = ""
    @State private var registrationExpiry = ""
    @State private var storageLocation = ""
    @State private var tracksOdometer = true
    @State private var tracksHours = false
    @State private var odometerText = ""
    @State private var hoursText = ""
    @State private var notes = ""
    // Watercraft extras
    @State private var hullId = ""
    @State private var uscgRegistration = ""
    @State private var uscgRegistrationExpiry = ""
    @State private var capacityText = ""
    @State private var motorType = ""
    @State private var hasLifejackets = false
    @State private var lifejacketCountText = ""

    var isEditing: Bool { editing != nil }

    var availableSubtypes: [String] {
        subtypesByCategory[category] ?? ["other"]
    }

    var isWatercraft: Bool { category == .watercraft }

    var canSave: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !storageLocation.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("Basic info") {
                    TextField("Asset name", text: $name)

                    Picker("Category", selection: $category) {
                        ForEach(AssetCategory.allCases) { cat in
                            Text(cat.displayName).tag(cat)
                        }
                    }
                    .onChange(of: category) { _, newCat in
                        let types = subtypesByCategory[newCat] ?? ["other"]
                        subtype = types.first ?? "other"
                        if newCat != .vehicle && newCat != .golfCart && newCat != .watercraft {
                            tracksOdometer = false
                        }
                        if newCat != .vehicle && newCat != .largeEquipment {
                            tracksHours = false
                        }
                    }

                    Picker("Type", selection: $subtype) {
                        ForEach(availableSubtypes, id: \.self) { s in
                            Text(subtypeDisplayNames[s] ?? s).tag(s)
                        }
                    }

                    let locations = authManager.currentCamp?.locations ?? []
                    if locations.isEmpty {
                        TextField("Storage location", text: $storageLocation)
                    } else {
                        Picker("Storage location", selection: $storageLocation) {
                            Text("Select…").tag("")
                            ForEach(locations, id: \.self) { loc in
                                Text(loc).tag(loc)
                            }
                        }
                    }
                }

                Section("Details") {
                    TextField("Make", text: $make)
                    TextField("Model", text: $model)
                    TextField("Year", text: $yearText)
                        .keyboardType(.numberPad)
                    TextField("Serial / VIN", text: $serialNumber)
                    if category == .vehicle || category == .trailer {
                        TextField("License plate", text: $licensePlate)
                        TextField("Registration expiry (YYYY-MM-DD)", text: $registrationExpiry)
                    }
                }

                Section("Tracking") {
                    if category == .vehicle || category == .golfCart || category == .watercraft {
                        Toggle("Track odometer (miles)", isOn: $tracksOdometer)
                        if tracksOdometer {
                            HStack {
                                Text("Current odometer")
                                Spacer()
                                TextField("0", text: $odometerText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 100)
                                Text("mi").foregroundStyle(.secondary)
                            }
                        }
                    }
                    if category == .vehicle || category == .largeEquipment {
                        Toggle("Track hours", isOn: $tracksHours)
                        if tracksHours {
                            HStack {
                                Text("Current hours")
                                Spacer()
                                TextField("0", text: $hoursText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 100)
                                Text("hrs").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if isWatercraft {
                    Section("Watercraft") {
                        TextField("Hull ID", text: $hullId)
                        TextField("USCG registration", text: $uscgRegistration)
                        TextField("USCG expiry (YYYY-MM-DD)", text: $uscgRegistrationExpiry)
                        TextField("Capacity (persons)", text: $capacityText)
                            .keyboardType(.numberPad)
                        TextField("Motor type (if any)", text: $motorType)
                        Toggle("Has lifejackets", isOn: $hasLifejackets)
                        if hasLifejackets {
                            HStack {
                                Text("Lifejacket count")
                                Spacer()
                                TextField("0", text: $lifejacketCountText)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 80)
                            }
                        }
                    }
                }

                Section("Notes") {
                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(3...5)
                }
            }
            .navigationTitle(isEditing ? "Edit Asset" : "Add Asset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await onSave(buildAsset())
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
        guard let a = editing else { return }
        name = a.name; category = a.category; subtype = a.subtype
        make = a.make ?? ""; model = a.model ?? ""
        yearText = a.year.map(String.init) ?? ""
        serialNumber = a.serialNumber ?? ""
        licensePlate = a.licensePlate ?? ""
        registrationExpiry = a.registrationExpiry ?? ""
        storageLocation = a.storageLocation
        tracksOdometer = a.tracksOdometer; tracksHours = a.tracksHours
        odometerText = a.currentOdometer.map { String($0) } ?? ""
        hoursText = a.currentHours.map { String($0) } ?? ""
        notes = a.notes ?? ""
        hullId = a.hullId ?? ""; uscgRegistration = a.uscgRegistration ?? ""
        uscgRegistrationExpiry = a.uscgRegistrationExpiry ?? ""
        capacityText = a.capacity.map(String.init) ?? ""
        motorType = a.motorType ?? ""
        hasLifejackets = a.hasLifejackets ?? false
        lifejacketCountText = a.lifejacketCount.map(String.init) ?? ""
    }

    private func buildAsset() -> CampAsset {
        let now = Date()
        return CampAsset(
            id: editing?.id ?? UUID().uuidString,
            name: name.trimmingCharacters(in: .whitespaces),
            category: category,
            subtype: subtype,
            make: make.isEmpty ? nil : make,
            model: model.isEmpty ? nil : model,
            year: Int(yearText),
            serialNumber: serialNumber.isEmpty ? nil : serialNumber,
            licensePlate: licensePlate.isEmpty ? nil : licensePlate,
            registrationExpiry: registrationExpiry.isEmpty ? nil : registrationExpiry,
            storageLocation: storageLocation.trimmingCharacters(in: .whitespaces),
            status: editing?.status ?? .available,
            currentOdometer: Double(odometerText),
            currentHours: Double(hoursText),
            tracksOdometer: tracksOdometer,
            tracksHours: tracksHours,
            notes: notes.isEmpty ? nil : notes,
            isActive: editing?.isActive ?? true,
            hullId: hullId.isEmpty ? nil : hullId,
            uscgRegistration: uscgRegistration.isEmpty ? nil : uscgRegistration,
            uscgRegistrationExpiry: uscgRegistrationExpiry.isEmpty ? nil : uscgRegistrationExpiry,
            capacity: Int(capacityText),
            motorType: motorType.isEmpty ? nil : motorType,
            hasLifejackets: isWatercraft ? hasLifejackets : nil,
            lifejacketCount: (isWatercraft && hasLifejackets) ? Int(lifejacketCountText) : nil,
            createdAt: editing?.createdAt ?? now,
            updatedAt: now
        )
    }
}
