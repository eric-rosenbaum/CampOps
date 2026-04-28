import SwiftUI

enum AssetDetailTab { case overview, checkouts, service, maintenance }

struct AssetDetailSheet: View {
    let assetId: String
    @EnvironmentObject private var vm: AssetViewModel
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var activeTab: AssetDetailTab = .overview
    @State private var checkingOut = false
    @State private var returningCheckout: AssetCheckout? = nil
    @State private var editingCheckout: AssetCheckout? = nil
    @State private var loggingService = false
    @State private var editingServiceRecord: AssetServiceRecord? = nil
    @State private var addingTask: AssetMaintenancePhase? = nil
    @State private var editingTask: AssetMaintenanceTask? = nil

    var asset: CampAsset? { vm.assets.first { $0.id == assetId } }

    var body: some View {
        NavigationStack {
            Group {
                if let asset {
                    VStack(spacing: 0) {
                        assetHeader(asset: asset)
                        tabBar
                        tabContent(asset: asset)
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle(asset?.name ?? "Asset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if asset?.status == .available {
                            Button { checkingOut = true } label: {
                                Label("Check Out", systemImage: "arrow.up.right")
                            }
                        }
                        Button { loggingService = true } label: {
                            Label("Log Service", systemImage: "wrench")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .sheet(isPresented: $checkingOut) {
            if let asset {
                CheckoutAssetSheet(asset: asset, editing: nil,
                    onSave: { await vm.checkOutAsset($0) })
                    .environmentObject(authManager)
            }
        }
        .sheet(item: $returningCheckout) { co in
            if let asset {
                ReturnAssetSheet(asset: asset, checkout: co,
                    onSave: { await vm.returnAsset($0) })
                    .environmentObject(authManager)
            }
        }
        .sheet(item: $editingCheckout) { co in
            if let asset {
                CheckoutAssetSheet(asset: asset, editing: co,
                    onSave: { await vm.updateCheckout($0) })
                    .environmentObject(authManager)
            }
        }
        .sheet(isPresented: $loggingService) {
            if let asset {
                LogAssetServiceSheet(asset: asset, editing: nil,
                    onSave: { await vm.addServiceRecord($0) })
                    .environmentObject(authManager)
            }
        }
        .sheet(item: $editingServiceRecord) { record in
            if let asset {
                LogAssetServiceSheet(asset: asset, editing: record,
                    onSave: { await vm.updateServiceRecord($0) })
                    .environmentObject(authManager)
            }
        }
        .sheet(item: $addingTask) { phase in
            if let asset {
                AddMaintenanceTaskSheet(
                    assetId: asset.id,
                    defaultPhase: phase,
                    editing: nil,
                    sortOrder: vm.maintenanceTasks(for: asset.id).count,
                    onSave: { await vm.addMaintenanceTask($0) }
                )
            }
        }
        .sheet(item: $editingTask) { task in
            AddMaintenanceTaskSheet(
                assetId: assetId,
                defaultPhase: task.phase,
                editing: task,
                sortOrder: task.sortOrder,
                onSave: { await vm.updateMaintenanceTask($0) }
            )
        }
    }

    // MARK: - Header

    @ViewBuilder func assetHeader(asset: CampAsset) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.cream)
                    .frame(width: 44, height: 44)
                Image(systemName: asset.category.icon)
                    .font(.system(size: 20))
                    .foregroundStyle(Color.sage)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(subtypeDisplayNames[asset.subtype] ?? asset.subtype)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.forest.opacity(0.5))
                if let make = asset.make, let model = asset.model {
                    Text("\(make) \(model)\(asset.year.map { " \($0)" } ?? "")")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.7))
                }
            }
            Spacer()
            AssetStatusBadge(status: asset.status)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.cream)
        Divider()
    }

    // MARK: - Tab bar

    @ViewBuilder var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach([AssetDetailTab.overview, .checkouts, .service, .maintenance], id: \.hashValue) { tab in
                    Button {
                        activeTab = tab
                    } label: {
                        Text(tabTitle(tab))
                            .font(.system(size: 14))
                            .fontWeight(activeTab == tab ? .semibold : .regular)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .foregroundStyle(activeTab == tab ? Color.sage : Color.forest.opacity(0.5))
                            .overlay(alignment: .bottom) {
                                if activeTab == tab {
                                    Rectangle().fill(Color.sage).frame(height: 2)
                                }
                            }
                    }
                }
            }
        }
        Divider()
    }

    func tabTitle(_ tab: AssetDetailTab) -> String {
        switch tab {
        case .overview:    return "Overview"
        case .checkouts:   return "Checkouts"
        case .service:     return "Service"
        case .maintenance: return "Maintenance"
        }
    }

    // MARK: - Tab content

    @ViewBuilder
    func tabContent(asset: CampAsset) -> some View {
        switch activeTab {
        case .overview:
            OverviewTab(asset: asset, onCheckout: asset.status == .available ? { checkingOut = true } : nil)
        case .checkouts:
            CheckoutsTab(
                asset: asset,
                checkouts: vm.checkouts(for: assetId),
                activeCheckout: vm.activeCheckout(for: assetId),
                onReturn: { returningCheckout = $0 },
                onEditCheckout: { editingCheckout = $0 },
                onDeleteCheckout: { id in Task { await vm.deleteCheckout(id: id) } },
                onNewCheckout: { checkingOut = true }
            )
        case .service:
            ServiceTab(
                asset: asset,
                records: vm.serviceRecords(for: assetId),
                onAdd: { loggingService = true },
                onEdit: { editingServiceRecord = $0 },
                onDelete: { id in Task { await vm.deleteServiceRecord(id: id) } }
            )
        case .maintenance:
            MaintenanceTab(
                assetId: assetId,
                tasks: vm.maintenanceTasks(for: assetId),
                onAdd: { addingTask = $0 },
                onEdit: { editingTask = $0 },
                onToggle: { id in Task { await vm.toggleMaintenanceTask(id: id, userName: authManager.currentUser.name) } },
                onDelete: { id in Task { await vm.deleteMaintenanceTask(id: id) } }
            )
        }
    }
}

