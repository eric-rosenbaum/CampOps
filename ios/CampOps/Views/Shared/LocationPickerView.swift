import SwiftUI

struct LocationPickerView: View {
    @Binding var selected: [String]
    private var options: [String] { AuthManager.shared.currentCamp?.locations ?? [] }

    var body: some View {
        List {
            if options.isEmpty {
                Text("No locations configured for this camp.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(options, id: \.self) { loc in
                    Button {
                        if selected.contains(loc) {
                            selected.removeAll { $0 == loc }
                        } else {
                            selected.append(loc)
                        }
                    } label: {
                        HStack {
                            Text(loc).foregroundColor(.primary)
                            Spacer()
                            if selected.contains(loc) {
                                Image(systemName: "checkmark").foregroundColor(.sage)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Locations")
        .navigationBarTitleDisplayMode(.inline)
    }
}
