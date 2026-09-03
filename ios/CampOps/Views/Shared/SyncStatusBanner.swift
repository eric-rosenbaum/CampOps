import SwiftUI

/// The one place the app admits it is not talking to the server.
///
/// It is a pill rather than a full-width bar on purpose: this appears while somebody is in the
/// middle of doing something, and the message is reassurance ("your taps are being kept"), not
/// an error. It stays out of the way until there is a failure, which is the only state that
/// actually needs a decision from a person, and which is therefore the only state that changes
/// colour and offers a tap target.
struct SyncStatusPill: View {
    @StateObject private var engine = SyncEngine.shared
    @State private var showingFailures = false

    var body: some View {
        Group {
            if engine.hasSomethingToReport {
                Button {
                    if !engine.failures.isEmpty {
                        Haptics.tap()
                        showingFailures = true
                    }
                } label: {
                    pill
                }
                .buttonStyle(.plain)
                .disabled(engine.failures.isEmpty)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: engine.hasSomethingToReport)
        .animation(.easeOut(duration: 0.2), value: engine.state)
        .sheet(isPresented: $showingFailures) {
            SyncFailureSheet()
        }
    }

    private var pill: some View {
        HStack(spacing: Spacing.sm) {
            icon
            Text(message)
                .font(.campMetaSemibold)
                .foregroundStyle(isFailed ? Color.urgentText : Color.forest.opacity(0.75))
            if isFailed {
                Image(systemName: "chevron.right")
                    .font(.campMicro)
                    .foregroundStyle(Color.urgentText.opacity(0.7))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(isFailed ? Color.urgentBg : Color.surface, in: Capsule())
        .overlay(
            Capsule().strokeBorder(
                isFailed ? Color.priorityUrgent.opacity(0.3) : Color.border,
                lineWidth: 1
            )
        )
    }

    @ViewBuilder
    private var icon: some View {
        switch engine.state {
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.campMicro).foregroundStyle(Color.urgentText)
        case .syncing:
            ProgressView().controlSize(.mini).tint(Color.sage)
        case .offline:
            Image(systemName: "wifi.slash")
                .font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
        case .pendingCount:
            Image(systemName: "arrow.up.circle")
                .font(.campMicro).foregroundStyle(Color.forest.opacity(0.55))
        case .online:
            EmptyView()
        }
    }

    private var isFailed: Bool {
        if case .failed = engine.state { return true }
        return false
    }

    /// Deliberately says what happened to the person's work, not what the network is doing.
    /// "No connection" tells a maintenance lead nothing; "3 changes waiting" tells them their
    /// taps were kept and will go when there is signal.
    private var message: String {
        switch engine.state {
        case .failed(let items):
            return "\(items.count) \(items.count == 1 ? "change" : "changes") could not be saved"
        case .syncing:
            return "Syncing…"
        case .offline:
            return engine.pendingCount > 0
                ? "Offline — \(engine.pendingCount) \(engine.pendingCount == 1 ? "change" : "changes") waiting"
                : "Offline — changes will be saved here"
        case .pendingCount(let n):
            return "\(n) \(n == 1 ? "change" : "changes") waiting to sync"
        case .online:
            return ""
        }
    }
}

/// The review screen behind the failure pill.
///
/// Every row names what the person did in their words, shows what the server said, and offers
/// the only two honest options: try it again, or throw it away knowingly. Nothing here expires
/// or disappears on its own.
struct SyncFailureSheet: View {
    @StateObject private var engine = SyncEngine.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    if engine.failures.isEmpty {
                        VStack(spacing: Spacing.md) {
                            Image(systemName: "checkmark.circle")
                                .font(.system(size: 34))
                                .foregroundStyle(Color.sage)
                            Text("Everything is saved.")
                                .font(.campBodyMedium)
                                .foregroundStyle(Color.forest.opacity(0.6))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, Spacing.xxl)
                    } else {
                        Text("These changes are still on this phone. They were not saved to the camp's records.")
                            .font(.campSmall)
                            .foregroundStyle(Color.forest.opacity(0.6))

                        ForEach(engine.failures) { mutation in
                            failureCard(mutation)
                        }

                        Button("Try all again") {
                            Task { await engine.retryFailed() }
                        }
                        .buttonStyle(.campSecondary)
                    }
                }
                .padding(Spacing.lg)
            }
            .campCanvas()
            .navigationTitle("Unsaved changes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func failureCard(_ mutation: PendingMutation) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(mutation.summary)
                .font(.campBodySemibold)
                .foregroundStyle(Color.forest)

            Text(mutation.createdAt.relativeDisplay)
                .font(.campMeta)
                .foregroundStyle(Color.forest.opacity(0.5))

            if let error = mutation.lastError {
                Text(error)
                    .font(.campMeta)
                    .foregroundStyle(Color.urgentText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Color.urgentBg, in: .rect(cornerRadius: Radius.sm))
            }

            HStack(spacing: Spacing.sm) {
                Button("Try again") {
                    Task { await engine.retry(mutation) }
                }
                .buttonStyle(.campChip(filled: true))

                Button("Discard") {
                    Task { await engine.discard(mutation) }
                }
                .buttonStyle(.campChip(filled: false))

                Spacer()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

// MARK: - Attaching it

extension View {
    /// Puts the sync pill at the bottom of a tab's content, clear of the tab bar.
    ///
    /// A `safeAreaInset` rather than an `overlay` on purpose: an overlay on the TabView anchors
    /// to the screen edge and lands underneath the tab bar. This anchors inside the tab's own
    /// content area, and because the pill renders nothing when there is nothing to report, it
    /// reserves no height in the quiet case.
    func syncStatusBar() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            SyncStatusPill()
                .padding(.bottom, Spacing.xs)
        }
    }
}

/// A small inline marker for a single row whose change has not left the phone yet.
///
/// Used next to a work order or a comment the person just acted on, so "did that go through?"
/// has an answer in the place they are already looking rather than only in the pill.
struct PendingSyncMark: View {
    var label: String = "Waiting to sync"

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 9))
            Text(label)
                .font(.campMicro)
        }
        .foregroundStyle(Color.forest.opacity(0.45))
    }
}
