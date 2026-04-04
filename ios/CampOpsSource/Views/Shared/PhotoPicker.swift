import SwiftUI
import PhotosUI

struct PhotoPicker: View {
    @Binding var selectedImage: UIImage?
    var existingUrl: String? = nil

    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var showingOptions = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Photo")
                .font(.subheadline.weight(.medium))

            if let img = selectedImage {
                // Show selected image
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 180)
                        .clipped()
                        .cornerRadius(Radius.md)

                    Button {
                        selectedImage = nil
                        pickerItem = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundColor(.white)
                            .shadow(radius: 2)
                            .padding(Spacing.sm)
                    }
                }
            } else if let url = existingUrl, let imageUrl = URL(string: url) {
                // Show existing remote photo
                ZStack(alignment: .topTrailing) {
                    AsyncImage(url: imageUrl) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color(.systemGray5)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .clipped()
                    .cornerRadius(Radius.md)

                    Button {
                        // Signal removal via nil selectedImage + caller checks
                    } label: {
                        PhotosPickerButton(pickerItem: $pickerItem, label: "Replace")
                    }
                }
            } else {
                // Empty state — picker button
                PhotosPickerButton(pickerItem: $pickerItem, label: nil)
            }
        }
        .onChange(of: pickerItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    selectedImage = img
                }
            }
        }
    }
}

private struct PhotosPickerButton: View {
    @Binding var pickerItem: PhotosPickerItem?
    let label: String?

    var body: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            if let label {
                Text(label)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, 4)
                    .background(Color(.systemBackground).opacity(0.85))
                    .cornerRadius(Radius.sm)
                    .padding(Spacing.sm)
            } else {
                Label("Add photo", systemImage: "camera")
                    .font(.subheadline)
                    .foregroundColor(.sage)
                    .frame(maxWidth: .infinity)
                    .frame(height: 100)
                    .background(Color(.systemGray6))
                    .cornerRadius(Radius.md)
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.md)
                            .stroke(Color.border, lineWidth: 1)
                    )
            }
        }
    }
}
