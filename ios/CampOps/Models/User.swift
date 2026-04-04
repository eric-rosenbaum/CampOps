import Foundation

struct CampUser: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let role: UserRole
    let initials: String

    var firstName: String {
        String(name.split(separator: " ").first ?? Substring(name))
    }
}

extension CampUser {
    static let seedUsers: [CampUser] = [
        CampUser(id: "10000000-0000-0000-0000-000000000001", name: "Jordan M.", role: .doe,               initials: "JM"),
        CampUser(id: "10000000-0000-0000-0000-000000000002", name: "Tom H.",    role: .facilitiesManager, initials: "TH"),
        CampUser(id: "10000000-0000-0000-0000-000000000003", name: "Dana K.",   role: .maintenanceStaff,  initials: "DK"),
        CampUser(id: "10000000-0000-0000-0000-000000000004", name: "Mike L.",   role: .maintenanceStaff,  initials: "ML"),
    ]

    static func find(id: String) -> CampUser? {
        seedUsers.first { $0.id == id }
    }
}
