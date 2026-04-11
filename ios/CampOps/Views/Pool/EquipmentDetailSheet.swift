import SwiftUI

struct EquipmentDetailSheet: View {
    @EnvironmentObject private var vm: PoolViewModel
    @EnvironmentObject private var userManager: UserManager
    @Environment(\.dismiss) private var dismiss

    let equipment: PoolEquipment
    @State private var showingEdit = false
    @State private var showingLogService = false
    @State private var showingDeleteConfirm = false

    private var serviceLog: [PoolServiceLog] { vm.serviceLogFor(equipmentId: equipment.id) }

    // Reflect live updates from vm
    private var live: PoolEquipment {
        vm.equipment.first(where: { $0.id == equipment.id }) ?? equipment
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    headerCard
                    if !serviceLog.isEmpty {
                        serviceHistorySection
                    }
                    if let specs = live.specs, !specs.isEmpty {
                        infoRow(label: "Specs", value: specs)
                    }
                    if let vendor = live.vendor, !vendor.isEmpty {
                        infoRow(label: "Vendor", value: vendor)
                    }
                }
                .padding(Spacing.md)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(live.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showingLogService = true } label: {
                            Label("Log service", systemImage: "wrench.adjustable")
                        }
                        Button { showingEdit = true } label: {
                            Label("Edit equipment", systemImage: "pencil")
                        }
                        Button(role: .destructive) { showingDeleteConfirm = true } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingEdit) {
                AddEquipmentSheet(editing: live, onSave: { updated in
                    await vm.updateEquipment(updated)
                }, onDelete: { id in
                    await vm.deleteEquipment(id: id)
                    dismiss()
                })
            }
            .sheet(isPresented: $showingLogService) {
                LogServiceSheet(equipment: vm.equipment) { entry in
                    await vm.addServiceLog(entry)
                }
                .environmentObject(userManager)
            }
            .confirmationDialog("Delete \(live.name)?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    Task { await vm.deleteEquipment(id: live.id); dismiss() }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    // MARK: - Subviews

    private var headerCard: some View {
        HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(live.status.color)
                .frame(width: 4)
                .cornerRadius(2)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack {
                    Image(systemName: live.type.icon).foregroundColor(.sage).frame(width: 20)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(live.name).font(.headline).foregroundColor(.forest)
                        Text(live.type.displayName).font(.caption).foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(live.status.displayName)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, Spacing.sm).padding(.vertical, 3)
                        .background(live.status.bgColor).foregroundColor(live.status.color)
                        .clipShape(Capsule())
                }

                if !live.statusDetail.isEmpty {
                    Text(live.statusDetail).font(.subheadline).foregroundColor(.secondary)
                }

                HStack(spacing: Spacing.lg) {
                    if let last = live.lastServiced {
                        LabelValuePair(label: "Last serviced", value: last.localDateDisplay)
                    }
                    if let next = live.nextServiceDue {
                        LabelValuePair(label: "Next due", value: next.localDateDisplay)
                    }
                }

                Button { showingLogService = true } label: {
                    Label("Log service", systemImage: "wrench.adjustable")
                        .font(.subheadline.weight(.medium))
                }
                .buttonStyle(.bordered)
                .tint(.sage)
                .controlSize(.small)
            }
            .padding(Spacing.md)
        }
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Color.border, lineWidth: 1))
    }

    private var serviceHistorySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Service history")
                .font(.headline).foregroundColor(.forest)
                .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                ForEach(Array(serviceLog.enumerated()), id: \.element.id) { idx, entry in
                    ServiceLogRow(entry: entry, isLast: idx == serviceLog.count - 1)
                }
            }
            .background(Color(.systemBackground))
            .cornerRadius(Radius.md)
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundColor(.secondary)
            Spacer()
            Text(value).font(.subheadline).foregroundColor(.forest)
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
    }
}

// MARK: - Service log row

private struct ServiceLogRow: View {
    let entry: PoolServiceLog
    let isLast: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.serviceType.displayName)
                        .font(.subheadline.weight(.medium)).foregroundColor(.forest)
                    Text("\(entry.datePerformed.localDateDisplay) · \(entry.performedBy)")
                        .font(.caption).foregroundColor(.secondary)
                    if let notes = entry.notes {
                        Text(notes).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
                if let cost = entry.cost {
                    Text(String(format: "$%.0f", cost))
                        .font(.caption.weight(.semibold)).foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, 10)

            if !isLast { Divider().padding(.leading, Spacing.md) }
        }
    }
}

private struct LabelValuePair: View {
    let label, value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundColor(.secondary)
            Text(value).font(.caption.weight(.medium)).foregroundColor(.forest)
        }
    }
}
