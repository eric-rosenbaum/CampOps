-- SECURITY PHASE 0. Remove dangerous / over-broad storage policies.
--
-- issue-photos: four anon policies (added out-of-band, NOT in repo migrations) gave the
-- anonymous role full read/insert/update/DELETE with no path scoping, anyone could
-- enumerate, download, overwrite, or wipe every camp's photos and upload arbitrary files.
-- Remove all four, plus the broad public listing policy. The authenticated, camp-scoped
-- upload/update/delete policies remain (staff uploads via db.ts:dbUploadPhoto still work).
-- The bucket stays public so existing getPublicUrl() links keep rendering; migrating to a
-- fully-private bucket + signed URLs is a tracked follow-up (requires web + iOS changes).

drop policy if exists "anon can read issue photos"   on storage.objects;
drop policy if exists "anon can upload issue photos" on storage.objects;
drop policy if exists "anon can update issue photos" on storage.objects;
drop policy if exists "anon can delete issue photos" on storage.objects;
drop policy if exists "Anyone can view issue photos" on storage.objects;

-- public-report-photos: remove the broad public listing policy (enumeration of all camps'
-- report photos). Keep the anon INSERT so the public report form can still attach a photo,
-- and the authenticated upload policy.
drop policy if exists "Anyone can view public report photos" on storage.objects;
