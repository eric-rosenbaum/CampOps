import SwiftUI
import PhotosUI

struct PhotoPicker: View {
    @Binding var selectedImage: UIImage?
    var existingUrl: String? = nil

    @State private var pickerItem: PhotosPickerItem? = nil
    @State private var showingSourcePicker = false
    @State private var showingCamera = false

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
                    Button { showingSourcePicker = true } label: {
                        Text("Replace").font(.caption.weight(.medium))
                            .padding(.horizontal, Spacing.sm).padding(.vertical, 4)
                            .background(Color(.systemBackground).opacity(0.85))
                            .cornerRadius(Radius.sm).padding(Spacing.sm)
                    }
                }
            } else {
                Button { showingSourcePicker = true } label: {
                    Label("Add photo", systemImage: "camera")
                        .font(.subheadline).foregroundColor(.sage)
                        .frame(maxWidth: .infinity).frame(height: 100)
                        .background(Color(.systemGray6)).cornerRadius(Radius.md)
                        .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Color.border, lineWidth: 1))
                }
            }
        }
        .confirmationDialog("Add Photo", isPresented: $showingSourcePicker, titleVisibility: .visible) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Take Photo") { showingCamera = true }
            }
            PhotosPicker(selection: $pickerItem, matching: .images) {
                Text("Choose from Library")
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showingCamera) {
            CameraView(image: $selectedImage)
        }
        .onChange(of: pickerItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) { selectedImage = img }
            }
        }
    }
}

// MARK: - Camera wrapper

private struct CameraView: UIViewControllerRepresentable {
    @Binding var image: UIImage?
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
        let parent: CameraView
        init(_ parent: CameraView) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            parent.image = info[.originalImage] as? UIImage
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
