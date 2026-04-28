import SwiftUI

struct TimingOption: Identifiable, Hashable {
    let id: String
    let label: String
    let value: Int?

    init(label: String, value: Int?) {
        self.id = value.map { String($0) } ?? "none"
        self.label = label
        self.value = value
    }
}

private let preBuckets: [TimingOption] = [
    .init(label: "No due date", value: nil),
    .init(label: "1 month before opening", value: -30),
    .init(label: "2 weeks before opening", value: -14),
    .init(label: "1 week before opening", value: -7),
    .init(label: "3 days before opening", value: -3),
    .init(label: "Opening day", value: 0),
]

private let postBuckets: [TimingOption] = [
    .init(label: "No due date", value: nil),
    .init(label: "Closing day", value: 0),
    .init(label: "3 days after closing", value: 3),
    .init(label: "1 week after closing", value: 7),
    .init(label: "2 weeks after closing", value: 14),
    .init(label: "1 month after closing", value: 30),
]

private func bucketsFor(_ phase: ChecklistPhase) -> [TimingOption] {
    phase == .pre ? preBuckets : postBuckets
}

private func matchBucket(_ value: Int?, phase: ChecklistPhase) -> TimingOption {
    bucketsFor(phase).first { $0.value == value } ?? bucketsFor(phase)[0]
}

struct AddTaskView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: ChecklistViewModel

    var editingTask: ChecklistTask? = nil

    @State private var title = ""
    @State private var description = ""
    @State private var phase: ChecklistPhase = .pre
    @State private var locations: [String] = []
    @State private var priority: Priority = .normal
    @State private var assigneeId: String? = nil
    @State private var selectedTiming: TimingOption = preBuckets[0]
    @State private var isSaving = false

    private var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }
    private var navTitle: String { editingTask == nil ? "Add Task" : "Edit Task" }
    private var buckets: [TimingOption] { bucketsFor(phase) }

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
                    .onChange(of: phase) { _, newPhase in
                        selectedTiming = matchBucket(selectedTiming.value, phase: newPhase)
                    }
                    NavigationLink {
                        LocationPickerView(selected: $locations)
                    } label: {
                        HStack {
                            Text("Location")
                            Spacer()
                            Text(locations.isEmpty ? "None" : locations.joined(separator: ", "))
                                .foregroundColor(.secondary).lineLimit(1)
                        }
                    }
                    Picker("Priority", selection: $priority) {
                        ForEach(Priority.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                }
                Section("Assignment") {
                    Picker("Assign to", selection: $assigneeId) {
                        Text("Unassigned").tag(String?.none)
                        ForEach(authManager.members, id: \.id) { Text($0.name).tag(Optional($0.id)) }
                    }
                }
                Section("Schedule") {
                    Picker("Timing", selection: $selectedTiming) {
                        ForEach(buckets) { option in
                            Text(option.label).tag(option)
                        }
                    }
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
        phase = t.phase; locations = t.locations; priority = t.priority
        assigneeId = t.assigneeId
        selectedTiming = matchBucket(t.daysRelativeToOpening, phase: t.phase)
    }

    private func save() async {
        isSaving = true
        if let existing = editingTask {
            var updated = existing
            updated.title = title.trimmingCharacters(in: .whitespaces)
            updated.description = description
            updated.phase = phase; updated.locations = locations; updated.priority = priority
            updated.assigneeId = assigneeId
            updated.daysRelativeToOpening = selectedTiming.value
            updated.dueDate = nil
            await vm.updateTask(updated, by: authManager.currentUser)
        } else {
            let task = ChecklistTask(
                title: title.trimmingCharacters(in: .whitespaces),
                description: description,
                locations: locations, priority: priority,
                assigneeId: assigneeId, phase: phase,
                daysRelativeToOpening: selectedTiming.value)
            await vm.addTask(task, by: authManager.currentUser)
        }
        isSaving = false; dismiss()
    }
}
