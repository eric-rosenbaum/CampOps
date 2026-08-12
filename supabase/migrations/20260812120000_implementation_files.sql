-- White-glove implementation hand-off, generalized.
--
-- During setup a camp needs to send us raw source files — location inventories, staff
-- lists, camper rosters, session calendars, vendor order guides. Previously only the
-- locations spreadsheet had a home (the `location-imports` bucket); everything else was
-- arriving by email, which puts customer data outside the RLS boundary and outside the
-- audit log. This replaces that with one camp-scoped private bucket + a metadata table so
-- every hand-off has a receipt: what was sent, by whom, when.
--
-- RETENTION — deliberately keep-forever. There is no UPDATE or DELETE policy on either the
-- table or the bucket, so no app user (not even a camp admin) can remove or alter an
-- uploaded file or its metadata row. Purging is a service-role operation, on purpose: the
-- record of what a camp handed us is permanent.

-- ─── Bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('implementation-files', 'implementation-files', false)
on conflict (id) do nothing;

-- Any member of the camp may upload to / read their own camp's folder, and nobody else's.
-- Path convention: <camp_id>/<category>/<uuid>-<filename>, so foldername()[1] is the tenant.
-- Scoped `to authenticated` (the old location-imports policies were untyped, i.e. `public`)
-- so anon never even evaluates them.
drop policy if exists "impl_files_member_upload" on storage.objects;
create policy "impl_files_member_upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'implementation-files' and is_camp_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "impl_files_member_read" on storage.objects;
create policy "impl_files_member_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'implementation-files' and is_camp_member((storage.foldername(name))[1]::uuid)
  );
-- No update/delete policies: uploads are immutable and permanent from the app's side.

-- ─── Metadata table ───────────────────────────────────────────────────────────
create table if not exists public.implementation_files (
  id             uuid primary key default gen_random_uuid(),
  camp_id        uuid not null references public.camps(id) on delete cascade,
  category       text not null default 'other',
  name           text not null,              -- original filename as the camp sent it
  path           text not null unique,       -- storage path inside implementation-files
  size_bytes     bigint,
  content_type   text,
  note           text,                       -- optional context from the camp
  uploaded_by    uuid,                       -- auth.uid() of the uploader
  uploader_name  text,                       -- captured at upload; survives staff off-boarding
  uploader_email text,
  created_at     timestamptz not null default now(),
  constraint implementation_files_category_chk check (category in (
    'locations','staff','campers','sessions','inventory','vendors','retreats','other'
  ))
);

create index if not exists implementation_files_camp_time_idx
  on public.implementation_files (camp_id, created_at desc);

alter table public.implementation_files enable row level security;

drop policy if exists impl_files_row_read on public.implementation_files;
create policy impl_files_row_read on public.implementation_files
  for select to authenticated using (is_camp_member(camp_id));

drop policy if exists impl_files_row_insert on public.implementation_files;
create policy impl_files_row_insert on public.implementation_files
  for insert to authenticated with check (is_camp_member(camp_id));
-- Again: no update/delete policies. The hand-off record is append-only.

-- Every upload lands in the audit trail alongside health-record access and role changes.
drop trigger if exists audit_implementation_files on public.implementation_files;
create trigger audit_implementation_files
  after insert or update or delete on public.implementation_files
  for each row execute function public.audit_row_change();

-- ─── Retire the locations-only bucket ─────────────────────────────────────────
-- Verified empty before writing this migration (zero storage.objects rows) and no longer
-- referenced by any code. Dropping its policies makes it inert — with no policy, RLS on
-- storage.objects denies every app request against it, which fails closed.
--
-- The empty bucket row itself has to go through the Storage API; Postgres blocks direct
-- deletes from storage.buckets (storage.protect_delete). Remove it from the Supabase
-- dashboard → Storage, or leave it — it is unreachable either way.
drop policy if exists "loc_import_member_upload" on storage.objects;
drop policy if exists "loc_import_member_read"   on storage.objects;
