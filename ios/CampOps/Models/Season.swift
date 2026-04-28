import Foundation

struct Season: Codable, Identifiable {
    let id: String
    var name: String
    var openingDate: String
    var closingDate: String
    var acaInspectionDate: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case openingDate       = "opening_date"
        case closingDate       = "closing_date"
        case acaInspectionDate = "aca_inspection_date"
    }

    init(id: String = UUID().uuidString, name: String, openingDate: String, closingDate: String, acaInspectionDate: String? = nil) {
        self.id = id; self.name = name
        self.openingDate = openingDate; self.closingDate = closingDate
        self.acaInspectionDate = acaInspectionDate
    }
}
