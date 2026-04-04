import Foundation
import Combine

@MainActor
final class UserManager: ObservableObject {
    static let shared = UserManager()
    @Published private(set) var currentUser: CampUser
    private let key = "campops.currentUserId"

    private init() {
        if let id = UserDefaults.standard.string(forKey: "campops.currentUserId"),
           let user = CampUser.find(id: id) {
            currentUser = user
        } else {
            currentUser = CampUser.seedUsers[0]
        }
    }

    var can: Permissions { Permissions(role: currentUser.role) }
    var allUsers: [CampUser] { CampUser.seedUsers }

    /// Swap this body for Supabase auth when ready
    func switchUser(to user: CampUser) {
        currentUser = user
        UserDefaults.standard.set(user.id, forKey: key)
    }
}

struct Permissions {
    let role: UserRole
    var createIssue:       Bool { role == .doe || role == .facilitiesManager }
    var createTask:        Bool { role == .doe || role == .facilitiesManager }
    var assign:            Bool { role == .doe || role == .facilitiesManager }
    var enterActualCost:   Bool { role == .doe || role == .facilitiesManager }
    var activateNewSeason: Bool { role == .doe || role == .facilitiesManager }
    var updateStatus:      Bool { true }
    var markResolved:      Bool { true }
    var markComplete:      Bool { true }
}
