-- SECURITY PHASE 1 — allow revoking/rotating a guest-portal link.
-- Portal tokens previously never changed, so a leaked /portal/:token URL was permanent access
-- to that group's roster, documents, and financial balance. This RPC issues a fresh 256-bit
-- token (invalidating the old link), gated to admin/staff of the retreat's camp.

create or replace function public.regenerate_portal_token(p_retreat_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_camp uuid; v_token text;
begin
  select camp_id into v_camp from public.retreats where id = p_retreat_id;
  if v_camp is null then raise exception 'Retreat not found'; end if;
  if not (is_camp_member(v_camp) and get_camp_role(v_camp) in ('admin','staff')) then
    raise exception 'Not authorized';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  update public.retreats set portal_token = v_token, updated_at = now() where id = p_retreat_id;
  return v_token;
end $$;

revoke execute on function public.regenerate_portal_token(uuid) from public, anon;
grant  execute on function public.regenerate_portal_token(uuid) to authenticated;
