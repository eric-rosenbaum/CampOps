import Foundation
import Combine
import Supabase

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    private var supabase: SupabaseClient { SupabaseService.shared.client }

    @Published private(set) var isLoading = true
    @Published private(set) var session: Session? = nil
    @Published private(set) var currentCamp: Camp? = nil
    @Published private(set) var currentMember: CampMember? = nil
    @Published private(set) var userFullName: String? = nil
    @Published private(set) var members: [CampUser] = []
    @Published var authError: String? = nil

    var isAuthenticated: Bool { session != nil }
    var hasCamp: Bool { currentCamp != nil }

    var currentUser: CampUser {
        let name = userFullName ?? session?.user.email ?? ""
        let initials = name
            .split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0) }
            .joined()
            .uppercased()
        return CampUser(id: session?.user.id.uuidString.lowercased() ?? "", name: name, initials: initials)
    }

    var can: Permissions { Permissions(role: currentMember?.role ?? .staff) }

    private let selectedCampKey = "campcommand.selectedCampId"

    private init() {}

    func initialize() async {
        Task {
            for await (event, session) in supabase.auth.authStateChanges {
                switch event {
                case .initialSession:
                    self.session = session
                    if session != nil { await loadCampData() }
                    self.isLoading = false
                case .signedIn:
                    self.session = session
                    await loadCampData()
                case .signedOut:
                    self.session = nil
                    self.currentCamp = nil
                    self.currentMember = nil
                    self.userFullName = nil
                default:
                    break
                }
            }
        }
    }

    // MARK: - Auth actions

    func signIn(email: String, password: String) async {
        authError = nil
        do {
            try await supabase.auth.signIn(email: email, password: password)
        } catch {
            authError = error.localizedDescription
        }
    }

    func signUp(email: String, password: String, fullName: String) async {
        authError = nil
        do {
            let response = try await supabase.auth.signUp(
                email: email,
                password: password,
                data: ["full_name": .string(fullName)]
            )
            // Upsert profile so it exists immediately
            let userId = response.user.id.uuidString
            try? await supabase.from("profiles")
                .upsert(["id": userId, "full_name": fullName])
                .execute()
        } catch {
            authError = error.localizedDescription
        }
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }

    func joinWithCode(_ code: String) async {
        authError = nil
        do {
            let result: JoinCodeResult = try await supabase
                .rpc("join_camp_with_code", params: ["p_code": code])
                .execute()
                .value
            if let err = result.error {
                authError = err
                return
            }
            await loadCampData()
        } catch {
            authError = "Invalid or expired code. Please try again."
        }
    }

    // MARK: - Camp data loading

    func loadCampData() async {
        guard let userId = session?.user.id.uuidString else { return }

        // Fetch profile
        if let profile = try? await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", value: userId)
            .single()
            .execute()
            .value as ProfileRow {
            userFullName = profile.fullName
        }

        // Fetch camp memberships with nested camp data
        guard let rows = try? await supabase
            .from("camp_members")
            .select("*, camps(*)")
            .eq("user_id", value: userId)
            .eq("is_active", value: true)
            .execute()
            .value as [CampMemberRow],
              !rows.isEmpty else { return }

        // Prefer previously selected camp, otherwise first
        let savedId = UserDefaults.standard.string(forKey: selectedCampKey)
        let preferred = rows.first { $0.camps.id == savedId } ?? rows[0]

        currentCamp = preferred.camps
        currentMember = CampMember(
            id: preferred.id,
            campId: preferred.campId,
            userId: preferred.userId,
            role: preferred.role,
            department: preferred.department,
            displayName: preferred.displayName,
            isActive: preferred.isActive
        )
        UserDefaults.standard.set(preferred.camps.id, forKey: selectedCampKey)
        await loadMembers(campId: preferred.camps.id)
    }

    private func loadMembers(campId: String) async {
        struct MemberRow: Decodable {
            let userId: String
            let displayName: String?
            enum CodingKeys: String, CodingKey {
                case userId = "user_id"
                case displayName = "display_name"
            }
        }
        struct ProfileRow2: Decodable {
            let id: String
            let fullName: String?
            enum CodingKeys: String, CodingKey { case id; case fullName = "full_name" }
        }

        guard let rows = try? await supabase
            .from("camp_members")
            .select("user_id, display_name")
            .eq("camp_id", value: campId)
            .eq("is_active", value: true)
            .execute()
            .value as [MemberRow] else { return }

        let userIds = rows.map(\.userId)
        let profiles = (try? await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", values: userIds)
            .execute()
            .value as [ProfileRow2]) ?? []

        let nameMap = Dictionary(uniqueKeysWithValues: profiles.compactMap { p -> (String, String)? in
            guard let name = p.fullName else { return nil }
            return (p.id, name)
        })

        members = rows.map { row in
            let name = nameMap[row.userId] ?? row.displayName ?? "Unknown"
            let initials = name.split(separator: " ").compactMap { $0.first }
                .prefix(2).map { String($0) }.joined().uppercased()
            return CampUser(id: row.userId, name: name, initials: initials)
        }
    }
}

// MARK: - Permissions

struct Permissions {
    let role: CampRole
    var createIssue:       Bool { true }
    var createTask:        Bool { true }
    var assign:            Bool { true }
    var updateStatus:      Bool { true }
    var markResolved:      Bool { true }
    var markComplete:      Bool { true }
    var enterActualCost:   Bool { role == .admin }
    var activateNewSeason: Bool { role == .admin }
    var managePoolChecklist: Bool { true }
}
