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
    @Published private(set) var currentStaffGroup: StaffGroup? = nil
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

    func canAccessModule(_ module: String) -> Bool {
        guard let member = currentMember else { return false }
        if member.role == .admin { return true }
        guard let group = currentStaffGroup else { return true }
        switch module {
        case "issues_repairs": return group.modules.issuesRepairs
        case "pre_post":       return group.modules.prePost
        case "pool":           return group.modules.pool
        case "safety":         return group.modules.safety
        case "assets":         return group.modules.assets
        default:               return true
        }
    }

    var issuesSeeUnassigned: Bool {
        guard currentMember?.role == .staff else { return true }
        guard let group = currentStaffGroup else { return true }
        return group.issuesSeeUnassigned
    }

    var prepostSeeUnassigned: Bool {
        guard currentMember?.role == .staff else { return true }
        guard let group = currentStaffGroup else { return true }
        return group.prepostSeeUnassigned
    }

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
                    self.currentStaffGroup = nil
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

    // Refreshes the current member record and staff group without a full re-auth.
    // Called on foreground resume and on realtime camp_members/staff_groups changes.
    func reloadMemberAndGroup() async {
        guard let userId = session?.user.id.uuidString,
              let campId = currentCamp?.id else { return }

        guard let rows = try? await supabase
            .from("camp_members")
            .select("*, camps(*)")
            .eq("user_id", value: userId)
            .eq("camp_id", value: campId)
            .eq("is_active", value: true)
            .limit(1)
            .execute()
            .value as [CampMemberRow],
              let row = rows.first else { return }

        currentMember = CampMember(
            id: row.id, campId: row.campId, userId: row.userId,
            role: row.role, department: row.department,
            displayName: row.displayName, isActive: row.isActive,
            staffGroupId: row.staffGroupId
        )
        if let groupId = row.staffGroupId {
            currentStaffGroup = try? await supabase
                .from("staff_groups")
                .select()
                .eq("id", value: groupId)
                .single()
                .execute()
                .value
        } else {
            currentStaffGroup = nil
        }
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
            isActive: preferred.isActive,
            staffGroupId: preferred.staffGroupId
        )
        if let groupId = preferred.staffGroupId {
            currentStaffGroup = try? await supabase
                .from("staff_groups")
                .select()
                .eq("id", value: groupId)
                .single()
                .execute()
                .value
        } else {
            currentStaffGroup = nil
        }
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
