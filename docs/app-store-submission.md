# CampCommand — App Store submission pack

Everything needed to fill in App Store Connect, in the order the form asks for it.
Last updated 2026-08-17.

---

## 1. App information

| Field | Value |
|---|---|
| **Name** (30 max) | `CampCommand` |
| **Subtitle** (30 max) | `Maintenance & safety for camps` |
| **Bundle ID** | `com.ericrosenbaum.CampOps` |
| **Primary category** | Business |
| **Secondary category** | Productivity |
| **Age rating** | 4+ |
| **Price** | Free (access is controlled by camp invitation, not by purchase) |

### Keywords (100 characters, no spaces after commas)

```
summer camp,maintenance,work order,facilities,pool,chemical log,inspection,checklist,repairs,staff
```

Do not repeat words already used in the name or subtitle. Apple indexes those separately, so
repeating them wastes characters.

### Promotional text (170 max, editable without a new review)

```
Log a maintenance issue with a photo in seconds, track pool chemistry, and keep opening and closing checklists on schedule from anywhere on camp.
```

---

## 2. Description

```
CampCommand gives camp staff a single place to record and track the work that keeps a camp
running. Maintenance issues, pool chemistry, opening and closing checklists, and shared
equipment are all handled from your phone, wherever you happen to be standing when you notice
something.

Log an issue in seconds
When you spot a problem, photograph it, tag the location, and set a priority. The issue goes
straight to your camp's list so the right person can pick it up, and you can follow its
progress until it is resolved.

See what is assigned to you
Your home screen shows the work that belongs to you alongside a live count of everything open
across camp, so you always know both what you are responsible for and how the wider operation
is doing.

Keep pool chemistry on record
Record free chlorine, pH, alkalinity, cyanuric acid, and water temperature against your target
ranges. Readings outside a safe range are flagged immediately, and every entry is stored with a
timestamp and the name of the person who logged it, which gives you a complete history when
your health inspector asks for one.

Work through opening and closing
Pre-camp and post-camp checklists are organised by area so your team can see what is done, what
is outstanding, and how close the site is to being ready for campers.

Keep track of vehicles and equipment
Check vehicles, golf carts, and gear in and out with odometer readings, fuel level, and an
expected return time, so you always know where things are and who has them.

CampCommand is built for camp directors, facilities managers, and seasonal staff. Access is
provided by your camp administrator, who will send you an invitation link to set up your
account.
```

---

## 3. Screenshots

Five screenshots, supplied at both required display sizes. Upload in this order; the first two
are what most people actually see.

| # | Headline | Screen shown | File |
|---|---|---|---|
| 1 | TRACK / EVERY JOB ON CAMP | Home: open counts plus assigned work | `01-track.png` |
| 2 | LOG / ISSUES ON THE SPOT | Issues list with priorities and locations | `02-log.png` |
| 3 | MONITOR / POOL CHEMISTRY | Chemical log with target ranges and history | `03-monitor.png` |
| 4 | FINISH / EVERY OPENING TASK | Pre/post camp checklist | `04-finish.png` |
| 5 | CHECK OUT / VEHICLES & GEAR | Asset list with checked-out state | `05-checkout.png` |