// MARK: - Overview Tab

private struct OverviewTab: View {
    let asset: CampAsset
    var onCheckout: (() -> Void)? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let onCheckout {
                    Button(action: onCheckout) {
                        Label("Check Out", systemImage: "arrow.up.right")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundStyle(.white)
                            .background(Color.sage)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
                if asset.tracksOdometer || asset.tracksHours {
                    DetailSection(title: "Usage") {
                        if asset.tracksOdometer, let odo = asset.currentOdometer {
                            InfoRow(label: "Odometer", value: "\(Int(odo).formatted()) mi")
                        }
                        if asset.tracksHours, let hrs = asset.currentHours {
                            InfoRow(label: "Hours", value: "\(hrs.formatted()) hrs")
                        }
                    }
                }

                DetailSection(title: "Location & Storage") {
                    InfoRow(label: "Storage", value: asset.storageLocation)
                }

                if asset.make != nil || asset.model != nil || asset.year != nil || asset.serialNumber != nil {
                    DetailSection(title: "Identification") {
                        if let make = asset.make { InfoRow(label: "Make", value: make) }
                        if let model = asset.model { InfoRow(label: "Model", value: model) }
                        if let year = asset.year { InfoRow(label: "Year", value: String(year)) }
                        if let serial = asset.serialNumber { InfoRow(label: "Serial / VIN", value: serial) }
                        if let plate = asset.licensePlate { InfoRow(label: "License plate", value: plate) }
                        if let exp = asset.registrationExpiry { InfoRow(label: "Reg. expiry", value: exp) }
                    }
                }

                if asset.category == .watercraft {
                    DetailSection(title: "Watercraft") {
                        if let hull = asset.hullId { InfoRow(label: "Hull ID", value: hull) }
                        if let uscg = asset.uscgRegistration { InfoRow(label: "USCG Reg.", value: uscg) }
                        if let exp = asset.uscgRegistrationExpiry { InfoRow(label: "USCG Expiry", value: exp) }
                        if let cap = asset.capacity { InfoRow(label: "Capacity", value: "\(cap) persons") }
                        if let motor = asset.motorType { InfoRow(label: "Motor type", value: motor) }
                        if let lj = asset.hasLifejackets {
                            InfoRow(label: "Lifejackets", value: lj ? "Yes (\(asset.lifejacketCount ?? 0))" : "No")
                        }
                    }
                }

                if let notes = asset.notes, !notes.isEmpty {
                    DetailSection(title: "Notes") {
                        Text(notes)
                            .font(.system(size: 14))
                            .foregroundStyle(Color.forest.opacity(0.7))
                    }
                }
            }
            .padding(16)
        }
    }
}

