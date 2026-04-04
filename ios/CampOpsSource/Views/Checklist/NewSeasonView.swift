import SwiftUI

struct NewSeasonView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var userManager: UserManager
    @EnvironmentObject private var vm: ChecklistViewModel

    @State private var name = ""
    @State private var openingDate = Date()
    @State private var closingDate = Date().addingTimeInterval(60 * 60 * 24 * 90)
    @State private var isSaving = false

    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    private let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    var body: some View {
        NavigationStack {
            Form {
                Section("Season Info") {
                    TextField("Season name (e.g. Summer 2026)", text: $name)
                    DatePicker("Opening date", selection: $openingDate, displayedComponents: .date)
                    DatePicker("Closing date", selection: $closingDate, displayedComponents: .date)
                }
            }
            .navigationTitle("New Season")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Activate") { Task { await save() } }
                        .disabled(!isValid || isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        let season = Season(
            name: name.trimmingCharacters(in: .whitespaces),
            openingDate: dateFormatter.string(from: openingDate),
            closingDate: dateFormatter.string(from: closingDate),
            isActive: true
        )
        await vm.activateSeason(season, by: userManager.currentUser)
        isSaving = false
        dismiss()
    }
}
