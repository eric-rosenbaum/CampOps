import Foundation

struct Season: Codable, Identifiable {
    let id: String
    var name: String
    var openingDate: String
    var closingDate: String
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, name
        case openingDate = "opening_date"
        case closingDate = "closing_date"
        case isActive    = "is_active"
    }

    init(id: String = UUID().uuidString, name: String, openingDate: String, closingDate: String, isActive: Bool = false) {
        self.id = id; self.name = name
        self.openingDate = openingDate; self.closingDate = closingDate
        self.isActive = isActive
    }
}
