import SwiftUI

struct CheckoutAssetSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let asset: CampAsset
    let editing: AssetCheckout?
    let onSave: (AssetCheckout) async -> Void

    @State private var checkedOutBy = ""
    @State private var purpose = ""
    @State private var expectedReturn: Date = {
        var d = Date()
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: d)
        comps.hour = 17; comps.minute = 0
        return Calendar.current.date(from: comps) ?? d
    }()
    @State private var startOdometerText = ""
    @State private var startHoursText = ""
    @State private var fuelLevel: FuelLevel = .full
    @State private var notes = ""

    let fuelLevels: [FuelLevel] = [.empty, .quarter, .half, .threeQuarter, .full]
    var showFuel: Bool { asset.category == .vehicle || asset.category == .golfCart || asset.category == .watercraft }

    var canSave: Bool { !checkedOutBy.trimmingCharacters(in: .whitespaces).isEmpty && !purpose.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Staff member name", text: $checkedOutBy)
                        .autocorrectionDisabled()
                } header: {
                    Text("Checked out by *")
                }

                Section {
                    TextField("Supply run, grounds maintenance…", text: $purpose)
                } header: {
                    Text("Purpose / destination *")
                }

                Section("Expected return") {
                    DatePicker("", selection: $expectedReturn, displayedComponents: [.date, .hourAndMinute])
                        .labelsHidden()
                }

                if asset.tracksOdometer || asset.tracksHours {
                    Section("Starting readings") {
                        if asset.tracksOdometer {
                            HStack {
                                Text("Odometer")
                                Spacer()
                                TextField("0", text: $startOdometerText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 100)
                                Text("mi").foregroundStyle(.secondary)
                            }
                        }
                        if asset.tracksHours {
                            HStack {
                                Text("Hours")
                                Spacer()
                                TextField("0", text: $startHoursText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 100)
                                Text("hrs").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if showFuel {
                    Section("Fuel level") {
                        HStack(spacing: 4) {
                            ForEach(fuelLevels, id: \.rawValue) { lvl in
                                Button {
                                    fuelLevel = lvl
                                } label: {
                                    Text(lvl.displayName)
                                        .font(.system(size: 12)).fontWeight(.medium)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .background(fuelLevel == lvl ? Color.sage : Color.clear)
                                        .foregroundStyle(fuelLevel == lvl ? .white : Color.forest.opacity(0.6))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 6)
                                                .stroke(fuelLevel == lvl ? Color.sage : Color.border, lineWidth: 1)
                                        )
                                        .clipShape(RoundedRectangle(cornerRadius: 6))
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Notes (optional)") {
                    TextField("Optional notes", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle(editing != nil ? "Edit Checkout" : "Check Out")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await onSave(buildCheckout())
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
        if let co = editing {
            checkedOutBy = co.checkedOutBy
            purpose = co.purpose
            expectedReturn = co.expectedReturnAt
            startOdometerText = co.startOdometer.map { String($0) } ?? ""
            startHoursText = co.startHours.map { String($0) } ?? ""
            fuelLevel = co.fuelLevelOut ?? .full
            notes = co.checkoutNotes ?? ""
        } else {
            startOdometerText = asset.currentOdometer.map { String($0) } ?? ""
            startHoursText = asset.currentHours.map { String($0) } ?? ""
        }
    }

    private func buildCheckout() -> AssetCheckout {
        let now = Date()
        if let co = editing {
            var updated = co
            updated.checkedOutBy = checkedOutBy.trimmingCharacters(in: .whitespaces)
            updated.purpose = purpose.trimmingCharacters(in: .whitespaces)
            updated.expectedReturnAt = expectedReturn
            updated.checkoutNotes = notes.isEmpty ? nil : notes
            if asset.tracksOdometer { updated.startOdometer = Double(startOdometerText) }
            if asset.tracksHours    { updated.startHours = Double(startHoursText) }
            if showFuel { updated.fuelLevelOut = fuelLevel }
            return updated
        }
        return AssetCheckout(
            id: UUID().uuidString,
            assetId: asset.id,
            checkedOutBy: checkedOutBy.trimmingCharacters(in: .whitespaces),
            purpose: purpose.trimmingCharacters(in: .whitespaces),
            checkedOutAt: now,
            expectedReturnAt: expectedReturn,
            returnedAt: nil,
            startOdometer: asset.tracksOdometer ? Double(startOdometerText) : nil,
            endOdometer: nil,
            startHours: asset.tracksHours ? Double(startHoursText) : nil,
            endHours: nil,
            fuelLevelOut: showFuel ? fuelLevel : nil,
            fuelLevelIn: nil,
            checkoutNotes: notes.isEmpty ? nil : notes,
            returnNotes: nil,
            returnCondition: nil,
            loggedBy: authManager.currentUser.name,
            createdAt: now
        )
    }
}