// MARK: - Checkouts Tab

private struct CheckoutsTab: View {
    let asset: CampAsset
    let checkouts: [AssetCheckout]
    let activeCheckout: AssetCheckout?
    let onReturn: (AssetCheckout) -> Void
    let onEditCheckout: (AssetCheckout) -> Void
    let onDeleteCheckout: (String) -> Void
    let onNewCheckout: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let co = activeCheckout {
                    ActiveCheckoutCard(checkout: co,
                        onReturn: { onReturn(co) },
                        onEdit: { onEditCheckout(co) },
                        onDelete: { onDeleteCheckout(co.id) })
                } else if asset.status == .available {
                    Button { onNewCheckout() } label: {
                        Label("Check out this asset", systemImage: "arrow.up.right")
                            .font(.system(size: 14))
                            .fontWeight(.medium)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.sage)
                            .foregroundStyle(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }

                let history = checkouts.filter { $0.returnedAt != nil }
                if !history.isEmpty {
                    Text("History")
                        .font(.system(size: 14))
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.forest)
                        .padding(.top, 4)
                    ForEach(history) { co in
                        HistoricalCheckoutRow(checkout: co,
                            onEdit: { onEditCheckout(co) },
                            onDelete: { onDeleteCheckout(co.id) })
                    }
                }

                if checkouts.isEmpty {
                    EmptyStateView(icon: "arrow.up.right", message: "No checkouts yet")
                }
            }
            .padding(16)
        }
    }
}

