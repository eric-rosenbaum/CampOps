import SwiftUI
import UIKit

/// One work order, open on screen.
///
/// The screen is ordered by what somebody does with it: what it is, then the one button that
/// closes it, then the steps, then everything that has been said. Notes and system events share
/// a single timeline rather than sitting in two tabs -- what happened and what people said about
/// it are the same story, and splitting them means reading both to work out either.
struct IssueDetailView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var listVM: IssueListViewModel
    @EnvironmentObject private var campground: CampgroundStore
    @StateObject private var vm: IssueDetailViewModel
    @StateObject private var thread: IssueThreadViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var draftComment = ""
    @State private var commentPhoto: UIImage?
    @State private var isPickingCommentPhoto = false
    @State private var replyToReporter = false
    @State private var mentioned: Set<String> = []
    @State private var showingMentionPicker = false
    @State private var showingEdit = false
    @State private var showingAssignPicker = false
    @State private var showingResolveSheet = false
    @State private var showingDeleteConfirm = false
    @State private var showingTemplatePicker = false
    @State private var newStep = ""
    @State private var justClosed = false
    @State private var undoTask: Task<Void, Never>?

    init(issue: Issue) {
        _vm = StateObject(wrappedValue: IssueDetailViewModel(issue: issue))
        _thread = StateObject(wrappedValue: IssueThreadViewModel(issueId: issue.id))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                header
                if vm.issue.isPublicReport { reporterCard }
                photo
                description
                facts
                actions
                checklistSection
                timelineSection
                composer
            }
            .padding(Spacing.lg)
        }
        .campCanvas()
        .task {
            await vm.refresh()
            await thread.load()
            // Opening the thread is what marks it read, and only once the row exists on the
            // server -- a work order still sitting in the queue has nothing to mark.
            if !listVM.isShowingCachedCopy { campground.markRead(issueId: vm.issue.id) }
        }
        .refreshable {
            await vm.refresh()
            await thread.refresh()
        }
        .navigationTitle("Work order")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if authManager.can.createIssue {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showingEdit = true } label: { Label("Edit", systemImage: "pencil") }
                        if !campground.templates(for: vm.issue.trade).isEmpty {
                            Button { showingTemplatePicker = true } label: {
                                Label("Add a checklist", systemImage: "checklist")
                            }
                        }
                        if vm.issue.status == .resolved {
                            Button { Task { await reopen() } } label: {
                                Label("Reopen", systemImage: "arrow.uturn.backward")
                            }
                        }
                        Button(role: .destructive) { showingDeleteConfirm = true } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
        }
        .sheet(isPresented: $showingEdit) {
            LogIssueView(editing: vm.issue) { updated in
                vm.applyEdit(updated)
                listVM.apply(updated)
            }
        }
        .sheet(isPresented: $showingAssignPicker) {
            AssignPickerSheet(
                currentAssigneeId: vm.issue.assigneeId,
                currentCrewId: vm.issue.assigneeGroupId,
                onSelect: { user in
                    Task {
                        await vm.assign(to: user, by: authManager.currentUser)
                        listVM.apply(vm.issue)
                    }
                },
                onSelectCrew: { crew in
                    Task {
                        await vm.assign(toCrew: crew, by: authManager.currentUser)
                        listVM.apply(vm.issue)
                    }
                }
            )
        }
        .sheet(isPresented: $showingResolveSheet) {
            ResolveSheet(canEnterCost: authManager.can.enterActualCost) { cost, minutes in
                Task {
                    await vm.resolve(actualCost: cost, minutes: minutes, by: authManager.currentUser)
                    listVM.apply(vm.issue)
                }
            }
        }
        .sheet(isPresented: $showingTemplatePicker) {
            TemplatePickerSheet(trade: vm.issue.trade) { template in
                Task { await thread.applyTemplate(template) }
            }
        }
        .sheet(isPresented: $isPickingCommentPhoto) {
            NavigationStack {
                PhotoPicker(selectedImage: $commentPhoto)
                    .padding(Spacing.lg)
                    .navigationTitle("Photo")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { isPickingCommentPhoto = false }
                        }
                    }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showingMentionPicker) {
            MentionPickerSheet(selected: $mentioned)
        }
        .confirmationDialog("Delete this work order?", isPresented: $showingDeleteConfirm,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task { await listVM.delete(issue: vm.issue); dismiss() }
            }
        } message: { Text("This cannot be undone.") }
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: { Text(vm.errorMessage ?? "") }
        .safeAreaInset(edge: .bottom) {
            if justClosed { undoBar }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                PriorityBadge(priority: vm.issue.priority)
                StatusBadge(status: vm.issue.status)
                Spacer()
            }
            Text(vm.issue.title).font(.campTitle).foregroundColor(.forest)
            HStack(spacing: Spacing.xs) {
                CrewPill(trade: vm.issue.trade)
                if vm.issue.source == .routine {
                    MetaTag(text: "Routine", systemImage: "arrow.triangle.2.circlepath")
                }
                if vm.issue.source == .qr {
                    MetaTag(text: "Scanned", systemImage: "qrcode")
                }
            }
            if !vm.issue.locations.isEmpty {
                Label(vm.issue.locations.joined(separator: ", "), systemImage: "mappin.circle")
                    .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }
            Text(reportedLine)
                .font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
        }
    }

    private var reportedLine: String {
        let who = vm.issue.reportedBy?.name
            ?? vm.issue.reporterName
            ?? (vm.issue.source == .routine ? "a routine" : "someone")
        return "From \(who) · \(vm.issue.createdAt.dateTimeDisplay)"
    }

    /// A guest filed this. Their name and how to reach them, because the first useful action is
    /// often to ask them a question.
    private var reporterCard: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Label("Reported by a guest", systemImage: "person.crop.circle.badge.exclamationmark")
                .font(.campLabel)
            if let name = vm.issue.reporterName {
                Text(name).font(.campBodySemibold)
            }
            if let contact = vm.issue.reporterContact {
                Text(contact).font(.campMeta).foregroundStyle(Color.forest.opacity(0.6))
            }
            Text("Replies you mark for the reporter are the only thing they can see.")
                .font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    @ViewBuilder
    private var photo: some View {
        if let url = vm.issue.photoUrl, let imageUrl = URL(string: url) {
            AsyncImage(url: imageUrl) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFill()
                        .frame(maxWidth: .infinity).frame(height: 220)
                        .clipped().cornerRadius(Radius.md)
                default:
                    Color(.systemGray5).frame(height: 220).cornerRadius(Radius.md)
                }
            }
        }
    }

    @ViewBuilder
    private var description: some View {
        if let desc = vm.issue.description, !desc.isEmpty {
            Text(desc).font(.campBodyLarge).foregroundStyle(Color.forest.opacity(0.75))
        }
    }

    /// Who has it, when it is due, who has been called, how long it took.
    private var facts: some View {
        VStack(spacing: Spacing.sm) {
            factRow(label: "With", systemImage: "person.crop.circle") {
                if authManager.can.assign {
                    Button { showingAssignPicker = true } label: {
                        HStack(spacing: Spacing.xs) {
                            Text(vm.issue.holderLabel).font(.campBody)
                            Image(systemName: "chevron.right").font(.campMicro)
                        }
                        .foregroundStyle(Color.forest)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text(vm.issue.holderLabel).font(.campBody)
                }
            }

            if let due = vm.issue.dueLabel {
                factRow(label: "Due", systemImage: "calendar") {
                    Text(due)
                        .font(.campBody)
                        .foregroundStyle(vm.issue.isOverdue(today: CampDate.today())
                                         ? Color.priorityUrgent : Color.forest)
                }
            }

            if authManager.can.assign {
                factRow(label: "Vendor", systemImage: "hammer") {
                    Menu {
                        Button("None") {
                            Task {
                                await vm.setVendor(nil, by: authManager.currentUser)
                                listVM.apply(vm.issue)
                            }
                        }
                        ForEach(campground.activeVendors()) { vendor in
                            Button(vendor.name) {
                                Task {
                                    await vm.setVendor(vendor, by: authManager.currentUser)
                                    listVM.apply(vm.issue)
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: Spacing.xs) {
                            Text(vendorName).font(.campBody)
                            Image(systemName: "chevron.up.chevron.down").font(.campMicro)
                        }
                        .foregroundStyle(Color.forest)
                    }
                }
            }

            if let minutes = vm.issue.minutesSpent {
                factRow(label: "Time", systemImage: "clock") {
                    Text("\(minutes) min").font(.campBody)
                }
            }

            if let cost = vm.issue.actualCost {
                factRow(label: "Cost", systemImage: "dollarsign.circle") {
                    Text("$\(String(format: "%.2f", cost))").font(.campBody)
                }
            }
        }
    }

    private var vendorName: String {
        guard let id = vm.issue.vendorId else { return "None" }
        return campground.vendors.first { $0.id == id }?.name ?? "None"
    }

    private func factRow<Content: View>(label: String, systemImage: String,
                                        @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Label(label, systemImage: systemImage)
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.55))
            Spacer()
            content()
        }
    }

    // MARK: - Actions

    @ViewBuilder
    private var actions: some View {
        if vm.issue.isOpen && authManager.can.updateStatus {
            VStack(spacing: Spacing.sm) {
                Button {
                    markDone()
                } label: {
                    Label("Mark done", systemImage: "checkmark.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.campPrimary())

                HStack(spacing: Spacing.sm) {
                    if vm.issue.status != .inProgress {
                        Button("Start") {
                            Task {
                                await vm.updateStatus(.inProgress, by: authManager.currentUser)
                                listVM.apply(vm.issue)
                            }
                        }
                        .buttonStyle(.campChip(filled: false))
                    }
                    Menu {
                        ForEach(IssueStatus.open, id: \.self) { status in
                            Button(status.displayName) {
                                Task {
                                    await vm.updateStatus(status, by: authManager.currentUser)
                                    listVM.apply(vm.issue)
                                }
                            }
                        }
                    } label: {
                        Label("Waiting on…", systemImage: "pause.circle")
                            .font(.campLabel)
                    }
                    .buttonStyle(.campChip(filled: false))
                    Spacer()
                }
            }
        }
    }

    /// One tap closes it.
    ///
    /// When there are steps left, this scrolls to them instead: the database closes a
    /// checklisted work order itself when the last step is ticked, and a client that also
    /// closes it is racing the trigger to write the same thing.
    private func markDone() {
        let outstanding = thread.checklist.contains { !$0.isDone }
        if outstanding {
            showingResolveSheet = false
            Haptics.tap()
            vm.errorMessage = "There are steps left. Tick them off and it closes itself."
            return
        }
        if authManager.can.enterActualCost || !thread.checklist.isEmpty {
            showingResolveSheet = true
            return
        }
        Task {
            await vm.resolve(actualCost: nil, by: authManager.currentUser)
            listVM.apply(vm.issue)
            startUndoWindow()
        }
    }

    private func startUndoWindow() {
        justClosed = true
        undoTask?.cancel()
        undoTask = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            justClosed = false
        }
    }

    private func reopen() async {
        await vm.reopen(by: authManager.currentUser)
        listVM.apply(vm.issue)
    }

    private var undoBar: some View {
        HStack {
            Text("Marked done").font(.campMeta)
            Spacer()
            Button("Undo") {
                undoTask?.cancel()
                justClosed = false
                Task { await reopen() }
            }
            .font(.campLabel)
            .buttonStyle(.plain)
            .underline()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .background(Color.forestFill)
        .foregroundStyle(Color.ccCream)
    }

    // MARK: - Steps

    /// Ticking a step is one of the two actions this whole offline layer was built for, so the
    /// tap has to land the same way with or without signal. It does: `IssueThreadViewModel`
    /// updates the row here and hands the write to the mutation queue.
    @ViewBuilder
    private var checklistSection: some View {
        if thread.hasChecklist {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack {
                    Text("Steps").font(.campBodySemibold).foregroundStyle(Color.forest)
                    Spacer()
                    Text("\(thread.doneCount) of \(thread.checklist.count)")
                        .font(.campMeta).foregroundStyle(Color.forest.opacity(0.5))
                }
                // Steps that belong to a room are grouped under it; a template written without
                // sections just renders as one list.
                ForEach(sectionedSteps, id: \.name) { group in
                    if let name = group.name {
                        Text(name)
                            .font(.campLabel)
                            .foregroundStyle(Color.forest.opacity(0.55))
                            .padding(.top, Spacing.xs)
                    }
                    ForEach(group.items) { item in stepRow(item) }
                }

                HStack(spacing: Spacing.sm) {
                    TextField("Add a step…", text: $newStep)
                        .font(.campBody)
                        .textFieldStyle(.roundedBorder)
                    Button("Add") {
                        let text = newStep
                        newStep = ""
                        Task { await thread.addStep(text) }
                    }
                    .buttonStyle(.campChip(filled: false))
                    .disabled(newStep.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var sectionedSteps: [(name: String?, items: [IssueChecklistItem])] {
        let groups = Dictionary(grouping: thread.checklist) { $0.section }
        return groups
            .sorted { ($0.key ?? "") < ($1.key ?? "") }
            .map { (name: $0.key, items: $0.value.sorted { $0.position < $1.position }) }
    }

    private func stepRow(_ item: IssueChecklistItem) -> some View {
        Button {
            Task { await thread.toggle(item, by: authManager.currentUser) }
        } label: {
            HStack(alignment: .top, spacing: Spacing.sm) {
                Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 19))
                    .foregroundStyle(item.isDone ? Color.sage : Color.forest.opacity(0.3))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.text)
                        .font(.campBody)
                        .foregroundStyle(Color.forest.opacity(item.isDone ? 0.45 : 1))
                        .strikethrough(item.isDone, color: Color.forest.opacity(0.35))
                        .multilineTextAlignment(.leading)
                    if let note = item.note, !note.isEmpty {
                        Text(note).font(.campMicro).foregroundStyle(Color.forest.opacity(0.5))
                    }
                    if item.requiresPhoto && item.photoUrl == nil {
                        // Asked for, never enforced: a step that refuses to tick is a step
                        // somebody works around by not using the app.
                        Label("A photo was asked for", systemImage: "camera")
                            .font(.campMicro).foregroundStyle(Color.amberText)
                    }
                    if item.isDone, let who = item.doneByName {
                        Text("\(who)\(item.doneAt.map { " · " + $0.relativeDisplay } ?? "")")
                            .font(.campMicro).foregroundStyle(Color.forest.opacity(0.45))
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, Spacing.xs)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Timeline

    /// Notes and events, oldest first, in one column.
    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text("Timeline").font(.campBodySemibold).foregroundStyle(Color.forest)
                Spacer()
                if thread.isShowingCachedCopy {
                    PendingSyncMark(label: "Showing saved copy")
                }
            }

            if timeline.isEmpty {
                Text("Nothing yet.").font(.campMeta).foregroundStyle(Color.forest.opacity(0.5))
            }

            ForEach(timeline) { entry in
                switch entry.kind {
                case let .comment(comment): commentRow(comment)
                case let .event(activity): eventRow(activity)
                }
            }
        }
    }

    private struct TimelineEntry: Identifiable {
        enum Kind {
            case comment(IssueComment)
            case event(ActivityEntry)
        }
        let id: String
        let at: Date
        let kind: Kind
    }

    private var timeline: [TimelineEntry] {
        let comments = thread.comments.map {
            TimelineEntry(id: "c-\($0.id)", at: $0.createdAt, kind: .comment($0))
        }
        let events = vm.issue.activity.map {
            TimelineEntry(id: "a-\($0.id)", at: $0.createdAt, kind: .event($0))
        }
        return (comments + events).sorted { $0.at < $1.at }
    }

    private func commentRow(_ comment: IssueComment) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            AvatarCircle(initials: comment.initials, size: 22)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(comment.authorName).font(.campMetaSemibold)
                    Text(comment.createdAt.relativeDisplay)
                        .font(.campMeta).foregroundStyle(Color.forest.opacity(0.5))
                    if comment.visibleToReporter {
                        MetaTag(text: "Sent to reporter", systemImage: "arrowshape.turn.up.right")
                    }
                }
                if !comment.body.isEmpty {
                    Text(comment.body)
                        .font(.campSmall)
                        .foregroundStyle(Color.forest.opacity(0.75))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if !comment.photoUrls.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.xs) {
                            ForEach(comment.photoUrls, id: \.self) { url in
                                AsyncImage(url: URL(string: url)) { phase in
                                    if case let .success(img) = phase {
                                        img.resizable().scaledToFill()
                                            .frame(width: 88, height: 88)
                                            .clipped().cornerRadius(Radius.sm)
                                    } else {
                                        Color(.systemGray5)
                                            .frame(width: 88, height: 88).cornerRadius(Radius.sm)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(.vertical, Spacing.xs)
    }

    private func eventRow(_ entry: ActivityEntry) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: "circle.fill")
                .font(.system(size: 5))
                .foregroundStyle(Color.forest.opacity(0.3))
                .padding(.top, 6)
            Text("\(entry.action) · \(entry.createdAt.relativeDisplay)")
                .font(.campMicro)
                .foregroundStyle(Color.forest.opacity(0.5))
            Spacer(minLength: 0)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            if let commentPhoto {
                HStack {
                    Image(uiImage: commentPhoto)
                        .resizable().scaledToFill()
                        .frame(width: 56, height: 56)
                        .clipped().cornerRadius(Radius.sm)
                    Button("Remove") { self.commentPhoto = nil }
                        .buttonStyle(.campChip(filled: false))
                    Spacer()
                }
            }
            if !mentioned.isEmpty {
                Text("Notifying: " + mentionNames)
                    .font(.campMicro).foregroundStyle(Color.forest.opacity(0.6))
            }

            HStack(spacing: Spacing.sm) {
                TextField("Add a note…", text: $draftComment, axis: .vertical)
                    .font(.campBody)
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Color.surfaceRaised, in: .rect(cornerRadius: Radius.sm))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.sm)
                            .strokeBorder(Color.border, lineWidth: 1)
                    )
                Button { isPickingCommentPhoto = true } label: {
                    Image(systemName: "camera").font(.system(size: 18))
                }
                .accessibilityLabel("Attach a photo")
                Button { showingMentionPicker = true } label: {
                    Image(systemName: "at").font(.system(size: 18))
                }
                .accessibilityLabel("Notify someone")
                Button {
                    send()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(canSend ? Color.sage : Color.forest.opacity(0.25))
                }
                .disabled(!canSend)
            }

            // Only a guest report has a reporter to reply to, and internal stays the default:
            // everything else is a note the camp writes to itself.
            if vm.issue.isPublicReport {
                Toggle("Send this to the reporter", isOn: $replyToReporter)
                    .font(.campMeta)
            }
        }
    }

    private var mentionNames: String {
        authManager.members.filter { mentioned.contains($0.id) }
            .map(\.name).joined(separator: ", ")
    }

    private var canSend: Bool {
        !draftComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || commentPhoto != nil
    }

    private func send() {
        let text = draftComment
        let photo = commentPhoto
        let people = Array(mentioned)
        let toReporter = replyToReporter
        draftComment = ""
        commentPhoto = nil
        mentioned = []
        replyToReporter = false
        Task {
            await thread.postComment(text, by: authManager.currentUser,
                                     visibleToReporter: toReporter,
                                     mentions: people, photo: photo)
        }
    }
}

