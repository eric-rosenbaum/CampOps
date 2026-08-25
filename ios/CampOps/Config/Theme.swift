import SwiftUI
import UIKit

// Shared surface + control styling, so the brand treatment lives in one place instead of
// being re-typed inline on every card and chip.

// MARK: - Haptics

/// Physical feedback for the actions worth confirming by touch. Kept here so views don't
/// each have to import UIKit.
enum Haptics {
    /// A state change the user asked for: taking an issue, toggling a task.
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Something was saved or completed.
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// A request failed.
    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}

// MARK: - Surfaces

private struct CardSurface: ViewModifier {
    var padding: CGFloat
    var radius: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.surface, in: .rect(cornerRadius: radius))
            // A hairline border rather than a drop shadow: it matches the web app's
            // `border border-stone-200`, and shadows go muddy against a dark canvas.
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(Color.border, lineWidth: 1)
            )
    }
}

extension View {
    /// A standard content card: surface fill, hairline border, no shadow.
    func cardSurface(padding: CGFloat = Spacing.md, radius: CGFloat = Radius.md) -> some View {
        modifier(CardSurface(padding: padding, radius: radius))
    }

    /// The warm brand canvas, edge to edge. Use in place of `systemGroupedBackground`.
    func campCanvas() -> some View {
        background(Color.canvas.ignoresSafeArea())
    }
}

// MARK: - Buttons

/// Filled forest button. The single primary action on a screen.
struct CampPrimaryButtonStyle: ButtonStyle {
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.campBodySemibold)
            .foregroundStyle(Color.cream)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Color.forestFill.opacity(enabled ? 1 : 0.35), in: .rect(cornerRadius: Radius.md))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Outlined button, secondary actions that still need a full-width target.
struct CampSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.campBodyMedium)
            .foregroundStyle(Color.forest)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Color.surface, in: .rect(cornerRadius: Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md)
                    .strokeBorder(Color.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Small inline chip, e.g. "Take it" on an issue row.
struct CampChipButtonStyle: ButtonStyle {
    var filled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.campMetaSemibold)
            .foregroundStyle(filled ? Color.cream : Color.sage)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background {
                if filled {
                    Capsule().fill(Color.sage)
                } else {
                    Capsule().strokeBorder(Color.sage, lineWidth: 1)
                }
            }
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

extension ButtonStyle where Self == CampPrimaryButtonStyle {
    static func campPrimary(enabled: Bool = true) -> CampPrimaryButtonStyle {
        CampPrimaryButtonStyle(enabled: enabled)
    }
}

extension ButtonStyle where Self == CampSecondaryButtonStyle {
    static var campSecondary: CampSecondaryButtonStyle { CampSecondaryButtonStyle() }
}

extension ButtonStyle where Self == CampChipButtonStyle {
    static func campChip(filled: Bool = true) -> CampChipButtonStyle {
        CampChipButtonStyle(filled: filled)
    }
}

// MARK: - Building blocks

/// All-caps eyebrow above a group of rows.
struct SectionEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.campLabel)
            .tracking(0.7)
            .foregroundStyle(Color.forest.opacity(0.45))
    }
}

/// The wordmark used on every signed-out screen.
struct CampWordmark: View {
    var size: CGFloat = 34

    var body: some View {
        VStack(spacing: Spacing.md) {
            // The badge carries its own disc, so it needs no tinted plate behind it.
            CampCommandMark(size: size * 1.5)
            Text("CampCommand")
                .font(.campTitle)
                .foregroundStyle(Color.forest)
        }
    }
}

/// Rounded, bordered text field used across the auth screens.
struct CampField<Content: View>: View {
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.campMetaMedium)
                .foregroundStyle(Color.forest.opacity(0.6))
            content()
                .font(.campBody)
                .foregroundStyle(Color.forest)
                .tint(Color.sage)
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Color.surfaceRaised, in: .rect(cornerRadius: Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .strokeBorder(Color.border, lineWidth: 1)
                )
        }
    }
}

/// Inline error banner, matching the web app's red-tinted box.
struct CampErrorBanner: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.campMeta)
            .foregroundStyle(Color.urgentText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color.urgentBg, in: .rect(cornerRadius: Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.sm)
                    .strokeBorder(Color.priorityUrgent.opacity(0.25), lineWidth: 1)
            )
    }
}
