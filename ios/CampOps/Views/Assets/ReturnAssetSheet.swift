import SwiftUI

struct ReturnAssetSheet: View {
    @EnvironmentObject private var userManager: UserManager
    @Environment(\.dismiss) private var dismiss

    let asset: CampAsset
    let checkout: AssetCheckout
    let onSave: (AssetCheckout) async -> Void

    @State private var endOdometerText = ""
    @State private var endHoursText = ""
    @State private var fuelLevel: FuelLevel = .full
    @State private var condition: CheckoutCondition = .noIssues
    @State private var returnNotes = ""

    let fuelLevels: [FuelLevel] = [.empty, .quarter, .half, .threeQuarter, .full]
    var showFuel: Bool { asset.category == .vehicle || asset.category == .golfCart || asset.category == .watercraft }

    var conditions: [(CheckoutCondition, String)] = [
        (.noIssues, "No issues"),
        (.minorNote, "Minor note"),
        (.needsAttention, "Needs attention"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Asset") {
                    HStack {
                        Text(asset.name).foregroundStyle(Color.forest)
                        Spacer()
                        Text("Checked out by \(checkout.checkedOutBy)")
                            .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.5))
                    }
                }

                if asset.tracksOdometer || asset.tracksHours {
                    Section("End readings") {
                        if asset.tracksOdometer {
                            HStack {
                                Text("Odometer")
                                Spacer()
                                if let start = checkout.startOdometer {
                                    Text("started at \(Int(start).formatted())")
                                        .font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                                TextField("0", text: $endOdometerText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 80)
                                Text("mi").foregroundStyle(.secondary)
                            }
                        }
                        if asset.tracksHours {
                            HStack {
                                Text("Hours")
                                Spacer()
                                TextField("0", text: $endHoursText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 80)
                                Text("hrs").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if showFuel {
                    Section("Fuel level returned") {
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
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Condition") {
                    ForEach(conditions, id: \.0.rawValue) { cond, label in
                        Button {
                            condition = cond
                        } label: {
                            HStack {
                                Text(label)
                                    .foregroundStyle(cond == .needsAttention ? Color.priorityUrgent : Color.forest)
                                Spacer()
                                if condition == cond {
                                    Image(systemName: "checkmark").foregroundStyle(Color.sage)
                                }
                            }
                        }
                    }
                }

                Section("Return notes (optional)") {
                    TextField("Any notes about the return…", text: $returnNotes, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle("Return \(asset.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Confirm Return") {
                        Task {
                            await onSave(buildReturn())
                            dismiss()
                        }
                    }
                }
            }
            .onAppear {
                endOdometerText = asset.currentOdometer.map { String($0) } ?? ""
                endHoursText = asset.currentHours.map { String($0) } ?? ""
                fuelLevel = checkout.fuelLevelOut ?? .full
            }
        }
    }

    private func buildReturn() -> AssetCheckout {
        var updated = checkout
        updated.returnedAt = Date()
        updated.returnCondition = condition
        updated.returnNotes = returnNotes.isEmpty ? nil : returnNotes
        if asset.tracksOdometer { updated.endOdometer = Double(endOdometerText) }
        if asset.tracksHours    { updated.endHours = Double(endHoursText) }
        if showFuel { updated.fuelLevelIn = fuelLevel }
        return updated
    }
}
