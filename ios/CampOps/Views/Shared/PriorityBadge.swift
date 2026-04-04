import SwiftUI

struct PriorityBadge: View {
    let priority: Priority
    var body: some View {
        Text(priority.displayName)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 3)
            .background(priority.bgColor)
            .foregroundColor(priority.color)
            .clipShape(Capsule())
    }
}
