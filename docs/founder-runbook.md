# CampCommand — Founder Operations Runbook

How you (Eric + Prakash) run the business day-to-day: the golden seed, demos, trials, provisioning real customers, supporting accounts, and managing the platform. Everything below happens in the **Admin console**.

Companion docs: architecture + decisions live in `production-restructure-spec.md`.

---

## 0. The mental model (30 seconds)

- **Two surfaces.** `campcommand.app` = public marketing (book a demo). `app.campcommand.app` = the product + your admin console. Sign in only happens on `app.`
- **Accounts are invite-only.** Nobody self-signs-up. You create every account from the admin console; the buyer/prospect gets an invite link.
- **Every account is a "camp"** with an **account type**:
  - `customer` — a paying camp.
  - `trial` — a prospect's 30-day hands-on account (a clone of the golden seed, fake data).
  - `demo` — a camp you keep for live demos / the golden seed.
  - `internal` — your own scratch camps.
- **You are "platform admins"** — a super-role that lets you open the admin console and enter *any* camp.

---

## 1. Getting into the admin console

1. Go to **`https://app.campcommand.app`** and sign in with your founder account.
2. If your account isn't a member of any camp, you land on **`/admin`** automatically. If you *are* in a camp, you land in the app — click **"Admin console"** in the left sidebar (bottom section, founders only), or go to `app.campcommand.app/admin`.

The admin console lists every camp with its type, status, plan, member count, and trial countdown, plus the action buttons described below.

---

## 2. Build the golden seed (do this once, maintain over time)

The **golden seed** is one polished, realistic **fake** camp. Every prospect trial is a clone of it, so it's your most important sales asset — it's what makes a trial feel alive on day one.

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

> ⚠️ **Fake data only — never real camper info.** Trials are clones of this camp, and it holds minors-adjacent data types. Use made-up names/photos throughout.

**To refresh the demo later:** Open the seed camp, edit the data, done — new trials clone the updated version automatically. No re-marking needed.

---

## 3. Give a prospect a hands-on trial (after a demo)

1. In `/admin`, click **Spin up trial**.
2. Enter the **prospect/camp name** (e.g. "Maplewood (trial)") and the **prospect's email**.
3. **Seed to clone** defaults to your golden seed — leave it.
4. Click **Spin up + invite**. This clones the seed into a fresh **30-day trial** account and generates an **invite link**.
5. **Copy the invite link and send it to the prospect.** They open it, set a password, and become the admin of their trial camp — pre-loaded with the demo data, ready to explore and invite their own team.

**What the prospect sees:** a "Trial — N days left" banner. When 30 days pass, the trial hard-stops with a "your trial has ended — email prakash@campcommand.app" screen (data is retained so it can convert).

**Extend a trial:** click **+30d** on that camp in `/admin`.

---

## 4. Set up a real (paying) customer

Do this when a deal closes.

1. In `/admin`, click **Provision customer**.
2. Enter the **camp name**, optionally a **plan** label (free text, e.g. "Standard – founding") and an **organization** (see §7), and the **buyer's email** (they become the camp admin).
3. Click **Provision + invite** → creates a fresh **empty** `customer` camp and an **invite link**.
4. **Send the invite link to the buyer.** They set a password, become admin, and invite their staff.
5. **Get their data in.** Either they self-onboard, or use the white-glove path: Camp Info → Locations → **"Send us your list"** lets them drop a spreadsheet for you to load. (Billing is handled by you out-of-band — send the invoice separately.)

**Convert a trial into a paying customer** (keeps all their trial data — no re-setup): click **→ Customer** on the trial in `/admin`. It flips the account to `customer`, clears the trial clock, and keeps them running.

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
- **Set seed / Unseed** — designate which camp trials clone from.

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
| Let a prospect try it themselves | **Spin up trial** → send the invite link |
| Turn a won deal into an account | **Provision customer** → send the invite link |
| Turn a trial into a paid account | **→ Customer** on the trial |
| Get into a customer's account to help | **Open** → do the thing → **Exit to admin** |
| Pause an account | **Suspend** (reverse with **Reactivate**) |
| Give a prospect more time | **+30d** |
| Refresh the demo data | **Open** the seed camp, edit, done |

---

## 10. Gotchas

- **Invite links are how people get in.** After Provision/Spin-up, *you* send the link (copy it from the success screen). It makes the recipient the camp **admin**.
- **Trials are fake-data only.** Never load real camper PII into a demo/trial.
- **Sign out returns to marketing** (`campcommand.app`), by design — sign back in at `app.campcommand.app`.
- **"Remember me"** is per-device on `app.campcommand.app`; how long it lasts is the Supabase refresh-token setting.
- **Deploys:** changes go live when you deploy to Vercel; the DB (Supabase) is shared/live immediately.
