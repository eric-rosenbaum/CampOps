import SwiftUI

struct SeasonalChecklistView: View {
    @EnvironmentObject private var vm: PoolViewModel
    @EnvironmentObject private var authManager: AuthManager
    @Binding var addTaskPhase: SeasonalPhase?
    @State private var editingTask: PoolSeasonalTask?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.md) {
                progressCard
                ForEach(SeasonalPhase.allCases, id: \.self) { phase in
                    PhaseSection(
                        phase: phase,
                        tasks: vm.tasksForPhase(phase),
                        progress: vm.progressForPhase(phase),
                        canManage: authManager.can.managePoolChecklist,
                        onToggle: { id in Task { await vm.toggleSeasonalTask(id: id, userName: authManager.currentUser.name) } },
                        onEdit: { task in editingTask = task },
                        onDelete: { id in Task { await vm.deleteSeasonalTask(id: id) } },
                        onAdd: { phase in addTaskPhase = phase }
                    )
                }
            }
            .padding(Spacing.md)
        }
        .background(Color(.systemGroupedBackground))
        .sheet(item: $editingTask) { task in
            SeasonalTaskSheet(
                poolId: task.poolId,
                editing: task,
                defaultPhase: task.phase,
                onAdd: { _ in },
                onSave: { updated in await vm.updateSeasonalTask(updated) },
                onDelete: { id in await vm.deleteSeasonalTask(id: id) }
            )
        }
    }

    private var progressCard: some View {
        let p = vm.seasonalProgress
        let pct = p.total > 0 ? Double(p.done) / Double(p.total) : 0
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text("Season checklist").font(.headline).foregroundColor(.forest)
                Spacer()
                Text("\(p.done) of \(p.total) tasks")
                    .font(.subheadline).foregroundColor(.secondary)
            }
            ProgressView(value: pct)
                .tint(.sage)
                .scaleEffect(x: 1, y: 1.5, anchor: .center)
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
    }
}

// MARK: - Phase section

private struct PhaseSection: View {
    let phase: SeasonalPhase
    let tasks: [PoolSeasonalTask]
    let progress: (done: Int, total: Int)
    let canManage: Bool
    let onToggle: (String) -> Void
    let onEdit: (PoolSeasonalTask) -> Void
    let onDelete: (String) -> Void
    let onAdd: (SeasonalPhase) -> Void

    private var pct: Double {
        progress.total > 0 ? Double(progress.done) / Double(progress.total) : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            // Header
            HStack {
                Text(phase.displayName).font(.subheadline.weight(.semibold)).foregroundColor(.forest)
                Spacer()
                phaseBadge
                if canManage {
                    Button { onAdd(phase) } label: {
                        Image(systemName: "plus.circle")
                            .font(.subheadline)
                            .foregroundColor(.sage)
                    }
                }
            }

            ProgressView(value: pct)
                .tint(.sage)
                .scaleEffect(x: 1, y: 1.2, anchor: .center)

            if tasks.isEmpty {
                Text(canManage ? "No tasks yet — tap + to add" : "No tasks added yet.")
                    .font(.subheadline).foregroundColor(.secondary)
                    .padding(.vertical, Spacing.xs)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(tasks.enumerated()), id: \.element.id) { idx, task in
                        SeasonalTaskRow(
                            task: task,
                            isLast: idx == tasks.count - 1,
                            canManage: canManage,
                            onToggle: { onToggle(task.id) },
                            onTap: canManage ? { onEdit(task) } : nil
                        )
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if canManage {
                                Button(role: .destructive) { onDelete(task.id) } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button { onEdit(task) } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.sage)
                            }
                        }
                    }
                }
                .background(Color(.systemBackground))
                .cornerRadius(Radius.md)
            }
        }
    }

    private var phaseBadge: some View {
        let (done, total) = (progress.done, progress.total)
        let text: String
        let bg: Color
        let fg: Color
        if total == 0 {
            text = "Empty"; bg = Color(.systemGray5); fg = .secondary
        } else if done == total {
            text = "\(total) of \(total) done"; bg = .greenBg; fg = .greenText
        } else if done == 0 {
            text = "Not started"; bg = .urgentBg; fg = .priorityUrgent
        } else {
            text = "\(done) of \(total) done"; bg = .amberBg; fg = .amberText
        }
        return Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 3)
            .background(bg)
            .foregroundColor(fg)
            .clipShape(Capsule())
    }
}

// MARK: - Task row

private struct SeasonalTaskRow: View {
    let task: PoolSeasonalTask
    let isLast: Bool
    let canManage: Bool
    let onToggle: () -> Void
    var onTap: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                // Checkbox
                Button(action: onToggle) {
                    Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundColor(task.isComplete ? .sage : Color(.systemGray3))
                }
                .buttonStyle(.plain)

                // Content
                VStack(alignment: .leading, spacing: 3) {
                    Text(task.title)
                        .font(.subheadline)
                        .foregroundColor(task.isComplete ? .secondary : .forest)
                        .strikethrough(task.isComplete)

                    if let detail = task.detail {
                        Text(detail).font(.caption).foregroundColor(.secondary)
                    }

                    // Assignees + completion date
                    if !task.assignees.isEmpty || (task.isComplete && task.completedDate != nil) {
                        HStack(spacing: Spacing.xs) {
                            ForEach(task.assignees, id: \.self) { name in
                                Text(name)
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color(hex: "e8f0fe"))
                                    .foregroundColor(Color(hex: "1a56db"))
                                    .clipShape(Capsule())
                            }
                            if task.isComplete, let date = task.completedDate {
                                Text("Done \(date.localDateDisplay)")
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.greenBg)
                                    .foregroundColor(Color.greenText)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                Spacer()

                if canManage {
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundColor(Color(.systemGray3))
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, 10)
            .opacity(task.isComplete ? 0.65 : 1)
            .contentShape(Rectangle())
            .onTapGesture { onTap?() }

            if !isLast { Divider().padding(.leading, Spacing.md + 28) }
        }
    }
}
