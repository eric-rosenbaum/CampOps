-- sync_pull threw on every call, full or delta.
--
-- It built one query shape for all nineteen tables:
--
--   where x.camp_id = $1 and ($2 is null or x.updated_at > $2 or x.created_at > $2)
--
-- Seven of them have no `updated_at` at all — issue_comments, issue_checklist_items,
-- asset_checkouts, asset_service_records, pool_chemical_readings, pool_inspection_log,
-- pool_service_log. A column reference has to resolve at PARSE time, so `$2 is null` does not
-- rescue the full-sync case either: every call raised 42703 and the whole offline layer had no
-- read path.
--
-- The fix is to ask the catalogue which timestamp columns each table actually has and build the
-- predicate from that, rather than assuming a shape. Append-only tables are correctly served by
-- created_at alone — a chemical reading is never edited, it is superseded.

create or replace function public.sync_pull(p_camp_id uuid, p_since timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $fn$
declare
  v_out   jsonb := '{}'::jsonb;
  v_now   timestamptz := now();
  t       text;
  v_rows  jsonb;
  v_has_updated boolean;
  v_has_created boolean;
  v_pred  text;
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  foreach t in array array[
    'issues','issue_comments','issue_checklist_items','checklist_tasks','locations',
    'camp_assets','asset_checkouts','asset_service_records','asset_maintenance_tasks',
    'pools','pool_chemical_readings','pool_equipment','pool_service_log','pool_seasonal_tasks',
    'pool_inspections','pool_inspection_log','work_schedules','service_vendors','work_routing'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;

    select
      bool_or(column_name = 'updated_at'),
      bool_or(column_name = 'created_at')
      into v_has_updated, v_has_created
      from information_schema.columns
     where table_schema = 'public' and table_name = t;

    -- Build the watermark predicate from what the table actually has. A table with neither
    -- timestamp (work_routing) is small enough to send whole every time.
    if v_has_updated and v_has_created then
      v_pred := 'and ($2 is null or x.updated_at > $2 or x.created_at > $2)';
    elsif v_has_updated then
      v_pred := 'and ($2 is null or x.updated_at > $2)';
    elsif v_has_created then
      v_pred := 'and ($2 is null or x.created_at > $2)';
    else
      v_pred := '';
    end if;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.camp_id = $1 %s',
      t, v_pred)
      into v_rows using p_camp_id, p_since;

    v_out := v_out || jsonb_build_object(t, v_rows);
  end loop;

  return v_out || jsonb_build_object(
    'deleted', coalesce((
      select jsonb_agg(jsonb_build_object('table', table_name, 'id', row_id))
      from deleted_rows
      where camp_id = p_camp_id and (p_since is null or deleted_at > p_since)), '[]'::jsonb),
    'server_time', v_now,
    -- A device away longer than the tombstone window cannot be brought up to date by a delta,
    -- and pretending otherwise leaves it showing deleted work forever.
    'full_resync_required', p_since is not null and p_since < v_now - interval '90 days'
  );
end;
$fn$;

grant execute on function public.sync_pull(uuid, timestamptz) to authenticated;
