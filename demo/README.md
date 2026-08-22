# Demo content

Scripts that build **Camp Pinecrest**, the camp used for marketing captures, live demos, and
`/try/` links. Committed as the *recipe*, not just the result — the UI moves fast, and being
able to rebuild a board in a minute is the only thing that stops these assets rotting.

## Scope rule — read before writing anything here

**Camp Pinecrest is the only camp this repo's demo tooling may touch.**

    Camp Pinecrest = 03c7a80f-e536-4f0e-ab48-41ea10fd2029

Every other camp in the project is real data belonging to someone else — customers, trials,
Eric's own test camps, and the seed. No script in this folder may insert, update, or delete a
row in any of them, and no ad-hoc query should either. If demo content is needed for something,
it gets built in Pinecrest.

This rule exists because it was broken: on 2026-08-20 a seeding script hard-deleted the nine
issues in Demo Camp Ramah NorCal to make room for demo content. They were reconstructed from a
pre-delete snapshot and a photograph of the board, but descriptions, assignees, original ids
and the whole activity history were unrecoverable. Every seed script here scopes its deletes to
the Pinecrest camp id for that reason — check the `where camp_id` clause before running one.

## `upload-photos.mjs`

Uploads images to a camp's `issue-photos` folder and prints their public URLs.

```bash
node demo/upload-photos.mjs <share-token> <dir-of-images>
```

**No service-role key needed.** The bucket's INSERT policy is `is_camp_member(...)` for the
`authenticated` role, and `join_demo_with_token` makes a `/try/` anonymous session a member — so
an anonymous sign-in plus the camp's share token is enough to write. It uses the anon key
already in `.env.local`.

Paths are deterministic (`demo-<filename>`), so re-running replaces rather than accumulating and
URLs already pasted into seed SQL keep working.
