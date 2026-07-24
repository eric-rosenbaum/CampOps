-- SECURITY PHASE 1 — SECURITY DEFINER function hardening.

-- (1) Pin search_path on every SECURITY DEFINER function that lacked it. Without a pinned
-- path a caller who can create objects in an earlier schema could shadow an unqualified name
-- and have it run with the definer's (postgres) privileges. ALTER FUNCTION changes only the
-- config, never the body/behavior. The is_camp_* helpers are highest priority — they gate
-- every RLS policy in the app.
alter function public.accept_invitation(text) set search_path = public;
alter function public.create_camp(text,text,text,text,jsonb) set search_path = public;
alter function public.generate_join_code(uuid,text,text,integer,integer) set search_path = public;
alter function public.generate_join_code(uuid,text,text,integer,integer,uuid) set search_path = public;
alter function public.get_camp_role(uuid) set search_path = public;
alter function public.has_camper_health_access(uuid) set search_path = public;
alter function public.is_camp_admin(uuid) set search_path = public;
alter function public.is_camp_member(uuid) set search_path = public;
alter function public.join_camp_with_code(text) set search_path = public;
alter function public.update_camp(uuid,text,text,text,jsonb,jsonb,jsonb) set search_path = public;
alter function public.update_member_role(uuid,text,text,uuid) set search_path = public;

-- (2) Shrink the anonymous attack surface. Supabase grants EXECUTE to anon by default on
-- every function. Revoke it on the internal admin/onboarding functions (each already guards
-- internally via auth.uid()/is_camp_admin, so this is defense-in-depth), keeping them callable
-- by authenticated users. The 5 guest-portal RPCs stay anon-callable (that is their purpose).
-- The read-only helpers (is_camp_member/get_camp_role/is_camp_admin/has_camper_health_access)
-- are handled in the follow-up migration.
revoke execute on function public.accept_invitation(text) from public, anon;
grant  execute on function public.accept_invitation(text) to authenticated;
revoke execute on function public.create_camp(text,text,text,text,jsonb) from public, anon;
grant  execute on function public.create_camp(text,text,text,text,jsonb) to authenticated;
revoke execute on function public.generate_join_code(uuid,text,text,integer,integer) from public, anon;
grant  execute on function public.generate_join_code(uuid,text,text,integer,integer) to authenticated;
revoke execute on function public.generate_join_code(uuid,text,text,integer,integer,uuid) from public, anon;
grant  execute on function public.generate_join_code(uuid,text,text,integer,integer,uuid) to authenticated;
revoke execute on function public.join_camp_with_code(text) from public, anon;
grant  execute on function public.join_camp_with_code(text) to authenticated;
revoke execute on function public.update_camp(uuid,text,text,text,jsonb,jsonb,jsonb) from public, anon;
grant  execute on function public.update_camp(uuid,text,text,text,jsonb,jsonb,jsonb) to authenticated;
revoke execute on function public.update_member_role(uuid,text,text) from public, anon;
grant  execute on function public.update_member_role(uuid,text,text) to authenticated;
revoke execute on function public.update_member_role(uuid,text,text,uuid) from public, anon;
grant  execute on function public.update_member_role(uuid,text,text,uuid) to authenticated;
