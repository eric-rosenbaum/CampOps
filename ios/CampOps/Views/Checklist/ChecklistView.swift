import SwiftUI

struct ChecklistView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: ChecklistViewModel
    @EnvironmentObject private var poolVM: PoolViewModel
    @State private var showingAddTask = false
    @State private var selectedPhase: ChecklistPhase = .pre

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.tasks.isEmpty {
                    ProgressView("Loading...").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    taskList
                }
            }
            .navigationTitle("Pre/Post Camp")
            .toolbar {
                ToolbarItem(placement: .primaryAction) { UserMenuButton() }
                if authManager.can.createTask {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showingAddTask = true } label: { Image(systemName: "plus") }
                    }
                }
            }
            .sheet(isPresented: $showingAddTask) {
                AddTaskView().environmentObject(authManager).environmentObject(vm)
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
                    // Pool & Waterfront seasonal tasks
                    PoolSeasonalSection(
                        phase: selectedPhase,
                        poolVM: poolVM,
                        currentUserName: authManager.currentUser.name
                    )
                }
                .padding(.horizontal, Spacing.md).padding(.bottom, Spacing.md)
            }
            .navigationDestination(for: String.self) { taskId in
                ChecklistDetailView(taskId: taskId).environmentObject(authManager).environmentObject(vm)
            }
        }
    }

}

// MARK: - Pool seasonal section

struct PoolSeasonalSection: View {
    let phase: ChecklistPhase
    @ObservedObject var poolVM: PoolViewModel
    let currentUserName: String

    @State private var isExpanded = true

    /// Map checklist phase to pool seasonal phase
    private var poolPhase: SeasonalPhase {
        phase == .pre ? .opening : .closing
    }

    /// All active pools
    private var activePools: [CampPool] {
        poolVM.pools.filter { $0.isActive }.sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Pools that have tasks for the relevant phase
    private var poolsWithTasks: [(pool: CampPool, tasks: [PoolSeasonalTask])] {
        activePools.compactMap { pool in
            let tasks = poolVM.seasonalTasks
                .filter { $0.poolId == pool.id && $0.phase == poolPhase }
                .sorted { $0.sortOrder < $1.sortOrder }
            return tasks.isEmpty ? nil : (pool, tasks)
        }
    }

    var body: some View {
        if poolsWithTasks.isEmpty { return AnyView(EmptyView()) }

        let totalDone = poolsWithTasks.flatMap { $0.tasks }.filter { $0.isComplete }.count
        let totalAll  = poolsWithTasks.flatMap { $0.tasks }.count

        return AnyView(
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Section header
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
                } label: {
                    HStack {
                        Image(systemName: "water.waves")
                            .font(.subheadline)
                            .foregroundColor(.sage)
                        Text("Pool & Waterfront")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.forest)
                        Spacer()
                        progressBadge(done: totalDone, total: totalAll)
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .buttonStyle(.plain)

                if isExpanded {
                    ForEach(poolsWithTasks, id: \.pool.id) { entry in
                        PoolSeasonalPoolGroup(
                            pool: entry.pool,
                            tasks: entry.tasks,
                            currentUserName: currentUserName,
                            onToggle: { id in
                                Task { await poolVM.toggleSeasonalTask(id: id, userName: currentUserName) }
                            }
                        )
                    }
                }
            }
            .padding(.top, Spacing.sm)
        )
    }

    private func progressBadge(done: Int, total: Int) -> some View {
        let isComplete = done == total && total > 0
        let text = "\(done)/\(total)"
        return Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 3)
            .background(isComplete ? Color.greenBg : Color(.systemGray5))
            .foregroundColor(isComplete ? Color.greenText : .secondary)
            .clipShape(Capsule())
    }
}

// MARK: - Pool group within section

private struct PoolSeasonalPoolGroup: View {
    let pool: CampPool
    let tasks: [PoolSeasonalTask]
    let currentUserName: String
    let onToggle: (String) -> Void

    @State private var isExpanded = true

    private var doneTasks: Int { tasks.filter { $0.isComplete }.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Pool name header
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: pool.type.icon)
                        .font(.caption)
                        .foregroundColor(.sage)
                    Text(pool.name)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.forest)
                    Spacer()
                    Text("\(doneTasks)/\(tasks.count)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                        .foregroundColor(Color(.systemGray3))
                }
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 6)
                .background(Color(.systemGray6))
                .cornerRadius(Radius.sm)
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(spacing: 0) {
                    ForEach(Array(tasks.enumerated()), id: \.element.id) { idx, task in
                        PoolChecklistTaskRow(
                            task: task,
                            isLast: idx == tasks.count - 1,
                            onToggle: { onToggle(task.id) }
                        )
                    }
                }
                .background(Color(.systemBackground))
                .cornerRadius(Radius.sm)
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .stroke(Color.border, lineWidth: 1)
                )
            }
        }
    }
}

// MARK: - Individual pool seasonal task row in checklist

private struct PoolChecklistTaskRow: View {
    let task: PoolSeasonalTask
    let isLast: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                Button(action: onToggle) {
                    Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 18))
                        .foregroundColor(task.isComplete ? .sage : Color(.systemGray3))
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(task.title)
                        .font(.subheadline)
                        .foregroundColor(task.isComplete ? .secondary : .forest)
                        .strikethrough(task.isComplete)
                        .fixedSize(horizontal: false, vertical: true)

                    if let detail = task.detail {
                        Text(detail).font(.caption).foregroundColor(.secondary)
                    }

                    if task.isComplete, let date = task.completedDate, let by = task.completedBy {
                        Text("Done \(date.localDateDisplay) by \(by)")
                            .font(.caption2)
                            .foregroundColor(.greenText)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 8)
            .opacity(task.isComplete ? 0.65 : 1)

            if !isLast {
                Divider().padding(.leading, Spacing.sm + 28)
            }
        }
    }
}
