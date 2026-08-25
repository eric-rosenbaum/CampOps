# CampCommand, App Store submission pack

Everything needed to fill in App Store Connect, in the order the form asks for it.
Last updated 2026-08-25 (CampCommand badge mark from `src/campcommand-brand`, Camp Pinecrest captures).

> **Brand:** the mark, the app icon and the web favicons all ship from the brand package at
> `src/campcommand-brand/`. The icon is installed in `Assets.xcassets` and the screenshots
> below were recaptured on 2026-08-25, so every surface shows the CampCommand badge.

---

## 1. App information

| Field | Value |
|---|---|
| **Name** (30 max) | `CampCommand` |
| **Subtitle** (30 max) | `Maintenance, pools, checklists` (30/30) |
| **Bundle ID** | `com.ericrosenbaum.CampOps` |
| **Primary category** | Business |
| **Secondary category** | Productivity |
| **Age rating** | 4+ |
| **Price** | Free (access is controlled by camp invitation, not by purchase) |

### Keywords (100 characters, no spaces after commas)

```
summer,work,order,facilities,repair,chlorine,inspection,ACA,staff,retreat,property,compliance,log
```

97/100 characters.

Apple indexes the name, the subtitle and this field as one pool, so a word used in the name or
subtitle must not be repeated here. Every repeat is a wasted character. `camp` is in the name;
`maintenance`, `pools` and `checklists` are in the subtitle. None appear below.

Single words rather than phrases: Apple recombines them, so `work` + `order` already matches a
search for "work order" while costing four fewer characters than the phrase.

`ACA` is the American Camp Association, a term directors search that no consumer would.

### A note on how much this matters

Access is by camp invitation, so nobody discovers this app through App Store search. The
metadata's real jobs are **recognition** (a counselor told "download CampCommand" finds the
right app on the first try) and **deflection** (someone without an invitation understands why
they cannot sign in, and doesn't leave a one-star review saying it's broken). The keyword work
below is worth doing well but is not an acquisition channel.

### Promotional text (170 max, editable without a new review)

```
Log a repair with a photo in seconds. Track pool chemistry against your target ranges. Keep opening and closing checklists moving, from anywhere on the property.
```

159/170 characters. This field can be changed without submitting a new build, so it is the one
to use for seasonal messaging (pre-season opening, mid-summer, closing).

---

## 2. Description

The first three lines are all that show before "more", so they carry the whole pitch. The
second paragraph exists to stop the wrong person downloading and then rating the app one star
because they cannot sign in.

Only the six modules that actually ship on iOS are described, Home, Issues, Pre/Post, Pool,
Assets and Building. Safety & Compliance, Commissary and Retreats are web-only, and describing
them here would be inaccurate.

```
CampCommand is where camp staff record and track the work that keeps a camp running · repairs,
pool chemistry, opening and closing checklists, buildings and shared vehicles · logged from
wherever you happen to be standing when you notice something.

Access is provided by your camp administrator. If your camp does not use CampCommand yet, you
will not be able to sign in.

Log an issue in seconds
Photograph the problem, tag the location, set a priority. It lands on your camp's list so the
right person can pick it up, and you can follow it until it is resolved.

See what is yours
Your home screen shows the work assigned to you next to a live count of everything open across
camp, so you know both what you are responsible for and how the wider operation is doing.

Keep pool chemistry on record
Record free chlorine, pH, alkalinity, cyanuric acid and water temperature against your target
ranges. Anything outside a safe range is flagged, and every entry is stored with a timestamp
and the name of the person who logged it, a complete history for when your health inspector
asks for one.

Work through opening and closing
Pre-camp and post-camp checklists are organised by area, so your team can see what is done,
what is outstanding, and how close the site is to being ready for campers.

Track vehicles and equipment
Check golf carts, vehicles and gear in and out with odometer readings, fuel level and an
expected return time, so you always know where something is and who has it.

Find the shutoff before you need it
Electrical panels, plumbing shutoffs and building systems recorded room by room, so nobody is
hunting for a breaker in the dark.

Built for camp directors, facilities managers and seasonal staff.
```

---

## 3. Screenshots

Five screenshots, supplied at both required display sizes. Upload in this order; the first two
are what most people actually see.

| # | Headline | Screen shown | File |
|---|---|---|---|
| 1 | TRACK / EVERY JOB ON CAMP | Home: open counts plus assigned work | `01-track.png` |
| 2 | LOG / IT FROM ANYWHERE | Issues list with priorities and locations | `02-log.png` |
| 3 | ASSIGN / AND NOTHING GETS LOST | Issue detail with its activity trail | `03-monitor.png` |
| 4 | PROVE / THE POOL WAS IN RANGE | Chemical log with target ranges and history | `04-finish.png` |
| 5 | OPEN / CAMP ON SCHEDULE | Pre/post camp checklist | `05-checkout.png` |

