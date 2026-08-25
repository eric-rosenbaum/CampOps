import SwiftUI

/// The brand mark: a "CC" monogram over a campfire, inside a hairline ring on a green disc.
///
/// Mirrors `src/campcommand-brand/react/CampCommandMark.tsx`, which is the source of truth for
/// the geometry. Everything is authored on the same 64-unit grid as the web mark and the app
/// icon, so the tab icon, the in-app mark and the home-screen icon are the same drawing at
/// different scales rather than three near-misses.
///
/// Drawn rather than shipped as a PNG because the disc and ink colours flip depending on the
/// surface: green-on-cream in most of the app, cream-on-green on the pine headers.
struct CampCommandMark: View {
    var size: CGFloat = 32
    var disc: Color = .ccGreen
    var ink: Color = .ccCream
    /// Drops the hairline ring and enlarges the contents. Use below roughly 24pt, where the
    /// 1.4-unit ring collapses into a grey halo.
    var compact: Bool = false

    var body: some View {
        Canvas { ctx, rect in
            let s = min(rect.width, rect.height) / 64
            let center = CGPoint(x: 32 * s, y: 32 * s)

            ctx.fill(
                Path(ellipseIn: CGRect(x: 1 * s, y: 1 * s, width: 62 * s, height: 62 * s)),
                with: .color(disc)
            )

            if !compact {
                ctx.stroke(
                    Path(ellipseIn: CGRect(x: 5 * s, y: 5 * s, width: 54 * s, height: 54 * s)),
                    with: .color(ink),
                    lineWidth: 1.4 * s
                )
            }

            // The contents scale up when the ring is dropped, matching the web `compact` build.
            let k: CGFloat = compact ? 1.14 : 1.0
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                CGPoint(x: center.x + (x - 32) * s * k, y: center.y + (y - 32) * s * k)
            }

            // ── The two Cs ──
            // Each is the ring between r=7 and r=4, which is exactly a 5.5-radius arc stroked
            // at width 3, open on the right between -46° and +46°.
            for cx in [CGFloat(24), CGFloat(40)] {
                var c = Path()
                c.addArc(
                    center: p(cx, 23),
                    radius: 5.5 * s * k,
                    startAngle: .degrees(46),
                    endAngle: .degrees(314),
                    clockwise: false
                )
                ctx.stroke(c, with: .color(ink),
                           style: StrokeStyle(lineWidth: 3 * s * k, lineCap: .butt))
            }

            // ── Fire ──
            var fire = Path()
            fire.move(to: p(32, 32))
            fire.addCurve(to: p(38, 44), control1: p(35, 37), control2: p(38, 40))
            // Rounded base: a half circle bulging downward between (38,44) and (26,44).
            fire.addArc(center: p(32, 44), radius: 6 * s * k,
                        startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
            fire.addCurve(to: p(29, 36), control1: p(26, 40.8), control2: p(27.8, 38.6))
            fire.addCurve(to: p(31.6, 40.7), control1: p(29.8, 38.6), control2: p(30.7, 40))
            fire.addCurve(to: p(32, 32), control1: p(31.3, 37.6), control2: p(31.5, 34.6))
            fire.closeSubpath()
            ctx.fill(fire, with: .color(ink))

            // ── Crossed logs ──
            let logWidth = (compact ? 3.8 : 3) * s * k
            for (a, b) in [((CGFloat(18), CGFloat(51)), (CGFloat(46), CGFloat(45.5))),
                           ((CGFloat(18), CGFloat(45.5)), (CGFloat(46), CGFloat(51)))] {
                var log = Path()
                log.move(to: p(a.0, a.1))
                log.addLine(to: p(b.0, b.1))
                ctx.stroke(log, with: .color(ink),
                           style: StrokeStyle(lineWidth: logWidth, lineCap: .butt))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

#Preview {
    VStack(spacing: 24) {
        HStack(spacing: 20) {
            CampCommandMark(size: 64)
            CampCommandMark(size: 32)
            CampCommandMark(size: 20, compact: true)
        }
        HStack(spacing: 20) {
            CampCommandMark(size: 64, disc: .ccCream, ink: .ccGreen)
            CampCommandMark(size: 32, disc: .ccCream, ink: .ccGreen)
        }
        .padding(24)
        .background(Color.ccGreen)
    }
    .padding(40)
}
