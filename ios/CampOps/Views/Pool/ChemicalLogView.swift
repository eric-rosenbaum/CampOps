import SwiftUI

struct ChemicalLogView: View {
    @EnvironmentObject private var vm: PoolViewModel
    @EnvironmentObject private var userManager: UserManager
    @State private var chartField: ChemField?
    @State private var editingReading: ChemicalReading?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.md) {
                if let latest = vm.latestReading {
                    // Alert / warn banners
                    ForEach(Array(vm.alertMessages.enumerated()), id: \.offset) { _, item in
                        AlertBannerRow(level: item.level, message: item.message)
                    }
                    // Status cards grid — tappable for chart
                    statusCards(latest)
                    // Pool status badge
                    poolStatusRow(latest)
                } else {
                    emptyChemState
                }

                // Readings log
                if !vm.filteredReadings.isEmpty {
                    readingsSection
                }
            }
            .padding(Spacing.md)
        }
        .background(Color(.systemGroupedBackground))
        .sheet(item: $chartField) { field in
            ChemFieldChartView(field: field, readings: vm.readings)
        }
        .sheet(item: $editingReading) { reading in
            LogReadingSheet(
                poolId: reading.poolId,
                editing: reading,
                onSave: { updated in await vm.updateReading(updated) },
                onDelete: { id in await vm.deleteReading(id: id) }
            )
            .environmentObject(userManager)
        }
    }

    @ViewBuilder
    private func statusCards(_ r: ChemicalReading) -> some View {
        let fields: [ChemField] = [.freeChlorine, .ph, .alkalinity, .cyanuricAcid]
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Spacing.sm) {
            ForEach(fields, id: \.self) { field in
                Button { chartField = field } label: {
                    ChemStatusCard(field: field, value: field.value(from: r))
                }
                .buttonStyle(.plain)
            }
        }
        // Water temp full width
        Button { chartField = .waterTemp } label: {
            ChemStatusCard(field: .waterTemp, value: r.waterTemp, fullWidth: true)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func poolStatusRow(_ r: ChemicalReading) -> some View {
        HStack {
            Image(systemName: "drop.fill").foregroundColor(.sage)
            Text("Pool status").font(.subheadline).foregroundColor(.secondary)
            Spacer()
            Text(r.poolStatus.displayName)
                .font(.subheadline.weight(.medium))
                .foregroundColor(.forest)
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
    }

    private var readingsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Readings log")
                .font(.headline)
                .foregroundColor(.forest)
                .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                // Header row
                HStack(spacing: 0) {
                    Text("Date").frame(maxWidth: .infinity, alignment: .leading)
                    Text("Cl").frame(width: 42, alignment: .trailing)
                    Text("pH").frame(width: 42, alignment: .trailing)
                    Text("Alk").frame(width: 42, alignment: .trailing)
                    Text("CYA").frame(width: 42, alignment: .trailing)
                    Text("Temp").frame(width: 46, alignment: .trailing)
                }
                .font(.caption.weight(.semibold))
                .foregroundColor(.secondary)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(Color(.systemGroupedBackground))

                Divider()

                let sortedReadings = vm.filteredReadings.sorted { $0.readingTime > $1.readingTime }
                ForEach(Array(sortedReadings.enumerated()), id: \.element.id) { idx, r in
                    Button {
                        editingReading = r
                    } label: {
                        ReadingRow(reading: r, isLast: idx == sortedReadings.count - 1)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Color(.systemBackground))
            .cornerRadius(Radius.md)
        }
    }

    private var emptyChemState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "drop.circle").font(.system(size: 48)).foregroundColor(.sageLight)
            Text("No readings logged").font(.headline).foregroundColor(.secondary)
            Text("Tap + to log a chemical reading").font(.subheadline).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Spacing.xxl)
    }
}

// MARK: - Alert banner row

private struct AlertBannerRow: View {
    let level: ChemStatus
    let message: String
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: level == .alert ? "exclamationmark.triangle.fill" : "exclamationmark.circle.fill")
                .foregroundColor(level.color)
            Text(message).font(.subheadline).foregroundColor(.forest)
            Spacer()
        }
        .padding(Spacing.md)
        .background(level.bgColor)
        .cornerRadius(Radius.md)
    }
}

// MARK: - Status card

private struct ChemStatusCard: View {
    let field: ChemField
    let value: Double
    var fullWidth: Bool = false
    private var status: ChemStatus { chemStatus(field: field, value: value) }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(field.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(formattedValue)
                        .font(.title2.weight(.bold).monospacedDigit())
                        .foregroundColor(.forest)
                    Text(field.unit)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Text(field.rangeDisplay)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            Spacer()
            VStack(spacing: 4) {
                Circle()
                    .fill(status.color)
                    .frame(width: 10, height: 10)
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(Spacing.md)
        .background(status.bgColor.opacity(status == .ok ? 0 : 1).overlay(Color(.systemBackground)))
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md)
                .stroke(status == .ok ? Color.border : status.color.opacity(0.3), lineWidth: 1)
        )
        .frame(maxWidth: fullWidth ? .infinity : nil)
    }

    private var formattedValue: String {
        if field == .ph || field == .waterTemp {
            return String(format: "%.1f", value)
        }
        return String(format: value == value.rounded() ? "%.0f" : "%.1f", value)
    }
}

// MARK: - Reading row

private struct ReadingRow: View {
    let reading: ChemicalReading
    let isLast: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(reading.readingTime.readingTimeDisplay)
                        .font(.subheadline)
                        .foregroundColor(.forest)
                    Text(reading.loggedByName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                ChemCell(value: reading.freeChlorine, status: chemStatus(field: .freeChlorine, value: reading.freeChlorine))
                    .frame(width: 42, alignment: .trailing)
                ChemCell(value: reading.ph, status: chemStatus(field: .ph, value: reading.ph))
                    .frame(width: 42, alignment: .trailing)
                ChemCell(value: reading.alkalinity, status: chemStatus(field: .alkalinity, value: reading.alkalinity))
                    .frame(width: 42, alignment: .trailing)
                ChemCell(value: reading.cyanuricAcid, status: chemStatus(field: .cyanuricAcid, value: reading.cyanuricAcid))
                    .frame(width: 42, alignment: .trailing)
                ChemCell(value: reading.waterTemp, status: chemStatus(field: .waterTemp, value: reading.waterTemp), decimals: 1)
                    .frame(width: 46, alignment: .trailing)

                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundColor(Color(.systemGray3))
                    .padding(.leading, 4)
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, 10)

            if !isLast { Divider().padding(.leading, Spacing.md) }
        }
    }
}

private struct ChemCell: View {
    let value: Double
    let status: ChemStatus
    var decimals: Int = 0
    var body: some View {
        Text(String(format: "%.\(decimals)f", value))
            .font(.subheadline.monospacedDigit())
            .foregroundColor(status == .ok ? .forest : status.color)
            .fontWeight(status == .ok ? .regular : .semibold)
    }
}