/// Closing out: what it cost, and how long it took. Both optional, always.
private struct ResolveSheet: View {
    @Environment(\.dismiss) private var dismiss
    let canEnterCost: Bool
    let onResolve: (Double?, Int?) -> Void
    @State private var costInput = ""
    @State private var minutesInput = ""

    var body: some View {
        NavigationStack {
            Form {
                if canEnterCost {
                    Section("What it cost") {
                        TextField("$0.00", text: $costInput).keyboardType(.decimalPad)
                    }
                }
                Section("How long it took") {
                    TextField("Minutes", text: $minutesInput).keyboardType(.numberPad)
                }
                Section {
                    Button("Mark done") {
                        onResolve(Double(costInput), Int(minutesInput))
                        dismiss()
                    }
                    .foregroundColor(.sage)
                } footer: {
                    Text("Both are optional. Closing a job never needs a field filled in.")
                }
            }
            .navigationTitle("Close it out")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

/// The admin-written checklists that fit this crew.
private struct TemplatePickerSheet: View {
    @EnvironmentObject private var campground: CampgroundStore
    @Environment(\.dismiss) private var dismiss
    let trade: String
    let onPick: (WorkChecklistTemplate) -> Void

    var body: some View {
        NavigationStack {
            List(campground.templates(for: trade)) { template in
                Button {
                    onPick(template); dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(template.name).font(.campBody)
                        Text("\(template.items.count) steps")
                            .font(.campMicro).foregroundStyle(Color.forest.opacity(0.5))
                    }
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Add a checklist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

/// Who to pull into this thread.
///
/// Naming somebody who cannot see the work order is a real case -- the web offers to grant them
/// access on the spot. Here the mention is still recorded, and the note still reaches everyone
/// who can already see it; widening access is an admin action and stays on the web.
private struct MentionPickerSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss
    @Binding var selected: Set<String>

    var body: some View {
        NavigationStack {
            List(authManager.members) { member in
                Button {
                    if selected.contains(member.id) { selected.remove(member.id) }
                    else { selected.insert(member.id) }
                } label: {
                    HStack {
                        AvatarCircle(initials: member.initials, size: 26)
                        Text(member.name).font(.campBody)
                        Spacer()
                        if selected.contains(member.id) {
                            Image(systemName: "checkmark").foregroundStyle(Color.sage)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Notify")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}
