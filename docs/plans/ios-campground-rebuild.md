# The phone catches up with the board

The web's Campground module was rebuilt on 2026-09-02 (two products, joined at the work order).
The iOS app was not, and it has been quietly broken in production ever since: it writes
`estimated_cost`, a column that rework never created, so **logging or editing a work order from
the phone fails**. The last issue logged from a phone in production is 2026-08-23.

This plan brings the phone up to the board, and then past it in the one direction that matters:
the phone is what a person is holding while they are standing in front of the broken thing.

## The split we are building toward

| The phone | The web |
|---|---|
| Walking around: scan, log, take, do, close | Setting up: routines, templates, routing, vendors |
| One spot at a time | The whole camp at once |
| Bad signal, one hand, gloves on | A desk, a season review, a CSV |

Everything below follows from that. The phone never grows a routine editor; the web never has
to be opened to close out a job.

## Invariants (from the web, non-negotiable)

These are the rules the web enforces and the phone must not break. Each one is a real
constraint or trigger, not a preference.

1. **A job sits with a person or a crew, never both.** `issues_one_assignee`. Naming a person
   clears `assignee_group_id` in the same write and moves `unassigned → assigned`.
2. **`trade` is one of *this camp's* `staff_groups.key` values.** The five defaults are not a
   list to hard-code; `assert_trade_belongs_to_camp` rejects anything else.
3. **Trade is never permission.** It sets a filter and a colour. Visibility comes from role,
   crew membership, `issue_viewers` and "I reported it".
4. **The server owns `assigned_at`, `resolved_at`, `reporter_token`, `author_name`.** Never write
   them.
5. **A checklisted job is closed by a trigger, not by the client.** Tick the last step and the
   database resolves it. The client must not also resolve it.
6. **`issue_activity` has no trigger.** The client writes its own timeline rows.
7. **`YYYY-MM-DD` is a camp-local day.** `due_date` is a day; `due_time` is a separate column.
8. **Deprecated, never written:** `estimated_cost_*`, `is_recurring`, `recurring_interval`.
9. **Most permissive crew wins.** A person is in many crews; the union of what they grant is
   what they get.

## Phases

### 1. Stop the bleeding
The app is live. These are the fixes that matter before anything else.
- Drop `estimated_cost` from every payload and screen.
- Decode the two waiting statuses (`waiting_on_vendor`, `waiting_on_part`); unknown values
  degrade to an open status instead of failing the whole list decode.
- Read crews from `staff_group_members` (many-to-many), not the dead
  `camp_members.staff_group_id`. Fold permissions the permissive way.
- Honour `camps.modules` + `camps.platform_modules`.
- Retire the Pre/Post tab, which the web removed.

### 2. Campground parity
The work order gains every field the board has: crew, asset, vendor, schedule, retreat, due date
and time, minutes, waiting statuses, crew assignment. The board gains crew and status filters and
the web's visibility rule. The detail screen gains the timeline, comments with photos and
mentions, reporter replies, and checklists with sections and photo steps.

### 3. Scanning
An in-app scanner (VisionKit), a location screen and an asset screen. Universal links fixed so a
sticker scanned with the phone's own camera opens the app instead of Safari.

### 4. AI capture
Photo and/or dictation → `draft-work-order` → a filled form the person confirms. Never files by
itself. The edge function gets a camp-membership check, a rate limit and this camp's real trades
before the phone starts calling it.

### 5. Production push, and admin impersonation
Push works in production (0 device tokens today). A platform admin can open any camp from the
phone, with the camp they are borrowing made obvious on every screen.

## Offline is the design, not a feature

Camp signal is bad. That is an assumption, not an edge case.

- **Reads** come from the offline cache first, network second. Every Campground screen, including
  the location screen a sticker opens, renders from cache.
- **Writes** go through `MutationQueue` → `sync_push`. The device picks the id, so a job logged
  in a dead zone is a real row the moment it is typed.
- **Photos queue too.** A photo taken with no signal is written to disk and uploaded later, then
  patched onto its work order or comment. Without this, the camera is useless in exactly the
  buildings people are standing in when something breaks.
- **AI capture degrades.** No signal means the form opens empty with the photo attached, rather
  than an error.

## What we are deliberately not building on the phone

Routine and checklist-template authoring, work routing defaults, vendor management, season
review, CSV export, QR label printing, the locations editor, Retreats. All of it stays on the
web. The phone consumes what they produce.
