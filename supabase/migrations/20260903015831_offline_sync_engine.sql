-- Offline sync, server side.
--
-- iOS was specced for offline and it was never built, which is the real risk to the whole field
-- story: a maintenance lead in a dead zone taps Done and nothing happens. Three pieces are
-- needed and none of them can live only on the device.
--
-- 1 · TOMBSTONES. A delta pull ("what changed since Tuesday?") is a query on updated_at, and a
--     row deleted on Wednesday matches nothing -- so a device that was away keeps showing work
--     that no longer exists. Deletes have to leave something behind.
--
-- 2 · IDEMPOTENCY. A phone that loses signal mid-request does not know whether the write landed.
--     It must be safe to retry, which means the client picks the mutation id and the server
--     refuses to apply the same one twice.
--
-- 3 · A BATCH ENDPOINT that runs under the caller's own RLS. Everything here is SECURITY INVOKER
--     on purpose: a sync endpoint that bypassed row-level security would be the single largest
--     hole in the product.

-- 1 · Tombstones -------------------------------------------------------------------
create table if not exists deleted_rows (
  table_name text        not null,
  row_id     uuid        not null,
  camp_id    uuid        not null,
  deleted_at timestamptz not null default now(),
  primary key (table_name, row_id)
);
create index if not exists deleted_rows_camp_idx on deleted_rows (camp_id, deleted_at);

alter table deleted_rows enable row level security;
drop policy if exists deleted_rows_read on deleted_rows;
create policy deleted_rows_read on deleted_rows for select using (is_camp_member(camp_id));

comment on table deleted_rows is
  'What a delta pull cannot otherwise know. Swept after 90 days: a device offline for a full season re-syncs from scratch rather than replaying a year of tombstones.';

create or replace function public.record_tombstone()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into deleted_rows (table_name, row_id, camp_id, deleted_at)
  values (tg_table_name, old.id, old.camp_id, now())
  on conflict (table_name, row_id) do update set deleted_at = now();
  return old;
end;
$fn$;

