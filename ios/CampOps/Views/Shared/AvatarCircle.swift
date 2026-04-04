import SwiftUI

struct AvatarCircle: View {
    let initials: String
    var size: CGFloat = 36
    var body: some View {
        Circle()
            .fill(Color.sageLight)
            .frame(width: size, height: size)
            .overlay(
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundColor(.forest)
            )
    }
}
