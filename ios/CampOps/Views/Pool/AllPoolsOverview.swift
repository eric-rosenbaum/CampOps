import SwiftUI

struct AllPoolsOverview: View {
    @ObservedObject var vm: PoolViewModel
    let onSelectPool: (CampPool) -> Void

    private var activePools: [CampPool] {
        vm.pools.filter { $0.isActive }.sorted { $0.sortOrder < $1.sortOrder }
    }

    var body: some View {
        ScrollView {
            if activePools.isEmpty {
                emptyState
            } else {
                LazyVStack(spacing: Spacing.md) {
                    summaryRow
                    ForEach(activePools) { pool in
                        PoolStatusCard(pool: pool, vm: vm, onTap: { onSelectPool(pool) })
                    }
                }
                .padding(Spacing.md)
            }
        }
        .background(Color.canvas)
    }

    // MARK: - Summary row

    private var summaryRow: some View {
        let chemical = activePools.filter { $0.type.isChemical }.count
        let waterfront = activePools.count - chemical
        return HStack(spacing: Spacing.md) {
            SummaryTile(value: "\(activePools.count)", label: "Locations", icon: "mappin.circle.fill", color: .sage)
            SummaryTile(value: "\(chemical)",   label: "Chemical",  icon: "drop.fill",        color: .forest)
            SummaryTile(value: "\(waterfront)", label: "Waterfront", icon: "water.waves",      color: Color(hex: "0ea5e9"))
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "drop.circle")
                .font(.system(size: 52))
                .foregroundColor(.sageLight)
            Text("No pools added yet")
                .font(.campSection).foregroundStyle(Color.forest.opacity(0.55))
            Text("Use the menu to add your first pool or waterfront.")
                .font(.campBody).foregroundStyle(Color.forest.opacity(0.55))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
        .padding(.horizontal, Spacing.xl)
    }
}

// MARK: - Summary tile

private struct SummaryTile: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundColor(color)
            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundColor(.forest)
            Text(label)
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
        .background(Color.surface)
        .cornerRadius(Radius.md)
    }
}

// MARK: - Pool status card

private struct PoolStatusCard: View {
    let pool: CampPool
    @ObservedObject var vm: PoolViewModel
    let onTap: () -> Void

    private var latestReading: ChemicalReading? {
        vm.readings
            .filter { $0.poolId == pool.id }
            .max { $0.readingTime < $1.readingTime }
    }

    private var poolEquipment: [PoolEquipment] {
        vm.equipment.filter { $0.poolId == pool.id }
    }

    private var issueCount: Int {
        poolEquipment.filter { $0.status != .ok }.count
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Header
                HStack(spacing: Spacing.sm) {
                    Image(systemName: pool.type.icon)
                        .foregroundColor(.sage)
                    Text(pool.name)
                        .font(.campSection)
                        .foregroundColor(.forest)
                    Spacer()
                    Text(pool.type.displayName)
                        .font(.campLabel)
                        .foregroundStyle(Color.forest.opacity(0.55))
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 3)
                        .background(Color.surfaceRaised)
                        .clipShape(Capsule())
                    Image(systemName: "chevron.right")
                        .font(.campMeta)
                        .foregroundColor(Color(.systemGray3))
                }

                Divider()

                if pool.type.isChemical {
                    chemicalSummary
                } else {
                    waterfrontSummary
                }

                if let notes = pool.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.55))
                        .lineLimit(2)
                }
            }
            .padding(Spacing.md)
            .background(Color.surface)
            .cornerRadius(Radius.md)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var chemicalSummary: some View {
        if let r = latestReading {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                HStack(spacing: Spacing.md) {
                    MiniChemCell(label: "Cl", value: r.freeChlorine,  field: .freeChlorine)
                    MiniChemCell(label: "pH", value: r.ph,            field: .ph)
                    MiniChemCell(label: "Alk", value: r.alkalinity,   field: .alkalinity)
                    MiniChemCell(label: "Temp", value: r.waterTemp,   field: .waterTemp, decimals: 1)
                    Spacer()
                }
                Text("Last reading: \(r.readingTime.readingTimeDisplay)")
                    .font(.campMicro)
                    .foregroundStyle(Color.forest.opacity(0.55))
            }
        } else {
            Text("No readings logged")
                .font(.campBody)
                .foregroundStyle(Color.forest.opacity(0.55))
        }
    }

    @ViewBuilder
    private var waterfrontSummary: some View {
        HStack(spacing: Spacing.md) {
            Label("\(poolEquipment.count) equipment", systemImage: "wrench.adjustable")
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.55))
            if issueCount > 0 {
                Label("\(issueCount) issue\(issueCount == 1 ? "" : "s")", systemImage: "exclamationmark.triangle.fill")
                    .font(.campMetaSemibold)
                    .foregroundColor(.priorityUrgent)
            } else if !poolEquipment.isEmpty {
                Label("All operational", systemImage: "checkmark.circle.fill")
                    .font(.campMetaSemibold)
                    .foregroundColor(.sage)
            }
            Spacer()
        }
    }
}

// MARK: - Mini chem cell

private struct MiniChemCell: View {
    let label: String
    let value: Double
    let field: ChemField
    var decimals: Int = 0
    private var status: ChemStatus { chemStatus(field: field, value: value) }

    var body: some View {
        VStack(spacing: 1) {
            Text(label).font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
            Text(String(format: "%.\(decimals)f", value))
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundColor(status == .ok ? .forest : status.color)
        }
    }
}
