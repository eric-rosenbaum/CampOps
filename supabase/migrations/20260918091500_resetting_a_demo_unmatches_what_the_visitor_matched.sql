-- Resetting a demo failed once a visitor had imported a statement of their own.
--
-- The visitor's statement lines were matched to sample receipts. The receipts seed deletes and
-- rewrites its sample receipts, statement_lines.receipt_id is ON DELETE SET NULL, and a line whose
-- receipt vanished broke statement_lines_match_has_receipt (matched <=> has a receipt). The reset
-- now hands those lines back to "unmatched" first, so the visitor's statement survives and can be
-- matched again against the restored receipts.
create or replace function public.reset_demo_sample_data(p_camp_id uuid, p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_type text;
  v_out jsonb := '{}'::jsonb;
  v_files jsonb;
begin
  if not (is_camp_admin(p_camp_id) or is_platform_admin()) then
    raise exception 'Not authorized';
  end if;
  select account_type into v_type from camps where id = p_camp_id and deleted_at is null;
  if v_type is null or v_type not in ('trial', 'demo') then
    raise exception 'Sample data can only be reset in a demo camp';
  end if;

  if 'food_requests' = any (p_keys) then
    v_out := v_out || jsonb_build_object('food_requests', seed_demo_food_requests_internal(p_camp_id));
  end if;
  if 'town_trips' = any (p_keys) then
    v_out := v_out || jsonb_build_object('town_trips', seed_demo_trips_internal(p_camp_id));
  end if;
  if 'receipts' = any (p_keys) then
    perform demo_unmatch_sample_receipts_internal(p_camp_id);
    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'file_path', file_path, 'sample_file', sample_file)), '[]'::jsonb)
      into v_files from seed_demo_receipts_internal(p_camp_id);
    v_out := v_out || jsonb_build_object('receipt_files', v_files);
  end if;
  return v_out;
end;
$fn$;

create or replace function public.demo_unmatch_sample_receipts_internal(p_camp uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n integer;
begin
  update statement_lines
     set match_state = 'unmatched', receipt_id = null, resolved_by = null, resolved_at = null
   where camp_id = p_camp
     and receipt_id in (select demo_seed_uuid(p_camp, 'receipt:' || k) from generate_series(1, 40) k)
     and statement_id not in (select demo_seed_uuid(p_camp, 'statement:' || k) from unnest(array['A','B']) k);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- The founder's reset goes through seed_demo_data, which needs the same step.
create or replace function public.seed_demo_data(p_camp_id uuid, p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_type text;
  v_out jsonb := '{}'::jsonb;
  v_files jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  select account_type into v_type from camps where id = p_camp_id and deleted_at is null;
  if v_type is null then raise exception 'Camp not found'; end if;
  if v_type not in ('trial', 'demo') then
    raise exception 'Sample data can only be written into a demo camp';
  end if;

  if 'food_requests' = any (p_keys) then
    v_out := v_out || jsonb_build_object('food_requests', seed_demo_food_requests_internal(p_camp_id));
  end if;
  if 'town_trips' = any (p_keys) then
    v_out := v_out || jsonb_build_object('town_trips', seed_demo_trips_internal(p_camp_id));
  end if;
  if 'receipts' = any (p_keys) then
    perform demo_unmatch_sample_receipts_internal(p_camp_id);
    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'file_path', file_path, 'sample_file', sample_file)), '[]'::jsonb)
      into v_files from seed_demo_receipts_internal(p_camp_id);
    v_out := v_out || jsonb_build_object('receipt_files', v_files);
  end if;
  return v_out;
end;
$fn$;

revoke execute on function public.demo_unmatch_sample_receipts_internal(uuid) from public, anon, authenticated;
grant execute on function public.demo_unmatch_sample_receipts_internal(uuid) to service_role;
revoke execute on function public.reset_demo_sample_data(uuid, text[]) from public, anon;
grant execute on function public.reset_demo_sample_data(uuid, text[]) to authenticated, service_role;
revoke execute on function public.seed_demo_data(uuid, text[]) from public, anon;
grant execute on function public.seed_demo_data(uuid, text[]) to authenticated, service_role;
