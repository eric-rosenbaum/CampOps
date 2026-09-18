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
    /// Every crew in this camp, active first, in the camp's own order. This is also the list of
    /// trades a work order may carry.
    @Published private(set) var crews: [StaffGroup] = []
    /// The crews this person is on. A person can be on many, and gates fold the permissive way.
    @Published private(set) var myCrews: [StaffGroup] = []
    /// True when the signed-in account is a CampCommand founder.
    ///
    /// Fetched, never inferred: there is no JWT claim for it, and inferring it from role `admin`
    /// or an email would hand every camp administrator the keys to every other camp.
    @Published private(set) var isPlatformAdmin = false
    /// Set while a founder is working inside a camp they are not a member of.
    @Published private(set) var isImpersonating = false
    @Published private(set) var userFullName: String? = nil
    @Published private(set) var members: [CampUser] = []
    /// Every camp this user belongs to, for the switcher in Profile. Excludes deleted camps.
    @Published private(set) var camps: [Camp] = []
    /// True while membership is being fetched after sign-in.
    ///
    /// `session` publishes the moment auth succeeds, but the camp arrives a network round trip
    /// later. Without this flag those few hundred milliseconds render as "signed in with no
    /// camp" (i.e. the join screen, complete with a support email address) which reads as a
    /// failed login right at the moment the user succeeded.
    @Published private(set) var isLoadingCamp = false
    @Published var authError: String? = nil

    var isAuthenticated: Bool { session != nil }
    var hasCamp: Bool { currentCamp != nil }
    /// True when a camp is selected but suspended or trial-expired. The app shows a
    /// blocking screen instead of the tabs, matching the web app's `CampRoute`.
    ///
    /// A founder is exempt: the whole point of opening a suspended camp is to look at why.
    var isCampBlocked: Bool {
        guard let camp = currentCamp, !isPlatformAdmin else { return false }
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

    /// Whether this camp has the module at all.
    ///
    /// Two levels, both of which the phone used to ignore entirely: the platform sells the
    /// module (`platform_modules`), and then the camp switches it on (`modules`). A module a
    /// camp had turned off still appeared in the phone's tab bar.
    ///
    /// Absent reads as ON at both levels. That is the web's rule (`src/lib/modules.ts`) and it
    /// has to stay: every camp provisioned before a module existed has no key for it, and
    /// reading absent as OFF would empty their sidebars on deploy.
    func campHasModule(_ key: String) -> Bool {
        guard let camp = currentCamp else { return false }
        return camp.platformModules[key] ?? true ? camp.modules[key] ?? true : false
    }

    /// Whether this person may open the module.
    ///
    /// Crews stopped gating module access in the 2026-09-10 rework: staff see the whole app, and
    /// what a crew decides is whose WORK you can see. Viewers remain read-only observers of
    /// everything, which is the one role that still turns a module off.
    func canAccessModule(_ module: String) -> Bool {
        guard let member = currentMember else { return false }
        guard campHasModule(module) else { return false }
        if member.role == .admin { return true }
        return member.role != .viewer
    }

    /// Whether this person sees work that is not theirs.
    ///
    /// Across every crew, the most permissive answer wins: someone on both Grounds (pick work
    /// up) and Kitchen (own work only) can still pick up grounds work. A stricter crew must not
    /// quietly take away what another one grants.
    var issuesSeeUnassigned: Bool {
        guard currentMember?.role == .staff else { return true }
        if myCrews.isEmpty { return true }
        return myCrews.contains { $0.issuesSeeUnassigned }
    }

    /// The crew ids this person is on, for filtering work that sits with a crew.
    var myCrewIds: [String] { myCrews.map(\.id) }

    /// Camper names and allergy severities. Unlike every other gate here this one is mirrored by
    /// real RLS, and it FAILS CLOSED: a staff member with no crew is denied, where elsewhere no
    /// crew means full access.
    var canViewCamperHealth: Bool {
        guard let role = currentMember?.role else { return false }
        if role == .admin { return true }
        return role == .staff && myCrews.contains { $0.canViewCamperHealth }
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
                    // A successful redemption loads the camp itself, so don't fetch twice.
                    if await redeemPendingJoinCodeIfNeeded() { break }
                    await loadCampData()
                case .signedOut:
                    self.session = nil
                    self.currentCamp = nil
                    self.currentMember = nil
                    self.crews = []
                    self.myCrews = []
                    self.isPlatformAdmin = false
                    self.isImpersonating = false
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
    /// visits. Creating a bare account grants no access, camp membership still comes only from
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
                authError = L10n.tr("That code has expired, request a new one.")
            } else if raw.localizedCaseInsensitiveContains("invalid") {
                authError = L10n.tr("That code isn't right. Check it and try again.")
            } else {
                authError = friendlyAuthMessage(error)
            }
            return false
        }
    }

    /// A join code that has been validated but not yet redeemed, because the account it belongs
    /// to did not exist when it was entered.
    ///
    /// Held on the manager rather than in the view because the view goes away at exactly the
    /// wrong moment: verifying the emailed code flips `isAuthenticated`, which swaps the whole
    /// root view out, and any redemption still running inside that view's Task can be cancelled
    /// mid-flight. Landing on the "you belong to no camp" screen holding a code they already
    /// typed correctly is the one outcome this whole flow exists to prevent, so the manager -
    /// which outlives every view, owns the last step.
    private var pendingJoinCode: String? = nil

    func setPendingJoinCode(_ code: String) { pendingJoinCode = code }

    /// - Returns: true when a code was redeemed and the camp is already loaded.
    private func redeemPendingJoinCodeIfNeeded() async -> Bool {
        guard let code = pendingJoinCode else { return false }
        pendingJoinCode = nil
        await joinWithCode(code)
        // Failure leaves the user signed in with no camp, which routes to JoinCampView where
        // they can enter the code again.
        return hasCamp
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
            authError = L10n.tr("Could not check that code. Please try again.")
            return nil
        }
    }

    // NOTE: there is deliberately no password `signUp` here.
    //
    // Account creation is invite-only and sales-led: the web app hard-gates /signup behind an
    // invitation token and there is no self-serve path. The iOS app used to expose an open
    // `auth.signUp`, which was a way around that gate. Invited staff create their account from
    // the invite link on the web, then sign in here.

    /// Sends a password-reset email. The link opens the web app's /reset-password page -
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
    /// that POST can sit for a long time, so it runs unawaited. If it never lands, the refresh
    /// token expires on its own. The web client time-boxes the same call for the same reason.
    func signOut() async {
        // Before the session goes, while the delete still has a token to authenticate with.
        // Leaving the row behind would keep sending this camp's work orders to a phone whose
        // holder has just signed out of it.
        PushService.shared.forgetThisDevice()
        // Translations of this camp's notes are this camp's notes.
        ContentTranslations.shared.clear()

        Task { try? await supabase.auth.signOut() }

        // Drop derived state immediately rather than waiting for the auth-state callback, so
        // no screen can render a signed-out session against stale camp data.
        session = nil
        currentCamp = nil
        currentMember = nil
        crews = []
        myCrews = []
        isPlatformAdmin = false
        isImpersonating = false
        userFullName = nil
        camps = []
        members = []
        UserDefaults.standard.removeObject(forKey: selectedCampKey)
    }

    /// Deletes the signed-in account, then signs out.
    ///
    /// Required by App Store Guideline 5.1.1(v): an app that creates accounts must let a user
    /// delete one without leaving the app. The server does the deciding. It refuses when the
    /// caller is the last administrator of a camp, because a camp left with no admin cannot
    /// invite anyone or recover itself, so a refusal arrives as a message rather than an
    /// error, and is shown to the user as written.
    ///
    /// - Returns: nil on success, or the reason it was refused.
    func deleteAccount() async -> String? {
        authError = nil
        do {
            let result: DeleteAccountResult = try await supabase
                .rpc("delete_my_account")
                .execute()
                .value

            guard result.ok else {
                return result.error ?? L10n.tr("Your account could not be deleted.")
            }

            // The session now points at a user that no longer exists, so clearing local state
            // matters more than the sign-out call succeeding.
            await signOut()
            return nil
        } catch {
            return L10n.tr("Could not delete your account. Check your connection and try again.")
        }
    }

    // Supabase surfaces raw API strings; a few are worth rewriting for humans.
    private func friendlyAuthMessage(_ error: Error) -> String {
        let raw = error.localizedDescription
        if raw.localizedCaseInsensitiveContains("invalid login credentials") {
            return L10n.tr("That email or password doesn't match an account.")
        }
        // Raised when an emailed sign-in code is requested for an address that has no account
        // (shouldCreateUser: false). Verbatim it reads "Signups not allowed for otp", which
        // tells a counselor with a typo'd address precisely nothing.
        if raw.localizedCaseInsensitiveContains("signups not allowed")
            || raw.localizedCaseInsensitiveContains("user not found") {
            return L10n.tr("We couldn't find an account for that email. Check the spelling, or use the invite link your camp administrator sent you.")
        }
        if raw.localizedCaseInsensitiveContains("email not confirmed") {
            return L10n.tr("Please confirm your email address first. Check your inbox for the link.")
        }
        if raw.localizedCaseInsensitiveContains("network")
            || raw.localizedCaseInsensitiveContains("offline")
            || raw.localizedCaseInsensitiveContains("timed out")
            || raw.localizedCaseInsensitiveContains("connection") {
            // Reached after the retry ladder in NetworkService has already given the
            // connection three chances, so this really is "the network is not working".
            return L10n.tr("Can't reach CampCommand. Check your signal and try again.")
        }
        return raw
    }

    // Refreshes the current member record and crews without a full re-auth.
    // Called on foreground resume and on realtime camp_members/staff_groups changes.
    func reloadMemberAndGroup() async {
        guard let userId = session?.user.id.uuidString.lowercased(),
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
              let row = rows.first else {
            // A founder who is not a member has no row to refresh; their crews are still worth
            // re-reading in case the camp renamed one.
            await loadCrews(campId: campId, userId: userId)
            return
        }

        // Refresh the camp too, so a suspension or trial expiry applied while the app was
        // backgrounded takes effect on the next foreground resume rather than at next launch.
        currentCamp = row.camps
        if !isImpersonating {
            currentMember = CampMember(
                id: row.id, campId: row.campId, userId: row.userId,
                role: row.role, department: row.department,
                displayName: row.displayName, isActive: row.isActive,
                staffGroupId: row.staffGroupId
            )
        }
        await loadCrews(campId: campId, userId: userId)
    }

    /// Loads this camp's crews, and which of them this person is on.
    ///
    /// Two queries rather than a join, because `staff_group_members` is the source of truth for
    /// membership and `staff_groups` is the source of truth for the crew itself. The dead
    /// `camp_members.staff_group_id` is deliberately not consulted.
    private func loadCrews(campId: String, userId: String) async {
        let all: [StaffGroup] = (try? await supabase
            .from("staff_groups")
            .select()
            .eq("camp_id", value: campId)
            .order("sort_order", ascending: true)
            .execute()
            .value) ?? []
        crews = all

        let mine: [StaffGroupMembership] = (try? await supabase
            .from("staff_group_members")
            .select("staff_group_id, user_id")
            .eq("camp_id", value: campId)
            .eq("user_id", value: userId)
            .execute()
            .value) ?? []
        let ids = Set(mine.map(\.staffGroupId))
        myCrews = all.filter { ids.contains($0.id) }
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
            authError = L10n.tr("Invalid or expired code. Please try again.")
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
            .select("full_name, preferred_language")
            .eq("id", value: userId)
            .single()
            .execute()
            .value as ProfileRow {
            userFullName = profile.fullName
            adoptPreferredLanguage(profile.preferredLanguage)
        }

        await refreshPlatformAdmin()

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
            crews = []
            myCrews = []
            return
        }

        // Prefer previously selected camp, otherwise first.
        //
        // A founder is the exception, and it is not a small one: they hold admin rights in every
        // camp on the platform, so launching straight into one is how somebody edits a
        // customer's live data believing it is their own. They pick a camp every launch, even
        // one they are genuinely a member of. The web does the same.
        if isPlatformAdmin {
            currentCamp = nil
            currentMember = nil
            return
        }
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

    // Makes `row` the active camp: member, crews, saved selection, roster.
    private func apply(row: CampMemberRow) async {
        currentCamp = row.camps
        // True even in a camp the founder genuinely belongs to, and the web agrees. What the
        // banner announces is "you are here with platform rights", which is the case wherever
        // they are -- and it is what gives them a way back to the camp list from any screen.
        isImpersonating = isPlatformAdmin
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
        // Not remembered for a founder: which camp they had open last is not a preference, it is
        // a loaded gun at the next launch.
        if isPlatformAdmin {
            UserDefaults.standard.removeObject(forKey: selectedCampKey)
        } else {
            UserDefaults.standard.set(row.camps.id, forKey: selectedCampKey)
        }
        await loadCrews(campId: row.camps.id,
                        userId: session?.user.id.uuidString.lowercased() ?? "")
        await loadMembers(campId: row.camps.id)
    }

    // MARK: - Language

    /// Takes the language this person chose, on whichever device they chose it.
    ///
    /// Nobody has chosen yet: the phone's own language is written back when it is one we speak,
    /// so the web greets them in it too instead of in English. A value from the profile wins
    /// over whatever this phone had, because the profile is the choice they made most recently
    /// that both platforms can see.
    private func adoptPreferredLanguage(_ stored: String?) {
        if let stored, let language = AppLanguage(rawValue: stored) {
            LanguageStore.shared.choose(language, remember: false)
        } else if let device = AppLanguage.device {
            LanguageStore.shared.choose(device, remember: true)
        }
    }

    /// Writes the chosen language to the profile. Best effort: the choice already applies on
    /// this phone, and the next sign-in with signal writes it again.
    func savePreferredLanguage(_ language: AppLanguage) async {
        guard let userId = session?.user.id.uuidString.lowercased() else { return }
        _ = try? await supabase
            .from("profiles")
            .update(["preferred_language": language.rawValue])
            .eq("id", value: userId)
            .execute()
    }

    // MARK: - Platform admin

    /// Asks the server whether this account is a founder. One RPC, at camp-load time.
    private func refreshPlatformAdmin() async {
        isPlatformAdmin = (try? await supabase
            .rpc("is_platform_admin")
            .execute()
            .value as Bool) ?? false
    }

    /// Every camp on the platform, newest first. Only a founder can read this: `is_camp_member`
    /// short-circuits on `is_platform_admin()`, so RLS returns the whole table to them and
    /// nothing extra to anyone else.
    func loadAllCampsForAdmin() async -> [Camp] {
        guard isPlatformAdmin else { return [] }
        let rows: [Camp] = (try? await supabase
            .from("camps")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value) ?? []
        return rows.filter { $0.deletedAt == nil }
    }

    /// Opens a camp the founder is not a member of.
    ///
    /// The database already agrees: `get_camp_role()` returns `admin` for a platform admin in
    /// every camp. So this synthesizes the membership the client needs rather than inventing
    /// permission -- and deliberately ignores any real `camp_members` row, because a founder who
    /// happens to be a viewer somewhere must not be downgraded while holding the master key.
    ///
    /// Not persisted. A borrowed camp must not still be open at next launch, which is why
    /// `selectedCampKey` is cleared rather than written.
    func openCampAsAdmin(_ camp: Camp) async {
        guard isPlatformAdmin else { return }
        currentCamp = camp
        isImpersonating = true
        currentMember = CampMember(
            id: "platform-admin", campId: camp.id,
            userId: session?.user.id.uuidString.lowercased() ?? "",
            role: .admin, department: nil,
            displayName: "CampCommand admin", isActive: true, staffGroupId: nil
        )
        UserDefaults.standard.removeObject(forKey: selectedCampKey)
        await loadCrews(campId: camp.id, userId: session?.user.id.uuidString.lowercased() ?? "")
        await loadMembers(campId: camp.id)
    }

    /// Puts the borrowed camp down and returns the founder to the camp list.
    func exitImpersonation() {
        guard isImpersonating else { return }
        isImpersonating = false
        currentCamp = nil
        currentMember = nil
        crews = []; myCrews = []; members = []
        UserDefaults.standard.removeObject(forKey: selectedCampKey)
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
