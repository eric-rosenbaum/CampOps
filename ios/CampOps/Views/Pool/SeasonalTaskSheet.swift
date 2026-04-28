import SwiftUI

struct SeasonalTaskSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let poolId: String
    let editing: PoolSeasonalTask?
    let defaultPhase: SeasonalPhase
    let onAdd: (PoolSeasonalTask) async -> Void
    let onSave: (PoolSeasonalTask) async -> Void
    var onDelete: ((String) async -> Void)? = nil

    @State private var title: String = ""
    @State private var detail: String = ""
    @State private var phase: SeasonalPhase = .opening
    @State private var assignees: [String] = []
    @State private var userSearch: String = ""
    @State private var showingUserPicker = false
    @State private var isSaving = false
    @State private var showingDeleteConfirm = false

    private var allUsers: [CampUser] { authManager.members }

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("What needs to be done?", text: $title)
                    Picker("Phase", selection: $phase) {
                        ForEach(SeasonalPhase.allCases, id: \.self) { p in
                            Text(p.displayName).tag(p)
                        }
                    }
                    TextField("Notes / detail (optional)", text: $detail, axis: .vertical)
                        .lineLimit(2...4)
                }

                Section("Assignees") {
                    if assignees.isEmpty {
                        Text("No assignees added").foregroundColor(.secondary).font(.subheadline)
                    } else {
                        ForEach(assignees, id: \.self) { name in
                            HStack {
                                if let user = allUsers.first(where: { $0.name == name }) {
                                    AvatarCircle(initials: user.initials, size: 28)
                                }
                                Text(name)
                                Spacer()
                                Button {
                                    assignees.removeAll { $0 == name }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(Color(.systemGray3))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    // User picker inline
                    let available = allUsers.filter { u in !assignees.contains(u.name) }
                    if !available.isEmpty {
                        Menu {
                            ForEach(available) { user in
                                Button {
                                    assignees.append(user.name)
                                } label: {
                                    Label(user.name, systemImage: "person.circle")
                                }
                            }
                        } label: {
                            Label("Add assignee", systemImage: "plus.circle")
                                .foregroundColor(.sage)
                                .font(.subheadline)
                        }
                    }
                }

                if editing != nil {
                    Section {
                        Button("Delete task", role: .destructive) { showingDeleteConfirm = true }
                    }
                }
            }
            .navigationTitle(editing == nil ? "Add task" : "Edit task")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let e = editing {
                    title = e.title
                    detail = e.detail ?? ""
                    phase = e.phase
                    assignees = e.assignees
                } else {
                    phase = defaultPhase
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Add" : "Save") { save() }
                        .disabled(title.isEmpty || isSaving)
                }
            }
            .confirmationDialog("Delete this task?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let e = editing {
                        Task { await onDelete?(e.id); dismiss() }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func save() {
        isSaving = true
        let now = Date()
        if let e = editing {
            var updated = e
            updated.title = title
            updated.detail = detail.isEmpty ? nil : detail
            updated.phase = phase
            updated.assignees = assignees
            updated.updatedAt = now
            Task { await onSave(updated); dismiss() }
        } else {
            let task = PoolSeasonalTask(
                id: UUID().uuidString,
                poolId: poolId,
                title: title,
                detail: detail.isEmpty ? nil : detail,
                phase: phase,
                isComplete: false,
                completedBy: nil,
                completedDate: nil,
                assignees: assignees,
                sortOrder: Int(Date().timeIntervalSince1970),
                createdAt: now, updatedAt: now
            )
            Task { await onAdd(task); dismiss() }
        }
    }
}
