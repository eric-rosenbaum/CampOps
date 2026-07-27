-- Private bucket where a camp can drop their raw location spreadsheet for the CampCommand
-- team to process manually (white-glove onboarding). Path convention: <camp_id>/<file>.
insert into storage.buckets (id, name, public)
values ('location-imports', 'location-imports', false)
on conflict (id) do nothing;

-- Any camp member can upload to / read their own camp's folder. The CampCommand team
-- retrieves files via the service role / dashboard (no public access).
drop policy if exists "loc_import_member_upload" on storage.objects;
create policy "loc_import_member_upload" on storage.objects
  for insert with check (
    bucket_id = 'location-imports' and is_camp_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "loc_import_member_read" on storage.objects;
create policy "loc_import_member_read" on storage.objects
  for select using (
    bucket_id = 'location-imports' and is_camp_member((storage.foldername(name))[1]::uuid)
  );
