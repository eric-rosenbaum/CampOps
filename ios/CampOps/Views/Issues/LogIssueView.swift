import SwiftUI
import UIKit

/// Logging a work order, or editing one.
///
/// The form a phone needs is shorter than the one a laptop needs: title, where, how urgent, who.
/// Everything else -- the asset, the vendor, a checklist to start from -- sits behind "More", so
/// the common case is four taps and the uncommon case is still possible.
struct LogIssueView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @EnvironmentObject private var campground: CampgroundStore
    @StateObject private var vm: LogIssueViewModel
    @State private var showMore = false
    @State private var draftQuestions: [String] = []
    @State private var lowConfidence = false
    var onSave: ((Issue) -> Void)?

    init(
        editing issue: Issue? = nil,
        prefillLocationId: String? = nil,
        prefillAssetId: String? = nil,
        draft: WorkOrderDraft? = nil,
        photo: UIImage? = nil,
        spokenNote: String = "",
        onSave: ((Issue) -> Void)? = nil
    ) {
        let model = LogIssueViewModel(
            editing: issue,
            prefillLocationId: prefillLocationId,
            prefillAssetId: prefillAssetId
        )
        if let draft { model.apply(draft: draft) }
        if let photo { model.selectedPhoto = photo }
        if !spokenNote.isEmpty {
            // Verbatim, under whatever the model wrote. A transcript is evidence; a summary of
            // it is a guess, and the person who said it is standing right there to check.
            model.description = model.description.isEmpty
                ? "Said: \"\(spokenNote)\""
                : "\(model.description)\n\nSaid: \"\(spokenNote)\""
        }
        _vm = StateObject(wrappedValue: model)
        _draftQuestions = State(initialValue: draft?.questions ?? [])
        _lowConfidence = State(initialValue: draft.map { !$0.isConfident } ?? false)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                if lowConfidence {
                    Section {
                        Label(
                            "This is a rough guess from the photo. Check every line before saving.",
                            systemImage: "exclamationmark.triangle"
                        )
                        .font(.campMeta)
                        .foregroundStyle(Color.amberText)
                    }
                }

                Section("What's wrong") {
                    TextField("Title", text: $vm.title)
                    TextField("Anything else", text: $vm.description, axis: .vertical)
                        .lineLimit(3...6)
                }

                if !draftQuestions.isEmpty {
                    Section("Worth checking") {
                        ForEach(draftQuestions, id: \.self) { question in
                            Label(question, systemImage: "questionmark.circle")
                                .font(.campMeta)
                                .foregroundStyle(Color.forest.opacity(0.7))
                        }
                    }
                }

                Section("Where") {
                    NavigationLink {
                        LocationTreePicker(selectedIds: $vm.locationIds)
                    } label: {
                        HStack {
                            Text("Location")
                            Spacer()
                            Text(vm.locationIds.isEmpty ? "None" : vm.locationNames.joined(separator: ", "))
                                .foregroundStyle(Color.forest.opacity(0.55)).lineLimit(1)
                        }
                    }
                }

                Section("Crew") {
                    // Chips rather than a picker: a camp has a handful of crews and this is the
                    // field that decides who ever sees the job.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.sm) {
                            ForEach(campground.trades) { crew in
                                Button(crew.name) {
                                    Haptics.tap()
                                    vm.tradeChanged(to: crew.key)
                                }
                                .buttonStyle(.campChip(filled: vm.trade == crew.key))
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.md,
                                              bottom: Spacing.sm, trailing: Spacing.md))

                    Picker("Priority", selection: $vm.priority) {
                        ForEach(Priority.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                }

                Section("Who") {
                    Picker("Assign to", selection: assignmentBinding) {
                        Text("Nobody yet").tag(LogIssueViewModel.Assignment.nobody)
                        ForEach(campground.trades) { crew in
                            Text("\(crew.name) crew").tag(LogIssueViewModel.Assignment.crew(crew.id))
                        }
                        ForEach(authManager.members, id: \.id) { member in
                            Text(member.name).tag(LogIssueViewModel.Assignment.person(member.id))
                        }
                    }
                    if case .crew = vm.assignment {
                        Text("Stays up for grabs until somebody on that crew takes it.")
                            .font(.campMeta)
                            .foregroundStyle(Color.forest.opacity(0.55))
                    }
                }

                Section("When") {
                    Toggle("Has a due date", isOn: dueDateToggle)
                    if vm.dueDate != nil {
                        DatePicker("Due", selection: Binding(
                            get: { vm.dueDate ?? Date() },
                            set: { vm.dueDate = $0 }
                        ), displayedComponents: .date)
                        Toggle("At a set time", isOn: dueTimeToggle)
                        if vm.dueTime != nil {
                            DatePicker("Time", selection: Binding(
                                get: { vm.dueTime ?? Date() },
                                set: { vm.dueTime = $0 }
                            ), displayedComponents: .hourAndMinute)
                        }
                    }
                }

                Section("Photo") {
                    PhotoPicker(selectedImage: $vm.selectedPhoto, existingUrl: vm.editingIssue?.photoUrl)
                        .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.md,
                                                  bottom: Spacing.sm, trailing: Spacing.md))
                }

                Section {
                    DisclosureGroup("More", isExpanded: $showMore) {
                        Picker("Vendor", selection: $vm.vendorId) {
                            Text("None").tag(String?.none)
                            ForEach(campground.activeVendors()) { vendor in
                                Text(vendor.name).tag(Optional(vendor.id))
                            }
                        }
                        if vm.editingIssue == nil {
                            Picker("Start from a checklist", selection: $vm.templateId) {
                                Text("None").tag(String?.none)
                                ForEach(campground.templates(for: vm.trade)) { template in
                                    Text(template.name).tag(Optional(template.id))
                                }
                            }
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(vm.editingIssue == nil ? "Log work" : "Edit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await saveIssue() } }
                        .disabled(!vm.isValid || vm.isSaving)
                }
            }
            .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
                Button("OK") { vm.errorMessage = nil }
            } message: { Text(vm.errorMessage ?? "") }
        }
    }

    private var assignmentBinding: Binding<LogIssueViewModel.Assignment> {
        Binding(get: { vm.assignment }, set: { vm.setAssignment($0) })
    }

    private var dueDateToggle: Binding<Bool> {
        Binding(
            get: { vm.dueDate != nil },
            set: { on in
                vm.dueDate = on ? Date() : nil
                if !on { vm.dueTime = nil }
            }
        )
    }

    private var dueTimeToggle: Binding<Bool> {
        Binding(
            get: { vm.dueTime != nil },
            set: { on in vm.dueTime = on ? Date() : nil }
        )
    }

    private func saveIssue() async {
        do {
            let saved = try await vm.save(reportedBy: authManager.currentUser)
            issueVM.apply(saved)
            onSave?(saved)
            dismiss()
        } catch { vm.errorMessage = error.localizedDescription }
    }
}
