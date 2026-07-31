# CampCommand — Founder Operations Runbook

How you (Eric + Prakash) run the business day-to-day: the golden seed, demos, provisioning real customers, supporting accounts, and managing the platform. Everything below happens in the **Admin console**.

Companion docs: architecture + decisions live in `production-restructure-spec.md`.

---

## 0. The mental model (30 seconds)

- **Two surfaces.** `campcommand.app` = public marketing (book a demo). `app.campcommand.app` = the product + your admin console. Sign in only happens on `app.`
- **Accounts are invite-only.** Nobody self-signs-up. You create every account from the admin console; the buyer/prospect gets an invite link.
- **Every account is a "camp"** with an **account type** (the UI label is in **bold**):
  - `customer` → **customer** — a paying camp (real accounts, email-invited).
  - `trial` → **demo** — a prospect's 30-day hands-on environment (a clone of the golden seed, fake data). The prospect's whole team gets in through a single **no-login link**; each prospect's demo is its own isolated camp, so they never see each other's data.
  - `demo` → **showcase** — a camp you keep for live sales calls / the golden seed.
  - `internal` → **internal** — your own scratch camps.
- **You are "platform admins"** — a super-role that lets you open the admin console and enter *any* camp.

> **One-time setup:** demo links use anonymous sessions, so **Anonymous sign-ins** must be ON in Supabase → **Authentication → Sign In / Providers**. Flip it once.

---

## 1. Getting into the admin console

1. Go to **`https://app.campcommand.app`** and sign in with your founder account.
2. You land on **`/admin`** automatically — founders always start in the console, never inside a camp. To work inside a camp, click **Open** on its row; return via **Exit to admin** in the banner. (You can also go straight to `app.campcommand.app/admin` any time.)

The admin console lists every camp with its type, status, plan, member count, and demo countdown, plus the action buttons described below.

---

## 2. Build the golden seed (do this once, maintain over time)

The **golden seed** is one polished, realistic **fake** camp. Every prospect demo is a clone of it, so it's your most important sales asset — it's what makes a demo feel alive on day one.

1. **Create the seed camp.** Easiest: from the admin console, **Provision customer** (see §4) with a name like *"CampCommand Demo"* and your own email as the admin — or reuse an existing internal camp. (It doesn't matter that it's typed `customer`; what matters is the `is_seed` flag in step 4.)
2. **Open it.** In the camps list, click **Open** next to that camp. You're now inside it as an admin (a "Viewing … as CampCommand admin" banner appears up top).
3. **Fill every module with believable fake data** — this is the part that sells:
   - **Camp Info → Locations:** a real-looking set of cabins, dining hall, waterfront, health center, etc.
   - **Issues & Repairs:** a handful of open/closed work orders with photos.
   - **Pool:** a pool with a few chemical readings logged.
   - **Safety & Compliance:** safety items, a completed drill, some inspections.
   - **Building Systems:** a building or two with electrical/plumbing detail.
   - **Commissary:** a few recipes + inventory items + a session menu (and, in Retreats mode, a retreat menu).
   - **Retreats:** one retreat with housing, a menu, an invoice, and a published guest portal.
   - **Team:** a couple of fake staff members.
4. **Mark it as the seed.** Back in `/admin`, click **Set seed** on that camp. (Only one seed is needed; you can re-mark a different camp any time.)

> ⚠️ **Fake data only — never real camper info.** Demos are clones of this camp, and it holds minors-adjacent data types. Use made-up names/photos throughout.

**To refresh the demo later:** Open the seed camp, edit the data, done — new demos clone the updated version automatically. No re-marking needed.

---

## 3. Give a prospect a hands-on demo (after a sales call)

1. In `/admin`, click **Spin up demo**.
2. Enter the **prospect/camp name** (e.g. "Maplewood (demo)").
3. **Seed to clone** defaults to your golden seed — leave it.
4. Click **Spin up demo**. This clones the seed into a fresh, **isolated 30-day demo** and gives you a **no-login share link**.
5. **Copy the link and send it to the prospect.** Anyone who opens it lands straight in the demo — **no email, no password**. Their whole team can share the one link and they'll all be in the same environment (and only that one — no other camp's data is reachable).

**Need the link again later?** Click **Demo link** on that camp's row in `/admin` to copy it any time.

**What the prospect sees:** the app, immediately, with a "Demo — N days left" banner. When 30 days pass, the demo hard-stops with a "your demo has ended — email prakash@campcommand.app" screen (data is retained so it can convert).

**Extend a demo:** click **+30d** on that camp in `/admin`.

**Note:** demo visitors are anonymous throwaway accounts — a nightly job clears them out automatically after ~40 days.

---

## 4. Set up a real (paying) customer

Do this when a deal closes.

