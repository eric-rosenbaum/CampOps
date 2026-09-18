import SwiftUI
import UIKit

/// Logging a work order, or editing one.
///
/// Built out of the app's own surfaces rather than a stock `Form`, which read as Settings: grey
/// grouped rows, a picker wheel for a three-way choice, and a text box with no way out once the
/// keyboard was up. What somebody actually does here is answer four questions -- what, where,
/// who, when -- so each one is a card with its answer visible on it, and the uncommon fields sit
/// under "More".
///
/// The keyboard can always be dismissed: drag the form, tap the background, or use Done above the
/// keyboard. That was the specific complaint, and one way out is not enough when a thumb is
/// already holding the phone.
struct LogIssueView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @EnvironmentObject private var campground: CampgroundStore
    @StateObject private var vm: LogIssueViewModel
    @FocusState private var focus: Field?
    @State private var showMore = false
    @State private var showingDatePicker = false
    @State private var draftQuestions: [String] = []
    @State private var lowConfidence = false
    var onSave: ((Issue) -> Void)?

    private enum Field: Hashable { case title, details }

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
            let said = L10n.tr("Said: “%@”", spokenNote)
            model.description = model.description.isEmpty
                ? said
                : "\(model.description)\n\n\(said)"
        }
        _vm = StateObject(wrappedValue: model)
        _draftQuestions = State(initialValue: draft?.questions ?? [])
        _lowConfidence = State(initialValue: draft.map { !$0.isConfident } ?? false)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    if lowConfidence { draftWarning }
                    whatCard
                    if !draftQuestions.isEmpty { questionsCard }
                    whereCard
                    crewCard
                    whoCard
                    whenCard
                    photoCard
                    moreCard
                    Color.clear.frame(height: Spacing.xl)
                }
                .padding(Spacing.lg)
            }
            // Three ways out of the keyboard, because the one that fits the moment is whichever
            // the thumb is already near.
            .scrollDismissesKeyboard(.interactively)
            .contentShape(Rectangle())
            .onTapGesture { focus = nil }
            .campCanvas()
            .navigationTitle(vm.editingIssue == nil ? Text("Log work") : Text("Edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .keyboard) {
                    HStack {
                        Spacer()
                        Button("Done") { focus = nil }
                            .font(.campBodySemibold)
                    }
                }
            }
            // The save button lives with the thumb rather than in the top corner, and says what
            // it will do.
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 0) {
                    Divider().overlay(Color.border)
                    Button {
                        focus = nil
                        Task { await saveIssue() }
                    } label: {
                        if vm.isSaving {
                            ProgressView().tint(Color.cream)
                        } else {
                            Text(vm.editingIssue == nil ? "Log it" : "Save changes")
                        }
                    }
                    .buttonStyle(.campPrimary(enabled: vm.isValid))
                    .disabled(!vm.isValid || vm.isSaving)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.md)
                    .padding(.bottom, Spacing.sm)
                }
                .background(.bar)
            }
            .sheet(isPresented: $showingDatePicker) { dueDateSheet }
            .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
                Button("OK") { vm.errorMessage = nil }
            } message: { Text(vm.errorMessage ?? "") }
        }
    }

    // MARK: - What

    private var whatCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            TextField("What's wrong?", text: $vm.title, axis: .vertical)
                .font(.campTitle)
                .lineLimit(1...3)
                .focused($focus, equals: .title)
                .submitLabel(.next)
                .tint(Color.sage)

            Divider().overlay(Color.border)

            TextField("Anything else worth knowing", text: $vm.description, axis: .vertical)
                .font(.campBody)
                .lineLimit(2...8)
                .focused($focus, equals: .details)
                .tint(Color.sage)
        }
        .cardSurface(padding: Spacing.lg)
    }

    private var draftWarning: some View {
        Label("This is a rough guess from what was captured. Check every line before saving.",
              systemImage: "exclamationmark.triangle")
            .font(.campMeta)
            .foregroundStyle(Color.amberText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(Color.amberBg, in: .rect(cornerRadius: Radius.md))
    }

    private var questionsCard: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            SectionEyebrow(text: "Worth checking")
            ForEach(draftQuestions, id: \.self) { question in
                Label(question, systemImage: "questionmark.circle")
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    // MARK: - Where

    private var whereCard: some View {
        NavigationLink {
            LocationTreePicker(selectedIds: $vm.locationIds)
        } label: {
            pickerRow(
                icon: "mappin.and.ellipse",
                label: "Where",
                value: vm.locationIds.isEmpty ? L10n.tr("Pick a place") : vm.locationNames.joined(separator: ", "),
                isPlaceholder: vm.locationIds.isEmpty
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Crew and priority

    private var crewCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                SectionEyebrow(text: "Crew")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        ForEach(campground.trades) { crew in
                            Button(crew.name) {
                                Haptics.tap()
                                focus = nil
                                vm.tradeChanged(to: crew.key)
                            }
                            .buttonStyle(.campChip(filled: vm.trade == crew.key))
                        }
                    }
                    .padding(.vertical, 1)
                }
            }

            VStack(alignment: .leading, spacing: Spacing.sm) {
                SectionEyebrow(text: "How urgent")
                HStack(spacing: Spacing.sm) {
                    // Calm to loud, left to right, so the default sits where the eye starts and
                    // reaching for Urgent is a deliberate move rightwards.
                    ForEach(Priority.allCases.reversed(), id: \.self) { level in
                        Button {
                            Haptics.tap()
                            focus = nil
                            vm.priority = level
                        } label: {
                            Text(level.displayName)
                                .font(.campMetaSemibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 9)
                                // The chosen one is filled and in its own colour; the others are
                                // flat against the canvas. On a dark screen two similar greys
                                // read as two unselected chips.
                                .background(
                                    vm.priority == level ? level.bgColor : Color.canvas,
                                    in: .rect(cornerRadius: Radius.sm)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: Radius.sm)
                                        .strokeBorder(
                                            vm.priority == level ? level.color : Color.border,
                                            lineWidth: vm.priority == level ? 1.5 : 1
                                        )
                                )
                                .foregroundStyle(vm.priority == level ? level.color : Color.forest.opacity(0.55))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .cardSurface(padding: Spacing.lg)
    }

    // MARK: - Who

    private var whoCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Menu {
                Button("Nobody yet") { vm.setAssignment(.nobody) }
                if !campground.trades.isEmpty {
                    Section("A crew") {
                        ForEach(campground.trades) { crew in
                            Button(L10n.tr("%@ crew", crew.name)) { vm.setAssignment(.crew(crew.id)) }
                        }
                    }
                }
                Section("A person") {
                    ForEach(authManager.members, id: \.id) { member in
                        Button(member.name) { vm.setAssignment(.person(member.id)) }
                    }
                }
            } label: {
                pickerRow(icon: "person.crop.circle", label: "Who", value: assignmentLabel,
                          isPlaceholder: vm.assignment == .nobody)
            }

            if case .crew = vm.assignment {
                Text("Stays up for grabs until somebody on that crew takes it.")
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.55))
                    .padding(.horizontal, Spacing.md)
                    .padding(.bottom, Spacing.sm)
            }
        }
    }

    private var assignmentLabel: String {
        switch vm.assignment {
        case .nobody:
            return L10n.tr("Nobody yet")
        case let .person(id):
            return authManager.members.first { $0.id == id }?.name ?? L10n.tr("Somebody")
        case let .crew(id):
            return (campground.trades.first { $0.id == id }?.name).map { L10n.tr("%@ crew", $0) } ?? L10n.tr("A crew")
        }
    }

    // MARK: - When

    private var whenCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            // "When" was ambiguous -- people read it as when the thing broke. It is the date
            // the work is wanted by, and nothing else, so it says so.
            SectionEyebrow(text: "Needs doing by")
            HStack(spacing: Spacing.sm) {
                dueChip(L10n.tr("No date"), active: vm.dueDate == nil) {
                    vm.dueDate = nil; vm.dueTime = nil
                }
                dueChip(L10n.tr("Today"), active: isDue(offset: 0)) {
                    vm.dueDate = Date()
                }
                dueChip(L10n.tr("Tomorrow"), active: isDue(offset: 1)) {
                    vm.dueDate = Calendar.current.date(byAdding: .day, value: 1, to: Date())
                }
                dueChip(customLabel, active: isCustomDue) {
                    if vm.dueDate == nil { vm.dueDate = Date() }
                    showingDatePicker = true
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(padding: Spacing.lg)
    }

    private var customLabel: String {
        guard isCustomDue, let date = vm.dueDate else { return L10n.tr("Pick…") }
        let clock = vm.dueTime.map { CampDate.timeString(from: $0) }
        return CampDate.friendly(day: CampDate.dayString(date), time: clock)
    }

    private var isCustomDue: Bool {
        guard vm.dueDate != nil else { return false }
        return !isDue(offset: 0) && !isDue(offset: 1)
    }

    private func isDue(offset: Int) -> Bool {
        guard let due = vm.dueDate else { return false }
        return CampDate.dayString(due) == CampDate.day(offsetByDays: offset)
    }

    private func dueChip(_ text: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            focus = nil
            action()
        } label: {
            Text(text).lineLimit(1)
        }
        .buttonStyle(.campChip(filled: active))
    }

    private var dueDateSheet: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                DatePicker("Due", selection: Binding(
                    get: { vm.dueDate ?? Date() },
                    set: { vm.dueDate = $0 }
                ), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .tint(Color.sage)

                Toggle("At a set time", isOn: Binding(
                    get: { vm.dueTime != nil },
                    set: { on in vm.dueTime = on ? (vm.dueTime ?? Date()) : nil }
                ))
                .font(.campBody)

                if vm.dueTime != nil {
                    DatePicker("Time", selection: Binding(
                        get: { vm.dueTime ?? Date() },
                        set: { vm.dueTime = $0 }
                    ), displayedComponents: .hourAndMinute)
                    .tint(Color.sage)
                }
                Spacer()
            }
            .padding(Spacing.lg)
            .campCanvas()
            .navigationTitle("Needs doing by")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showingDatePicker = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Photo

    private var photoCard: some View {
        PhotoPicker(selectedImage: $vm.selectedPhoto, existingUrl: vm.editingIssue?.photoUrl)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(padding: Spacing.lg)
    }

    // MARK: - More

    private var moreCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Button {
                withAnimation(.easeOut(duration: 0.15)) { showMore.toggle() }
            } label: {
                HStack {
                    Text("More").font(.campBodyMedium)
                    Spacer()
                    Image(systemName: showMore ? "chevron.up" : "chevron.down")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.5))
                }
            }
            .buttonStyle(.plain)

            if showMore {
                Menu {
                    Button("None") { vm.vendorId = nil }
                    ForEach(campground.activeVendors()) { vendor in
                        Button(vendor.name) { vm.vendorId = vendor.id }
                    }
                } label: {
                    inlineRow(label: "Vendor", value: vendorLabel)
                }

                if vm.editingIssue == nil, !campground.templates(for: vm.trade).isEmpty {
                    Menu {
                        Button("None") { vm.templateId = nil }
                        ForEach(campground.templates(for: vm.trade)) { template in
                            Button(template.name) { vm.templateId = template.id }
                        }
                    } label: {
                        inlineRow(label: "Start from a checklist", value: templateLabel)
                    }
                }
            }
        }
        .cardSurface(padding: Spacing.lg)
    }

    private var vendorLabel: String {
        vm.vendorId.flatMap { id in campground.vendors.first { $0.id == id }?.name } ?? L10n.tr("None")
    }

    private var templateLabel: String {
        vm.templateId.flatMap { id in campground.templates.first { $0.id == id }?.name } ?? L10n.tr("None")
    }

    // MARK: - Shared rows

    private func pickerRow(icon: String, label: LocalizedStringKey, value: String,
                           isPlaceholder: Bool) -> some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(Color.sage)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.campLabel)
                    .foregroundStyle(Color.forest.opacity(0.45))
                Text(value)
                    .font(.campBody)
                    .foregroundStyle(isPlaceholder ? Color.forest.opacity(0.45) : Color.forest)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.forward")
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.35))
        }
        .cardSurface(padding: Spacing.lg)
    }

    private func inlineRow(label: LocalizedStringKey, value: String) -> some View {
        HStack {
            Text(label).font(.campBody).foregroundStyle(Color.forest)
            Spacer()
            Text(value)
                .font(.campBody)
                .foregroundStyle(Color.forest.opacity(0.55))
            Image(systemName: "chevron.up.chevron.down")
                .font(.campMicro)
                .foregroundStyle(Color.forest.opacity(0.4))
        }
        .padding(.vertical, 2)
    }

    // MARK: - Saving

    private func saveIssue() async {
        do {
            let saved = try await vm.save(reportedBy: authManager.currentUser)
            issueVM.apply(saved)
            onSave?(saved)
            dismiss()
        } catch { vm.errorMessage = error.localizedDescription }
    }
}
