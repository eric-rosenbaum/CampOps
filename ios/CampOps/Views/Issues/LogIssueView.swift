import SwiftUI

struct LogIssueView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var vm: LogIssueViewModel
    @FocusState private var costFocused: Bool
    var onSave: (Issue) -> Void

    init(editing issue: Issue? = nil, onSave: @escaping (Issue) -> Void) {
        _vm = StateObject(wrappedValue: LogIssueViewModel(editing: issue))
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Title *", text: $vm.title)
                    TextField("Description", text: $vm.description, axis: .vertical).lineLimit(3...6)
                }
                Section("Location & Priority") {
                    NavigationLink {
                        LocationPickerView(selected: $vm.locations)
                    } label: {
                        HStack {
                            Text("Location")
                            Spacer()
                            Text(vm.locations.isEmpty ? "None" : vm.locations.joined(separator: ", "))
                                .foregroundColor(.secondary).lineLimit(1)
                        }
                    }
                    Picker("Priority", selection: $vm.priority) {
                        ForEach(Priority.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                }
                Section("Assignment") {
                    Picker("Assign to", selection: $vm.assigneeId) {
                        Text("Unassigned").tag(String?.none)
                        ForEach(authManager.members, id: \.id) { Text($0.name).tag(Optional($0.id)) }
                    }
                }
                Section("Cost") {
                    TextField("Estimated cost ($)", text: $vm.estimatedCost)
                        .keyboardType(.decimalPad)
                        .focused($costFocused)
                }
                Section("Photo") {
                    PhotoPicker(selectedImage: $vm.selectedPhoto, existingUrl: vm.editingIssue?.photoUrl)
                        .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.md,
                                                  bottom: Spacing.sm, trailing: Spacing.md))
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(vm.editingIssue == nil ? "Log Issue" : "Edit Issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await saveIssue() } }
                        .disabled(!vm.isValid || vm.isSaving)
                }
                ToolbarItem(placement: .keyboard) {
                    HStack { Spacer(); Button("Done") { costFocused = false } }
                }
            }
            .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
                Button("OK") { vm.errorMessage = nil }
            } message: { Text(vm.errorMessage ?? "") }
        }
    }

    private func saveIssue() async {
        do {
            let saved = try await vm.save(reportedBy: authManager.currentUser)
            onSave(saved); dismiss()
        } catch { vm.errorMessage = error.localizedDescription }
    }
}
