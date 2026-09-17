-- Closing a work order from a phone never actually worked.
--
-- `sync_push` applied every mutation as `insert ... on conflict (id) do update`, which reads as
-- "upsert" and is not one. Postgres builds the proposed insert row and checks its NOT NULL
-- constraints BEFORE it looks for a conflict, so a PARTIAL payload -- which is what every edit
-- sends, by design, so that two phones editing one work order do not overwrite each other --
-- arrives with no `title`, and `issues.title` is NOT NULL. Every status change, assignment,
-- resolution and checklist tick queued by the iOS app was rejected with
--
--     null value in column "title" of relation "issues" violates not-null constraint
--
-- and surfaced on the phone as "1 change could not be saved". The activity row written alongside
-- it succeeded, because that payload is complete, so the timeline recorded "Resolved" on work
-- orders that stayed open. The one action the whole offline layer was built for -- the tap a
-- maintenance lead makes standing in front of the thing they just fixed -- has never landed.
--
-- A change to a row that already exists is an UPDATE. Only a row that is genuinely new is an
-- insert, and those payloads are complete.

create or replace function public.sync_push(p_camp_id uuid, p_mutations jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
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
  v_upd     text;
  v_count   integer;
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
               string_agg(format('%I = excluded.%I', k, k), ', '),
               string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', k, v_tbl, k), ', ')
          into v_cols, v_sets, v_upd
          from jsonb_object_keys(v_payload) k
          where exists (
            select 1 from information_schema.columns c
            where c.table_schema = 'public' and c.table_name = v_tbl and c.column_name = k);

        if v_cols is null then
          v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', 'no known columns');
          continue;
        end if;

        v_count := 0;

        -- Update what is already there, scoped to the caller's camp so a payload cannot reach
        -- into another one.
        if v_row is not null then
          execute format('update public.%I set %s where id = $2 and camp_id = $3', v_tbl, v_upd)
            using v_payload, v_row, p_camp_id;
          get diagnostics v_count = row_count;
        end if;

        -- Nothing to update means the row is new, and a payload for a new row is complete.
        -- `on conflict` stays as the guard against two devices creating the same id at once.
        if v_count = 0 then
          execute format(
            'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
               on conflict (id) do update set %s',
            v_tbl, v_cols, v_cols, v_tbl, v_sets)
            using v_payload;
        end if;
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
$function$;
