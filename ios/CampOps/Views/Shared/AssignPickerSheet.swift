import SwiftUI

struct AssignPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let currentAssigneeId: String?
    let onSelect: (CampUser?) -> Void
    var body: some View {
        NavigationStack {
            List {
                UserPickerRow(user: nil, isSelected: currentAssigneeId == nil) {
                    onSelect(nil); dismiss()
                }
                ForEach(CampUser.seedUsers) { user in
                    UserPickerRow(user: user, isSelected: user.id == currentAssigneeId) {
                        onSelect(user); dismiss()
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
