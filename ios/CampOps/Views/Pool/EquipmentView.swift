import SwiftUI

struct EquipmentView: View {
    @EnvironmentObject private var vm: PoolViewModel
    @EnvironmentObject private var authManager: AuthManager
    @Binding var showingLogService: Bool
    @State private var detailEquipment: PoolEquipment?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.md) {
                if !vm.equipment.isEmpty {
                    statsRow
                }

                if vm.equipment.isEmpty {
                    emptyState
                } else {
                    ForEach(vm.equipment) { equip in
                        Button {
                            detailEquipment = equip
                        } label: {
                            EquipmentCard(
                                equip: equip,
                                serviceLog: vm.serviceLogFor(equipmentId: equip.id)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(Spacing.md)
        }
        .background(Color(.systemGroupedBackground))
        .sheet(item: $detailEquipment) { equip in
            EquipmentDetailSheet(equipment: equip)
                .environmentObject(vm)
                .environmentObject(authManager)
        }
    }

    private var statsRow: some View {
        HStack(spacing: Spacing.sm) {
            StatChip(
                value: "\(vm.equipment.filter { $0.status == .ok }.count)",
                label: "OK",
                color: .greenText, bg: .greenBg
            )
            StatChip(
                value: "\(vm.equipment.filter { $0.status == .warn }.count)",
                label: "Monitor",
                color: .amberText, bg: .amberBg
            )
            StatChip(
                value: "\(vm.equipment.filter { $0.status == .alert }.count)",
                label: "Alert",
                color: .priorityUrgent, bg: .urgentBg
            )
        }
    }

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "wrench.and.screwdriver").font(.system(size: 48)).foregroundColor(.sageLight)
            Text("No equipment added").font(.headline).foregroundColor(.secondary)
            Text("Tap + to add pool equipment").font(.subheadline).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Spacing.xxl)
    }
}

private struct StatChip: View {
    let value, label: String
    let color, bg: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.title2.weight(.bold).monospacedDigit()).foregroundColor(color)
            Text(label).font(.caption.weight(.semibold)).foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
        .background(bg)
        .cornerRadius(Radius.sm)
    }
}

// MARK: - Equipment card

private struct EquipmentCard: View {
    let equip: PoolEquipment
    let serviceLog: [PoolServiceLog]

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Status bar
            Rectangle()
                .fill(equip.status.color)
                .frame(width: 4)
                .cornerRadius(2)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Header
                HStack {
                    Image(systemName: equip.type.icon)
                        .foregroundColor(.sage)
                        .frame(width: 20)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(equip.name)
                            .font(.headline)
                            .foregroundColor(.forest)
                        Text(equip.type.displayName)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    HStack(spacing: Spacing.xs) {
                        Text(equip.status.displayName)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, 3)
                            .background(equip.status.bgColor)
                            .foregroundColor(equip.status.color)
                            .clipShape(Capsule())
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundColor(Color(.systemGray3))
                    }
                }

                if !equip.statusDetail.isEmpty {
                    Text(equip.statusDetail)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                // Service info
                HStack(spacing: Spacing.lg) {
                    if let last = equip.lastServiced {
                        LabelValue(label: "Last serviced", value: last.localDateDisplay)
                    }
                    if let next = equip.nextServiceDue {
                        LabelValue(label: "Next due", value: next.localDateDisplay)
                    }
                }

                // Recent service log
                if let latest = serviceLog.first {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: "clock").font(.caption2).foregroundColor(.secondary)
                        Text("\(latest.serviceType.displayName) · \(latest.datePerformed.localDateDisplay)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(Spacing.md)
        }
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Color.border, lineWidth: 1))
    }
}

private struct LabelValue: View {
    let label, value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundColor(.secondary)
            Text(value).font(.caption.weight(.medium)).foregroundColor(.forest)
        }
    }
}