do $tomb$
declare t text;
begin
  foreach t in array array[
    'issues','checklist_tasks','locations','camp_assets','asset_checkouts','asset_service_records',
    'asset_maintenance_tasks','pools','pool_chemical_readings','pool_equipment','pool_service_log',
    'pool_seasonal_tasks','pool_inspections','pool_inspection_log','buildings','building_rooms',
    'building_components','building_circuits','building_seasonal_tasks',
    'issue_comments','issue_checklist_items','work_schedules','service_vendors'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_tombstone_trg', t);
      execute format(
        'create trigger %I after delete on public.%I for each row execute function public.record_tombstone()',
        t || '_tombstone_trg', t);
    end if;
  end loop;
end;
$tomb$;

-- Realtime deletes need this too, and building_* never got it -- deleting a building, room,
-- component or circuit has been silently invisible to every other open browser.
do $ri$
declare t text;
begin
  foreach t in array array['buildings','building_rooms','building_components','building_circuits',
                           'building_seasonal_tasks','deleted_rows'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end;
$ri$;

-- 2 · Idempotency ------------------------------------------------------------------
create table if not exists client_mutations (
  id         text primary key,          -- chosen by the device, stable across retries
  camp_id    uuid not null references camps(id) on delete cascade,
  user_id    uuid not null,
  op         text not null,
  table_name text not null,
  row_id     uuid,
  applied_at timestamptz not null default now(),
  result     jsonb
);
create index if not exists client_mutations_camp_idx on client_mutations (camp_id, applied_at desc);

alter table client_mutations enable row level security;
drop policy if exists client_mutations_own on client_mutations;
create policy client_mutations_own on client_mutations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_camp_member(camp_id));

comment on table client_mutations is
  'One row per mutation the device sent, keyed by an id the DEVICE chose. A phone that loses signal mid-request does not know whether the write landed; this is what makes retrying safe.';

-- 3 · Pull -------------------------------------------------------------------------
-- Everything that changed for this camp since a watermark, plus what was deleted. Null since =
-- a full sync, which is what a fresh install or a device gone longer than the tombstone window
-- gets.
create or replace function public.sync_pull(p_camp_id uuid, p_since timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $fn$
declare
  v_out jsonb := '{}'::jsonb;
  v_now timestamptz := now();
  t text;
  v_rows jsonb;
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  foreach t in array array[
    'issues','issue_comments','issue_checklist_items','checklist_tasks','locations',
    'camp_assets','asset_checkouts','asset_service_records','asset_maintenance_tasks',
    'pools','pool_chemical_readings','pool_equipment','pool_service_log','pool_seasonal_tasks',
    'pool_inspections','pool_inspection_log','work_schedules','service_vendors','work_routing'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;

    -- work_routing has no id and no updated-since story worth having: it is three rows.
    if t = 'work_routing' then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.camp_id = $1', t)
        into v_rows using p_camp_id;
    else
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x
          where x.camp_id = $1 and ($2 is null or x.updated_at > $2 or x.created_at > $2)', t)
        into v_rows using p_camp_id, p_since;
    end if;

    v_out := v_out || jsonb_build_object(t, v_rows);
  end loop;

  return v_out || jsonb_build_object(
    'deleted', coalesce((
      select jsonb_agg(jsonb_build_object('table', table_name, 'id', row_id))
      from deleted_rows
      where camp_id = p_camp_id and (p_since is null or deleted_at > p_since)), '[]'::jsonb),
    'server_time', v_now,
    -- A device that has been away longer than the tombstone window cannot be brought up to date
    -- by a delta, and pretending otherwise leaves it showing deleted work forever.
    'full_resync_required', p_since is not null and p_since < v_now - interval '90 days'
  );
end;
$fn$;

grant execute on function public.sync_pull(uuid, timestamptz) to authenticated;

-- 4 · Push -------------------------------------------------------------------------
-- SECURITY INVOKER: every write below is subject to exactly the same RLS the app is. The batch
-- is applied one mutation at a time rather than atomically, because a phone with eleven queued
-- changes should land the ten that are fine rather than lose all eleven to one that is not.
create or replace function public.sync_push(p_camp_id uuid, p_mutations jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare
  m         jsonb;
  v_results jsonb := '[]'::jsonb;
  v_tbl     text;
  v_op      text;
  v_id      text;
  v_row     uuid;
  v_payload jsonb;
  v_cols    text;
  v_sets    text;
  v_err     text;
  ALLOWED   text[] := array[
    'issues','issue_comments','issue_checklist_items','checklist_tasks',
    'pool_chemical_readings','pool_inspection_log','pool_service_log','pool_seasonal_tasks',
    'asset_checkouts','asset_service_records','asset_maintenance_tasks',
    'building_seasonal_tasks','issue_activity'
  ];
begin
  if not is_camp_member(p_camp_id) then raise exception 'Forbidden'; end if;

  for m in select * from jsonb_array_elements(p_mutations) loop
    v_id      := m->>'id';
    v_op      := coalesce(m->>'op', 'upsert');
    v_tbl     := m->>'table';
    v_payload := m->'payload';
    v_row     := nullif(v_payload->>'id','')::uuid;
    v_err     := null;

    if v_id is null or v_tbl is null then
      v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', 'malformed mutation');
      continue;
    end if;

    -- Already applied. Report success so the device clears it from the queue rather than
    -- retrying forever.
    if exists (select 1 from client_mutations c where c.id = v_id) then
      v_results := v_results || jsonb_build_object('id', v_id, 'ok', true, 'duplicate', true);
      continue;
    end if;

    if not (v_tbl = any(ALLOWED)) then
      v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', 'table not syncable');
      continue;
    end if;

    begin
      if v_op = 'delete' then
        execute format('delete from public.%I where id = $1 and camp_id = $2', v_tbl)
          using v_row, p_camp_id;
      else
        -- The payload must belong to the camp the caller named, whatever it claims.
        v_payload := v_payload || jsonb_build_object('camp_id', p_camp_id);

        select string_agg(quote_ident(k), ', '),
               string_agg(format('%I = excluded.%I', k, k), ', ')
          into v_cols, v_sets
          from jsonb_object_keys(v_payload) k
          where exists (
            select 1 from information_schema.columns c
            where c.table_schema = 'public' and c.table_name = v_tbl and c.column_name = k);

        if v_cols is null then
          v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', 'no known columns');
          continue;
        end if;

        execute format(
          'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
             on conflict (id) do update set %s',
          v_tbl, v_cols, v_cols, v_tbl, v_sets)
          using v_payload;
      end if;

      insert into client_mutations (id, camp_id, user_id, op, table_name, row_id)
      values (v_id, p_camp_id, auth.uid(), v_op, v_tbl, v_row);

      v_results := v_results || jsonb_build_object('id', v_id, 'ok', true);

    exception when others then
      -- A rejected mutation is information, not a crash. The device shows it and lets the person
      -- decide, rather than silently dropping something they typed in a field.
      get stacked diagnostics v_err = message_text;
      v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', v_err);
    end;
  end loop;

  return jsonb_build_object('results', v_results, 'server_time', now());
end;
$fn$;

grant execute on function public.sync_push(uuid, jsonb) to authenticated;

-- Housekeeping on the tombstones themselves.
create or replace function public.sweep_tombstones()
returns integer language sql security definer set search_path = public as $fn$
  with gone as (delete from deleted_rows where deleted_at < now() - interval '90 days' returning 1)
  select count(*)::int from gone;
$fn$;

select cron.schedule('campcommand-sweep-tombstones', '0 4 * * 0', $cron$select public.sweep_tombstones();$cron$)
where not exists (select 1 from cron.job where jobname = 'campcommand-sweep-tombstones');