**Locations**
- `screenshots/final/6.9-inch/` — 1320 × 2868 (iPhone 6.9")
- `screenshots/final/6.7-inch/` — 1290 × 2796 (iPhone 6.7")
- `ios/appstore/raw/` — the unframed simulator captures, kept so screenshots can be recomposed
  without re-driving the simulator

All five use real screens captured from the running app against the demo camp. No UI was
fabricated or mocked up, which matters because Apple rejects screenshots that do not represent
the actual app.

The device frame is rendered by `ios/appstore/compose.py`, written for this project because
the ASO skill's stock frame was a flat dark rectangle. It draws a brushed-titanium rail with
lit specular edges, a true 11.5% corner radius, the action/volume/power buttons, a glass sheen
and a contact shadow. It deliberately does not draw a Dynamic Island, because the simulator
capture already contains one.

**Optional further pass:** pulled-out UI panels (a stat card floating proud of the phone) would
add depth. That needs Gemini image credits, which are currently exhausted. The set is complete
and submittable without it.

---

## 4. App Review information

### Demo account — REQUIRED, and the single most common cause of rejection

CampCommand has no self-serve signup. Account creation happens through an invitation link
issued by a camp administrator, so a reviewer cannot get past the sign-in screen without
credentials. Guideline 2.1 requires a working demo account.

Provide, in the App Review notes field:

```
CampCommand is a business app for summer camp staff. Accounts are created by a camp
administrator, so please use the demo credentials below.

Email:    <reviewer account email>
Password: <password>

Sign in on the first screen using "Use a password instead".

The account is a member of a demo camp with sample maintenance issues, pool readings,
checklists and vehicles, so every tab has representative data.
```

**Important:** the app defaults to passwordless sign-in, where a one-time code is emailed. A
reviewer cannot read that mailbox. The demo account must therefore have a password set, and the
notes must tell the reviewer to tap "Use a password instead".

### Contact
- First / last name, phone, email of whoever can answer review questions.

---

## 5. Before you submit

Three items to resolve. The first two are rejection risks, the third is a factual accuracy point.

### a. In-app account deletion — done
Guideline 5.1.1(v) requires any app with accounts to offer account deletion inside the app. This
shipped on 2026-08-17: Profile has a "Delete my account" row behind a two-button confirmation
alert, calling the `delete_my_account()` `SECURITY DEFINER` RPC
(`supabase/migrations/20260817120000_delete_my_account.sql`).

What it removes: the auth user, the profile, and every camp membership. What it keeps: the work
the person logged, because that is the camp's operating record rather than personal data — an
inspector asking for a year of pool readings should not find a hole where someone's summer was.
Kept rows are detached from the user id and attributed by the name snapshot each row already
carries.

It refuses in two cases, returning a message naming the obstacle: the caller is the last
administrator of a camp, or the last platform admin. Both would leave something
unadministerable. The web app still has no equivalent; Apple only requires it in the app, but
it is worth adding for parity.

### b. Demo account with a password
See above. Create it before submitting and verify it works from a clean install.

### c. Do not claim offline support anywhere
There is no offline layer on iOS: no SwiftData, no Core Data, no write queue. Any copy implying
the app works without a signal would be inaccurate. The description above deliberately avoids it.

---

## 6. Privacy (App Privacy questionnaire)

Data collected and linked to the user's identity:
- **Contact info:** email address, name. Used for account authentication and to attribute work
  to the person who logged it.
- **User content:** photographs attached to maintenance issues, plus text the user enters.
- **Identifiers:** user ID.

Not collected: location data, contacts, browsing history, advertising identifiers, analytics.
No third-party advertising or tracking SDKs are present.

Required URLs:
- Privacy policy: `https://app.campcommand.app/privacy`
- Support URL: needed before submission
- Marketing URL (optional): `https://campcommand.app`

Permission strings already declared in `Info.plist`:
- Camera: "CampCommand uses your camera to photograph maintenance issues and scan pool chemical
  test strips."
- Photo library: "CampCommand uses your photo library to attach photos to issues."

---

## 7. Reproducing the screenshots

The simulator captures came from the iPhone 17 simulator signed into "Demo Camp Ramah NorCal".
To recapture:

1. Sign the simulator into the demo camp.
2. Capture each screen with `xcrun simctl io <udid> screenshot`, saving into `ios/appstore/raw/`.
3. Recompose with the ASO skill's `compose.py`, using a Python environment that has Pillow
   (a virtualenv at `.aso-venv` was created for this):

```bash
.aso-venv/bin/python ~/.claude/skills/aso-appstore-screenshots/compose.py \
  --bg "#2d4a2d" --verb "TRACK" --desc "EVERY JOB ON CAMP" \
  --screenshot ios/appstore/raw/01-home.png \
  --output screenshots/01-track/scaffold.png
```

4. Resize the 6.7" output to 6.9" with `sips -z 2868 1320 <file>`.

### Demo data adjustments made for the captures

The demo camp was tidied so the screenshots show realistic content. All of it is reversible:

| Change | Previous value |
|---|---|
| Profile `5b38efb7…` renamed to "Sam Reyes" | "M staff test" |
| Pool readings `logged_by_name` set to "Sam Reyes" | "M staff test" |
| Issue "Deep clean walk-in cooler" | was "Kitchen is dirty", status `unassigned` |
| Issue "Replace broken monitor in camp office" | was "Computer is broken" |
| "Take down hornets nest" and "Fix Broken Toilet" assigned to `5b38efb7…` | both unassigned |

---

## 8. Build checklist

- [ ] Version and build number set in Xcode
- [ ] App icon present at all required sizes (source: `Assets.xcassets/AppIcon.appiconset`)
- [ ] Archive built against the Release configuration
- [ ] Signing team and provisioning profile configured
- [x] Account deletion shipped (section 5a)
- [ ] Demo account created and tested (section 5b)
- [ ] Support URL live
- [ ] Screenshots uploaded for 6.9" and 6.7"
