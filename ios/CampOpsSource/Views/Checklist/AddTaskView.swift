import SwiftUI

struct AddTaskView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var vm: ChecklistViewModel

    @State private var title = ""
    @State private var description = ""
    @State private var phase: ChecklistPhase = .pre
    @State private var assignedToId: String? = nil
    @State private var dueDateString = ""
    @State private var estimatedCost = ""
    @State private var isRecurring = false
    @State private var recurringInterval: RecurringInterval = .weekly
    @State private var isSaving = false

    private var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Title *", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3...5)
                }

                Section("Phase & Assignment") {
                    Picker("Phase", selection: $phase) {
                        Text("Pre-camp").tag(ChecklistPhase.pre)
                        Text("Post-camp").tag(ChecklistPhase.post)
                    }
                    Picker("Assign to", selection: $assignedToId) {
                        Text("Unassigned").tag(String?.none)
                        ForEach(CampUser.seedUsers, id: \.id) { user in
                            Text(user.name).tag(Optional(user.id))
                        }
                    }
                }

                Section("Schedule & Cost") {
                    TextField("Due date (YYYY-MM-DD)", text: $dueDateString)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("Estimated cost ($)", text: $estimatedCost)
                        .keyboardType(.decimalPad)
                }

                Section("Recurring") {
                    Toggle("Recurring task", isOn: $isRecurring)
                    if isRecurring {
                        Picker("Interval", selection: $recurringInterval) {
                            ForEach([RecurringInterval.daily, .weekly, .monthly, .annually], id: \.self) {
                                Text($0.rawValue.capitalized).tag($0)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Add Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await save() } }
                        .disabled(!isValid || isSaving)
                }
            }
        }
    }

    private func save() async {
        guard let seasonId = vm.season?.id else { return }
        isSaving = true
        let task = ChecklistTask(
            title: title.trimmingCharacters(in: .whitespaces),
            description: description.isEmpty ? nil : description,
            phase: phase,
            assignedToId: assignedToId,
            dueDate: dueDateString.isEmpty ? nil : dueDateString,
            estimatedCost: Double(estimatedCost),
            isRecurring: isRecurring,
            recurringInterval: isRecurring ? recurringInterval : nil,
            seasonId: seasonId
        )
        await vm.addTask(task, by: userManager.currentUser)
        isSaving = false
        dismiss()
    }
}
