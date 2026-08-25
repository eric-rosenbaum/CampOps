-- Let camp members SELECT their own issue photos.
--
-- `issue-photos` had INSERT, UPDATE and DELETE policies but no SELECT one. Storage resolves an
-- object row before it will update or delete it, and with no SELECT policy that lookup returns
-- nothing, so the operation silently finds "no such object" and succeeds having done nothing.
--
-- The visible symptom is dbDeletePhoto() in src/lib/db.ts: it calls .remove([path]), gets back
-- no error and an empty array, logs nothing, and the file stays in the bucket forever. Deleting
-- an issue or replacing its photo has been orphaning storage objects. Uploads with upsert:true
-- fail outright for the same reason, reported as an RLS violation.
--
-- This grants nothing new: the bucket is public, so every one of these objects is already
-- readable by anyone holding the URL. It only lets the authenticated API see rows it is already
-- allowed to modify.

create policy "Camp members can read issue photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'issue-photos'
    and is_camp_member(((storage.foldername(name))[1])::uuid)
  );
