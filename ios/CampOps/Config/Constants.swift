import CoreFoundation
import SwiftUI

enum Constants {
    /// The web app. Password resets and invitations are completed there.
    static let webAppBaseURL = "https://app.campcommand.app"
    /// Shown wherever a member is blocked and needs a human — matches the web app's screens.
    static let supportEmail = "prakash@campcommand.app"

    /// Emailed sign-in codes are NOT always 6 digits — the length is a Supabase project
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

enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let pill: CGFloat = 20
}

// MARK: - Typography
//
// The brand faces, matching the web app: DM Sans for UI, Fraunces for display.
//
// Every token names its weight explicitly rather than relying on `.weight()` / `.fontWeight()`.
// Google ships DM Sans Medium and SemiBold under their own *family* names ("DM Sans Medium"),
// so asking CoreText for a semibold "DM Sans" would miss and fall back to a synthetic bold.
// Naming the PostScript face directly is unambiguous.
//
// `relativeTo:` keeps every token scaling with Dynamic Type.
extension Font {
    private static func sans(_ face: String, _ size: CGFloat, _ style: Font.TextStyle) -> Font {
        .custom(face, size: size, relativeTo: style)
    }

    // Display — Fraunces. Reserved for greetings, hero numbers, and empty-state titles.
    static let campHero      = sans("Fraunces-Bold", 32, .largeTitle)
    static let campDisplay   = sans("Fraunces-SemiBold", 27, .title)
    static let campTitle     = sans("Fraunces-SemiBold", 22, .title2)

    // UI — DM Sans.
    static let campPageTitle = sans("DMSans-Bold", 20, .title3)
    static let campSection   = sans("DMSans-SemiBold", 17, .headline)
    static let campBodyLarge = sans("DMSans-Regular", 17, .body)

    static let campBody          = sans("DMSans-Regular", 15, .subheadline)
    static let campBodyMedium    = sans("DMSans-Medium", 15, .subheadline)
    static let campBodySemibold  = sans("DMSans-SemiBold", 15, .subheadline)

    static let campSmall         = sans("DMSans-Regular", 14, .subheadline)
    static let campSmallMedium   = sans("DMSans-Medium", 14, .subheadline)
    static let campSmallSemibold = sans("DMSans-SemiBold", 14, .subheadline)

    static let campSecondary         = sans("DMSans-Regular", 13, .footnote)
    static let campSecondarySemibold = sans("DMSans-SemiBold", 13, .footnote)

    static let campMeta          = sans("DMSans-Regular", 12, .caption)
    static let campMetaMedium    = sans("DMSans-Medium", 12, .caption)
    static let campMetaSemibold  = sans("DMSans-SemiBold", 12, .caption)

    static let campMicro         = sans("DMSans-Regular", 11, .caption2)
    static let campMicroMedium   = sans("DMSans-Medium", 11, .caption2)
    /// Small all-caps section eyebrow.
    static let campLabel         = sans("DMSans-SemiBold", 11, .caption2)

    /// Big numerals on stat tiles.
    static let campStat = sans("DMSans-Bold", 30, .title)
}
