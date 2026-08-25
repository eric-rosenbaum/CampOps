-- SECURITY PHASE 1 (cont.), finish the function hardening.

-- (1) Pin search_path on every remaining public function still flagged mutable, by name
--     (robust to overloads / unknown arg types).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('update_updated_at','adjust_inventory_item','receive_purchase_order','delete_all_commissary_data')
      and not exists (
        select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- (2) handle_new_user is a trigger on auth.users. It should never be a callable API
--     endpoint. Revoke execute from everyone (the trigger still fires as table owner).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- (3) The read-only RLS helpers were left anon-executable as a precaution, but audit
--     confirmed NO anon-reachable policy references them (anon has no camps SELECT, and the
--     anon issues-insert check uses is_public_report only). Revoke anon; authenticated keeps
--     it because RLS evaluates these for signed-in users on every query.
revoke execute on function public.is_camp_member(uuid) from anon;
revoke execute on function public.get_camp_role(uuid) from anon;
revoke execute on function public.is_camp_admin(uuid) from anon;
revoke execute on function public.has_camper_health_access(uuid) from anon;