**Locations**
- `screenshots/final/6.9-inch/`1320 × 2868 (iPhone 6.9")
- `screenshots/final/6.7-inch/`1290 × 2796 (iPhone 6.7")
- `ios/appstore/raw-new/`the unframed simulator captures (Camp Pinecrest, Field Guide design),
  kept so screenshots can be recomposed without re-shooting. `ios/appstore/raw/` holds the
  superseded pre-redesign captures.
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

### Demo account, REQUIRED, and the single most common cause of rejection

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

### a. In-app account deletion · done
Guideline 5.1.1(v) requires any app with accounts to offer account deletion inside the app. This
shipped on 2026-08-17: Profile has a "Delete my account" row behind a two-button confirmation
alert, calling the `delete_my_account()` `SECURITY DEFINER` RPC
(`supabase/migrations/20260817120000_delete_my_account.sql`).

What it removes: the auth user, the profile, and every camp membership. What it keeps: the work
the person logged, because that is the camp's operating record rather than personal data · an
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

### Required URLs

| Field | Value | Status |
|---|---|---|
| Privacy policy | `https://app.campcommand.app/privacy` | Live, route exists |
| Support URL | `https://app.campcommand.app/support` | Live, route added 2026-08-23 |
| Marketing URL (optional) | `https://campcommand.app` | Live |

The support page answers the question a reviewer is about to have themselves. Why they cannot
create an account, as well as the one real users will actually ask. Source is
`docs/legal/SUPPORT.md`, rendered by `src/pages/legal/Support.tsx` on the public `/support`
route, the same pattern as `/privacy`, `/security` and `/dpa`.

Confirm it resolves on the production host before submitting; Apple rejects a support URL that
404s, and the route only exists once this build is deployed.

Permission strings already declared in `Info.plist`:
- Camera: "CampCommand uses your camera to photograph maintenance issues and scan pool chemical
  test strips."
- Photo library: "CampCommand uses your photo library to attach photos to issues."

---

## 7. Reproducing the screenshots

The captures come from the iPhone 17 simulator signed into **Camp Pinecrest**, running the
Field Guide design. To recapture:

1. Sign the simulator into Camp Pinecrest.
2. Reseed the demo board first if the data has aged. The issue timestamps are relative, so a
   stale board shows months-old dates in the captures. See `demo/pinecrest/`.
3. Capture each screen into `ios/appstore/raw-new/`:

```bash
xcrun simctl io <udid> screenshot ios/appstore/raw-new/01-home.png
```

4. Compose with the project's own composer (vendored from the ASO skill so the colour, the
   gaps and the line-spacing fix travel with the repo):

```bash
.aso-venv/bin/python ios/appstore/compose.py \
  --bg "#1D3A2E" --fg "#F6F1E4" --contours "#EFE7D4" \
  --verb "TRACK" --desc "EVERY JOB ON CAMP" \
  --screenshot ios/appstore/raw-new/01-home.png \
  --output screenshots/01-track/scaffold.png
```

`--contours` draws the sidebar's topographic texture onto the pine ground; omit it for a flat
background. Headline spacing is metric-based, lines sit on a baseline grid that advances by a
constant derived from cap height, so two all-caps lines are spaced identically regardless of
which glyphs they contain. Tune with `--verb-desc-gap` / `--desc-line-gap`.

5. Resize the 6.7" output to 6.9" with `sips -z 2868 1320 <file>`.

The five panels, their headlines and the screen each one needs. This used to be duplicated in
section 3 with different copy, and the two drifted apart; section 3 now mirrors this table.

| Folder | Verb | Descriptor | Screen |
|---|---|---|---|
| `01-track` | TRACK | EVERY JOB ON CAMP | Home tab |
| `02-log` | LOG | IT FROM ANYWHERE | Issues tab |
| `03-monitor` | ASSIGN | AND NOTHING GETS LOST | Issues → "Bathhouse 2" (it has an activity trail) |
| `04-finish` | PROVE | THE POOL WAS IN RANGE | Pool → Main Pool → Chemical |
| `05-checkout` | OPEN | CAMP ON SCHEDULE | Pre/Post camp → Pre-camp |

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

---

## 9. Remaining App Store Connect fields

| Field | Value |
|---|---|
| **Version** | `1.0` |
| **Build** | `1` |
| **Copyright** | `2026 Eric Rosenbaum` |
| **What's New** | Not required for a first release; Apple shows the description instead |
| **Primary language** | English (U.S.) |
| **Content rights** | Does not contain, show, or access third-party content |
| **Age rating** | 4+, no objectionable content in any category |
| **Export compliance** | Uses encryption **only** via standard HTTPS/TLS, which is exempt. Answer "Yes" to using encryption, then "Yes" to the exemption for standard encryption. Adding `ITSAppUsesNonExemptEncryption = false` to `Info.plist` skips the question on every future upload. |
| **Pricing** | Free |
| **Availability** | All territories, or United States only if you would rather keep the first release narrow |
| **Sign in with Apple** | Not required. The app offers no third-party or social login, only email |

### Fonts

Bitter and Karla are bundled and are both licensed under the SIL Open Font License, which
permits embedding in an app. No attribution is required in the binary.
