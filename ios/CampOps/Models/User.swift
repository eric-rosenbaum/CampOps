import Foundation

struct CampUser: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let initials: String

    var firstName: String {
        String(name.split(separator: " ").first ?? Substring(name))
    }
}