private struct ActiveCheckoutCard: View {
    let checkout: AssetCheckout
    let onReturn: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    var isOverdue: Bool { checkout.expectedReturnAt < Date() }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Currently checked out", systemImage: "arrow.up.right")
                    .font(.system(size: 12))
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.blue)
                Spacer()
                if isOverdue {
                    Label("Overdue", systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.priorityUrgent)
                }
            }
            InfoRow(label: "Checked out by", value: checkout.checkedOutBy)
            InfoRow(label: "Purpose", value: checkout.purpose)
            InfoRow(label: isOverdue ? "Was due" : "Expected return",
                value: checkout.expectedReturnAt.readingTimeDisplay)
            if let notes = checkout.checkoutNotes, !notes.isEmpty {
                InfoRow(label: "Notes", value: notes)
            }

            HStack(spacing: 8) {
                Button { onReturn() } label: {
                    Label("Return", systemImage: "arrow.down.left")
                        .font(.system(size: 12))
                        .fontWeight(.medium)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.sage)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button { onEdit() } label: {
                    Image(systemName: "pencil").foregroundStyle(Color.forest.opacity(0.4))
                }
                Button { onDelete() } label: {
                    Image(systemName: "trash").foregroundStyle(Color.forest.opacity(0.4))
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isOverdue ? Color.priorityUrgent.opacity(0.4) : Color.blue.opacity(0.3), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct HistoricalCheckoutRow: View {
    let checkout: AssetCheckout
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(checkout.checkedOutBy)
                    .font(.system(size: 14)).fontWeight(.medium).foregroundStyle(Color.forest)
                Text(checkout.purpose)
                    .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.5))
                if let returned = checkout.returnedAt {
                    Text("Returned \(returned.readingTimeDisplay)")
                        .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.4))
                }
                if let cond = checkout.returnCondition, cond != .noIssues {
                    Text(cond.displayName)
                        .font(.system(size: 12)).foregroundStyle(Color.priorityHigh)
                }
            }
            Spacer()
            HStack(spacing: 4) {
                Button { onEdit() } label: {
                    Image(systemName: "pencil").font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.3))
                }
                Button { onDelete() } label: {
                    Image(systemName: "trash").font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.3))
                }
            }
        }
        .padding(12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Service Tab

private struct ServiceTab: View {
    let asset: CampAsset
    let records: [AssetServiceRecord]
    let onAdd: () -> Void
    let onEdit: (AssetServiceRecord) -> Void
    let onDelete: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Button { onAdd() } label: {
                    Label("Log service record", systemImage: "plus")
                        .font(.system(size: 14)).fontWeight(.medium)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Color.sage).foregroundStyle(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if records.isEmpty {
                    EmptyStateView(icon: "wrench.fill", message: "No service records")
                } else {
                    ForEach(records) { record in
                        ServiceRecordRow(record: record,
                            onEdit: { onEdit(record) },
                            onDelete: { onDelete(record.id) })
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct ServiceRecordRow: View {
    let record: AssetServiceRecord
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(record.serviceType.displayName)
                        .font(.system(size: 14)).fontWeight(.medium).foregroundStyle(Color.forest)
                    if record.isInspection {
                        Text("Inspection")
                            .font(.system(size: 12)).padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color.greenBg).foregroundStyle(Color.greenText)
                            .clipShape(Capsule())
                    }
                }
                Text(record.datePerformed + " · " + record.performedBy)
                    .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.5))
                if let cost = record.cost {
                    Text("$\(String(format: "%.2f", cost))")
                        .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.4))
                }
                if let desc = record.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.4)).lineLimit(2)
                }
            }
            Spacer()
            HStack(spacing: 4) {
                Button { onEdit() } label: {
                    Image(systemName: "pencil").font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.3))
                }
                Button { onDelete() } label: {
                    Image(systemName: "trash").font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.3))
                }
            }
        }
        .padding(12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Maintenance Tab

private struct MaintenanceTab: View {
    let assetId: String
    let tasks: [AssetMaintenanceTask]
    let onAdd: (AssetMaintenancePhase) -> Void
    let onEdit: (AssetMaintenanceTask) -> Void
    let onToggle: (String) -> Void
    let onDelete: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ForEach(AssetMaintenancePhase.allCases) { phase in
                    let phaseTasks = tasks.filter { $0.phase == phase }.sorted { $0.sortOrder < $1.sortOrder }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(phase.displayName)
                                .font(.system(size: 14)).fontWeight(.semibold).foregroundStyle(Color.forest)
                            Spacer()
                            Button { onAdd(phase) } label: {
                                Image(systemName: "plus.circle").foregroundStyle(Color.sage)
                            }
                        }
                        if phaseTasks.isEmpty {
                            Text("No tasks")
                                .font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.3)).padding(.leading, 4)
                        } else {
                            ForEach(phaseTasks) { task in
                                MaintenanceTaskRow(task: task,
                                    onToggle: { onToggle(task.id) },
                                    onEdit: { onEdit(task) },
                                    onDelete: { onDelete(task.id) })
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct MaintenanceTaskRow: View {
    let task: AssetMaintenanceTask
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Button { onToggle() } label: {
                Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.isComplete ? Color.sage : Color.forest.opacity(0.3))
                    .font(.system(size: 20))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.system(size: 14))
                    .foregroundStyle(task.isComplete ? Color.forest.opacity(0.4) : Color.forest)
                    .strikethrough(task.isComplete)
                if let detail = task.detail, !detail.isEmpty {
                    Text(detail).font(.system(size: 12)).foregroundStyle(Color.forest.opacity(0.4))
                }
                if task.isComplete, let by = task.completedBy {
                    Text("Done by \(by)\(task.completedDate.map { " · \($0)" } ?? "")")
                        .font(.system(size: 12)).foregroundStyle(Color.sage.opacity(0.8))
                }
            }
            Spacer()
            HStack(spacing: 4) {
                Button { onEdit() } label: {
                    Image(systemName: "pencil").font(.system(size: 13))
                        .foregroundStyle(Color.forest.opacity(0.3))
                }
                Button { onDelete() } label: {
                    Image(systemName: "trash").font(.system(size: 13))
                        .foregroundStyle(Color.forest.opacity(0.3))
                }
            }
        }
        .padding(12)
        .background(task.isComplete ? Color.cream : Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Shared helpers

private struct DetailSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12)).fontWeight(.semibold)
                .foregroundStyle(Color.forest.opacity(0.4))
                .textCase(.uppercase).kerning(0.5)
            VStack(alignment: .leading, spacing: 6) {
                content()
            }
            .padding(12)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

private struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 14)).foregroundStyle(Color.forest.opacity(0.5))
                .frame(width: 130, alignment: .leading)
            Text(value).font(.system(size: 14)).foregroundStyle(Color.forest)
            Spacer()
        }
    }
}

private struct EmptyStateView: View {
    let icon: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 32))
                .foregroundStyle(Color.forest.opacity(0.15))
            Text(message).font(.system(size: 14)).foregroundStyle(Color.forest.opacity(0.3))
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }
}
