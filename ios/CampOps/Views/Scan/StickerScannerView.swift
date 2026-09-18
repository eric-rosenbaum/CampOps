import SwiftUI
import VisionKit
import AVFoundation
import Vision

/// The scanner inside the app.
///
/// Universal links mean the phone's own camera opens a sticker in the app, but that only helps
/// somebody who thinks to leave the app first. Walking a property with a list of things to check
/// is the opposite motion: the app is already open, and the sticker is the fastest way to say
/// "this cabin". So the app scans too.
///
/// `DataScannerViewController` rather than a hand-built `AVCaptureSession`: it does the
/// focusing, the highlighting and the accessibility, and it is the same scanner people have used
/// in every other iOS app.
struct StickerScannerView: View {
    /// Called with a resolved target. The sheet stays up until something resolves, so a
    /// misfire on a printed poster does not close it.
    var onScanned: (DeepLinkRouter.ScannedTarget) -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var router = DeepLinkRouter.shared
    @State private var lastCode: String?

    var body: some View {
        NavigationStack {
            Group {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    scanner
                } else {
                    unsupported
                }
            }
            .navigationTitle("Scan a sticker")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onChange(of: router.pending) { _, target in
                guard let target else { return }
                router.clearPending()
                Haptics.success()
                onScanned(target)
            }
        }
    }

    private var scanner: some View {
        ZStack(alignment: .bottom) {
            CodeScannerRepresentable { code in
                // The same sticker stays in frame for as long as somebody holds the phone up,
                // so the same code arrives many times a second. Resolve it once.
                guard code != lastCode else { return }
                lastCode = code
                handle(code)
            }
            .ignoresSafeArea(edges: .bottom)

            VStack(spacing: Spacing.sm) {
                if router.isResolving {
                    ProgressView().tint(.white)
                }
                Text(router.failure ?? L10n.tr("Point the camera at the sticker on the door"))
                    .font(.campMeta)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .padding(Spacing.md)
                    .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: Radius.lg))
            }
            .padding(Spacing.xl)
        }
    }

    private var unsupported: some View {
        VStack(spacing: Spacing.lg) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 44))
                .foregroundStyle(Color.forest.opacity(0.4))
            Text("This device can't scan")
                .font(.campTitle)
                // Fitted on one line in English, so nobody saw it wrap flush left; in Spanish
                // it takes two and hung off-centre above the centred line beneath it.
                .multilineTextAlignment(.center)
            Text("Point the phone's own Camera app at the sticker instead, and it will open here.")
                .font(.campBody)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.forest.opacity(0.6))
        }
        .padding(Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .campCanvas()
    }

    /// A sticker's QR holds the full web URL, not the bare token, so both shapes are accepted:
    /// whatever was printed, and whatever somebody pastes.
    private func handle(_ code: String) {
        let token: String
        if let url = URL(string: code), let parsed = DeepLinkRouter.token(in: url) {
            token = parsed
        } else {
            token = code
        }
        router.handleScanned(token: token)
    }
}

/// Wraps `DataScannerViewController`, reporting every QR payload it sees.
private struct CodeScannerRepresentable: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        // Starting is a throwing call that fails when the camera is unavailable (permission
        // refused, or another app holding it). There is nothing to do about it here, and the
        // instruction label stays up, so the failure is visible rather than fatal.
        try? controller.startScanning()
    }

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            report(addedItems)
        }

        func dataScanner(_ scanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            report([item])
        }

        private func report(_ items: [RecognizedItem]) {
            for item in items {
                if case let .barcode(barcode) = item, let value = barcode.payloadStringValue {
                    onCode(value)
                }
            }
        }
    }
}
