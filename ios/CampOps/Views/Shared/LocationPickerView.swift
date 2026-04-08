import SwiftUI

struct LocationPickerView: View {
    @Binding var selected: [CampLocation]

    var body: some View {
        List {
            ForEach(CampLocation.allCases, id: \.self) { loc in
                Button {
                    if selected.contains(loc) {
                        selected.removeAll { $0 == loc }
                    } else {
                        selected.append(loc)
                    }
                } label: {
                    HStack {
                        Text(loc.displayName).foregroundColor(.primary)
                        Spacer()
                        if selected.contains(loc) {
                            Image(systemName: "checkmark").foregroundColor(.sage)
                        }
                    }
                }
            }
        }
        .navigationTitle("Locations")
        .navigationBarTitleDisplayMode(.inline)
    }
}
