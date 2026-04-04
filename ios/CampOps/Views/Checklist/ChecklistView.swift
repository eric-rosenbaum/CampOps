import SwiftUI

struct ChecklistView: View {
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var vm: ChecklistViewModel
    @State private var showingAddTask = false
    @State private var showingNewSeason = false
    @State private var selectedPhase: ChecklistPhase = .pre

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.tasks.isEmpty {
                    ProgressView("Loading...").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.season == nil {
                    noSeasonState
                } else {
                    taskList
                }
            }
            .navigationTitle("Pre/Post Camp")
            .toolbar {
                if userManager.can.createTask, vm.season != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showingAddTask = true } label: { Image(systemName: "plus") }
                    }
                }
                if userManager.can.activateNewSeason {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button { showingNewSeason = true } label: {
                            Label("New Season", systemImage: "calendar.badge.plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingAddTask) {
                AddTaskView().environmentObject(userManager).environmentObject(vm)
            }
            .sheet(isPresented: $showingNewSeason) {
                NewSeasonView().environmentObject(userManager).environmentObject(vm)
            }
        }
        .task { await vm.load() }
    }

    private var taskList: some View {
        VStack(spacing: 0) {
            if let season = vm.season {
                HStack {
                    Image(systemName: "sun.max.fill").foregroundColor(.sage)
                    Text(season.name).font(.subheadline.weight(.semibold))
                    Text("·").foregroundColor(.secondary)
                    Text("\(season.openingDate.localDateDisplay) – \(season.closingDate.localDateDisplay)")
                        .font(.caption).foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, Spacing.lg).padding(.vertical, Spacing.sm)
                .background(Color(.systemGroupedBackground))
            }
            Picker("Phase", selection: $selectedPhase) {
                Text("Pre-camp").tag(ChecklistPhase.pre)
                Text("Post-camp").tag(ChecklistPhase.post)
            }
            .pickerStyle(.segmented).padding(Spacing.md)

            ScrollView {
                LazyVStack(spacing: Spacing.sm) {
                    let tasks = selectedPhase == .pre ? vm.preTasks : vm.postTasks
                    if tasks.isEmpty {
                        Text("No \(selectedPhase == .pre ? "pre" : "post")-camp tasks")
                            .font(.subheadline).foregroundColor(.secondary).padding(.top, Spacing.xl)
                    } else {
                        ForEach(tasks) { task in
                            NavigationLink(value: task.id) { ChecklistTaskRow(task: task) }.buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, Spacing.md).padding(.bottom, Spacing.md)
            }
            .navigationDestination(for: String.self) { taskId in
                ChecklistDetailView(taskId: taskId).environmentObject(userManager).environmentObject(vm)
            }
        }
    }

    private var noSeasonState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "calendar.badge.exclamationmark").font(.system(size: 48)).foregroundColor(.sageLight)
            Text("No Active Season").font(.headline)
            Text("Create a new season to start adding pre/post-camp tasks.")
                .font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.xl)
            if userManager.can.activateNewSeason {
                Button("Create Season") { showingNewSeason = true }
                    .buttonStyle(.borderedProminent).tint(.sage)
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
