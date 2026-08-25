import CoreFoundation
import SwiftUI

enum Constants {
    /// The web app. Password resets and invitations are completed there.
    static let webAppBaseURL = "https://app.campcommand.app"
    /// Shown wherever a member is blocked and needs a human, matches the web app's screens.
    static let supportEmail = "prakash@campcommand.app"

    /// Emailed sign-in codes are NOT always 6 digits. The length is a Supabase project
    /// setting (Auth → Sign In / Providers → Email → "Email OTP Length") and can be 6–10.
    /// Accept the range and let the server reject a wrong code; hardcoding 6 silently
    /// truncated longer codes so they could never be submitted.
    static let otpMinLength = 6
    static let otpMaxLength = 10

    /// Join codes are word-shaped (`CEDAR-4821`); legacy camps still hold 6-character hex
    /// ones. The server normalises case and punctuation, so clients only sanity-check length.
    static let joinCodeMinLength = 6
}

enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
}

// Field Guide is a squarer design: the softness comes from paper tones and hairline rules
// rather than from rounded corners. Mirrors the web's borderRadius tokens.
enum Radius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 5
    static let lg: CGFloat = 8
    static let pill: CGFloat = 20
}

// MARK: - Typography
//
// The brand faces, matching the web app: Karla for UI, Bitter for display.
//
// Every token names its weight explicitly rather than relying on `.weight()` / `.fontWeight()`,
// because asking CoreText for a weight it cannot find falls back to a synthetic one silently.
//
// Both faces ship as VARIABLE fonts, and the two families expose their named instances
// differently, Bitter as the expected `Bitter-SemiBold`, but Karla as `Karla-Regular_SemiBold`.
// These names were read off `UIFont.fontNames(forFamilyName:)` on a running simulator rather
// than guessed; `Karla-SemiBold` does not exist and would quietly render as the system face.
//
// `relativeTo:` keeps every token scaling with Dynamic Type.
extension Font {
    private static func sans(_ face: String, _ size: CGFloat, _ style: Font.TextStyle) -> Font {
        .custom(face, size: size, relativeTo: style)
    }

    // Display, Bitter. Reserved for greetings, hero numbers, and empty-state titles.
    static let campHero      = sans("Bitter-Bold", 32, .largeTitle)
    static let campDisplay   = sans("Bitter-SemiBold", 27, .title)
    static let campTitle     = sans("Bitter-SemiBold", 22, .title2)

    // UI · Karla.
    static let campPageTitle = sans("Karla-Regular_Bold", 20, .title3)
    static let campSection   = sans("Karla-Regular_SemiBold", 17, .headline)
    static let campBodyLarge = sans("Karla-Regular", 17, .body)

    static let campBody          = sans("Karla-Regular", 15, .subheadline)
    static let campBodyMedium    = sans("Karla-Regular_Medium", 15, .subheadline)
    static let campBodySemibold  = sans("Karla-Regular_SemiBold", 15, .subheadline)

    static let campSmall         = sans("Karla-Regular", 14, .subheadline)
    static let campSmallMedium   = sans("Karla-Regular_Medium", 14, .subheadline)
    static let campSmallSemibold = sans("Karla-Regular_SemiBold", 14, .subheadline)

    static let campSecondary         = sans("Karla-Regular", 13, .footnote)
    static let campSecondarySemibold = sans("Karla-Regular_SemiBold", 13, .footnote)

    static let campMeta          = sans("Karla-Regular", 12, .caption)
    static let campMetaMedium    = sans("Karla-Regular_Medium", 12, .caption)
    static let campMetaSemibold  = sans("Karla-Regular_SemiBold", 12, .caption)

    static let campMicro         = sans("Karla-Regular", 11, .caption2)
    static let campMicroMedium   = sans("Karla-Regular_Medium", 11, .caption2)
    /// Small all-caps section eyebrow.
    static let campLabel         = sans("Karla-Regular_SemiBold", 11, .caption2)

    /// Big numerals on stat tiles.
    static let campStat = sans("Karla-Regular_Bold", 30, .title)
}
