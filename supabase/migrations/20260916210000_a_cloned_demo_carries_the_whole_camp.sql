-- A demo cloned from a seed camp was missing most of the camp, and could not be cloned at all.
--
-- clone_camp() copied from a hand-written list of 74 tables written in July. By September 44
-- camp tables were not on it: crews and their members, every work_* table, issue comments and
-- checklist items, retreat contacts, guests, proposals and space requests, camp sessions. A demo
-- showed an empty Campground board and retreats without their people.
--
-- Worse, it copied `locations.qr_token` verbatim, which is unique, so cloning any camp that had
-- a single location raised 23505 and "Spin up demo" failed outright.
--
-- The list is now derived, not maintained:
--   * every base table in public with a camp_id column is cloned, minus an explicit exclusion
--     list (membership, credentials, delivery queues, audit, per-person state);
--   * the order is a topological sort of the foreign keys between those tables, computed on
--     each run; a cycle is broken on a nullable column, which is inserted as NULL and patched
--     once every row exists (the building_components <-> building_circuits case, generalised);
--   * any single-column UNIQUE text column (qr_token, portal_token, reporter_token, ...) gets a
--     fresh random value of the same length instead of a copy;
--   * rows a camps-INSERT trigger seeded into the new camp (location categories, trades) are
--     removed before copying, and every copy is ON CONFLICT DO NOTHING so a row another trigger
--     already mirrored (commissary_sessions -> camp_sessions) is not a failure. A child whose
--     parent was genuinely skipped still fails loudly on its foreign key.
--
-- A table added next month is cloned without anyone remembering to add it here.

create or replace function public.clone_camp_excluded_tables()
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select array[
    -- who belongs to the camp: a demo gets its own members
    'camp_members','camp_invitations','camp_join_codes','staff_group_members',
    -- credentials and per-device / per-person state
    'device_tokens','issue_comment_reads','issue_viewers','staff_intake_links','staff_intake_submissions',
    -- delivery queues and logs: cloning them would re-send or misreport
    'scheduled_messages','push_notifications','client_mutations','deleted_rows','audit_log','payment_events',
    -- files whose storage objects are not copied
    'implementation_files','compliance_exports',
    -- throttles
    'public_report_throttle'
  ]::text[];
$$;

create or replace function public.clone_camp_plan()
returns table(ord integer, tbl text, deferred_cols text[])
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_tables text[];
  v_placed text[] := '{}';
  v_edges  jsonb;          -- [{child, col, parent}]
  v_deferred jsonb := '{}';
  v_ready  text[];
  v_break  jsonb;
  v_ord    integer := 0;
  t        text;
begin
  select array_agg(c.table_name::text order by c.table_name)
    into v_tables
    from information_schema.columns c
    join information_schema.tables it
      on it.table_schema = c.table_schema and it.table_name = c.table_name and it.table_type = 'BASE TABLE'
   where c.table_schema = 'public' and c.column_name = 'camp_id'
     and c.table_name <> all (clone_camp_excluded_tables());

  select coalesce(jsonb_agg(jsonb_build_object('child', cl.relname, 'col', a.attname,
                                               'parent', rc.relname, 'nullable', not a.attnotnull)
                            order by cl.relname, a.attname), '[]')
    into v_edges
    from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join pg_class rc on rc.oid = co.confrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = co.conkey[1]
   where co.contype = 'f' and n.nspname = 'public'
     and array_length(co.conkey, 1) = 1
     and cl.relname <> rc.relname                      -- self references resolve within one INSERT
     and cl.relname::text = any (v_tables) and rc.relname::text = any (v_tables);

  while coalesce(array_length(v_placed, 1), 0) < coalesce(array_length(v_tables, 1), 0) loop
    select array_agg(x order by x) into v_ready
      from unnest(v_tables) x
     where x <> all (v_placed)
       and not exists (
         select 1 from jsonb_array_elements(v_edges) e
          where e->>'child' = x and (e->>'parent') <> all (v_placed));

    if v_ready is null then
      -- A cycle. Break it on the first nullable edge between two unplaced tables.
      select e into v_break
        from jsonb_array_elements(v_edges) e
       where (e->>'child') <> all (v_placed) and (e->>'parent') <> all (v_placed)
         and (e->>'nullable')::boolean
       limit 1;
      if v_break is null then
        raise exception 'clone_camp_plan: unbreakable foreign-key cycle among %',
          (select array_agg(x) from unnest(v_tables) x where x <> all (v_placed));
      end if;
      v_edges := (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(v_edges) e where e <> v_break);
      v_deferred := jsonb_set(v_deferred, array[v_break->>'child'],
        coalesce(v_deferred->(v_break->>'child'), '[]') || to_jsonb(v_break->>'col'));
      continue;
    end if;

    foreach t in array v_ready loop
      v_ord := v_ord + 1;
      ord := v_ord; tbl := t;
      deferred_cols := coalesce((select array_agg(value) from jsonb_array_elements_text(v_deferred->t)), '{}');
      return next;
    end loop;
    v_placed := v_placed || v_ready;
  end loop;
