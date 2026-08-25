import SwiftUI
import UIKit

// The brand palette, mirrored from the web app's tailwind.config.js (Field Guide).
//
// `forest` is body ink (warm near-black), NOT the pine green, pine lives on `forestFill` and
// is what buttons, the nav and headings use. The two were one token before the redesign.
//
// Every token here is DYNAMIC: it resolves differently in light and dark mode. This matters
// because the app previously mixed hard-coded brand hexes (near-black `forest` text) with
// adaptive system backgrounds (`systemBackground`, black in dark mode) · which rendered
// forest-on-black, i.e. invisible. Tokens that are used as *ink* (forest, forestMid, …)
// therefore flip to a light cream in dark mode; tokens used as *fills* keep their hue and
// only change value.
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    /// A token that resolves to `light` in light mode and `dark` in dark mode.
    static func adaptive(_ light: String, _ dark: String) -> Color {
        Color(uiColor: UIColor { trait in
            UIColor(Color(hex: trait.userInterfaceStyle == .dark ? dark : light))
        })
    }

    // MARK: - Ink
    // Primary text. Light: near-black forest green. Dark: warm cream.
    // Call sites use `.forest.opacity(0.4)` etc. for secondary text, so the opacity ladder
    // has to read correctly against BOTH canvases, hence a genuinely light dark-mode value.
    static let forest      = adaptive("23201B", "F1ECDF")
    static let forestMid   = adaptive("6B6357", "C6BFAE")
    static let forestLight = adaptive("9AA98F", "8B9B82")

    // MARK: - Brand accents
    static let sage      = adaptive("5E7A61", "8FB894")
    static let sageLight = adaptive("9AA98F", "3D5142")
    static let sagePale  = adaptive("E6E9D8", "232B23")

    // Cream is an on-dark brand constant (e.g. label on a forest button), so it stays put.
    static let cream     = Color(hex: "F6F1E4")
    static let creamDark = adaptive("EFE9D9", "232A20")

    // MARK: - Brand mark
    // Fixed values from the brand package, not theme tokens: the mark has to render the same
    // in light and dark, and the same as the favicon and the home-screen icon.
    static let ccGreen = Color(hex: "24392F")
    static let ccCream = Color(hex: "FCF9F2")
    static let ccFlame = Color(hex: "A45838")
    static let ccEmber = Color(hex: "CF9542")
    static let ccWood  = Color(hex: "8E6D45")

    // MARK: - Surfaces
    /// The screen background. Warm cream instead of iOS's neutral grey.
    static let canvas        = adaptive("F6F1E4", "14170F")
    /// Card / sheet background.
    static let surface       = adaptive("FFFDF7", "1C211A")
    /// Inset fills: text fields, segmented pills, secondary rows.
    static let surfaceRaised = adaptive("FCF9F1", "262E22")
    /// Hairline dividers and card borders, used instead of drop shadows.
    static let border        = adaptive("DED3BB", "353D2E")

    /// A solid forest fill for primary buttons. Unlike `.forest` this does NOT invert,
    /// because `.cream` sits on top of it in both appearances.
    static let forestFill = adaptive("1D3A2E", "2C5342")

    // MARK: - Status
    static let priorityUrgent = adaptive("B4552F", "E5865C")
    static let priorityHigh   = adaptive("D08C1B", "E5B45C")
    static let priorityNormal = adaptive("5E7A61", "8FB894")

    static let urgentBg  = adaptive("F8E9E2", "35201A")
    static let urgentText = adaptive("8A3D1E", "E9A184")
    static let amberBg   = adaptive("FBF1DC", "352C16")
    static let amberText = adaptive("8A5A0C", "E6C07A")
    static let greenBg   = adaptive("E6ECE2", "1F291F")
    static let greenText = adaptive("3F5D45", "93BE99")
    static let blue      = adaptive("185fa5", "5aa6ee")
    static let blueBg    = adaptive("e6f1fb", "16273a")
    static let blueText  = adaptive("0c447c", "9cc9f2")
    static let purple    = adaptive("6b3fa0", "b088e8")
    static let purpleBg  = adaptive("f0ebfc", "271b3a")
    static let purpleText = adaptive("3d1f6b", "c7aef5")
}
