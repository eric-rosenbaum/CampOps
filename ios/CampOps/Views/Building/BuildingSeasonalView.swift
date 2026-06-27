import SwiftUI

private func phaseTitle(_ phase: SeasonalPhase) -> String {
    switch phase {
    case .opening:  return "Spring opening"
    case .inSeason: return "In-season checks"
    case .closing:  return "Fall closing / winterization"
    }
}

struct BuildingSeasonalView: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @State private var sheet: BuildingSheetRoute?

    var body: some View {
        List {
            Section {
                let p = vm.seasonalProgress
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(p.done) of \(p.total) tasks complete").font(.subheadline).fontWeight(.medium)
                    ProgressView(value: p.total > 0 ? Double(p.done) / Double(p.total) : 0).tint(.sage)
                }
                .padding(.vertical, 4)
            }

            ForEach(SeasonalPhase.allCases) { phase in
                Section {
                    let tasks = vm.tasksForPhase(phase)
                    if tasks.isEmpty {
                        Text("No tasks yet").font(.caption).foregroundColor(.secondary)
                    }
                    ForEach(tasks) { task in
                        taskRow(task)
                    }
                    Button { sheet = .addSeasonal(phase: phase) } label: {
                        Label("Add task", systemImage: "plus").font(.caption)
                    }
                } header: {
                    Text(phaseTitle(phase))
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Seasonal")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { route in buildingSheet(route) }
    }

    private func taskRow(_ task: BuildingSeasonalTask) -> some View {
        let buildingName = task.buildingId.flatMap { id in vm.buildings.first { $0.id == id }?.name } ?? "Camp-wide"
        return HStack(alignment: .top, spacing: 10) {
            Button {
                Task { await vm.toggleSeasonalTask(id: task.id, userName: AuthManager.shared.currentUser.name) }
            } label: {
                Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(task.isComplete ? .sage : .secondary)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .strikethrough(task.isComplete)
                    .foregroundColor(task.isComplete ? .secondary : .primary)
                if let d = task.detail, !d.isEmpty {
                    Text(d).font(.caption).foregroundColor(.secondary)
                }
                Text(buildingName)
                    .font(.caption2).fontWeight(.medium)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.creamDark).clipShape(Capsule())
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { sheet = .editSeasonal(task) }
        .swipeActions {
            Button(role: .destructive) { Task { await vm.deleteSeasonalTask(id: task.id) } } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}

// MARK: - Add / edit seasonal task

struct BuildingSeasonalTaskSheet: View {
    @EnvironmentObject private var vm: BuildingViewModel
    @Environment(\.dismiss) private var dismiss
    var editing: BuildingSeasonalTask? = nil
    var defaultPhase: SeasonalPhase = .closing

    @State private var title = ""
    @State private var detail = ""
    @State private var phase: SeasonalPhase = .closing
    @State private var buildingId: String? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Task (e.g. Blow out water lines)", text: $title)
                    TextField("Detail (optional)", text: $detail, axis: .vertical).lineLimit(2...4)
                }
                Section {
                    Picker("Phase", selection: $phase) {
                        ForEach(SeasonalPhase.allCases) { Text(phaseTitle($0)).tag($0) }
                    }
                    Picker("Building", selection: $buildingId) {
                        Text("Camp-wide").tag(String?.none)
                        ForEach(vm.sortedBuildings) { Text($0.name).tag(String?.some($0.id)) }
                    }
                }
            }
            .navigationTitle(editing == nil ? "Add task" : "Edit task")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let e = editing {
                    title = e.title; detail = e.detail ?? ""; phase = e.phase; buildingId = e.buildingId
                } else {
                    phase = defaultPhase
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Add" : "Save") { save() }.disabled(title.isEmpty)
                }
            }
        }
    }

    private func save() {
        let now = Date()
        let t = BuildingSeasonalTask(
            id: editing?.id ?? UUID().uuidString, buildingId: buildingId,
            title: title, detail: detail.isEmpty ? nil : detail, phase: phase,
            isComplete: editing?.isComplete ?? false,
            completedBy: editing?.completedBy, completedDate: editing?.completedDate,
            assignees: editing?.assignees ?? [],
            sortOrder: editing?.sortOrder ?? vm.tasksForPhase(phase).count,
            createdAt: editing?.createdAt ?? now, updatedAt: now
        )
        Task { editing == nil ? await vm.addSeasonalTask(t) : await vm.updateSeasonalTask(t); dismiss() }
    }
}