1. In `/admin`, click **Provision customer**.
2. Enter the **camp name**, optionally a **plan** label (free text, e.g. "Standard – founding") and an **organization** (see §7), and the **buyer's email** (they become the camp admin).
3. Click **Provision + email invite** → creates a fresh **empty** `customer` camp and **emails the buyer their sign-in link automatically**. (The link is also shown on screen as a backup — if the email fails to send, you'll see a warning and can copy it to send manually.)
4. The buyer opens the emailed link, sets a password, becomes admin, and invites their staff.
5. **Get their data in.** Either they self-onboard, or use the white-glove path: Camp Info → Locations → **"Send us your list"** lets them drop a spreadsheet for you to load. (Billing is handled by you out-of-band — send the invoice separately.)

**Demos never become customer accounts.** A demo is entered through an anonymous no-login link, so there are no real, verified identities in it — upgrading it in place would leave the account wide open. When a deal closes you **always create a fresh, invite-only customer account** with **Provision customer** (above): the buyer gets a link to *their email*, sets a password, and signs in as a real named admin. (Demos are for exploring; the customer account is where real data lives.)

---

## 5. View / support any account (impersonation)

1. In `/admin`, click **Open** on any camp.
2. You're now inside that camp **as an admin**, seeing exactly what they see, with a persistent **"Viewing {Camp} as CampCommand admin"** banner at the top.
3. Do what you need (debug, fix data, check status).
4. Click **Exit to admin** in the banner to leave and return to the console.

Notes:
- Everything you do while impersonating is attributed to *your* founder account and logged.
- You can reach camper-health data while supporting a camp; each such access is recorded internally (not shown to the camp).

---

## 6. Pause, reactivate, change plan

All from the camps list in `/admin`:
- **Suspend** — blocks the camp's members at login with a "contact us" screen (you're exempt). Use for non-payment or off-boarding.
- **Reactivate** — un-suspends.
- **Plan** — click the plan cell and type/adjust the label (informational; billing is external).
- **Set seed / Unseed** — designate which camp demos clone from.
- **Delete** — moves the camp and all its data to the trash. You must **type the camp's exact name** to confirm (no accidents). It's **recoverable for 30 days** from the **"Recently deleted"** list at the bottom of the console (click **Restore**); after 30 days a nightly job permanently deletes it. Members lose access immediately.

---

## 7. Organizations (multi-camp networks)

For a buyer that runs several camps (a JCC, a camp network):
1. In `/admin`, use **"New organization…"** to create the org.
2. On each camp row, use the **org dropdown** to assign it to that org.

This groups the camps for you now; org-level billing/reporting is a future add-on. Sell per-camp today.

---

## 8. See & manage founders / super-admins

At the top of `/admin` there's a **"Platform admins"** panel:
- It **lists everyone with super-admin access** (your own row is marked **"you"**). These are the only accounts that can open the admin console and enter any camp.
- **Add someone:** type their email → **Add super-admin**. They must have **signed in at least once** first (so their account exists) — otherwise you'll get "No CampCommand account exists for that email."
- **Remove someone:** click the trash icon on their chip. You can't remove yourself (prevents locking the last founder out).

Current super-admins: **ericrosenbaum77@gmail.com** and **prakash@campcommand.app**.

Under the hood it's the `platform_admins` table and `is_platform_admin()`; if you ever need the SQL fallback:
```sql
insert into platform_admins (user_id) select id from auth.users where email = 'x@campcommand.app' on conflict do nothing;
```

---

## 9. Quick reference — playbooks

| You want to… | Do this |
|---|---|
| Run a live demo on a call | `/admin` → **Open** the golden seed camp, drive it on screen |
| Let a prospect try it themselves | **Spin up demo** → send the no-login link |
| Re-send a prospect their demo link | **Demo link** on the camp row (copies it) |
| Turn a won deal into an account | **Provision customer** → send the invite link |
| Turn a won deal into a paid account | **Provision customer** (fresh email-invited account) — demos can't be upgraded in place |
| Get into a customer's account to help | **Open** → do the thing → **Exit to admin** |
| Pause an account | **Suspend** (reverse with **Reactivate**) |
| Give a prospect more time | **+30d** |
| Delete a camp (recoverable 30 days) | **Delete** → type the exact name → confirm; restore from **Recently deleted** |
| Refresh the demo data | **Open** the seed camp, edit, done |

---

## 10. Gotchas

- **Invite links are how people get in.** After Provision/Spin-up, *you* send the link (copy it from the success screen). It makes the recipient the camp **admin**.
- **Demos are fake-data only.** Never load real camper PII into a demo.
- **Sign out returns to marketing** (`campcommand.app`), by design — sign back in at `app.campcommand.app`.
- **"Remember me"** is per-device on `app.campcommand.app`; how long it lasts is the Supabase refresh-token setting.
- **Deploys:** changes go live when you deploy to Vercel; the DB (Supabase) is shared/live immediately.
- **Invite emails** are sent by the `send-email` edge function via Resend, from `CampCommand <invites@campcommand.app>`. If a buyer never gets their email, the `RESEND_API_KEY` secret isn't set (Supabase → Edge Functions → secrets) or the `campcommand.app` domain isn't verified in Resend. Provisioning still works — the modal shows the link so you can send it by hand.
- **How accepting an invite works.** The link opens a page that **shows the invited email locked in** (read from the token) — the person just sets a password (and confirms it) and is signed in on the account for *that* address, then lands in the camp. No way to accidentally sign up under a different email. If they already have an account for that email, the page switches to "enter your password to sign in & join." Founders can't consume invites (they're told to open the camp from the console instead). Same page/flow for both the customer admin and any team member a camp admin invites.
- **Team invites email automatically too.** When a camp admin invites someone (Team → Invite by email), CampCommand emails them the same set-a-password link from `invites@campcommand.app` (the link also shows on screen as a backup).
