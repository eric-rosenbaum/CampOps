-- Make a fresh project reproducible from migrations alone.
--
-- Production has seven storage buckets but only three were ever created by a migration; the
-- rest were made by hand in the dashboard, along with two of their policies. That was invisible
-- while there was one project. Standing up a staging environment is where it surfaces: the
-- schema applies cleanly, then every photo upload fails against a bucket that does not exist.
--
-- Every statement is idempotent, so this is a no-op against production and the full set against
-- an empty project.

-- ── Buckets ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('issue-photos',         'issue-photos',         true,  null),
  ('public-report-photos', 'public-report-photos', true,  null),
  ('strip-photos',         'strip-photos',         true,  5242880),
  ('commissary-files',     'commissary-files',     false, null),
  ('retreat-documents',    'retreat-documents',    false, null),
  ('implementation-files', 'implementation-files', false, null),
  ('location-imports',     'location-imports',     false, null)
on conflict (id) do nothing;

-- ── Policies that only ever existed in the dashboard ─────────────────────────
-- Public issue-report photos. The reporter is anonymous by design (the point of `/report/:camp`
-- is that a counsellor or a guest can flag something without an account), so the insert is not
-- camp-scoped. Reads are public because the bucket is.
do $$ begin
  create policy "anon upload public report photos 47wt7a_0" on storage.objects
    for insert to anon with check (bucket_id = 'public-report-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated users can upload public report photos" on storage.objects
    for insert to authenticated with check (bucket_id = 'public-report-photos');
exception when duplicate_object then null; end $$;
