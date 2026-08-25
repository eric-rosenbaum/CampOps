# CampCommand, Production Restructure Spec

Status: **IMPLEMENTED (2026-07-29)**, all phases built, tsc/build green, advisors 0 ERROR, clone verified. Remaining founder to-dos in §18 (subdomain DNS). Untested at runtime.

This spec turns CampCommand from a self-serve app into a **sales-led, multi-tenant B2B SaaS**: prospects book a demo, get a hands-on trial we provision, pay a manual invoice, and we set them up. It defines the tenant model, roles, routing, admin console, trial mechanics, and provisioning flows. **No implementation until this is approved.**

---

## 1. Goals & non-goals

**Goals**
- Public marketing site → "Book a demo" (no self-serve signup).
- Account creation is **invite-only**, driven by us after a deal.
- Founders can **provision** customers and trials, **impersonate** any camp, and manage status/plan from an **admin console**.
- Prospects get a **hands-on, pre-seeded trial** we spin up per prospect (option (a): founder-provisioned from the admin console, no self-serve trial requests).
- One curated **sales-demo** tenant we drive on calls.
- Manual invoicing; **no in-app payments**.

**Non-goals (explicitly out of scope for now)**
- Self-serve signup, self-serve trial requests, in-app checkout / Stripe.
- Separate demo/sandbox *deployment* (we use tenant types in prod, not separate infra).
- Org-level billing rollups (we design the org hierarchy but sell per-camp first).
- True per-user session impersonation (we use scoped super-admin access. See §9).

---

## 2. Core concepts (glossary)

| Term | Meaning |
|---|---|
| **Deployment environment** | dev → staging → production. Infra concern. Separate DBs. Orthogonal to everything below. |
| **Org** (organization) | Optional parent over one or more camps (e.g., a camp network like Ramah, a JCC/YMCA). Designed now, used later. |
| **Camp** (tenant) | The unit of tenancy. Existing `camps` row + `camp_members`. All existing data is camp-scoped. |
| **Account type** | What a camp *is*: `customer` \| `trial` \| `demo` \| `internal`. A column on the camp. |
| **Status** | Where a camp is in its lifecycle: `active` \| `suspended` \| `trial_expired`. |
| **Plan / tier** | Pricing tier (`day` \| `standard` \| `large`), stored for reference; billing is manual. |
| **Camp role** | Existing per-camp role: `admin` \| `staff` (+ staff groups + module perms). Unchanged. |
| **Platform admin** | Founder-level super-admin. Orthogonal to camp roles. Access to the admin console + all camps. |
| **Golden seed** | One canonical fake camp (`is_seed = true`) we clone to create demos/trials. |

---

## 3. Tenant model

### 3.1 Hierarchy
```
Org (optional)
 └─ Camp (tenant)  ← all existing data hangs off camp_id
     └─ Camp members (users with camp roles)
```
- `camps.org_id` (nullable FK → `organizations.id`). Most camps have no org initially. Selling a network = one org with many camps.
- Org exists mainly to (later) group camps for a single buyer/invoice and cross-camp reporting. **No org-level features built now** beyond the column + admin grouping.

### 3.2 Account types (`camps.account_type`)
- **`customer`**, a paying camp. Full access per plan.
- **`trial`**, a prospect's hands-on account. Time-boxed (`trial_ends_at`), fake data only, cloned from the golden seed. Auto-expires.
- **`demo`**. The curated tenant *we* drive on sales calls. Never wiped, never expires, not customer-facing for editing.
- **`internal`**, founders' own scratch/test camps.

