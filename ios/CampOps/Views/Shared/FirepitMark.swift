import SwiftUI

/// The brand mark: a firepit. Mirrors the web's `FirepitMark.tsx`.
///
/// Drawn with shapes rather than an SF Symbol so it carries its own colour — an outlined ember
/// flame over crossed logs — which is what lets it stay recognisable next to the camp name at
/// small sizes, where a monoline glyph would read as just another list icon.
struct FirepitMark: View {
    var size: CGFloat = 22

    var body: some View {
        Canvas { ctx, rect in
            let s = min(rect.width, rect.height) / 32

            // Outer flame, stroked.
            var flame = Path()
            flame.move(to: CGPoint(x: 16 * s, y: 4.4 * s))
            flame.addCurve(to: CGPoint(x: 21.2 * s, y: 13.5 * s),
                           control1: CGPoint(x: 19.4 * s, y: 8.1 * s),
                           control2: CGPoint(x: 21.2 * s, y: 10.8 * s))
            flame.addCurve(to: CGPoint(x: 10.8 * s, y: 13.5 * s),
                           control1: CGPoint(x: 21.2 * s, y: 18.2 * s),
                           control2: CGPoint(x: 10.8 * s, y: 18.2 * s))
            flame.addCurve(to: CGPoint(x: 12.5 * s, y: 8.9 * s),
                           control1: CGPoint(x: 10.8 * s, y: 11.8 * s),
                           control2: CGPoint(x: 11.4 * s, y: 10.3 * s))
            flame.addCurve(to: CGPoint(x: 14 * s, y: 11 * s),
                           control1: CGPoint(x: 12.7 * s, y: 10 * s),
                           control2: CGPoint(x: 13.2 * s, y: 10.7 * s))
            flame.addCurve(to: CGPoint(x: 16 * s, y: 4.4 * s),
                           control1: CGPoint(x: 13.4 * s, y: 8.6 * s),
                           control2: CGPoint(x: 13.8 * s, y: 6.5 * s))
            ctx.stroke(flame, with: .color(Color(hex: "B0522F")), lineWidth: 2.1 * s)

            // Inner flame, filled.
            var inner = Path()
            inner.move(to: CGPoint(x: 16 * s, y: 10.6 * s))
            inner.addCurve(to: CGPoint(x: 18.1 * s, y: 14.6 * s),
                           control1: CGPoint(x: 17.5 * s, y: 12.5 * s),
                           control2: CGPoint(x: 18.1 * s, y: 13.5 * s))
            inner.addCurve(to: CGPoint(x: 13.9 * s, y: 14.6 * s),
                           control1: CGPoint(x: 18.1 * s, y: 16.8 * s),
                           control2: CGPoint(x: 13.9 * s, y: 16.8 * s))
            inner.addCurve(to: CGPoint(x: 16 * s, y: 10.6 * s),
                           control1: CGPoint(x: 13.9 * s, y: 13.5 * s),
                           control2: CGPoint(x: 14.5 * s, y: 12.5 * s))
            ctx.fill(inner, with: .color(Color(hex: "D9922B")))

            // Two logs crossed beneath.
            var logA = Path()
            logA.move(to: CGPoint(x: 5.2 * s, y: 24.6 * s))
            logA.addLine(to: CGPoint(x: 26.8 * s, y: 20.6 * s))
            ctx.stroke(logA, with: .color(Color(hex: "7C5A34")),
                       style: StrokeStyle(lineWidth: 3.4 * s, lineCap: .round))

            var logB = Path()
            logB.move(to: CGPoint(x: 5.2 * s, y: 20.6 * s))
            logB.addLine(to: CGPoint(x: 26.8 * s, y: 24.6 * s))
            ctx.stroke(logB, with: .color(Color(hex: "946B3E")),
                       style: StrokeStyle(lineWidth: 3.4 * s, lineCap: .round))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
