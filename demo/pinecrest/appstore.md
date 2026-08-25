# App Store capture notes

The five App Store panels are captured from Camp Pinecrest on the iPhone 17 simulator. The
full recipe lives in `docs/app-store-submission.md` §7; this file records the things that are
easy to get wrong.

## Re-anchor the clock before capturing

The board is seeded with relative timestamps, so it ages. If the newest card no longer reads in
minutes, re-anchor everything before shooting, a screenshot whose top card says "5 hrs ago"
undersells a tool whose whole argument is that the office sees the field immediately.

```sql
with base as (select max(created_at) as newest from issues where camp_id = '03c7a80f-…')
update issues i
   set created_at = i.created_at + ((now() - interval '16 minutes') - b.newest),
       updated_at = i.updated_at + ((now() - interval '16 minutes') - b.newest)
  from base b where i.camp_id = '03c7a80f-…';
```

Do the same for `issue_activity` and `pool_chemical_readings.reading_time`.

## Two data traps that break the captures

**Non-optional Swift properties.** iOS decodes several columns into non-optional properties, so
a NULL makes the decode throw and the *entire* payload is dropped. The app then renders an
empty state and the screen looks like a broken feature. `pool_equipment.status_detail` is the
one that caught us: four rows with a null detail made the Pool tab report "No pools added yet"
while the `pools` rows were perfectly intact. If a screen goes empty after seeding, suspect a
null in a required column before suspecting RLS.

**Completed work with a past due date** renders as "Overdue 2 days" on a COMPLETE task, which
reads as a bug in a screenshot. Completed checklist tasks are seeded with a null `due_date`.

## What each panel needs to be true

- **01 home**, issues assigned to the *signed-in simulator user*, or "My work" is empty.
- **02 issues**, a spread of priorities and statuses, newest in minutes.
- **03 detail**. Pick an issue that has an `issue_activity` trail, or the panel ends on
  "No activity yet" and the accountability story is missing.
- **04 pool**, readings in range and recent; the panel is the compliance argument.
- **05 pre/post**, a mix of pending, in progress and complete, each with an assignee.