### 3.3 Status (`camps.status`)
- **`active`** · normal.
- **`suspended`**, off-boarded / non-payment / manually paused. Members are blocked at login with a "contact us" screen (platform admins exempt).
- **`trial_expired`** (a trial past `trial_ends_at`. Members see a "trial ended) contact us to continue" screen; data retained for conversion.

Status is independent of account type (a `customer` can be `suspended`; a `trial` becomes `trial_expired`).

### 3.4 New/changed columns on `camps`
| Column | Type | Notes |
|---|---|---|
| `org_id` | uuid null → organizations | nullable |
| `account_type` | text | check in (customer,trial,demo,internal), default `customer` |
| `status` | text | check in (active,suspended,trial_expired), default `active` |
| `plan` | text null | tier slug; null for demo/trial/internal |
| `trial_ends_at` | timestamptz null | set for trials only |
| `is_seed` | boolean | default false; true on the golden seed |
| `provisioned_by` | uuid null | platform admin who created it |
| `provisioned_at` | timestamptz | default now() |

### 3.5 New tables
- **`organizations`** `(id uuid pk, name text, created_at)`.
- **`platform_admins`** `(user_id uuid pk → auth.users, added_by uuid, added_at)`. Seeded with the two founder user ids.

---

## 4. Roles & access

Two **orthogonal** axes:

1. **Camp role** (existing, unchanged): `admin` / `staff`, refined by staff groups + module permissions. Governs what a member can do *inside their camp*.
2. **Platform admin** (new): founder super-admin. Governs access to the **admin console** and to **all camps** (see §9). A platform admin is not necessarily a member of any camp.

Helper (SECURITY DEFINER, `SET search_path = public`):
- `is_platform_admin()` → true if `auth.uid()` ∈ `platform_admins`. Revoke execute from anon.

**Choke-point reuse (key design decision):** every camp-scoped RLS policy already funnels through `is_camp_member(camp_id)` and `get_camp_role(camp_id)`. We modify **only those two functions** so platform admins transparently get member+admin access to every camp, instead of editing dozens of policies:
- `is_camp_member(camp_id)` → `(existing membership check) OR is_platform_admin()`
- `get_camp_role(camp_id)` → `'admin'` when `is_platform_admin()`, else existing.

**Sensitive-data carve-out (decided):** platform admins **do** get camper-health access when supporting a camp, but **every access writes an internal audit event** (never silent). The audit trail is **internal only**, visible to founders, **not** shown to the camp. This balances support needs against minors'-data accountability.

---

## 5. Domain / routing structure

Target (standard SaaS split):
- **`campcommand.app`** (apex/www) → marketing site. CTAs: **Book a demo** (primary), **Sign in** (secondary). No signup.
- **`app.campcommand.app`** → the product (auth required). Customers, trials, demo, and founders all sign in here.
- **`app.campcommand.app/admin`** → admin console, gated to `is_platform_admin()`.

**Interim (before DNS/subdomain split):** keep the single SPA. Marketing at `/`, app at `/home` (as today), admin at `/admin`. Subdomain split is a deploy task that can land in a later phase without changing app logic. Spec builds toward subdomains; nothing blocks on them.

---

## 6. Auth & account creation

- **No public signup.** Remove/disable the self-serve path (`CampSetup` → `createCamp` → `Onboarding`) from public reach. The `create_camp` RPC's EXECUTE is **restricted to platform admins** (and the provisioning RPC below).
- **Invite-only.** Account creation happens only via an invite link generated during provisioning. Reuse existing `accept_invitation` / `generate_join_code` / `join_camp_with_code` machinery (verify current signatures at implementation).
- **Login** unchanged (Supabase email/password). Marketing "Sign in" → app login.
- **Password reset** unchanged.
- On successful login, the app checks the member's camp `status` (§3.3) and gates accordingly (§8).

---

## 7. Lifecycle flows

### 7.1 Prospect → trial (option (a): founder-provisioned)
1. Prospect books a demo (marketing → calendar, as today).
2. We run the live demo on the **demo tenant**.
3. From the **admin console**, founder clicks **"Spin up trial"**: pick prospect name + email. Trial length is **30 days**.
4. System **clones the golden seed** into a new `account_type = trial` camp with `trial_ends_at`, then **emails the prospect an admin invite**.
5. Prospect sets password, explores, can invite their team into the trial.
6. Countdown banner shows days remaining. On/after `trial_ends_at`, a cron flips status → `trial_expired`; app shows the "trial ended. Contact us" screen. Data retained.

### 7.2 Deal close → customer
1. Founder agrees price/tier.
2. Admin console **"Provision customer"**: name, plan/tier, optional org, buyer email. Choose **fresh empty camp** (white-glove import via the existing location-import "send us your file" flow) or **convert an existing trial** (keeps their trial data/config. See 7.4).
3. System creates/promotes the camp (`account_type = customer`, `status = active`, `plan` set), emails the buyer an **admin invite**.
4. Buyer onboards: invites staff, imports data (or we do it).
5. We send a manual invoice out-of-band.

### 7.3 Suspension / off-boarding
- Admin console **"Suspend"** sets `status = suspended`. Members blocked at login (platform admins exempt). Reversible via **"Reactivate."**

### 7.4 Trial → customer conversion
- Converting a trial promotes the same camp: `account_type` trial→customer, clear `trial_ends_at`, set `plan`, `status = active`. **All their trial config/data carries over** so they don't restart. (Guardrail: trials hold fake data by policy, so nothing sensitive persists into the paid account unless they chose to enter real data, acceptable since it's now their account.)

---

## 8. Access gating (status enforcement)

A small guard at app entry (and defense-in-depth in RLS/RPCs):
- `status = active` → normal.
- `status = suspended` → **hard block** with "Your account is paused. Contact **prakash@campcommand.app**." (platform admins exempt).
- `status = trial_expired` → **hard block** with "Your 30-day trial has ended, email **prakash@campcommand.app** to continue." (platform admins exempt). No read-only mode; data retained for conversion.
- Trials surface a **"Trial, N days left"** banner while active (30-day window).

