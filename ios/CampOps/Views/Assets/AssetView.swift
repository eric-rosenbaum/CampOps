import SwiftUI

enum AssetTab: Equatable { case all, checkedOut }

struct AssetView: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var vm: AssetViewModel
    @State private var selectedCategory: AssetCategory? = nil
    @State private var activeTab: AssetTab = .all
    @State private var editingAsset: CampAsset? = nil
    @State private var detailAsset: CampAsset? = nil
    @State private var checkoutAsset: CampAsset? = nil

    var displayedAssets: [CampAsset] {
        vm.assets(for: selectedCategory).sorted { $0.name < $1.name }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                categoryPills
                if activeTab == .all {
                    assetList
                } else {
                    checkedOutList
                }
            }
            .navigationTitle("Assets & Vehicles")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) { UserMenuButton() }
            }
        }
        .sheet(item: $editingAsset) { asset in
            AddAssetSheet(editing: asset, onSave: { await vm.updateAsset($0) })
                .environmentObject(authManager)
        }
        .sheet(item: $detailAsset) { asset in
            AssetDetailSheet(assetId: asset.id)
                .environmentObject(vm)
                .environmentObject(authManager)
        }
        .sheet(item: $checkoutAsset) { asset in
            CheckoutAssetSheet(asset: asset, editing: nil,
                onSave: { await vm.checkOutAsset($0) })
                .environmentObject(authManager)
        }
        .task { await vm.load() }
    }

    // MARK: - Category pills

    var categoryPills: some View {
        VStack(spacing: 0) {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    AssetCategoryPill(title: "All", isSelected: selectedCategory == nil) {
                        selectedCategory = nil
                    }
                    ForEach(AssetCategory.allCases) { category in
                        AssetCategoryPill(
                            title: category.displayName,
                            icon: category.icon,
                            isSelected: selectedCategory == category
                        ) {
                            selectedCategory = category
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }

            HStack(spacing: 0) {
                TabPill(title: "All Assets (\(vm.activeAssets.count))", isSelected: activeTab == .all) {
                    activeTab = .all
                }
                TabPill(title: "Checked Out (\(vm.currentlyCheckedOut.count))", isSelected: activeTab == .checkedOut) {
                    activeTab = .checkedOut
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(Color.cream)
        Divider()
        } // outer VStack
    }

    // MARK: - Asset list

    var assetList: some View {
        Group {
            if vm.isLoading && vm.assets.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if displayedAssets.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "car.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(Color.forest.opacity(0.2))
                    Text("No assets")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.4))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(displayedAssets) { asset in
                            AssetCard(asset: asset, checkout: vm.activeCheckout(for: asset.id))
                                .onTapGesture { detailAsset = asset }
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    // MARK: - Checked out list

    var checkedOutList: some View {
        Group {
            if vm.currentlyCheckedOut.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 36))
                        .foregroundStyle(Color.forest.opacity(0.2))
                    Text("No assets currently checked out")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.forest.opacity(0.4))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.currentlyCheckedOut, id: \.checkout.id) { pair in
                            CheckedOutCard(asset: pair.asset, checkout: pair.checkout)
                                .onTapGesture { detailAsset = pair.asset }
                        }
                    }
                    .padding(16)
                }
            }
        }
    }
}

// MARK: - Asset card

struct AssetCard: View {
    let asset: CampAsset
    let checkout: AssetCheckout?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(asset.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.forest)
                    Text(subtypeDisplayNames[asset.subtype] ?? asset.subtype)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.forest.opacity(0.5))
                }
                Spacer()
                AssetStatusBadge(status: asset.status)
            }

            if asset.tracksOdometer || asset.tracksHours || !asset.storageLocation.isEmpty {
                HStack(spacing: 12) {
                    if !asset.storageLocation.isEmpty {
                        Label(asset.storageLocation, systemImage: "mappin")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.forest.opacity(0.4))
                    }
                    if asset.tracksOdometer, let odo = asset.currentOdometer {
                        Text("\(Int(odo).formatted()) mi")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.forest.opacity(0.4))
                    }
                    if asset.tracksHours, let hrs = asset.currentHours {
                        Text("\(Int(hrs)) hrs")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.forest.opacity(0.4))
                    }
                }
            }

            if let co = checkout {
                HStack(spacing: 4) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(Color.blue)
                    Text("\(co.checkedOutBy) · \(co.purpose)")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.blue.opacity(0.8))
                        .lineLimit(1)
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Checked out card

struct CheckedOutCard: View {
    let asset: CampAsset
    let checkout: AssetCheckout

    var isOverdue: Bool { checkout.expectedReturnAt < Date() }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 3)
                .fill(isOverdue ? Color.priorityUrgent : Color.blue)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(asset.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.forest)
                    Spacer()
                    if isOverdue {
                        Label("Overdue", systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.priorityUrgent)
                    }
                }
                Text("\(checkout.checkedOutBy) · \(checkout.purpose)")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.forest.opacity(0.7))
                Text("\(isOverdue ? "Was due" : "Due by") \(checkout.expectedReturnAt.readingTimeDisplay)")
                    .font(.system(size: 12))
                    .foregroundStyle(isOverdue ? Color.priorityUrgent : Color.forest.opacity(0.5))
            }
        }
        .padding(14)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isOverdue ? Color.priorityUrgent.opacity(0.3) : Color.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Status badge

struct AssetStatusBadge: View {
    let status: AssetStatus
    var body: some View {
        Text(status.displayName)
            .font(.system(size: 12))
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.bgColor)
            .foregroundStyle(status.color)
            .clipShape(Capsule())
    }
}

// MARK: - Category pill

struct AssetCategoryPill: View {
    let title: String
    var icon: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 11))
                }
                Text(title)
                    .font(.system(size: 12))
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(isSelected ? Color.sage : Color.white)
            .foregroundStyle(isSelected ? Color.white : Color.forest.opacity(0.7))
            .overlay(
                Capsule().stroke(isSelected ? Color.sage : Color.border, lineWidth: 1)
            )
            .clipShape(Capsule())
        }
    }
}

// MARK: - Tab pill

struct TabPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14))
                .fontWeight(isSelected ? .semibold : .regular)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(isSelected ? Color.sage.opacity(0.1) : Color.clear)
                .foregroundStyle(isSelected ? Color.sage : Color.forest.opacity(0.5))
                .overlay(alignment: .bottom) {
                    if isSelected {
                        Rectangle().fill(Color.sage).frame(height: 2)
                    }
                }
        }
    }
}
