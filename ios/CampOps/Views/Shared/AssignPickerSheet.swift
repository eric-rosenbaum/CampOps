import SwiftUI

/// Who a work order goes to: one person, or one crew.
///
/// Both in the same list because they are the same decision, and never both at once because the
/// database will not store both (`issues_one_assignee`). Handing it to a crew leaves it up for
/// grabs; naming a person takes it off the pile.
struct AssignPickerSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var campground: CampgroundStore
    @Environment(\.dismiss) private var dismiss
    let currentAssigneeId: String?
    var currentCrewId: String? = nil
    let onSelect: (CampUser?) -> Void
    var onSelectCrew: ((StaffGroup) -> Void)? = nil

    var body: some View {
        NavigationStack {
            List {
                Section {
                    UserPickerRow(user: nil, isSelected: currentAssigneeId == nil && currentCrewId == nil) {
                        onSelect(nil); dismiss()
                    }
                }
                if onSelectCrew != nil, !campground.trades.isEmpty {
                    Section("A crew") {
                        ForEach(campground.trades) { crew in
                            Button {
                                onSelectCrew?(crew); dismiss()
                            } label: {
                                HStack(spacing: Spacing.sm) {
                                    Image(systemName: "person.2.fill")
                                        .foregroundStyle(Trade.color(crew.key))
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(crew.displayName).font(.campBody)
                                        Text("Stays up for grabs")
                                            .font(.campMicro)
                                            .foregroundStyle(Color.forest.opacity(0.5))
                                    }
                                    Spacer()
                                    if crew.id == currentCrewId {
                                        Image(systemName: "checkmark").foregroundStyle(Color.sage)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Section("A person") {
                    ForEach(authManager.members) { user in
                        UserPickerRow(user: user, isSelected: user.id == currentAssigneeId) {
                            onSelect(user); dismiss()
                        }
                    }
                }
            }
            .navigationTitle("Assign to")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}