Enforcement layers:
1. **UI**: on load, resolve the active camp's status → route to the appropriate blocked screen.
2. **Server (authoritative)**: writes should fail for non-active camps. Cheapest robust approach, a status check in the shared RLS helper or a trigger; **decision needed** on how hard to enforce server-side vs UI-only for v1 (recommended: UI gate now + a hard block on the highest-risk writes; full RLS status-gating is a follow-up).

---

## 9. Impersonation / "open any camp"

**Model:** scoped super-admin access, not true session-swapping.
- Because §4 makes `is_camp_member`/`get_camp_role` return true/admin for platform admins, a founder can **open any camp** and operate within it with admin rights.
- The admin console has **"Open camp"** → sets the active camp in the app and shows a persistent **banner: "Viewing {Camp} as CampCommand admin · exit."**
- Every founder action inside a camp is **attributed to their real user id** (existing audit log captures actor), plus an explicit **`impersonation_start` / `impersonation_end` audit event**.
- **Optional later:** "view as {role}" to simulate a staff member's limited view (client-side role clamp) for support repro. Not required for v1.

**Security requirements**
- `platform_admins` membership is the only gate; keep the table tiny and access-controlled.
- Impersonation and any camper-health access by platform admins are **always audited** (never silent).
- Banner must be unmissable so founders never mistake a customer's account for their own.

---

## 10. Golden seed & cloning

- **Golden seed**: one camp, `is_seed = true`, `account_type = demo`, filled with realistic **fake** data across all modules (issues, pool logs, safety, buildings/locations, commissary menus+inventory, a retreat with menu/housing/invoice). This is the master we clone.
- **`clone_camp(source_camp_id, new_name, account_type, trial_days)`**, server-side deep copy (SQL function or edge function) that:
  - Creates a new `camps` row (+ type/status/trial fields).
  - Copies every camp-scoped table's rows, remapping `camp_id` and primary keys, preserving intra-camp FKs (issues→locations, recipes→menu entries, retreat→housing/invoices, etc.).
  - Does **not** copy `camp_members` (invites are sent fresh).
  - Is idempotent-safe and ordered by FK dependencies.
- **Maintenance**: to refresh demo data, edit the golden seed **by hand in the UI** and re-clone. Cloning is invoked only from the admin console by platform admins.
- **Approach (decided): explicit table list + drift check.** The clone copies a hand-maintained, dependency-ordered list of camp-scoped tables (correct and predictable, handles self-referencing FKs like `locations.parent_id` and ids-in-jsonb). A companion check compares that list against every table in the DB with a `camp_id` column and **fails loudly** if one is missing, so adding a new camp-scoped table surfaces immediately instead of silently breaking clones. (Pure `information_schema` auto-discovery was rejected: too fragile for arbitrary FK/jsonb remapping.)

---

## 11. Admin console (`/admin`, platform admins only)

**v1 features**
- **Camps list**, all camps grouped by org, with: name, account_type, status, plan, member count, trial countdown, last activity, provisioned_by/at. Filter/search.
- **Provision customer**, name, plan/tier, optional org, buyer email → creates camp + admin invite.
- **Spin up trial**, prospect name, email, trial length → clone golden seed + invite + set expiry.
- **Open camp** (impersonate). Enter any camp with the banner + audit (§9).
- **Suspend / Reactivate**, **Extend trial**, **Change plan/tier**, **Convert trial → customer**.
- **Orgs**. Create org, assign camps to it.
- **Platform admins**, list; add/remove founder super-admins (guarded).
- **Audit view**, recent impersonations, provisioning events, health-data access (reads the existing audit log).

**Non-goals for admin v1:** usage analytics dashboards, billing/invoice generation, self-serve trial request queue.

---

## 12. Billing / plans

- **Manual invoicing**, entirely out-of-band. **No payment integration, no pricing logic in the app.**
- `camps.plan` is an **optional free-text label** the founder can set per camp in the admin console (e.g., "Standard – founding") or leave blank. Purely informational; no tiers enforced or hardcoded. Pricing is handled externally.
- Org/network deals (many camps, one buyer) handled manually via the org grouping; volume pricing is a conversation, not a feature.

---

## 13. Data model change summary

