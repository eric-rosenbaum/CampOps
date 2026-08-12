import SwiftUI
import UIKit

// The brand palette, mirrored from the web app's tailwind.config.js.
//
// Every token here is DYNAMIC: it resolves differently in light and dark mode. This matters
// because the app previously mixed hard-coded brand hexes (near-black `forest` text) with
// adaptive system backgrounds (`systemBackground`, black in dark mode) — which rendered
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
    // has to read correctly against BOTH canvases — hence a genuinely light dark-mode value.
    static let forest      = adaptive("1a2e1a", "eef2e7")
    static let forestMid   = adaptive("2d4a2d", "c3d4bb")
    static let forestLight = adaptive("3d6b3d", "9cb794")

    // MARK: - Brand accents
    static let sage      = adaptive("7aab6e", "8cc17e")
    static let sageLight = adaptive("a8c99f", "44603c")
    static let sagePale  = adaptive("e1f0dc", "22301e")

    // Cream is an on-dark brand constant (e.g. label on a forest button), so it stays put.
    static let cream     = Color(hex: "f5f2eb")
    static let creamDark = adaptive("ede9df", "232a20")

    // MARK: - Surfaces
    /// The screen background. Warm cream instead of iOS's neutral grey.
    static let canvas        = adaptive("f5f2eb", "10140e")
    /// Card / sheet background.
    static let surface       = adaptive("ffffff", "1a1f17")
    /// Inset fills: text fields, segmented pills, secondary rows.
    static let surfaceRaised = adaptive("ede9df", "242c20")
    /// Hairline dividers and card borders — used instead of drop shadows.
    static let border        = adaptive("d4cfc4", "313a2c")

    /// A solid forest fill for primary buttons. Unlike `.forest` this does NOT invert,
    /// because `.cream` sits on top of it in both appearances.
    static let forestFill = adaptive("1a2e1a", "2b4429")

    // MARK: - Status
    static let priorityUrgent = adaptive("c0392b", "ff7a68")
    static let priorityHigh   = adaptive("c47d08", "e5a94a")
    static let priorityNormal = adaptive("7aab6e", "8cc17e")

    static let urgentBg  = adaptive("fdecea", "3a1d18")
    static let urgentText = adaptive("7a1a1a", "ffa596")
    static let amberBg   = adaptive("fef5e4", "3a2e16")
    static let amberText = adaptive("7d4e00", "eec27c")
    static let greenBg   = adaptive("eaf3e8", "1d2c1b")
    static let greenText = adaptive("1e6b1e", "8ed388")
    static let blue      = adaptive("185fa5", "5aa6ee")
    static let blueBg    = adaptive("e6f1fb", "16273a")
    static let blueText  = adaptive("0c447c", "9cc9f2")
    static let purple    = adaptive("6b3fa0", "b088e8")
    static let purpleBg  = adaptive("f0ebfc", "271b3a")
    static let purpleText = adaptive("3d1f6b", "c7aef5")
}
