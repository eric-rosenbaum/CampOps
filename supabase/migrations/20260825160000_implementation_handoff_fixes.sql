-- Two fixes to the setup-file hand-off, both found while writing the client-facing setup guide.

-- 1 · The channel only worked in one direction.
--
-- Camps could upload, but both the metadata row and the stored object were readable only by
-- members of that camp (`is_camp_member`). Our platform admins are members of a handful of
-- camps, so for the rest a camp could send us their roster and nobody on our side could open
-- it. The feature reads as working right up until the moment it matters.
--
-- Read only, and only for platform admins. They still cannot write, delete or upload on a
-- camp's behalf, so the camp's own record of what it sent stays authoritative.
create policy "impl_files_row_admin_read" on public.implementation_files
  for select using (is_platform_admin());

create policy "impl_files_admin_read" on storage.objects
  for select using (bucket_id = 'implementation-files' and is_platform_admin());

-- 2 · The category list predates half the modules.
--
-- A camp sending an extinguisher schedule, a vehicle list, a panel schedule or a pool
-- inspection calendar had only "Something else" to file it under. Fine for one file, useless
-- across a whole onboarding: our team then opens every attachment to find out what it is.
-- Named after what the camp is sending, not after our table names.
alter table public.implementation_files
  drop constraint if exists implementation_files_category_chk;

alter table public.implementation_files
  add constraint implementation_files_category_chk check (category = any (array[
    'locations', 'staff', 'campers', 'sessions', 'inventory', 'vendors', 'retreats',
    'prepost', 'pool', 'safety', 'assets', 'building',
    'other'
  ]));
