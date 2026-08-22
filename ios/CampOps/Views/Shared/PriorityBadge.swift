import SwiftUI

/// An outlined stamp rather than a filled pill — on a page of paper-toned cards a filled chip
/// reads as UI chrome, where a ruled stamp reads as something inked onto the record.
struct PriorityBadge: View {
    let priority: Priority
    var body: some View {
        Text(priority.displayName.uppercased())
            .font(.campLabel)
            .tracking(0.8)
            .padding(.horizontal, 5)
            .padding(.vertical, 1.5)
            .foregroundColor(priority.color)
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(priority.color, lineWidth: 1)
            )
    }
}
