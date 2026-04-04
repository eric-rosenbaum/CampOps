import SwiftUI

struct IssueDetailView: View {
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var listVM: IssueListViewModel
    @StateObject private var vm: IssueDetailViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showingEdit = false
    @State private var showingAssignPicker = false
    @State private var showingResolveSheet = false
    @State private var showingDeleteConfirm = false
    @State private var actualCostInput = ""

    init(issue: Issue) {
        _vm = StateObject(wrappedValue: IssueDetailViewModel(issue: issue))
    }

    private var can: Permissions { userManager.can }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {

                // Header
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    HStack { PriorityBadge(priority: vm.issue.priority); Spacer() }
                    Text(vm.issue.title)
                        .font(.title2.weight(.bold))
                        .foregroundColor(.forest)
                    HStack(spacing: Spacing.sm) {
                        StatusBadge(status: vm.issue.status)
                        Label(vm.issue.location.displayName, systemImage: "mappin.circle")
                            .font(.caption).foregroundColor(.secondary)
                    }
                    Text("Reported by \(vm.issue.reportedBy?.name ?? "Unknown") · \(vm.issue.createdAt.dateTimeDisplay)")
                        .font(.caption).foregroundColor(.secondary)
                }

                // Photo
                if let url = vm.issue.photoUrl, let imageUrl = URL(string: url) {
                    AsyncImage(url: imageUrl) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                                .frame(maxWidth: .infinity).frame(height: 200)
                                .clipped().cornerRadius(Radius.md)
                        default:
                            Color(.systemGray5).frame(height: 200).cornerRadius(Radius.md)
                        }
                    }
                }

                // Description
                if let desc = vm.issue.description {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Description").font(.subheadline.weight(.semibold))
                        Text(desc).font(.body).foregroundColor(.secondary)
                    }
                }

                // Assignment
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("Assigned to").font(.subheadline.weight(.semibold))
                    if can.assign {
                        Button {
                            showingAssignPicker = true
                        } label: {
                            HStack {
                                if let assignee = vm.issue.assignedTo {
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
                        Text(vm.issue.assignedTo?.name ?? "Unassigned")
                            .font(.subheadline).foregroundColor(.secondary)
                    }
                }

                // Costs
                if let est = vm.issue.estimatedCost {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Estimated cost").font(.caption).foregroundColor(.secondary)
                            Text("$\(String(format: "%.2f", est))").font(.subheadline.weight(.medium))
                        }
                        if let actual = vm.issue.actualCost {
                            Spacer()
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Actual cost").font(.caption).foregroundColor(.secondary)
                                Text("$\(String(format: "%.2f", actual))").font(.subheadline.weight(.medium))
                            }
                        }
                    }
                }

                // Actions
                if vm.issue.status != .resolved {
                    VStack(spacing: Spacing.sm) {
                        if vm.issue.status == .assigned || vm.issue.status == .inProgress {
                            Button {
                                Task {
                                    let next: IssueStatus = vm.issue.status == .assigned ? .inProgress : .inProgress
                                    await vm.updateStatus(next, by: userManager.currentUser)
                                }
                            } label: {
                                Label(
                                    vm.issue.status == .inProgress ? "In Progress" : "Mark In Progress",
                                    systemImage: "wrench.and.screwdriver"
                                )
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.forestMid)
                            .disabled(vm.issue.status == .inProgress)
                        }

                        Button { showingResolveSheet = true } label: {
                            Label("Mark Resolved", systemImage: "checkmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.sage)
                    }
                }

                // Activity
                ActivityFeed(activity: vm.issue.activity)
            }
            .padding(Spacing.lg)
        }
        .navigationTitle("Issue")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if can.createIssue {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showingEdit = true } label: {
                            Label("Edit Issue", systemImage: "pencil")
                        }
                        Button(role: .destructive) { showingDeleteConfirm = true } label: {
                            Label("Delete Issue", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .sheet(isPresented: $showingEdit) {
            LogIssueView(editing: vm.issue) { updated in
                vm.applyEdit(updated)
                listVM.issues = listVM.issues.map { $0.id == updated.id ? updated : $0 }
            }
        }
        .sheet(isPresented: $showingAssignPicker) {
            AssignPickerSheet(currentAssigneeId: vm.issue.assignedToId) { user in
                Task { await vm.assign(to: user, by: userManager.currentUser) }
            }
        }
        .sheet(isPresented: $showingResolveSheet) {
            ResolveSheet(canEnterCost: can.enterActualCost) { cost in
                Task { await vm.resolve(actualCost: cost, by: userManager.currentUser) }
            }
        }
        .confirmationDialog("Delete this issue?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    await listVM.delete(issue: vm.issue)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
        }
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }
}

// MARK: - Sub-sheets

private struct ResolveSheet: View {
    @Environment(\.dismiss) private var dismiss
    let canEnterCost: Bool
    let onResolve: (Double?) -> Void
    @State private var costInput = ""

    var body: some View {
        NavigationStack {
            Form {
                if canEnterCost {
                    Section("Actual Cost") {
                        TextField("$0.00", text: $costInput)
                            .keyboardType(.decimalPad)
                    }
                }
                Section {
                    Button("Mark as Resolved") {
                        onResolve(Double(costInput))
                        dismiss()
                    }
                    .foregroundColor(.sage)
                }
            }
            .navigationTitle("Resolve Issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
