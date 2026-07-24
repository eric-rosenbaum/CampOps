-- Capture the acting user's email directly in each audit entry, so "who did this" is
-- self-contained and correct even if the client can't resolve the id (and survives the
-- member later being removed). auth.jwt() returns the caller's token claims even inside
-- SECURITY DEFINER functions.

alter table public.audit_log add column if not exists actor_email text;

-- Row-change trigger
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_camp uuid; v_id text;
begin
  if tg_op = 'DELETE' then
    v_camp := (to_jsonb(old)->>'camp_id')::uuid;
    v_id   := to_jsonb(old)->>'id';
  else
    v_camp := (to_jsonb(new)->>'camp_id')::uuid;
    v_id   := to_jsonb(new)->>'id';
  end if;
  insert into public.audit_log (camp_id, actor_id, actor_email, action, target_table, target_id)
  values (v_camp, auth.uid(), auth.jwt()->>'email', lower(tg_op), tg_table_name, v_id);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- App-level event helper
create or replace function public.log_audit_event(
  p_camp_id uuid, p_action text, p_target_table text default null, p_target_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_camp_member(p_camp_id) then raise exception 'Not authorized'; end if;
  insert into public.audit_log (camp_id, actor_id, actor_email, action, target_table, target_id)
  values (p_camp_id, auth.uid(), auth.jwt()->>'email', p_action, p_target_table, p_target_id);
end $$;
revoke execute on function public.log_audit_event(uuid,text,text,text) from public, anon;
grant  execute on function public.log_audit_event(uuid,text,text,text) to authenticated;

-- Data export
create or replace function public.export_camp_data(p_camp_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tables jsonb := '{}'::jsonb; t text; v_rows jsonb;
begin
  if not is_camp_admin(p_camp_id) then raise exception 'Not authorized'; end if;
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_name = c.table_name and tb.table_schema = 'public' and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'camp_id'
    order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.camp_id = $1', t)
      into v_rows using p_camp_id;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
  end loop;
  insert into public.audit_log (camp_id, actor_id, actor_email, action)
  values (p_camp_id, auth.uid(), auth.jwt()->>'email', 'export_data');
  return jsonb_build_object(
    'camp',        (select to_jsonb(c) from public.camps c where c.id = p_camp_id),
    'exported_at', now(), 'exported_by', auth.uid(), 'tables', v_tables
  );
end $$;
revoke execute on function public.export_camp_data(uuid) from public, anon;
grant  execute on function public.export_camp_data(uuid) to authenticated;

-- Portal token regeneration
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
  insert into public.audit_log (camp_id, actor_id, actor_email, action, target_table, target_id)
  values (v_camp, auth.uid(), auth.jwt()->>'email', 'regenerate_portal_token', 'retreats', p_retreat_id::text);
  return v_token;
end $$;
revoke execute on function public.regenerate_portal_token(uuid) from public, anon;
grant  execute on function public.regenerate_portal_token(uuid) to authenticated;

-- Backfill existing rows from auth.users.
update public.audit_log a
set actor_email = u.email
from auth.users u
where a.actor_id = u.id and a.actor_email is null;