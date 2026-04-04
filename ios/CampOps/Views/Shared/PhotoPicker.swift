import SwiftUI
import PhotosUI

struct PhotoPicker: View {
    @Binding var selectedImage: UIImage?
    var existingUrl: String? = nil
    @State private var pickerItem: PhotosPickerItem? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Photo").font(.subheadline.weight(.medium))
            if let img = selectedImage {
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: img).resizable().scaledToFill()
                        .frame(maxWidth: .infinity).frame(height: 180)
                        .clipped().cornerRadius(Radius.md)
                    Button { selectedImage = nil; pickerItem = nil } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3).foregroundColor(.white).shadow(radius: 2).padding(Spacing.sm)
                    }
                }
            } else if let url = existingUrl, let imageUrl = URL(string: url) {
                ZStack(alignment: .topTrailing) {
                    AsyncImage(url: imageUrl) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color(.systemGray5)
                        }
                    }
                    .frame(maxWidth: .infinity).frame(height: 180)
                    .clipped().cornerRadius(Radius.md)
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Text("Replace").font(.caption.weight(.medium))
                            .padding(.horizontal, Spacing.sm).padding(.vertical, 4)
                            .background(Color(.systemBackground).opacity(0.85))
                            .cornerRadius(Radius.sm).padding(Spacing.sm)
                    }
                }
            } else {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label("Add photo", systemImage: "camera")
                        .font(.subheadline).foregroundColor(.sage)
                        .frame(maxWidth: .infinity).frame(height: 100)
                        .background(Color(.systemGray6)).cornerRadius(Radius.md)
                        .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Color.border, lineWidth: 1))
                }
            }
        }
        .onChange(of: pickerItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) { selectedImage = img }
            }
        }
    }
}
