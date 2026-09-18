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
    @State private var pulse = false

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
                        CampErrorBanner(message: errorMessage)
                    }

                    Color.clear.frame(height: Spacing.sm)
                }
                .padding(Spacing.lg)
            }
            .campCanvas()
            // The two ways on sit at the bottom, above the thumb, and never scroll away. They
            // used to be the last thing in the scroll view: after recording, "Read this" was
            // below the fold, which is most of why tapping it seemed to do nothing.
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: Spacing.sm) {
                    Divider().overlay(Color.border)
                    Button { read() } label: {
                        if isReading {
                            HStack(spacing: Spacing.sm) {
                                ProgressView().tint(Color.cream)
                                Text("Reading…")
                            }
                        } else {
                            Label(readButtonTitle, systemImage: "sparkles")
                        }
                    }
                    .buttonStyle(.campPrimary(enabled: hasSomethingToRead && !dictation.isRecording))
                    .disabled(isReading || dictation.isRecording || !hasSomethingToRead)
                    .padding(.horizontal, Spacing.lg)

                    Button {
                        dictation.stop()
                        showForm = true
                    } label: {
                        Label("Just type it", systemImage: "square.and.pencil")
                    }
                    .buttonStyle(.campSecondary)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.sm)
                }
                .background(.bar)
            }
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

    private var hasSomethingToRead: Bool {
        photo != nil || dictation.hasSomethingToSend
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
        VStack(alignment: .leading, spacing: Spacing.md) {
            SectionEyebrow(text: "Say what's wrong")

            // One big target, in the middle, doing one thing: start, or stop. A small chip that
            // changed its label was the whole problem -- it was not obvious it was listening,
            // and not obvious how to finish.
            Button {
                if dictation.isRecording {
                    Task { await dictation.finish() }
                } else {
                    dictation.start()
                }
            } label: {
                VStack(spacing: Spacing.sm) {
                    ZStack {
                        Circle()
                            .fill(dictation.isRecording ? Color.priorityUrgent : Color.sage)
                            .frame(width: 84, height: 84)
                            .opacity(dictation.isRecording && pulse ? 0.55 : 1)
                            .animation(
                                dictation.isRecording
                                    ? .easeInOut(duration: 0.7).repeatForever()
                                    : .default,
                                value: pulse
                            )
                        Image(systemName: dictation.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 32, weight: .medium))
                            .foregroundStyle(Color.cream)
                    }
                    Text(recordLabel)
                        .font(.campBodySemibold)
                        .foregroundStyle(Color.forest)
                    if dictation.isRecording {
                        Text(timeLabel)
                            .font(.campMeta)
                            .monospacedDigit()
                            .foregroundStyle(Color.forest.opacity(0.55))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.lg)
            }
            .buttonStyle(.plain)
            .onAppear { pulse = true }

            if !dictation.transcript.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text(dictation.transcript)
                        .font(.campBody)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !dictation.isRecording {
                        HStack(spacing: Spacing.md) {
                            Button("Record again") { dictation.start() }
                                .buttonStyle(.campChip(filled: false))
                            Button("Clear") { dictation.clear() }
                                .font(.campLabel)
                                .buttonStyle(.plain)
                                .underline()
                            Spacer()
                        }
                    }
                }
                .cardSurface()
            }

            if let issue = dictation.problem {
                CampErrorBanner(message: issue)
            }
        }
    }

    /// Says what the button will do next, not what state it is in.
    private var recordLabel: String {
        if dictation.isRecording { return "Tap to stop" }
        return dictation.hasSomethingToSend ? "Record again" : "Tap to record"
    }

    private var readButtonTitle: String {
        if photo != nil && dictation.hasSomethingToSend { return "Read the photo and what I said" }
        if photo != nil { return "Read the photo" }
        if dictation.hasSomethingToSend { return "Use what I said" }
        return "Read this"
    }

    private var timeLabel: String {
        let seconds = Int(dictation.elapsed)
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private func read() {
        errorMessage = nil
        isReading = true
        Task {
            defer { isReading = false }
            // The last words arrive after the mic stops, so wait for them rather than sending
            // an empty transcript and being told nothing could be read.
            await dictation.finish()
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
    /// Seconds recorded, so the button can show something moving. A mic that looks identical
    /// whether or not it is listening is a mic nobody trusts.
    @Published private(set) var elapsed: TimeInterval = 0

    private let recognizer = SFSpeechRecognizer(locale: Locale.current)
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()
    private var timer: Timer?
    /// Resumed when the recogniser delivers its last result after the audio stops.
    private var finalResult: CheckedContinuation<Void, Never>?

    var hasSomethingToSend: Bool { !transcript.trimmingCharacters(in: .whitespaces).isEmpty }

    func start() {
        problem = nil

        // The simulator has no audio input path, and asking for one is not a graceful failure:
        // `AVAudioEngine.inputNode` waits on an audio server that never answers and then calls
        // abort(), which took the whole app down twice while this was being built. There is
        // nothing to record here and nothing to be gained by trying.
        #if targetEnvironment(simulator)
        problem = "Dictation needs a real device. On a phone this records what you say; here, type it."
        return
        #else
        // Permission first, and the microphone's own permission at that. Speech authorization
        // alone is not enough: the engine is what touches the hardware.
        AVAudioApplication.requestRecordPermission { granted in
            Task { @MainActor in
                guard granted else {
                    self.problem = "The microphone is off for CampCommand. Turn it on in Settings, or type it."
                    return
                }
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
        }
        #endif
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

            // Ask whether there is a microphone to open BEFORE touching `engine.inputNode`.
            //
            // Reaching for the input node when the audio server has no input route does not
            // throw -- it times out inside CoreAudio and calls abort(), taking the app with it.
            // That is not a simulator curiosity: a phone with no route (mid-call, some CarPlay
            // and accessory states) does the same, and the crash lands on somebody standing in
            // front of a broken pump trying to describe it.
            guard session.isInputAvailable, !(session.availableInputs ?? []).isEmpty else {
                problem = "No microphone is available right now. You can still type it."
                try? session.setActive(false, options: .notifyOthersOnDeactivation)
                return
            }

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            // On-device recognition ONLY when there is no connection to do better.
            //
            // Forcing it whenever the phone claims to support it was the other half of "voice
            // does not work": support is not readiness, and a locale whose model has not been
            // downloaded fails the task immediately, leaving an empty transcript and a screen
            // that looked like it had simply forgotten what was said.
            request.requiresOnDeviceRecognition =
                !SyncEngine.shared.isOnline && recognizer.supportsOnDeviceRecognition
            self.request = request

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            // A zero-channel or zero-rate format is the other way this fails: the tap installs
            // and then the engine throws on start, or delivers nothing at all.
            guard format.channelCount > 0, format.sampleRate > 0 else {
                problem = "The microphone isn't ready. You can still type it."
                teardown()
                return
            }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
            transcript = ""
            elapsed = 0
            isRecording = true
            timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
                guard let self else { return }
                Task { @MainActor in self.tick() }
            }

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let result { self.transcript = result.bestTranscription.formattedString }
                    // A failure has to say so. Swallowing it left the recording UI vanishing
                    // with nothing to show for it, which reads as the app losing the words.
                    if let error, self.transcript.isEmpty {
                        self.problem = Self.explain(error)
                    }
                    // The last words arrive AFTER the audio ends. Whoever is waiting on the
                    // finished transcript is released here, not when the mic stopped.
                    if error != nil || (result?.isFinal ?? false) {
                        self.releaseWaiter()
                        self.teardown()
                    }
                }
            }
        } catch {
            problem = "Couldn't start the microphone. You can still type it."
            teardown()
        }
    }

    /// Stops recording and waits for the recogniser's last words.
    ///
    /// Without the wait, tapping Stop and then Read sent an empty transcript: speech recognition
    /// delivers its final result asynchronously after the audio ends, so the words were still in
    /// flight. The person had spoken a whole sentence and the app said it could not read it.
    func finish() async {
        guard isRecording else { return }
        stopAudio()
        defer {
            if transcript.trimmingCharacters(in: .whitespaces).isEmpty, problem == nil {
                problem = "Nothing was picked up. Hold the phone closer and try again."
            }
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            finalResult = continuation
            // A recogniser that never delivers must not hold the button hostage; whatever has
            // been transcribed so far is better than a spinner that does not end.
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(2))
                self.releaseWaiter()
            }
        }
    }

    /// Turns a recogniser failure into something worth reading.
    private static func explain(_ error: Error) -> String {
        let text = error.localizedDescription.lowercased()
        if text.contains("no speech") || text.contains("retry") {
            return "Nothing was picked up. Hold the phone closer and try again."
        }
        if text.contains("network") || text.contains("connection") {
            return "Dictation needs a connection here, and there isn't one. Type it instead."
        }
        return "Dictation stopped early: \(error.localizedDescription). You can type it instead."
    }

    /// Stop without waiting, for cancelling out of the sheet.
    func stop() {
        stopAudio()
        releaseWaiter()
        teardown()
    }

    func clear() {
        transcript = ""
        elapsed = 0
    }

    private func tick() { elapsed += 0.2 }

    private func stopAudio() {
        guard engine.isRunning || isRecording else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        isRecording = false
        timer?.invalidate(); timer = nil
    }

    private func releaseWaiter() {
        finalResult?.resume()
        finalResult = nil
    }

    private func teardown() {
        task?.cancel()
        request = nil
        task = nil
        isRecording = false
        timer?.invalidate(); timer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
