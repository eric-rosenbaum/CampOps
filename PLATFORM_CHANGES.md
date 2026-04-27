# Platform Changes Log

Track web changes that need to be mirrored in iOS.

---

## Multi-tenant Auth & Camp System (Web complete: 2026-04-23)

### Schema / Supabase
- **New tables**: `profiles`, `camps`, `camp_members`, `camp_invitations`, `camp_join_codes`
- All operational tables now have `camp_id UUID NOT NULL FK → camps(id)`
- RLS helper functions: `is_camp_member()`, `get_camp_role()`, `is_camp_admin()`
- Stored procedures: `create_camp`, `join_camp_with_code`, `accept_invitation`, `generate_join_code`
- Trigger: `handle_new_user()` auto-creates `profiles` row on `auth.users` INSERT
- Migration file: `supabase/migrations/20260423000000_multi_tenant_auth.sql`

### Auth
- **Replaced**: mock session with real Supabase Auth (`supabase.auth.signIn`, `signUp`, `onAuthStateChange`)
- **New**: `authStore` — manages session, user profile, auth lifecycle
- **Roles**: `admin | staff | viewer` stored in `camp_members.role`
- **Departments**: `waterfront | maintenance | kitchen | administration | health | program | other`

### iOS changes needed
- [ ] Replace any mock/hardcoded user with real Supabase Auth session
- [ ] Implement sign in / sign up screens
- [ ] On launch, check session → load camps → auto-select if only one
- [ ] Store `campId` and use it to filter all Supabase queries (`.eq("camp_id", campId)`)
- [ ] Store `currentMemberId`, `role`, `department` from `camp_members` row
- [ ] Pool store: pass `campId` to all queries and inserts
- [ ] All INSERT calls: add `camp_id: campId` field
- [ ] Photo storage path: change from `issueId` to `campId/issueId`

### Role-based home screens (web: AdminHome, StaffHome, ViewerHome)
- **Admin**: stats grid (open issues, pool status, expiring certs), recent issues, module quick links
- **Staff**: department-specific — waterfront staff see pool status banner; all staff see assigned issues and tasks
- **Viewer**: read-only overview (open issues count, pool status)
- iOS: update home tab to branch on role

### Members, invitations, join codes (web only for now)
- Settings > Members: list active members, send invitation link, change role, remove member
- Settings > Join Codes: generate reusable codes by role/dept, set expiry + max uses, revoke
- Settings > Camp Settings: name, type, state, module toggles
- iOS: no equivalent screen needed immediately; join flow needed (accept invite / enter join code)

### db.ts changes (web)
- Removed: `SEED_USERS` seeding, `users` table, hardcoded user IDs
- Added: `setCampId(id)` export — set by campStore on camp selection
- All read functions now accept `campId` param and filter with `.eq('camp_id', campId)`
- All write functions now include `camp_id: _campId` in INSERT/UPSERT payloads
- Realtime subscriptions now filter by `camp_id=eq.${campId}`

### campStore (web)
- `members: MemberWithProfile[]` — populated on camp select, used for name lookups across app
- All SEED_USERS references in components replaced with `campStore.members`

### Sidebar / Topbar (web)
- Sidebar: shows real camp name + user name/role; settings section visible to admins only; sign-out button
- Topbar: removed mock user switcher; shows real user initials + name
