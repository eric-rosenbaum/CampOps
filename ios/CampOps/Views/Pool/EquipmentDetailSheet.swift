import SwiftUI

struct EquipmentDetailSheet: View {
    @EnvironmentObject private var vm: PoolViewModel
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let equipment: PoolEquipment
    @State private var showingEdit = false
    @State private var showingLogService = false
    @State private var showingFlagIssue = false
    @State private var showingDeleteConfirm = false
    @State private var editingServiceLog: PoolServiceLog? = nil

    private var serviceLog: [PoolServiceLog] { vm.serviceLogFor(equipmentId: equipment.id) }

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
            .background(Color.canvas)
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
                        Button { showingFlagIssue = true } label: {
                            Label(live.status == .ok ? "Flag issue" : "Edit issue",
                                  systemImage: live.status == .ok ? "exclamationmark.triangle" : "pencil.circle")
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
                AddEquipmentSheet(poolId: live.poolId, editing: live, onSave: { updated in
                    await vm.updateEquipment(updated)
                }, onDelete: { id in
                    await vm.deleteEquipment(id: id)
                    dismiss()
                })
            }
            .sheet(isPresented: $showingLogService) {
                LogServiceSheet(equipment: vm.equipment, onSave: { entry in
                    await vm.addServiceLog(entry)
                })
                .environmentObject(authManager)
            }
            .sheet(item: $editingServiceLog) { entry in
                LogServiceSheet(
                    equipment: vm.equipment,
                    editing: entry,
                    onSave: { _ in },
                    onUpdate: { updated in await vm.updateServiceLog(updated) },
                    onDelete: { id in await vm.deleteServiceLog(id: id) }
                )
                .environmentObject(authManager)
            }
            .sheet(isPresented: $showingFlagIssue) {
                FlagIssueSheet(equipment: live)
                    .environmentObject(vm)
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
                        Text(live.name).font(.campSection).foregroundColor(.forest)
                        Text(live.type.displayName).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                    }
                    Spacer()
                    Text(live.status.displayName)
                        .font(.campLabel)
                        .padding(.horizontal, Spacing.sm).padding(.vertical, 3)
                        .background(live.status.bgColor).foregroundColor(live.status.color)
                        .clipShape(Capsule())
                }

                if !live.statusDetail.isEmpty && live.statusDetail != "Normal" {
                    Text(live.statusDetail).font(.campBody).foregroundStyle(Color.forest.opacity(0.55))
                }

                HStack(spacing: Spacing.lg) {
                    if let last = live.lastServiced {
                        LabelValuePair(label: "Last serviced", value: last.localDateDisplay)
                    }
                    if let next = live.nextServiceDue {
                        LabelValuePair(label: "Next due", value: next.localDateDisplay)
                    }
                }

                HStack(spacing: Spacing.sm) {
                    Button { showingLogService = true } label: {
                        Label("Log service", systemImage: "wrench.adjustable")
                            .font(.campBodyMedium)
                    }
                    .buttonStyle(.bordered)
                    .tint(.sage)
                    .controlSize(.small)

                    Button { showingFlagIssue = true } label: {
                        Label(live.status == .ok ? "Flag issue" : "Edit issue",
                              systemImage: live.status == .ok ? "exclamationmark.triangle" : "pencil.circle")
                            .font(.campBodyMedium)
                    }
                    .buttonStyle(.bordered)
                    .tint(live.status == .ok ? .red : .orange)
                    .controlSize(.small)
                }
            }
            .padding(Spacing.md)
        }
        .background(Color.surface)
        .cornerRadius(Radius.md)
        .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Color.border, lineWidth: 1))
    }

    private var serviceHistorySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Service history")
                .font(.campSection).foregroundColor(.forest)
                .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                ForEach(Array(serviceLog.enumerated()), id: \.element.id) { idx, entry in
                    ServiceLogRow(entry: entry, isLast: idx == serviceLog.count - 1) {
                        editingServiceLog = entry
                    } onDelete: {
                        Task { await vm.deleteServiceLog(id: entry.id) }
                    }
                }
            }
            .background(Color.surface)
            .cornerRadius(Radius.md)
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).font(.campBody).foregroundStyle(Color.forest.opacity(0.55))
            Spacer()
            Text(value).font(.campBody).foregroundColor(.forest)
        }
        .padding(Spacing.md)
        .background(Color.surface)
        .cornerRadius(Radius.md)
    }
}

// MARK: - Service log row

private struct ServiceLogRow: View {
    let entry: PoolServiceLog
    let isLast: Bool
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.serviceType.displayName)
                        .font(.campBodyMedium).foregroundColor(.forest)
                    Text("\(entry.datePerformed.localDateDisplay) · \(entry.performedBy)")
                        .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                    if let notes = entry.notes {
                        Text(notes).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
                    }
                }
                Spacer()
                if let cost = entry.cost {
                    Text(String(format: "$%.0f", cost))
                        .font(.campMetaSemibold).foregroundStyle(Color.forest.opacity(0.55))
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, 10)

            if !isLast { Divider().padding(.leading, Spacing.md) }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { onDelete() } label: {
                Label("Delete", systemImage: "trash")
            }
            Button { onEdit() } label: {
                Label("Edit", systemImage: "pencil")
            }
            .tint(.blue)
        }
        .contentShape(Rectangle())
        .onTapGesture { onEdit() }
    }
}

private struct LabelValuePair: View {
    let label, value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
            Text(value).font(.campMetaMedium).foregroundColor(.forest)
        }
    }
}
