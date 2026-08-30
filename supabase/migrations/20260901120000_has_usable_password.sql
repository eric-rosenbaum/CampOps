-- Does the signed-in user have a real password we can ask them to confirm?
--
-- Deliberately NOT a null check. Accounts reach us in three shapes: a normal signup carries a
-- bcrypt hash; an OTP/magic-link signup carries ''; and seeded fixture accounts carry junk (the
-- *.test.local rows on staging hold a 1-character string). Only a bcrypt hash means the user
-- could actually type their current password, so that's what we test for.
create or replace function public.has_usable_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select coalesce(u.encrypted_password, '') ~ '^\$2' from auth.users u where u.id = auth.uid()),
    false
  );
$fn$;

revoke execute on function public.has_usable_password() from public, anon;
grant execute on function public.has_usable_password() to authenticated;
