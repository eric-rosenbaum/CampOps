-- Private storage bucket for retreat documents (agreements, COIs, waivers, deposit receipts).
-- Path convention: <camp_id>/<retreat_id>/<file>. Guests never read these directly — staff
-- generate signed URLs. Mirrors the applied remote migration (repo was out of sync).
insert into storage.buckets (id, name, public)
values ('retreat-documents', 'retreat-documents', false)
on conflict (id) do nothing;

-- Any camp member can read files under their camp's folder.
create policy "retreat_docs_member_read" on storage.objects
  for select using (
    bucket_id = 'retreat-documents'
    and is_camp_member((storage.foldername(name))[1]::uuid)
  );

-- Only admin/staff can upload.
create policy "retreat_docs_staff_write" on storage.objects
  for insert with check (
    bucket_id = 'retreat-documents'
    and is_camp_member((storage.foldername(name))[1]::uuid)
    and get_camp_role((storage.foldername(name))[1]::uuid) = any (array['admin', 'staff'])
  );

-- Only admin/staff can delete.
create policy "retreat_docs_staff_delete" on storage.objects
  for delete using (
    bucket_id = 'retreat-documents'
    and is_camp_member((storage.foldername(name))[1]::uuid)
    and get_camp_role((storage.foldername(name))[1]::uuid) = any (array['admin', 'staff'])
  );
