import SwiftUI

struct InspectionsView: View {
    @EnvironmentObject private var vm: PoolViewModel
    @EnvironmentObject private var authManager: AuthManager
    @State private var editingEntry: PoolInspectionLog?
    @State private var logForInspectionId: String?
    @State private var showingLog = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.md) {
                statsRow

                // Overdue banners
                ForEach(vm.inspections.filter { $0.status == .overdue }) { insp in
                    AlertBannerView(
                        message: "\(insp.name) is overdue. Required to remain in compliance.",
                        actionLabel: "Log inspection",
                        onAction: {
                            logForInspectionId = insp.id
                            showingLog = true
                        }
                    )
                }

                // Inspection schedule
                if !vm.inspections.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Inspection schedule")
                            .font(.headline).foregroundColor(.forest)
                            .padding(.horizontal, Spacing.xs)
                        ForEach(vm.inspections) { insp in
                            InspectionCard(insp: insp) {
                                logForInspectionId = insp.id
                                showingLog = true
                            }
                        }
                    }
                }

                // Inspection log
                if !vm.inspectionLog.isEmpty {
                    logSection
                }

                if vm.inspections.isEmpty && vm.inspectionLog.isEmpty {
                    emptyState
                }
            }
            .padding(Spacing.md)
        }
        .background(Color(.systemGroupedBackground))
        .sheet(isPresented: $showingLog) {
            LogInspectionSheet(
                poolId: vm.activePoolId ?? "",
                inspections: vm.inspections,
                editing: nil,
                preselectedId: logForInspectionId
            ) { entry in
                await vm.addInspectionLog(entry)
            } onDelete: { _ in }
                .environmentObject(authManager)
        }
        .sheet(item: $editingEntry) { entry in
            LogInspectionSheet(
                poolId: vm.activePoolId ?? "",
                inspections: vm.inspections,
                editing: entry
            ) { _ in } onDelete: { id in
                await vm.deleteInspectionLog(id: id)
            } onUpdate: { updated in
                await vm.updateInspectionLog(updated)
            }
            .environmentObject(authManager)
        }
    }

    private var statsRow: some View {
        HStack(spacing: Spacing.sm) {
            let completed = vm.inspections.filter { $0.status == .ok }.count
            let due       = vm.inspections.filter { $0.status == .due }.count
            let overdue   = vm.inspections.filter { $0.status == .overdue }.count
            InspStatChip(value: "\(completed)", label: "Completed", color: .greenText, bg: .greenBg)
            InspStatChip(value: "\(due)",       label: "Coming due", color: due > 0 ? .amberText : .secondary, bg: due > 0 ? .amberBg : Color(.systemBackground))
            InspStatChip(value: "\(overdue)",   label: "Overdue",   color: overdue > 0 ? .priorityUrgent : .secondary, bg: overdue > 0 ? .urgentBg : Color(.systemBackground))
        }
    }

    private var logSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Inspection log")
                .font(.headline).foregroundColor(.forest)
                .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                ForEach(Array(vm.inspectionLog.sorted { $0.createdAt > $1.createdAt }.enumerated()), id: \.element.id) { idx, entry in
                    InspectionLogRow(
                        entry: entry,
                        inspections: vm.inspections,
                        isLast: idx == vm.inspectionLog.count - 1,
                        onEdit: { editingEntry = entry }
                    )
                }
            }
            .background(Color(.systemBackground))
            .cornerRadius(Radius.md)
        }
    }

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "checklist.unchecked").font(.system(size: 48)).foregroundColor(.sageLight)
            Text("No inspections logged").font(.headline).foregroundColor(.secondary)
            Text("Tap + to record a completed inspection").font(.subheadline).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Spacing.xxl)
    }
}

// MARK: - Subviews

private struct InspStatChip: View {
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

private struct AlertBannerView: View {
    let message: String
    let actionLabel: String
    let onAction: () -> Void
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(.priorityUrgent)
            Text(message).font(.subheadline).foregroundColor(.forest)
            Spacer()
            Button(actionLabel, action: onAction)
                .font(.caption.weight(.semibold))
                .foregroundColor(.priorityUrgent)
        }
        .padding(Spacing.md)
        .background(Color.urgentBg)
        .cornerRadius(Radius.md)
    }
}

private struct InspectionCard: View {
    let insp: PoolInspection
    let onLog: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(insp.name).font(.headline).foregroundColor(.forest)
                    Text([insp.frequency, insp.authority].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                InspStatusBadge(status: insp.status, nextDue: insp.nextDue)
            }

            if let last = insp.lastCompleted {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "checkmark.circle.fill").font(.caption).foregroundColor(.sage)
                    Text("Last completed \(last.localDateDisplay)")
                        .font(.caption).foregroundColor(.secondary)
                }
            }

            if insp.status != .ok {
                Button(action: onLog) {
                    Label("Log inspection", systemImage: "plus.circle")
                        .font(.subheadline.weight(.medium))
                }
                .buttonStyle(.bordered)
                .tint(.sage)
                .controlSize(.small)
            }
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md)
                .stroke(insp.status == .overdue ? Color.priorityUrgent.opacity(0.3) :
                        insp.status == .due ? Color.priorityHigh.opacity(0.3) : Color.border, lineWidth: 1)
        )
    }
}

private struct InspStatusBadge: View {
    let status: InspectionStatus
    let nextDue: String?
    var body: some View {
        Text(badgeText)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 3)
            .background(bg)
            .foregroundColor(fg)
            .clipShape(Capsule())
    }
    private var badgeText: String {
        switch status {
        case .ok:      return nextDue.map { "Valid through \($0.localDateDisplay)" } ?? "Completed"
        case .due:     return nextDue.map { "Due \($0.localDateDisplay)" } ?? "Due soon"
        case .overdue:
            if let due = nextDue, let d = parseYMD(due) {
                let days = Calendar.current.dateComponents([.day], from: d, to: Date()).day ?? 0
                if days > 0 { return "Overdue \(days) day\(days == 1 ? "" : "s")" }
            }
            return "Overdue"
        }
    }
    private var bg: Color {
        switch status { case .ok: return .greenBg; case .due: return .amberBg; case .overdue: return .urgentBg }
    }
    private var fg: Color {
        switch status { case .ok: return .greenText; case .due: return .amberText; case .overdue: return .priorityUrgent }
    }
    private func parseYMD(_ s: String) -> Date? {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.date(from: s)
    }
}

private struct InspectionLogRow: View {
    let entry: PoolInspectionLog
    let inspections: [PoolInspection]
    let isLast: Bool
    let onEdit: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.typeName(inspections: inspections))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.forest)
                    Text("\(entry.inspectionDate.localDateDisplay) · \(entry.conductedBy)")
                        .font(.caption).foregroundColor(.secondary)
                    if let notes = entry.notes {
                        Text(notes).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(entry.result.displayName)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 3)
                        .background(entry.result.bgColor)
                        .foregroundColor(entry.result.color)
                        .clipShape(Capsule())
                    Button { onEdit() } label: {
                        Image(systemName: "pencil")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, 10)

            if !isLast { Divider().padding(.leading, Spacing.md) }
        }
    }
}
