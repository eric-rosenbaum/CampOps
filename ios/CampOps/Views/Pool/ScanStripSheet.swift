import SwiftUI
import PhotosUI

struct ScanStripSheet: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    let poolId: String
    let onSave: (ChemicalReading) async -> Void

    private enum ScanPhase { case setup, analyzing, review }

    @AppStorage("defaultStripBrand") private var defaultBrandRaw: String = StripBrand.aquachek.rawValue

    @State private var phase: ScanPhase = .setup
    @State private var selectedBrand: StripBrand = .aquachek
    @State private var capturedImage: UIImage? = nil
    @State private var showingCamera = false
    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var errorMessage: String? = nil
    @State private var isSaving = false
    @State private var showingLibraryPicker = false

    @State private var freeChlorine: Double = 2.0
    @State private var ph: Double = 7.4
    @State private var alkalinity: Double = 100.0
    @State private var cyanuricAcid: Double = 40.0
    @State private var waterTemp: Double = 76.0
    @State private var calcHardnessText: String = ""
    @State private var poolStatus: PoolStatusValue = .openAllClear
    @State private var correctiveAction: String = ""
    @State private var readingTime: Date = Date()
    @State private var confidences: [String: Double] = [:]
    @State private var scanNotes: String? = nil

    // MARK: - Body

    var body: some View {
        mainContent
            .sheet(isPresented: $showingCamera) {
                StripCameraCapture { img in
                    print("📸 [ScanStrip] camera captured image \(img.size)")
                    capturedImage = img
                    startAnalysis(img)
                }
            }
            .photosPicker(isPresented: $showingLibraryPicker, selection: $pickerItem, matching: .images)
            .onChange(of: pickerItem) { _, item in
                handlePickerItem(item)
            }
            .alert("Could Not Read Strip", isPresented: errorAlertBinding) {
                Button("Try Again") {
                    errorMessage = nil
                    capturedImage = nil
                    pickerItem = nil
                }
                Button("Cancel", role: .cancel) { dismiss() }
            } message: {
                Text(errorMessage ?? "")
            }
            .onAppear {
                selectedBrand = StripBrand(rawValue: defaultBrandRaw) ?? .aquachek
            }
    }

    private var mainContent: some View {
        NavigationStack {
            phaseContent
                .navigationTitle(navTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    if case .review = phase {
                        ToolbarItem(placement: .confirmationAction) {
                            if isSaving {
                                ProgressView().scaleEffect(0.8)
                            } else {
                                Button("Log") { saveReading() }
                            }
                        }
                    }
                }
        }
    }

    private var navTitle: String {
        switch phase {
        case .setup:     return "Scan Test Strip"
        case .analyzing: return "Analyzing…"
        case .review:    return "Review Reading"
        }
    }

    // MARK: - Phase content

    @ViewBuilder
    private var phaseContent: some View {
        switch phase {
        case .setup:     setupView
        case .analyzing: analyzingView
        case .review:    reviewView
        }
    }

    // MARK: - Setup

    private var setupView: some View {
        Form {
            Section {
                VStack(spacing: Spacing.md) {
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 56))
                        .foregroundColor(.sage)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Spacing.sm)
                    Text("Take or upload a photo of your test strip and results will be filled in automatically.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            Section {
                Picker("Strip brand", selection: $selectedBrand) {
                    ForEach(StripBrand.allCases) { brand in
                        Text(brand.rawValue).tag(brand)
                    }
                }
                .pickerStyle(.menu)
            } header: {
                Text("Strip brand")
            } footer: {
                brandFooter
            }

            Section {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button { showingCamera = true } label: {
                        Label("Take Photo", systemImage: "camera.fill")
                            .frame(maxWidth: .infinity, alignment: .center)
                            .foregroundColor(.white)
                    }
                    .listRowBackground(Color.sage)
                }
                Button { showingLibraryPicker = true } label: {
                    Label("Choose from Library", systemImage: "photo.on.rectangle")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .foregroundColor(.forest)
                }
            }
        }
    }

    @ViewBuilder
    private var brandFooter: some View {
        if selectedBrand.rawValue == defaultBrandRaw {
            Label("Saved as your default", systemImage: "checkmark.circle.fill")
                .foregroundColor(.sage)
        } else {
            HStack {
                Text("Helps identify the correct color scale for your strips.")
                Spacer()
                Button("Set as default") { defaultBrandRaw = selectedBrand.rawValue }
            }
        }
    }

    // MARK: - Analyzing

    private var analyzingView: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()
            if let img = capturedImage {
                ZStack {
                    Color.black
                    Image(uiImage: img).resizable().scaledToFit()
                }
                .frame(width: 180, height: 180)
                .cornerRadius(Radius.md)
            }
            ProgressView()
                .scaleEffect(1.4)
                .padding(.top, Spacing.md)
            Text("Analyzing test strip…")
                .font(.headline).foregroundColor(.forest)
            Text("Reading the color blocks…")
                .font(.subheadline).foregroundColor(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Review

    private var reviewView: some View {
        Form {
            if let img = capturedImage {
                Section {
                    ZStack {
                        Color.black
                        Image(uiImage: img).resizable().scaledToFit()
                    }
                    .aspectRatio(1, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                }
                .listRowInsets(EdgeInsets())
            }

            Section("Chemical levels") {
                ScanReadingField(label: "Free chlorine (ppm)", value: $freeChlorine,
                                 status: chemStatus(field: .freeChlorine, value: freeChlorine),
                                 range: "Target: 1.0–3.0", step: 0.5, format: "%.1f",
                                 confidence: confidences["free_chlorine"])
                ScanReadingField(label: "pH", value: $ph,
                                 status: chemStatus(field: .ph, value: ph),
                                 range: "Target: 7.2–7.8", step: 0.2, format: "%.1f",
                                 confidence: confidences["ph"])
                ScanReadingField(label: "Alkalinity (ppm)", value: $alkalinity,
                                 status: chemStatus(field: .alkalinity, value: alkalinity),
                                 range: "Target: 80–120", step: 10, format: "%.0f",
                                 confidence: confidences["alkalinity"])
                ScanReadingField(label: "Cyanuric acid (ppm)", value: $cyanuricAcid,
                                 status: chemStatus(field: .cyanuricAcid, value: cyanuricAcid),
                                 range: "Target: 30–50", step: 5, format: "%.0f",
                                 confidence: confidences["cyanuric_acid"])
                ScanReadingField(label: "Water temp (°F)", value: $waterTemp,
                                 status: chemStatus(field: .waterTemp, value: waterTemp),
                                 range: "Target: 68–82", step: 1, format: "%.0f",
                                 confidence: nil)
            }

            Section("Details") {
                DatePicker("Reading time", selection: $readingTime,
                           displayedComponents: [.date, .hourAndMinute])
                Picker("Pool status", selection: $poolStatus) {
                    ForEach(PoolStatusValue.allCases, id: \.self) { s in
                        Text(s.displayName).tag(s)
                    }
                }
                LabeledContent("Logged by") {
                    Text(authManager.currentUser.name).foregroundColor(.secondary)
                }
            }

            Section("Notes (optional)") {
                TextField("Corrective action taken, observations…", text: $correctiveAction, axis: .vertical)
                    .lineLimit(3...6)
            }
        }
        .onAppear { print("🖼️ [ScanStrip] reviewView appeared") }
    }

    // MARK: - Photo handling

    private func handlePickerItem(_ item: PhotosPickerItem?) {
        print("📚 [ScanStrip] pickerItem onChange — item=\(item != nil ? "non-nil" : "nil"), phase=\(phase)")
        guard let item else { return }
        Task {
            print("📚 [ScanStrip] loading transferable…")
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let img = UIImage(data: data) else {
                print("📚 [ScanStrip] failed to load image data")
                await MainActor.run { pickerItem = nil }
                return
            }
            print("📚 [ScanStrip] image loaded \(img.size), calling startAnalysis")
            await MainActor.run {
                pickerItem = nil
                capturedImage = img
                startAnalysis(img)
            }
        }
    }

    // MARK: - Analysis

    private func startAnalysis(_ image: UIImage) {
        print("🔬 [ScanStrip] startAnalysis — phase=\(phase)")
        guard phase == .setup else {
            print("🔬 [ScanStrip] skipped — not in setup phase")
            return
        }
        phase = .analyzing
        print("🔬 [ScanStrip] phase → analyzing")
        Task { @MainActor in
            do {
                print("🔬 [ScanStrip] calling TestStripService…")
                let result = try await TestStripService.shared.analyzeStrip(image: image, brand: selectedBrand)
                print("🔬 [ScanStrip] analysis succeeded — fc=\(result.freeChlorine?.value ?? -1) ph=\(result.ph?.value ?? -1) alk=\(result.alkalinity?.value ?? -1)")
                print("🔬 [ScanStrip] isMainThread=\(Thread.isMainThread)")
                applyResult(result)
                print("🔬 [ScanStrip] applyResult done, setting phase → review")
                phase = .review
                print("🔬 [ScanStrip] phase = .review assigned")
            } catch let e as StripScanError {
                print("🔬 [ScanStrip] StripScanError: \(e.localizedDescription)")
                errorMessage = e.localizedDescription
                phase = .setup
            } catch {
                print("🔬 [ScanStrip] unknown error: \(error)")
                errorMessage = "Analysis failed. Check your connection and try again."
                phase = .setup
            }
        }
    }

    private func applyResult(_ result: StripScanResult) {
        if let v = result.freeChlorine  { freeChlorine  = v.value; confidences["free_chlorine"]    = v.confidence }
        if let v = result.ph            { ph            = v.value; confidences["ph"]               = v.confidence }
        if let v = result.alkalinity    { alkalinity    = v.value; confidences["alkalinity"]        = v.confidence }
        if let v = result.cyanuricAcid  { cyanuricAcid  = v.value; confidences["cyanuric_acid"]    = v.confidence }
        if let v = result.calciumHardness {
            calcHardnessText = String(Int(v.value.rounded()))
            confidences["calcium_hardness"] = v.confidence
        }
        scanNotes = result.notes
        let fcStatus = chemStatus(field: .freeChlorine, value: freeChlorine)
        let phStatus = chemStatus(field: .ph, value: ph)
        if fcStatus == .alert || phStatus == .alert      { poolStatus = .closedCorrective }
        else if fcStatus == .warn || phStatus == .warn   { poolStatus = .openMonitoring }
        else                                              { poolStatus = .openAllClear }
    }

    // MARK: - Save

    private func saveReading() {
        isSaving = true
        let readingId = UUID().uuidString
        let reading = ChemicalReading(
            id: readingId, poolId: poolId,
            freeChlorine: freeChlorine, ph: ph, alkalinity: alkalinity,
            cyanuricAcid: cyanuricAcid, waterTemp: waterTemp,
            calciumHardness: Double(calcHardnessText),
            readingTime: readingTime,
            loggedById: authManager.currentUser.id,
            loggedByName: authManager.currentUser.name,
            correctiveAction: correctiveAction.isEmpty ? nil : correctiveAction,
            poolStatus: poolStatus, createdAt: Date()
        )
        Task {
            await onSave(reading)
            if let img = capturedImage {
                try? await TestStripService.shared.uploadStripPhoto(img, readingId: readingId)
            }
            dismiss()
        }
    }

    // MARK: - Helpers

    private var errorAlertBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }
}

