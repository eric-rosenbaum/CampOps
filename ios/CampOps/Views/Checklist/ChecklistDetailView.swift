import SwiftUI

struct ChecklistDetailView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: ChecklistViewModel
    let taskId: String
    @State private var showingAssignPicker = false
    @State private var showingEdit = false
    @State private var showingDeleteConfirm = false
    @Environment(\.dismiss) private var dismiss

    private var task: ChecklistTask? { vm.tasks.first { $0.id == taskId } }

    private func effectiveDueDateLabel(for task: ChecklistTask) -> (label: String, overdue: Bool)? {
        if let rel = task.dueDateRelative { return rel }
        guard let days = task.daysRelativeToOpening, let season = vm.season else { return nil }
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"
        let baseStr = task.phase == .post ? season.closingDate : season.openingDate
        guard let base = formatter.date(from: baseStr),
              let due = Calendar.current.date(byAdding: .day, value: days, to: base) else { return nil }
        return formatter.string(from: due).relativeDueDate
    }

    var body: some View {
        Group {
            if let task { content(task: task) }
            else { Text("Task not found").foregroundColor(.secondary) }
        }
        .navigationTitle("Task").navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func content(task: ChecklistTask) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                // Header
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    HStack {
                        ChecklistStatusBadge(status: task.status)
                        PriorityBadge(priority: task.priority)
                        Label(task.phase == .pre ? "Pre-camp" : "Post-camp", systemImage: "flag")
                            .font(.caption).foregroundColor(.secondary)
                        Spacer()
                    }
                    Text(task.title).font(.title2.weight(.bold)).foregroundColor(.forest)
                    Label(task.locations.joined(separator: ", "), systemImage: "mappin.circle")
                        .font(.caption).foregroundColor(.secondary)
                    if let (label, overdue) = effectiveDueDateLabel(for: task) {
                        Text(label).font(.caption.weight(.medium))
                            .foregroundColor(overdue ? .priorityUrgent : .secondary)
                    }
                }

                if !task.description.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Description").font(.subheadline.weight(.semibold))
                        Text(task.description).font(.body).foregroundColor(.secondary)
                    }
                }

                // Assignment
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("Assigned to").font(.subheadline.weight(.semibold))
                    if authManager.can.assign {
                        Button { showingAssignPicker = true } label: {
                            HStack {
                                if let a = task.assignedTo {
                                    AvatarCircle(initials: a.initials, size: 28); Text(a.name).font(.subheadline)
                                } else {
                                    Image(systemName: "person.badge.plus")
                                    Text("Unassigned").font(.subheadline).foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundColor(.secondary)
                            }
                        }.buttonStyle(.plain)
                    } else {
                        Text(task.assignedTo?.name ?? "Unassigned").font(.subheadline).foregroundColor(.secondary)
                    }
                }

                // Status actions
                if task.status != .complete {
                    VStack(spacing: Spacing.sm) {
                        if task.status == .pending {
                            Button {
                                Task { await vm.updateTaskStatus(task, to: .inProgress, by: authManager.currentUser) }
                            } label: {
                                Label("Mark In Progress", systemImage: "play.circle").frame(maxWidth: .infinity)
                            }.buttonStyle(.borderedProminent).tint(.forestMid)
                        }
                        Button {
                            Task { await vm.updateTaskStatus(task, to: .complete, by: authManager.currentUser) }
                        } label: {
                            Label("Mark Complete", systemImage: "checkmark.circle").frame(maxWidth: .infinity)
                        }.buttonStyle(.borderedProminent).tint(.sage)
                    }
                }

                ActivityFeed(activity: task.activity)
            }
            .padding(Spacing.lg)
        }
        .toolbar {
            if authManager.can.createTask {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showingEdit = true } label: { Label("Edit Task", systemImage: "pencil") }
                        Button(role: .destructive) { showingDeleteConfirm = true } label: {
                            Label("Delete Task", systemImage: "trash")
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
        }
        .sheet(isPresented: $showingAssignPicker) {
            AssignPickerSheet(currentAssigneeId: task.assigneeId) { user in
                Task { await vm.assign(task: task, to: user, by: authManager.currentUser) }
            }
        }
        .sheet(isPresented: $showingEdit) {
            AddTaskView(editingTask: task)
                .environmentObject(authManager)
                .environmentObject(vm)
        }
        .confirmationDialog("Delete this task?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task { await vm.deleteTask(task); dismiss() }
            }
        } message: { Text("This action cannot be undone.") }
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: { Text(vm.errorMessage ?? "") }
    }
}
