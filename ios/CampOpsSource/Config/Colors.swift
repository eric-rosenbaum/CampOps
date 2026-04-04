import SwiftUI

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

    static let forest      = Color(hex: "1a2e1a")
    static let forestMid   = Color(hex: "2d4a2d")
    static let forestLight = Color(hex: "3d6b3d")
    static let sage        = Color(hex: "7aab6e")
    static let sageLight   = Color(hex: "a8c99f")
    static let cream       = Color(hex: "f5f2eb")
    static let creamDark   = Color(hex: "ede9df")

    static let priorityUrgent = Color(hex: "c0392b")
    static let priorityHigh   = Color(hex: "c47d08")
    static let priorityNormal = Color(hex: "7aab6e")

    static let urgentBg  = Color(hex: "fdecea")
    static let amberBg   = Color(hex: "fef5e4")
    static let amberText = Color(hex: "7d4e00")
    static let greenBg   = Color(hex: "eaf3e8")
    static let greenText = Color(hex: "1e6b1e")
    static let border    = Color(hex: "d4cfc4")
}
