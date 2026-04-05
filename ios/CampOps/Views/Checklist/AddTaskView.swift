import SwiftUI

struct AddTaskView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var vm: ChecklistViewModel

    var editingTask: ChecklistTask? = nil

    @State private var title = ""
    @State private var description = ""
    @State private var phase: ChecklistPhase = .pre
    @State private var location: CampLocation = .other
    @State private var priority: Priority = .normal
    @State private var assigneeId: String? = nil
    @State private var dueDateString = ""
    @State private var daysRelative = ""
    @State private var isSaving = false

    private var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }
    private var navTitle: String { editingTask == nil ? "Add Task" : "Edit Task" }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Title *", text: $title)
                    TextField("Description", text: $description, axis: .vertical).lineLimit(3...5)
                }
                Section("Phase & Location") {
                    Picker("Phase", selection: $phase) {
                        Text("Pre-camp").tag(ChecklistPhase.pre)
                        Text("Post-camp").tag(ChecklistPhase.post)
                    }
                    Picker("Location", selection: $location) {
                        ForEach(CampLocation.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                    Picker("Priority", selection: $priority) {
                        ForEach(Priority.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                }
                Section("Assignment") {
                    Picker("Assign to", selection: $assigneeId) {
                        Text("Unassigned").tag(String?.none)
                        ForEach(CampUser.seedUsers, id: \.id) { Text($0.name).tag(Optional($0.id)) }
                    }
                }
                Section("Schedule") {
                    TextField("Due date (YYYY-MM-DD)", text: $dueDateString).keyboardType(.numbersAndPunctuation)
                    TextField("Days relative to opening (e.g. -7)", text: $daysRelative).keyboardType(.numbersAndPunctuation)
                }
            }
            .navigationTitle(navTitle).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editingTask == nil ? "Add" : "Save") { Task { await save() } }
                        .disabled(!isValid || isSaving)
                }
            }
            .onAppear { populate() }
        }
    }

    private func populate() {
        guard let t = editingTask else { return }
        title = t.title; description = t.description
        phase = t.phase; location = t.location; priority = t.priority
        assigneeId = t.assigneeId; dueDateString = t.dueDate ?? ""
        daysRelative = String(t.daysRelativeToOpening)
    }

    private func save() async {
        isSaving = true
        if let existing = editingTask {
            var updated = existing
            updated.title = title.trimmingCharacters(in: .whitespaces)
            updated.description = description
            updated.phase = phase; updated.location = location; updated.priority = priority
            updated.assigneeId = assigneeId
            updated.dueDate = dueDateString.isEmpty ? nil : dueDateString
            updated.daysRelativeToOpening = Int(daysRelative) ?? existing.daysRelativeToOpening
            await vm.updateTask(updated, by: userManager.currentUser)
        } else {
            let task = ChecklistTask(
                title: title.trimmingCharacters(in: .whitespaces),
                description: description,
                location: location, priority: priority,
                assigneeId: assigneeId, phase: phase,
                daysRelativeToOpening: Int(daysRelative) ?? 0,
                dueDate: dueDateString.isEmpty ? nil : dueDateString)
            await vm.addTask(task, by: userManager.currentUser)
        }
        isSaving = false; dismiss()
    }
}
