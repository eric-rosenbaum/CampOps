import Foundation

struct Season: Codable, Identifiable {
    let id: String
    var name: String
    var openingDate: String
    var closingDate: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case openingDate = "opening_date"
        case closingDate = "closing_date"
    }

    init(id: String = UUID().uuidString, name: String, openingDate: String, closingDate: String) {
        self.id = id; self.name = name
        self.openingDate = openingDate; self.closingDate = closingDate
    }
}