end;
$$;

create or replace function public.clone_camp(p_source uuid, p_new_name text, p_account_type text default 'trial', p_trial_days integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new uuid := gen_random_uuid();
  v_plan record;
  v_col record;
  v_cols text; v_sel text; v_expr text;
  v_unique text[];
  v_patch text;
begin
  if not is_platform_admin() then raise exception 'Only platform admins can clone camps'; end if;
  if p_account_type not in ('customer','trial','demo','internal') then raise exception 'bad account_type'; end if;
  if not exists (select 1 from camps where id = p_source) then raise exception 'Source camp not found'; end if;

  create temp table _clone_plan on commit drop as select * from clone_camp_plan();
  create temp table _clone_map(old uuid primary key, new uuid) on commit drop;
  insert into _clone_map values (p_source, v_new);
  for v_plan in select * from _clone_plan order by ord loop
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=v_plan.tbl and column_name='id' and udt_name='uuid') then
      execute format('insert into _clone_map(old,new) select id, gen_random_uuid() from %I where camp_id=$1 on conflict do nothing', v_plan.tbl)
        using p_source;
    end if;
  end loop;

  -- The camps row: every column copied except identity, account state and anything unique.
  v_cols := ''; v_sel := '';
  select coalesce(array_agg(a.attname::text), '{}') into v_unique
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
   where i.indrelid = 'public.camps'::regclass and i.indisunique and not i.indisprimary and i.indnatts = 1;
  for v_col in select column_name, udt_name from information_schema.columns
                where table_schema='public' and table_name='camps' order by ordinal_position loop
    v_expr := case v_col.column_name
      when 'id' then quote_literal(v_new) || '::uuid'
      when 'name' then quote_literal(p_new_name)
      when 'slug' then format('left(t.slug,40) || %L', '-' || substr(v_new::text,1,8))
      when 'account_type' then quote_literal(p_account_type)
      when 'status' then quote_literal('active')
      when 'trial_ends_at' then case when p_trial_days is not null
                                  then format('now() + make_interval(days => %s)', p_trial_days) else 'null' end
      when 'is_seed' then 'false'
      when 'provisioned_by' then 'auth.uid()'
      when 'provisioned_at' then 'now()'
      when 'created_at' then 'now()'
      when 'updated_at' then 'now()'
      when 'deleted_at' then 'null'
      when 'share_token' then 'replace(gen_random_uuid()::text,''-'','''')'
      when 'stripe_account_id' then 'null'
      when 'stripe_charges_enabled' then 'false'
      when 'stripe_connected_at' then 'null'
      else case when v_col.column_name = any (v_unique)
                then format('case when t.%1$I is null then null else substr(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1, greatest(length(t.%1$I), 12)) end', v_col.column_name)
                else format('t.%I', v_col.column_name) end
    end;
    v_cols := v_cols || format('%I,', v_col.column_name);
    v_sel  := v_sel || v_expr || ',';
  end loop;
  execute format('insert into camps (%s) select %s from camps t where t.id = $1',
                 rtrim(v_cols, ','), rtrim(v_sel, ',')) using p_source;

  -- Rows the camps-INSERT triggers seeded (location categories, trades) would collide with the
  -- source camp's own copies of them.
  for v_plan in select * from _clone_plan order by ord desc loop
    execute format('delete from %I where camp_id = $1', v_plan.tbl) using v_new;
  end loop;

  for v_plan in select * from _clone_plan order by ord loop
    select coalesce(array_agg(a.attname::text), '{}') into v_unique
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = format('public.%I', v_plan.tbl)::regclass
       and i.indisunique and not i.indisprimary and i.indnatts = 1
       and format_type(a.atttypid, a.atttypmod) in ('text', 'character varying');

    v_cols := ''; v_sel := '';
    for v_col in select column_name, udt_name from information_schema.columns
                  where table_schema='public' and table_name=v_plan.tbl order by ordinal_position loop
      v_cols := v_cols || format('%I,', v_col.column_name);
      if v_col.column_name = any (v_plan.deferred_cols) then
        v_expr := 'null';
      elsif v_col.column_name = any (v_unique) then
        v_expr := format('case when t.%1$I is null then null else substr(md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1, greatest(length(t.%1$I), 12)) end', v_col.column_name);
      elsif v_col.udt_name = 'uuid' then
        v_expr := format('coalesce((select m.new from _clone_map m where m.old=t.%1$I), t.%1$I)', v_col.column_name);
      elsif v_col.udt_name = '_uuid' then
        v_expr := format('coalesce((select array_agg(coalesce((select m.new from _clone_map m where m.old=e), e)) from unnest(t.%1$I) e), t.%1$I)', v_col.column_name);
      else
        v_expr := format('t.%I', v_col.column_name);
      end if;
      v_sel := v_sel || v_expr || ',';
    end loop;
    execute format('insert into %I (%s) select %s from %I t where t.camp_id=$1 on conflict do nothing',
                   v_plan.tbl, rtrim(v_cols, ','), rtrim(v_sel, ','), v_plan.tbl) using p_source;
  end loop;

  -- Patch the columns that were inserted as NULL to break a cycle.
  for v_plan in select * from _clone_plan where cardinality(deferred_cols) > 0 loop
    foreach v_patch in array v_plan.deferred_cols loop
      execute format(
        'update %1$I dst set %2$I = coalesce((select m.new from _clone_map m where m.old = src.%2$I), src.%2$I)
           from %1$I src join _clone_map m1 on m1.old = src.id
          where src.camp_id = $1 and dst.id = m1.new and src.%2$I is not null',
        v_plan.tbl, v_patch) using p_source;
    end loop;
  end loop;

  return v_new;
end $function$;

-- Every camp table is either cloned or excluded on purpose; anything else is a gap.
create or replace function public.clone_camp_coverage_gaps()
returns table(missing_table text)
language sql
stable
set search_path to 'public'
as $function$
  select distinct c.table_name::text
    from information_schema.columns c
    join information_schema.tables it
      on it.table_schema = c.table_schema and it.table_name = c.table_name and it.table_type = 'BASE TABLE'
   where c.table_schema = 'public' and c.column_name = 'camp_id'
     and c.table_name <> all (clone_camp_excluded_tables())
     and c.table_name::text not in (select tbl from clone_camp_plan());
$function$;

revoke execute on function public.clone_camp(uuid,text,text,integer) from public, anon;
grant execute on function public.clone_camp(uuid,text,text,integer) to authenticated, service_role;
revoke execute on function public.clone_camp_plan() from public, anon, authenticated;
revoke execute on function public.clone_camp_excluded_tables() from public, anon, authenticated;
revoke execute on function public.clone_camp_coverage_gaps() from public, anon, authenticated;
grant execute on function public.clone_camp_plan() to service_role;
grant execute on function public.clone_camp_excluded_tables() to service_role;
grant execute on function public.clone_camp_coverage_gaps() to service_role;
