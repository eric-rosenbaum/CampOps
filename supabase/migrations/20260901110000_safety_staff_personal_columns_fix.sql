-- Actually revoke the personal columns.
--
-- The previous migration ran `revoke select (col, ...)` while a whole-table `grant select` was
-- still in place, which Postgres accepts silently and does nothing with: a column privilege
-- cannot be taken away from under a table-wide grant. Verified after the fact by reading
-- date_of_birth as a plain camp member and getting the value back.
--
-- The working shape is to drop the table-wide grant and hand back only the columns the roster
-- needs. Row-level security is untouched and still decides which rows a member sees; this
-- decides which columns anybody may ask for at all.

revoke select on public.safety_staff from authenticated;
revoke select on public.safety_staff from anon;

grant select (id, camp_id, name, title, is_active, created_at, updated_at)
  on public.safety_staff to authenticated;

-- Writes are unchanged: only admins reach them, through the existing RLS policy.
grant insert, update, delete on public.safety_staff to authenticated;
