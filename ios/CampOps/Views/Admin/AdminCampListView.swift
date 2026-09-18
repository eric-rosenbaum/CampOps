import SwiftUI

/// Where a CampCommand founder lands, and the only way they get into a camp.
///
/// The database already treats a platform admin as an administrator of every camp -- the
/// `is_camp_member` and `is_camp_admin` helpers short-circuit on `is_platform_admin()`. So this
/// screen grants nothing; it is a list of doors that were already unlocked.
///
/// What it does do is make the choice deliberate. A founder is never dropped into a camp on
/// launch, and once inside, a banner says whose camp it is on every screen. Writes in a borrowed
/// camp are real writes to a customer's live data, and the banner is the only thing standing
/// between a founder and that.
struct AdminCampListView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var camps: [Camp] = []
    @State private var isLoading = true
    @State private var search = ""

    private var filtered: [Camp] {
        guard !search.isEmpty else { return camps }
        let q = search.lowercased()
        return camps.filter { $0.name.lowercased().contains(q) || $0.slug.lowercased().contains(q) }
    }

    private var myCamps: [Camp] { authManager.camps }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    list
                }
            }
            .campCanvas()
            .navigationTitle("Camps")
            .searchable(text: $search, prompt: "Find a camp")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { UserMenuButton() }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                if !myCamps.isEmpty && search.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        // Not "Yours": that key belongs to Home's work orders, and in Spanish a
                        // list of camps headed "Tuyas" had the wrong gender.
                        SectionEyebrow(text: "Your camps")
                        ForEach(myCamps) { camp in
                            campRow(camp, borrowed: false)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: Spacing.sm) {
                    SectionEyebrow(text: "Every camp")
                    Text("Opening one of these puts you in somebody's live camp as an admin.")
                        .font(.campMeta)
                        .foregroundStyle(Color.forest.opacity(0.55))
                    ForEach(filtered) { camp in
                        campRow(camp, borrowed: !myCamps.contains { $0.id == camp.id })
                    }
                }
            }
            .padding(Spacing.lg)
        }
    }

    private func campRow(_ camp: Camp, borrowed: Bool) -> some View {
        Button {
            Haptics.tap()
            Task {
                if borrowed {
                    await authManager.openCampAsAdmin(camp)
                } else {
                    await authManager.selectCamp(camp.id)
                }
            }
        } label: {
            HStack(spacing: Spacing.md) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(camp.name).font(.campBodySemibold)
                    HStack(spacing: Spacing.xs) {
                        MetaTag(verbatim: camp.accountType.label, systemImage: "tag")
                        if camp.status != .active {
                            MetaTag(verbatim: camp.status.label, systemImage: "exclamationmark.triangle")
                        }
                        if borrowed {
                            MetaTag(text: "As admin", systemImage: "eye")
                        }
                    }
                }
                Spacer()
                // "forward", not "right": under Hebrew a right-pointing chevron at the row's
                // trailing (left) edge pointed back out of the list it was meant to lead into.
                Image(systemName: "chevron.forward")
                    .font(.campMeta)
                    .foregroundStyle(Color.forest.opacity(0.4))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        isLoading = true
        camps = await authManager.loadAllCampsForAdmin()
        isLoading = false
    }
}

extension CampAccountType {
    var label: String {
        switch self {
        case .customer:        return "Customer"
        case .trial:           return "Trial"
        case .demo:            return "Demo"
        case .internalAccount: return "Internal"
        }
    }
}

extension CampStatus {
    var label: String {
        switch self {
        case .active:       return "Active"
        case .suspended:    return "Suspended"
        case .trialExpired: return "Trial expired"
        }
    }
}
