-- Every page a staff member opened showed "N changes didn't save".
--
-- The roster load calls get_camp_staff_personal for everyone, and the function RAISED for a
-- non-admin. The client already treated that error as "no details" (db.ts dbLoadStaffPersonal),
-- but the fetch wrapper counts every failed RPC POST as a failed write, so the unsaved-changes
-- banner appeared over the bottom of every screen for every counselor, kitchen lead and program
-- lead -- nothing had been changed, let alone lost.
--
-- A non-admin now gets an empty result instead of an error. Nothing more is disclosed: the same
-- rows are returned to the same people, and nobody else sees any.
create or replace function public.get_camp_staff_personal(p_camp_id uuid)
 returns table(id uuid, date_of_birth date, sex text, education text, qualifying_experience text, professional_license_number text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_camp_admin(p_camp_id) then
    return;
  end if;

  return query
    select s.id, s.date_of_birth, s.sex, s.education,
           s.qualifying_experience, s.professional_license_number
      from safety_staff s
     where s.camp_id = p_camp_id;
end $function$;

revoke execute on function public.get_camp_staff_personal(uuid) from public, anon;
grant execute on function public.get_camp_staff_personal(uuid) to authenticated, service_role;
