# Camp Pinecrest — the marketing camp

The camp to build marketing content in. Named to match the landing page, whose hero card
already reads *"Today at Pinecrest · Day 12 of 54 · 142 campers on site"* — so screenshots and
marketing copy agree instead of quietly contradicting each other.

## Scope

This is the **only** camp demo tooling may write to. See `../README.md` — every other camp in
the project holds real data. Scope every `delete`/`update` in this folder to the camp id below
and check the `where camp_id` clause before running anything.

## Identity

| | |
|---|---|
| Camp id | `03c7a80f-e536-4f0e-ab48-41ea10fd2029` |
| Slug | `pinecrest` |
| Share token | `26d50c92bd0a4445b79048aa044a814a` |
| No-login demo link | `/try/26d50c92bd0a4445b79048aa044a814a` |
| Public report form | `/report/pinecrest` |
| Account type | `trial`, `trial_ends_at = NULL` |

Cloned from the seed camp ("Demo Camp") via `clone_camp`, which copies ~70 tables across every
module with uuid remapping.

**Why `trial` with a null end date.** `join_demo_with_token` refuses any camp whose
`account_type` isn't `trial`, which is why the other demo camps' `/try/` links return *"This
link is not a demo link."* It only rejects a trial whose `trial_ends_at` is in the *past*, so a
null end date makes this one permanently shareable. This is the only camp whose demo link both
works and won't expire.

## What it contains today

The clone brought over scaffolding, not content. Starting point:

| Module | Rows | State |
|---|---|---|
| Locations | 12 (+10 categories) | usable base |
| Safety & Compliance | 13 items | usable base |
| Issues & Repairs | 10 | inherited seed junk — replace |
| Pre/Post checklists | 5 | thin |
| Assets & Vehicles | 4 | thin |
| Pool | 2 pools, 0 equipment, 1 reading | needs building |
| Commissary | 2 items, 1 recipe, 1 camper | needs building |
| Building Systems | 1 building, 0 components | needs building |
| Retreats | 1 | needs building |
| Seasons | 0 | needs building |

## Staff

Five personas with distinct initial pairs, so the avatar circles read apart at a glance.

| Name | Initials | Role |
|---|---|---|
| Sarah Kim | SK | admin (director) |
| Marcus Tate | MT | staff (facilities) |
| Dana Reyes | DR | staff (maintenance) |
| Priya Shah | PS | staff (waterfront) |
| Luis Ortega | LO | staff (kitchen) |

No password, no identity row — they cannot sign in. They exist to be believable names on a
board. Eric's own account is also a member, as admin.

## Adding photos

1. Drop images in `demo/pinecrest/photos/`
2. `node demo/upload-photos.mjs 26d50c92bd0a4445b79048aa044a814a demo/pinecrest/photos`
3. Paste the printed URLs into the module seed SQL

## Convention for module seeds

One numbered file per module: fixed uuids, upserts, and timestamps written as
`now() - interval '…'` so re-running before a capture session makes the data read as live rather
than as a museum piece. Every destructive statement must carry
`where camp_id = '03c7a80f-e536-4f0e-ab48-41ea10fd2029'`.
