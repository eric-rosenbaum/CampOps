import SwiftUI
import Charts

struct ChemFieldChartView: View {
    @Environment(\.dismiss) private var dismiss

    let field: ChemField
    let readings: [ChemicalReading]

    private var sorted: [ChemicalReading] {
        readings.sorted { $0.createdAt < $1.createdAt }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    // Current value card
                    if let latest = sorted.last {
                        currentValueCard(latest)
                    }

                    // Chart
                    chartSection

                    // Range reference
                    rangeCard
                }
                .padding(Spacing.md)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(field.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func currentValueCard(_ r: ChemicalReading) -> some View {
        let value = field.value(from: r)
        let status = chemStatus(field: field, value: value)
        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Current").font(.caption.weight(.semibold)).foregroundColor(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(formatted(value))
                        .font(.largeTitle.weight(.bold).monospacedDigit())
                        .foregroundColor(.forest)
                    Text(field.unit).font(.subheadline).foregroundColor(.secondary)
                }
                Text(r.readingTime.readingTimeDisplay)
                    .font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            Text(status.label)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 4)
                .background(status.bgColor)
                .foregroundColor(status.color)
                .clipShape(Capsule())
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
    }

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("History").font(.headline).foregroundColor(.forest)

            if sorted.isEmpty {
                Text("No data to display").font(.subheadline).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(Spacing.xl)
            } else {
                Chart {
                    // Target range band
                    RectangleMark(
                        xStart: .value("Start", sorted.first!.createdAt),
                        xEnd: .value("End", sorted.last!.createdAt),
                        yStart: .value("Low", targetLow),
                        yEnd: .value("High", targetHigh)
                    )
                    .foregroundStyle(Color.sage.opacity(0.08))

                    ForEach(sorted) { r in
                        let v = field.value(from: r)
                        let status = chemStatus(field: field, value: v)
                        LineMark(
                            x: .value("Date", r.createdAt),
                            y: .value(field.displayName, v)
                        )
                        .foregroundStyle(Color.sage)
                        .interpolationMethod(.catmullRom)

                        PointMark(
                            x: .value("Date", r.createdAt),
                            y: .value(field.displayName, v)
                        )
                        .foregroundStyle(status == .ok ? Color.sage : status.color)
                        .symbolSize(40)
                    }
                }
                .frame(height: 220)
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: max(1, sorted.count / 5))) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(formatted(v)).font(.caption2)
                            }
                        }
                    }
                }
                .padding(Spacing.md)
                .background(Color(.systemBackground))
                .cornerRadius(Radius.md)
            }
        }
    }

    private var rangeCard: some View {
        HStack(spacing: Spacing.lg) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Target range").font(.caption2.weight(.semibold)).foregroundColor(.secondary)
                Text(field.rangeDisplay).font(.subheadline.weight(.medium)).foregroundColor(.forest)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("Unit").font(.caption2.weight(.semibold)).foregroundColor(.secondary)
                Text(field.unit).font(.subheadline.weight(.medium)).foregroundColor(.forest)
            }
        }
        .padding(Spacing.md)
        .background(Color(.systemBackground))
        .cornerRadius(Radius.md)
    }

    // MARK: - Helpers

    private var targetLow: Double {
        switch field {
        case .freeChlorine: return 1.0
        case .ph:           return 7.2
        case .alkalinity:   return 80
        case .cyanuricAcid: return 30
        case .waterTemp:    return 68
        }
    }

    private var targetHigh: Double {
        switch field {
        case .freeChlorine: return 3.0
        case .ph:           return 7.8
        case .alkalinity:   return 120
        case .cyanuricAcid: return 50
        case .waterTemp:    return 82
        }
    }

    private func formatted(_ v: Double) -> String {
        switch field {
        case .ph, .freeChlorine, .waterTemp: return String(format: "%.1f", v)
        default: return String(format: "%.0f", v)
        }
    }
}
