-- Make the scanned test-strip photo actually reach the web.
--
-- The iOS scan flow has uploaded a photo of every strip it read since April, to
-- strip-photos/<readingId>.jpg. Not one has ever landed: the bucket has no INSERT policy, so
-- RLS denied all of them, and the app wrapped the upload in `try?` so the failure was silent.
-- The bucket is empty. Separately, nothing linked a photo to its reading and the web had no
-- code to show one, so even a successful upload would have gone nowhere.
--
-- Three things are needed and all three are here: somewhere to record the link, permission to
-- write, and permission to read.

alter table public.pool_chemical_readings
  add column if not exists strip_photo_url text;

comment on column public.pool_chemical_readings.strip_photo_url is
  'Public URL of the scanned test-strip photo, when the reading came from the iOS scanner. Null for hand-entered readings.';

-- Camp-scoped paths, matching issue-photos: <campId>/<readingId>.jpg. The old flat
-- <readingId>.jpg layout could not be scoped to a camp at all, which is why no policy could be
-- written for it. Nothing is migrated because nothing was ever stored.
create policy "Camp members can upload strip photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'strip-photos'
    and is_camp_member(((storage.foldername(name))[1])::uuid)
  );

create policy "Camp members can read strip photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'strip-photos'
    and is_camp_member(((storage.foldername(name))[1])::uuid)
  );

-- Re-scanning a strip for the same reading overwrites rather than accumulating, which the
-- client does with upsert; that is an UPDATE on an existing object.
create policy "Camp members can update strip photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'strip-photos'
    and is_camp_member(((storage.foldername(name))[1])::uuid)
  );
