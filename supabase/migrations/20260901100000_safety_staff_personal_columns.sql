-- Staff dates of birth are not for the whole camp to read.
--
-- Adding date_of_birth, sex, education, qualifying experience and licence number to
-- safety_staff made DOH-367a fillable, and quietly made every colleague's birthday readable by
-- every member of the camp. `members_select_safety_staff` grants SELECT to any camp member, RLS
-- is row-level so it cannot exclude a column, and the loader asked for select('*'). So a
-- read-only viewer login pulled the whole roster's personal details into their browser as a
-- side effect of opening the safety module.
--
-- The asymmetry is what gives it away: auth.ts already restricts *entering* a birthday to
-- admins, while *reading* one was open to everyone. This module has a rule about personal
-- records -- keep them where they belong and do not spread copies around -- and that rule was
-- being applied to requirements while the same data sat unprotected one table over.
--
-- Column privileges are the right tool, since the row itself must stay readable: a counselor
-- still needs to see who is on the roster.

revoke select (date_of_birth, sex, education, qualifying_experience, professional_license_number)
  on public.safety_staff from authenticated;

-- Admins read them through here instead. SECURITY DEFINER so the function owner's grants apply,
-- with the membership check done explicitly rather than relied upon from RLS.
create or replace function public.get_camp_staff_personal(p_camp_id uuid)
returns table (
  id uuid,
  date_of_birth date,
  sex text,
  education text,
  qualifying_experience text,
  professional_license_number text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_camp_admin(p_camp_id) then
    raise exception 'Only a camp administrator can read staff personal details';
  end if;

  return query
    select s.id, s.date_of_birth, s.sex, s.education,
           s.qualifying_experience, s.professional_license_number
      from safety_staff s
     where s.camp_id = p_camp_id;
end $$;

comment on function public.get_camp_staff_personal is
  'Staff personal details for the permit forms. Admin only; the columns are revoked from authenticated so this is the only read path.';

revoke execute on function public.get_camp_staff_personal(uuid) from public;
grant execute on function public.get_camp_staff_personal(uuid) to authenticated;
