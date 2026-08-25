-- SECURITY PHASE 2, per-camp data export (data portability / "give us our data").
-- Admin-only, audit-logged. Dynamically bundles every camp-scoped table plus the camp profile
-- row into one JSON document. SECURITY DEFINER (bypasses RLS) but hard-scoped to the caller's
-- own camp via is_camp_admin + a camp_id filter on every table.

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

  insert into public.audit_log (camp_id, actor_id, action) values (p_camp_id, auth.uid(), 'export_data');

  return jsonb_build_object(
    'camp',        (select to_jsonb(c) from public.camps c where c.id = p_camp_id),
    'exported_at', now(),
    'exported_by', auth.uid(),
    'tables',      v_tables
  );
end $$;

revoke execute on function public.export_camp_data(uuid) from public, anon;
grant  execute on function public.export_camp_data(uuid) to authenticated;