**New tables:** `organizations`, `platform_admins`.
**Changed table `camps`:** `org_id`, `account_type`, `status`, `plan`, `trial_ends_at`, `is_seed`, `provisioned_by`, `provisioned_at`.
**New/changed functions:**
- `is_platform_admin()` (new).
- `is_camp_member(camp_id)`, `get_camp_role(camp_id)`add platform-admin bypass.
- `create_camp(...)`restrict EXECUTE to platform admins.
- `provision_camp(...)` / `spin_up_trial(...)` / `clone_camp(...)` (new; platform-admin only).
- `has_camper_health_access(camp_id)`decide platform-admin behavior (§4/§14).
- Audit events: `impersonation_start/end`, `camp_provisioned`, `trial_provisioned`, `trial_expired`, `plan_changed`, `camp_suspended/reactivated`.
**Cron:** nightly job to flip `trial` → `trial_expired` past `trial_ends_at`.
**RLS:** new tables get camp-agnostic policies (platform-admin only for `platform_admins`/`organizations` writes; org read for members of its camps).

---

## 14. Security & privacy

- **Minors' data:** trials/demos are **fake data only**, enforce by policy + a visible reminder in the admin "spin up trial" UI. The golden seed contains zero real PII.
- **Platform-admin camper-health access:** decision required, recommended **grant with mandatory audit**, never silent. Founders will need it for support but every access must be logged.
- **Impersonation:** always audited; unmissable banner; `platform_admins` table tightly controlled.
- **create_camp lockdown:** removing public self-serve creation closes the current "any authenticated user can spin up a camp" path.
- **Suspended/expired camps:** ensure blocked accounts truly can't read/write beyond the block screen (server-side enforcement scope per §8 decision).
- Re-run Supabase advisors after the migrations; keep 0 ERROR.

---

## 15. Changes to the existing app

- **Landing page:** ensure only "Book a demo" + "Sign in"; remove any lingering self-serve signup entry points.
- **Disable self-serve onboarding:** `CampSetup`/`createCamp`/`Onboarding` become reachable only via invite/provisioning (or repurposed as the post-invite setup wizard for a newly provisioned admin).
- **Add** `/admin` console (platform admins).
- **Add** status-gating screens (suspended / trial-expired) + trial-countdown banner + impersonation banner.
- **Camp store / auth:** load `account_type`, `status`, `plan`, `trial_ends_at` with the active camp; expose `isPlatformAdmin`.

---

## 16. Phased implementation plan

- **Phase 0, Tenant foundation (backend).** `organizations`, `platform_admins`, `camps` columns, `is_platform_admin()`, member/role bypass, restrict `create_camp`, seed founder admins. App loads new camp fields + `isPlatformAdmin`.
- **Phase 1, Admin console core.** Camps list, provision customer (+invite), open-camp/impersonation with banner + audit, suspend/reactivate, change plan.
- **Phase 2, Golden seed + trials.** Build/curate golden seed, `clone_camp`, "spin up trial" (clone+invite+expiry), trial-countdown banner, nightly expiry cron, trial-expired/suspended gating screens, trial→customer conversion.
- **Phase 3, Front-door separation.** Confirm marketing = demo/sign-in only, invite-only account creation end-to-end, (optional) `app.` subdomain split.
- **Phase 4, Polish.** Plan/tier UI, org grouping in admin, audit view, founding-discount metadata, health-access audit wiring.

Each phase ships green (tsc/build/eslint at baseline, advisors 0 ERROR) and is independently reviewable.

---

## 17. Decisions (resolved 2026-07-29)

1. **Camper-health access for platform admins**, ✅ Grant when supporting, with an **internal-only** audit event on every access (not shown to camps).
2. **Status enforcement depth for v1**, ✅ UI gate + hard-block the highest-risk writes now; full RLS status-gating is a follow-up.
3. **Subdomain split** · ✅ Yes, `app.campcommand.app` (Phase 3). **Blocked on founder-provided info:** hosting provider + DNS provider (see §18).
4. **Trial length & expiry**, ✅ **30 days**, **hard block** on expiry (no read-only), prompt to email **prakash@campcommand.app**. Same contact on the suspended screen.
5. **Pricing**, ✅ Handled externally. No tiers/pricing in the app; `plan` is an optional free-text label (§12).
6. **Clone strategy**, ✅ Explicit hand-maintained table list, dependency-ordered, **plus a drift check** against `camp_id` tables that fails loudly on a missing table (§10).

## 18. Founder to-dos (unblock Phase 3 subdomain split)

I handle all app-side routing; these are the parts only you can do:
1. Tell me the **hosting provider** (Vercel/Netlify/Cloudflare/…) and the **DNS provider** for `campcommand.app`.
2. Add a DNS record for `app.campcommand.app` → the host (exact steps once I know the providers).
3. Add `app.campcommand.app` as a custom domain in the host.
4. In **Supabase → Auth → URL Configuration**, add `https://app.campcommand.app` to Site URL + Redirect URLs (so login/reset/invite emails redirect correctly).
5. Seed the two founder `user_id`s into `platform_admins` (I'll provide the one-liner once Phase 0 lands).
