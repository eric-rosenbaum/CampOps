import SwiftUI
import Speech
import UIKit
import Combine

/// Photograph it, say what is wrong, and let the form fill itself in.
///
/// The fastest honest path from "I am looking at a broken thing" to "it is logged". The model
/// reads the photo and the sentence and proposes a work order; the person confirms it. It never
/// files anything by itself, and the draft always lands in the ordinary form, because the form
/// is where somebody can see and fix what it got wrong.
///
/// With no signal it still works: the photo is kept, the form opens empty, and the person types
/// a line. That is the difference between a feature that degrades and one that blocks.
struct CaptureSheet: View {
    var locationId: String?
    var locationName: String?
    var assetId: String?
    var assetName: String?

    @EnvironmentObject private var authManager: AuthManager
    @EnvironmentObject private var issueVM: IssueListViewModel
    @Environment(\.dismiss) private var dismiss

    @StateObject private var dictation = Dictation()
    @State private var photo: UIImage?
    @State private var isPickingPhoto = false
    @State private var isReading = false
    @State private var draft: WorkOrderDraft?
    @State private var errorMessage: String?
    @State private var showForm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    if let locationName {
                        Label(locationName, systemImage: "mappin.and.ellipse")
                            .font(.campMeta)
                            .foregroundStyle(Color.forest.opacity(0.6))
                    }
                    if let assetName {
                        Label(assetName, systemImage: "wrench.and.screwdriver")
                            .font(.campMeta)
                            .foregroundStyle(Color.forest.opacity(0.6))
                    }

                    photoBlock
                    dictationBlock

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.campMeta)
                            .foregroundStyle(Color.priorityUrgent)
                    }

                    Button {
                        read()
                    } label: {
                        if isReading {
                            HStack(spacing: Spacing.sm) {
                                ProgressView().tint(Color.ccCream)
                                Text("Reading…")
                            }
                            .frame(maxWidth: .infinity)
                        } else {
                            Label("Read this", systemImage: "sparkles")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.campPrimary())
                    .disabled(isReading || (photo == nil && dictation.transcript.isEmpty))

                    Button("Just type it") { showForm = true }
                        .buttonStyle(.campSecondary)
                        .frame(maxWidth: .infinity)
                }
                .padding(Spacing.lg)
            }
            .campCanvas()
            .navigationTitle("Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dictation.stop()
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $isPickingPhoto) {
                NavigationStack {
                    PhotoPicker(selectedImage: $photo)
                        .padding(Spacing.lg)
                        .navigationTitle("Photo")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { isPickingPhoto = false }
                            }
                        }
                }
                .presentationDetents([.medium])
            }
            .fullScreenCover(isPresented: $showForm, onDismiss: { dismiss() }) {
                LogIssueView(
                    prefillLocationId: locationId,
                    prefillAssetId: assetId,
                    draft: draft,
                    photo: photo,
                    // Everything the person said goes into the description verbatim, under the
                    // model's own wording. A transcript is evidence; a summary is a guess.
                    spokenNote: dictation.transcript
                )
            }
        }
    }

    private var photoBlock: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Photo")
            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 220)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                Button("Retake") { isPickingPhoto = true }
                    .buttonStyle(.campChip(filled: false))
            } else {
                Button {
                    isPickingPhoto = true
                } label: {
                    VStack(spacing: Spacing.sm) {
                        Image(systemName: "camera.fill").font(.system(size: 28))
                        Text("Take a photo").font(.campBody)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.xl)
                    .background(Color.surfaceRaised, in: RoundedRectangle(cornerRadius: Radius.lg))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.lg)
                            .strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4]))
                    )
                    .foregroundStyle(Color.forest.opacity(0.7))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var dictationBlock: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionEyebrow(text: "Say what's wrong")
            Button {
                if dictation.isRecording { dictation.stop() } else { dictation.start() }
            } label: {
                Label(
                    dictation.isRecording ? "Stop" : "Hold the mic and talk",
                    systemImage: dictation.isRecording ? "stop.circle.fill" : "mic.fill"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.campChip(filled: dictation.isRecording))

            if !dictation.transcript.isEmpty {
                Text(dictation.transcript)
                    .font(.campBody)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
            }
            if let issue = dictation.problem {
                Text(issue).font(.campMeta).foregroundStyle(Color.forest.opacity(0.55))
            }
        }
    }

    private func read() {
        errorMessage = nil
        isReading = true
        dictation.stop()
        Task {
            defer { isReading = false }
            let context = DraftContext(
                locationId: locationId, locationName: locationName,
                assetId: assetId, assetName: assetName,
                recentTitles: issueVM.issues.prefix(20).map(\.title)
            )
            do {
                draft = try await DraftWorkOrderService.shared.draft(
                    image: photo,
                    transcript: dictation.transcript.isEmpty ? nil : dictation.transcript,
                    context: context
                )
                showForm = true
            } catch {
                // A failure is never a dead end: the photo and the words are still here, and
                // the form opens with both attached.
                errorMessage = error.localizedDescription
            }
        }
    }
}

/// Speech-to-text, for the half of a report that is easier said than typed.
///
/// On-device where the phone supports it, so a description of a broken pump does not need a
/// connection -- which matters, because the places things break are the places with no signal.
@MainActor
final class Dictation: ObservableObject {
    @Published private(set) var transcript = ""
    @Published private(set) var isRecording = false
    @Published private(set) var problem: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale.current)
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()

    func start() {
        problem = nil
        SFSpeechRecognizer.requestAuthorization { status in
            Task { @MainActor in
                guard status == .authorized else {
                    self.problem = "Dictation needs permission in Settings. You can still type it."
                    return
                }
                self.begin()
            }
        }
    }

    private func begin() {
        guard let recognizer, recognizer.isAvailable else {
            problem = "Dictation isn't available right now. You can still type it."
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            // Keeps the audio on the phone when the phone can manage it, which is both the
            // private option and the one that works with no bars.
            request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
            self.request = request

            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
            isRecording = true

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor in
                    if let result { self?.transcript = result.bestTranscription.formattedString }
                    if error != nil || (result?.isFinal ?? false) { self?.stop() }
                }
            }
        } catch {
            problem = "Couldn't start the microphone. You can still type it."
            stop()
        }
    }

    func stop() {
        guard isRecording || engine.isRunning else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
