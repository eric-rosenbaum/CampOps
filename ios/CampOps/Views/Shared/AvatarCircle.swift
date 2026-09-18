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
                    .font(initialsFont)
                    .foregroundStyle(Color.forest)
            )
    }

    /// Karla has no Hebrew letters, so a Hebrew name's initials were drawn in whatever face
    /// CoreText fell back to, at Karla's metrics. Hebrew initials get the system face.
    private var initialsFont: Font {
        let latin = initials.unicodeScalars.allSatisfy { $0.isASCII }
        return latin && !L10n.language.isRightToLeft
            ? .custom("Karla-Regular_SemiBold", size: size * 0.38)
            : .system(size: size * 0.38, weight: .semibold)
    }
}
