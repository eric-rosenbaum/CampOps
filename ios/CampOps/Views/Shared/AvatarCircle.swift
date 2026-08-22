import SwiftUI

struct AvatarCircle: View {
    let initials: String
    var size: CGFloat = 36

    var body: some View {
        Circle()
            .fill(Color.sageLight)
            .frame(width: size, height: size)
            .overlay(
                Circle().strokeBorder(Color.sage.opacity(0.35), lineWidth: 1)
            )
            .overlay(
                Text(initials)
                    .font(.custom("Karla-Regular_SemiBold", size: size * 0.38))
                    .foregroundStyle(Color.forest)
            )
    }
}
