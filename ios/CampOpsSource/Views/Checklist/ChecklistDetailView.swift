import SwiftUI

struct ChecklistDetailView: View {
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var vm: ChecklistViewModel
    let taskId: String

    @State private var showingAssignPicker = false

    private var task: ChecklistTask? {
        vm.tasks.first { $0.id == taskId }
    }

    var body: some View {
        Group {
            if let task {
                content(task: task)
            } else {
                Text("Task not found").foregroundColor(.secondary)
            }
        }
        .navigationTitle("Task")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func content(task: ChecklistTask) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {

                // Header
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    HStack {
                        ChecklistStatusBadge(status: task.status)
                        Label(task.phase == .pre ? "Pre-camp" : "Post-camp", systemImage: "flag")
                            .font(.caption).foregroundColor(.secondary)
                        Spacer()
                    }
                    Text(task.title)
                        .font(.title2.weight(.bold))
                        .foregroundColor(.forest)

                    if let (label, overdue) = task.dueDateRelative {
                        Text(label)
                            .font(.caption.weight(.medium))
                            .foregroundColor(overdue ? .priorityUrgent : .secondary)
                    }
                }

                // Description
                if let desc = task.description {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Description").font(.subheadline.weight(.semibold))
                        Text(desc).font(.body).foregroundColor(.secondary)
                    }
                }

                // Recurring
                if task.isRecurring, let interval = task.recurringInterval {
                    Label("Repeats \(interval.rawValue)", systemImage: "repeat")
                        .font(.caption).foregroundColor(.secondary)
                }

                // Assignment
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("Assigned to").font(.subheadline.weight(.semibold))
                    if userManager.can.assign {
                        Button { showingAssignPicker = true } label: {
                            HStack {
                                if let assignee = task.assignedTo {
                                    AvatarCircle(initials: assignee.initials, size: 28)
                                    Text(assignee.name).font(.subheadline)
                                } else {
                                    Image(systemName: "person.badge.plus")
                                    Text("Unassigned").font(.subheadline).foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundColor(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(task.assignedTo?.name ?? "Unassigned").font(.subheadline).foregroundColor(.secondary)
                    }
                }

                // Costs
                if let est = task.estimatedCost {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Estimated cost").font(.caption).foregroundColor(.secondary)
                            Text("$\(String(format: "%.2f", est))").font(.subheadline.weight(.medium))
                        }
                        if let actual = task.actualCost {
                            Spacer()
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Actual cost").font(.caption).foregroundColor(.secondary)
                                Text("$\(String(format: "%.2f", actual))").font(.subheadline.weight(.medium))
                            }
                        }
                    }
                }

                // Status actions
                if task.status != .complete {
                    VStack(spacing: Spacing.sm) {
                        if task.status == .pending {
                            Button {
                                Task { await vm.updateTaskStatus(task, to: .inProgress, by: userManager.currentUser) }
                            } label: {
                                Label("Mark In Progress", systemImage: "play.circle")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.forestMid)
                        }
                        Button {
                            Task { await vm.updateTaskStatus(task, to: .complete, by: userManager.currentUser) }
                        } label: {
                            Label("Mark Complete", systemImage: "checkmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.sage)
                    }
                }

                // Activity
                ActivityFeed(activity: task.activity)
            }
            .padding(Spacing.lg)
        }
        .sheet(isPresented: $showingAssignPicker) {
            AssignPickerSheet(currentAssigneeId: task.assignedToId) { user in
                Task { await vm.assign(task: task, to: user, by: userManager.currentUser) }
            }
        }
    }
}

// MARK: - Reusable assign picker sheet

struct AssignPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let currentAssigneeId: String?
    let onSelect: (CampUser?) -> Void

    var body: some View {
        NavigationStack {
            List {
                UserPickerRow(user: nil, isSelected: currentAssigneeId == nil) {
                    onSelect(nil); dismiss()
                }
                ForEach(CampUser.seedUsers) { user in
                    UserPickerRow(user: user, isSelected: user.id == currentAssigneeId) {
                        onSelect(user); dismiss()
                    }
                }
            }
            .navigationTitle("Assign to")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}