// MARK: - ScanReadingField

private struct ScanReadingField: View {
    let label: String
    @Binding var value: Double
    let status: ChemStatus
    let range: String
    let step: Double
    let format: String
    let confidence: Double?

    private var isLowConfidence: Bool { (confidence ?? 1.0) < 0.65 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).foregroundColor(.primary)
                if isLowConfidence {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundColor(.priorityHigh)
                }
                Spacer()
                Circle().fill(status.color).frame(width: 8, height: 8)
                Text(String(format: format, value))
                    .font(.subheadline.monospacedDigit().weight(.medium))
                    .foregroundColor(isLowConfidence ? .priorityHigh : status.color)
                    .frame(width: 50, alignment: .trailing)
            }
            Stepper(value: $value, in: 0...999, step: step) { EmptyView() }.labelsHidden()
            Text(range).font(.caption2).foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Camera (callback-based, avoids binding/onChange chain)

private struct StripCameraCapture: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: StripCameraCapture
        init(_ parent: StripCameraCapture) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            print("📸 [Camera] didFinishPickingMediaWithInfo")
            if let img = info[.originalImage] as? UIImage {
                print("📸 [Camera] got image \(img.size), firing onCapture")
                parent.onCapture(img)
            } else {
                print("📸 [Camera] no image in info dict — keys: \(info.keys)")
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            print("📸 [Camera] cancelled")
            parent.dismiss()
        }
    }
}
