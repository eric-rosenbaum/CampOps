import Foundation
import Combine

// MARK: - Current user session (mock auth, swap-friendly)
@MainActor
final class UserManager: ObservableObject {
    static let shared = UserManager()

    @Published private(set) var currentUser: CampUser

    private let key = "campops.currentUserId"

    private init() {
        // Restore last selected user from UserDefaults, or default to first seed user
        if let savedId = UserDefaults.standard.string(forKey: "campops.currentUserId"),
           let user = CampUser.find(id: savedId) {
            currentUser = user
        } else {
            currentUser = CampUser.seedUsers[0]
        }
    }

    // MARK: - Permission helpers (mirror web app's useAuth() / ROLE_PERMISSIONS)

    var can: Permissions { Permissions(role: currentUser.role) }

    // MARK: - User switching (impersonation — replace with real Supabase auth later)

    /// ↓ Swap this method body for supabase.auth.signIn() when adding real auth
    func switchUser(to user: CampUser) {
        currentUser = user
        UserDefaults.standard.set(user.id, forKey: key)
    }
    /// ↑ end of mock-auth block

    var allUsers: [CampUser] { CampUser.seedUsers }
}

// MARK: - Permissions

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
