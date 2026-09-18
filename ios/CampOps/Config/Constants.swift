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
    /// A brand face, or -- under Hebrew -- the system face at the same text style.
    ///
    /// Karla and Bitter have no Hebrew glyphs. CoreText does fall back per character, but it
    /// falls back to a Hebrew face whose metrics have nothing to do with Karla's, so a Hebrew
    /// label with a number in it rendered in two typefaces at two sizes on one baseline. Under
    /// Hebrew every token is the system face instead, which is designed for Hebrew and Latin
    /// together. Tokens are computed, not stored, so a language switch picks the new face up on
    /// the next render.
    private static func sans(_ face: String, _ size: CGFloat, _ style: Font.TextStyle,
                             _ weight: Font.Weight = .regular) -> Font {
        if L10n.language.isRightToLeft {
            return .system(style, design: .default, weight: weight)
        }
        return .custom(face, size: size, relativeTo: style)
    }

    // Display, Bitter. Reserved for greetings, hero numbers, and empty-state titles.
    static var campHero: Font      { sans("Bitter-Bold", 32, .largeTitle, .bold) }
    static var campDisplay: Font   { sans("Bitter-SemiBold", 27, .title, .semibold) }
    static var campTitle: Font     { sans("Bitter-SemiBold", 22, .title2, .semibold) }

    // UI · Karla.
    static var campPageTitle: Font { sans("Karla-Regular_Bold", 20, .title3, .bold) }
    static var campSection: Font   { sans("Karla-Regular_SemiBold", 17, .headline, .semibold) }
    static var campBodyLarge: Font { sans("Karla-Regular", 17, .body) }

    static var campBody: Font          { sans("Karla-Regular", 15, .subheadline) }
    static var campBodyMedium: Font    { sans("Karla-Regular_Medium", 15, .subheadline, .medium) }
    static var campBodySemibold: Font  { sans("Karla-Regular_SemiBold", 15, .subheadline, .semibold) }

    static var campSmall: Font         { sans("Karla-Regular", 14, .subheadline) }
    static var campSmallMedium: Font   { sans("Karla-Regular_Medium", 14, .subheadline, .medium) }
    static var campSmallSemibold: Font { sans("Karla-Regular_SemiBold", 14, .subheadline, .semibold) }

    static var campSecondary: Font         { sans("Karla-Regular", 13, .footnote) }
    static var campSecondarySemibold: Font { sans("Karla-Regular_SemiBold", 13, .footnote, .semibold) }

    static var campMeta: Font          { sans("Karla-Regular", 12, .caption) }
    static var campMetaMedium: Font    { sans("Karla-Regular_Medium", 12, .caption, .medium) }
    static var campMetaSemibold: Font  { sans("Karla-Regular_SemiBold", 12, .caption, .semibold) }

    static var campMicro: Font         { sans("Karla-Regular", 11, .caption2) }
    static var campMicroMedium: Font   { sans("Karla-Regular_Medium", 11, .caption2, .medium) }
    /// Small all-caps section eyebrow.
    static var campLabel: Font         { sans("Karla-Regular_SemiBold", 11, .caption2, .semibold) }

    /// Big numerals on stat tiles.
    static var campStat: Font { sans("Karla-Regular_Bold", 30, .title, .bold) }
}
