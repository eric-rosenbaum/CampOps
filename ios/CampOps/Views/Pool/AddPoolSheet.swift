import SwiftUI

struct AddPoolSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: PoolViewModel

    var editingPool: CampPool? = nil

    @State private var name: String = ""
    @State private var type: PoolType = .pool
    @State private var notes: String = ""
    @State private var isActive: Bool = true
    @State private var isSaving = false
    @State private var showingDeleteConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Pool / waterfront") {
                    TextField("Name (e.g. Main Pool, Waterfront)", text: $name)
                    Picker("Type", selection: $type) {
                        ForEach(PoolType.allCases, id: \.self) { t in
                            Label(t.displayName, systemImage: t.icon).tag(t)
                        }
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(typeDescription)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("About this type")
                }

                Section("Options") {
                    Toggle("Active", isOn: $isActive)
                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                }

                if editingPool != nil {
                    Section {
                        Button("Delete pool", role: .destructive) {
                            showingDeleteConfirm = true
                        }
                    }
                }
            }
            .navigationTitle(editingPool == nil ? "Add pool" : "Edit pool")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let p = editingPool {
                    name = p.name
                    type = p.type
                    notes = p.notes ?? ""
                    isActive = p.isActive
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editingPool == nil ? "Add" : "Save") { save() }
                        .disabled(name.isEmpty || isSaving)
                }
            }
            .confirmationDialog(
                "Delete \"\(editingPool?.name ?? "this pool")\"?",
                isPresented: $showingDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete pool", role: .destructive) {
                    if let p = editingPool {
                        Task { await vm.deletePool(id: p.id); dismiss() }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All readings, equipment, and tasks for this pool will also be deleted.")
            }
        }
    }

    private var typeDescription: String {
        switch type {
        case .pool:       return "Chemical pool — tracks chlorine, pH, alkalinity, and cyanuric acid readings alongside equipment and inspections."
        case .other:      return "Chemical facility — tracks chemical readings like a pool. Use for splash pads or other treated water features."
        case .lake:       return "Natural lake — no chemical tracking. Manage equipment, safety inspections, and seasonal tasks."
        case .pond:       return "Pond — no chemical tracking. Manage equipment, safety inspections, and seasonal tasks."
        case .river:      return "River or stream — no chemical tracking. Manage equipment, safety inspections, and seasonal tasks."
        case .waterfront: return "General waterfront — no chemical tracking. Manage equipment, safety inspections, and seasonal tasks."
        }
    }

    private func save() {
        isSaving = true
        let now = Date()
        if let p = editingPool {
            var updated = p
            updated.name = name
            updated.type = type
            updated.notes = notes.isEmpty ? nil : notes
            updated.isActive = isActive
            updated.updatedAt = now
            Task { await vm.updatePool(updated); dismiss() }
        } else {
            let pool = CampPool(
                id: UUID().uuidString,
                name: name,
                type: type,
                isActive: isActive,
                notes: notes.isEmpty ? nil : notes,
                sortOrder: vm.pools.count,
                createdAt: now,
                updatedAt: now
            )
            Task { await vm.addPool(pool); dismiss() }
        }
    }
}
