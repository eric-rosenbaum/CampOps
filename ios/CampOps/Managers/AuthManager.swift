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
    /// Every camp this user belongs to, for the switcher in Profile. Excludes deleted camps.
    @Published private(set) var camps: [Camp] = []
    /// True while membership is being fetched after sign-in.
    ///
    /// `session` publishes the moment auth succeeds, but the camp arrives a network round trip
    /// later. Without this flag those few hundred milliseconds render as "signed in with no
    /// camp" — i.e. the join screen, complete with a support email address — which reads as a
    /// failed login right at the moment the user succeeded.
    @Published private(set) var isLoadingCamp = false
    @Published var authError: String? = nil

    var isAuthenticated: Bool { session != nil }
    var hasCamp: Bool { currentCamp != nil }
    /// True when a camp is selected but suspended or trial-expired — the app shows a
    /// blocking screen instead of the tabs, matching the web app's `CampRoute`.
    var isCampBlocked: Bool {
        guard let camp = currentCamp else { return false }
        return !camp.isAccessible
    }

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

    // Defaults to `.viewer` (read-only) rather than `.staff`, so a missing membership can never
    // hand out write permissions.
    var can: Permissions { Permissions(role: currentMember?.role ?? .viewer) }

    func canAccessModule(_ module: String) -> Bool {
        guard let member = currentMember else { return false }
        if member.role == .admin { return true }
        // Viewers get no module access at all — same rule as the web app's canAccessModule.
        if member.role == .viewer { return false }
        guard let group = currentStaffGroup else { return true }
        switch module {
        case "issues_repairs": return group.modules.issuesRepairs
        case "pre_post":       return group.modules.prePost
        case "pool":           return group.modules.pool
        case "safety":         return group.modules.safety
        case "assets":           return group.modules.assets
        case "building_systems": return group.modules.buildingSystems
        default:                 return true
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
                    self.camps = []
                    self.members = []
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
            try await supabase.auth.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password: password
            )
        } catch {
            authError = friendlyAuthMessage(error)
        }
    }

    // MARK: - Passwordless (staff lane)

    /// Emails a 6-digit sign-in code, creating the account if the address is new.
    ///
    /// This is how seasonal staff get in: one code creates the account, proves the address is
    /// real, and signs them in. No password to invent on a phone, and nothing to forget between
    /// visits. Creating a bare account grants no access — camp membership still comes only from
    /// `join_camp_with_code`, which validates the code server-side.
    ///
    /// `shouldCreateUser` is true only when joining with a verified code; plain sign-in passes
    /// false so a typo'd address can't silently mint an empty account.
    func sendEmailCode(email: String, fullName: String? = nil, createIfNew: Bool) async -> Bool {
        authError = nil
        do {
            try await supabase.auth.signInWithOTP(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                shouldCreateUser: createIfNew,
                data: fullName.map { ["full_name": .string($0)] }
            )
            return true
        } catch {
            authError = friendlyAuthMessage(error)
            return false
        }
    }

    /// Exchanges the emailed code for a session.
    func verifyEmailCode(email: String, code: String) async -> Bool {
        authError = nil
        do {
            _ = try await supabase.auth.verifyOTP(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                token: code.trimmingCharacters(in: .whitespaces),
                type: .email
            )
            return true
        } catch {
            let raw = error.localizedDescription
            if raw.localizedCaseInsensitiveContains("expired") {
                authError = "That code has expired — request a new one."
            } else if raw.localizedCaseInsensitiveContains("invalid") {
                authError = "That code isn't right. Check it and try again."
            } else {
                authError = friendlyAuthMessage(error)
            }
            return false
        }
    }

    /// Checks a join code before we ask for an email, so the sheet can name the camp and a bad
    /// code is rejected without creating an account.
    func lookUpJoinCode(_ code: String) async -> JoinCodeInfo? {
        authError = nil
        do {
            let info: JoinCodeInfo = try await supabase
                .rpc("join_code_info", params: ["p_code": code.uppercased()])
                .execute()
                .value
            return info
        } catch {
            authError = "Could not check that code. Please try again."
            return nil
        }
    }

    // NOTE: there is deliberately no password `signUp` here.
    //
    // Account creation is invite-only and sales-led: the web app hard-gates /signup behind an
    // invitation token and there is no self-serve path. The iOS app used to expose an open
    // `auth.signUp`, which was a way around that gate. Invited staff create their account from
    // the invite link on the web, then sign in here.

    /// Sends a password-reset email. The link opens the web app's /reset-password page —
    /// the same flow as the web "Forgot your password?" link.
    func requestPasswordReset(email: String) async -> Bool {
        authError = nil
        do {
            try await supabase.auth.resetPasswordForEmail(
                email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                redirectTo: URL(string: "\(Constants.webAppBaseURL)/reset-password")
            )
            return true
        } catch {
            authError = friendlyAuthMessage(error)
            return false
        }
    }

    /// Signs out. Never hangs on the network, and always clears this device.
    ///
    /// `auth.signOut()` removes the stored session and emits `.signedOut` BEFORE it POSTs to
    /// /auth/v1/logout (see AuthClient.signOut), so this device is signed out the moment it is
    /// called. Only the server-side token revoke needs the network, and on a stale connection
    /// that POST can sit for a long time — so it runs unawaited. If it never lands, the refresh
    /// token expires on its own. The web client time-boxes the same call for the same reason.
    func signOut() async {
        Task { try? await supabase.auth.signOut() }

        // Drop derived state immediately rather than waiting for the auth-state callback, so
        // no screen can render a signed-out session against stale camp data.
        session = nil
        currentCamp = nil
        currentMember = nil
        currentStaffGroup = nil
        userFullName = nil
        camps = []
        members = []
        UserDefaults.standard.removeObject(forKey: selectedCampKey)
    }

    // Supabase surfaces raw API strings; a few are worth rewriting for humans.
    private func friendlyAuthMessage(_ error: Error) -> String {
        let raw = error.localizedDescription
        if raw.localizedCaseInsensitiveContains("invalid login credentials") {
            return "That email or password doesn't match an account."
        }
        // Raised when an emailed sign-in code is requested for an address that has no account
        // (shouldCreateUser: false). Verbatim it reads "Signups not allowed for otp", which
        // tells a counselor with a typo'd address precisely nothing.
        if raw.localizedCaseInsensitiveContains("signups not allowed")
            || raw.localizedCaseInsensitiveContains("user not found") {
            return "We couldn't find an account for that email. Check the spelling, or use the invite link your camp administrator sent you."
        }
        if raw.localizedCaseInsensitiveContains("email not confirmed") {
            return "Please confirm your email address first — check your inbox for the link."
        }
        if raw.localizedCaseInsensitiveContains("network") || raw.localizedCaseInsensitiveContains("offline") {
            return "Can't reach CampCommand. Check your connection and try again."
        }
        return raw
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

        // Refresh the camp too, so a suspension or trial expiry applied while the app was
        // backgrounded takes effect on the next foreground resume rather than at next launch.
        currentCamp = row.camps
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
        isLoadingCamp = true
        defer { isLoadingCamp = false }

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
        guard let allRows = try? await supabase
            .from("camp_members")
            .select("*, camps(*)")
            .eq("user_id", value: userId)
            .eq("is_active", value: true)
            .execute()
            .value as [CampMemberRow] else { return }

        // Camps in the 30-day trash are hidden from members entirely, as on web.
        let rows = allRows.filter { $0.camps.deletedAt == nil }
        camps = rows.map(\.camps)
        guard !rows.isEmpty else {
            currentCamp = nil
            currentMember = nil
            currentStaffGroup = nil
            return
        }

        // Prefer previously selected camp, otherwise first
        let savedId = UserDefaults.standard.string(forKey: selectedCampKey)
        let preferred = rows.first { $0.camps.id == savedId } ?? rows[0]
        await apply(row: preferred)
    }

    /// Switches the active camp for users who belong to more than one.
    func selectCamp(_ campId: String) async {
        guard campId != currentCamp?.id,
              let userId = session?.user.id.uuidString else { return }

        guard let rows = try? await supabase
            .from("camp_members")
            .select("*, camps(*)")
            .eq("user_id", value: userId)
            .eq("camp_id", value: campId)
            .eq("is_active", value: true)
            .limit(1)
            .execute()
            .value as [CampMemberRow],
              let row = rows.first, row.camps.deletedAt == nil else { return }

        await apply(row: row)
    }

    // Makes `row` the active camp: member, staff group, saved selection, roster.
    private func apply(row: CampMemberRow) async {
        currentCamp = row.camps
        currentMember = CampMember(
            id: row.id,
            campId: row.campId,
            userId: row.userId,
            role: row.role,
            department: row.department,
            displayName: row.displayName,
            isActive: row.isActive,
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
        UserDefaults.standard.set(row.camps.id, forKey: selectedCampKey)
        await loadMembers(campId: row.camps.id)
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

/// Mirrors the web app's ROLE_PERMISSIONS table (src/lib/auth.ts).
///
/// These used to be unconditional `true`, which was harmless only because the app couldn't
/// represent a viewer at all. Now that it can, every write has to be gated the same way the
/// web gates it, or a read-only account would get write access on iPhone.
struct Permissions {
    let role: CampRole

    private var isWriter: Bool { role == .admin || role == .staff }

    var createIssue:         Bool { isWriter }
    var createTask:          Bool { isWriter }
    var assign:              Bool { isWriter }
    var updateStatus:        Bool { isWriter }
    var markResolved:        Bool { isWriter }
    var markComplete:        Bool { isWriter }
    var logChemicalReading:  Bool { isWriter }
    var managePool:          Bool { isWriter }
    var managePoolChecklist: Bool { isWriter }
    var manageAssets:        Bool { isWriter }
    var manageBuildingSystems: Bool { isWriter }

    var enterActualCost:   Bool { role == .admin }
    var activateNewSeason: Bool { role == .admin }
}
