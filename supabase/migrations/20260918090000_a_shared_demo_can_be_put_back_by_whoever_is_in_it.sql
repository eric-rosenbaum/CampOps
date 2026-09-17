-- A demo link is shared: the prospect forwards it to their directors, and everyone lands in the
-- same camp. The reviewer who opened it second found last month's reconciliation already
-- finished by the first, and nothing left to try.
--
-- Anyone who administers a DEMO camp -- which every /try/ visitor does -- can now put the sample
-- data back. It runs the same seeds the founder's "Reset sample data" runs: sample rows are
-- rewritten, anything a visitor created stays. Refused for any camp that is not a demo, so a
-- customer admin can never reach it.
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
    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'file_path', file_path, 'sample_file', sample_file)), '[]'::jsonb)
      into v_files from seed_demo_receipts_internal(p_camp_id);
    v_out := v_out || jsonb_build_object('receipt_files', v_files);
  end if;
  return v_out;
end;
$fn$;

revoke execute on function public.reset_demo_sample_data(uuid, text[]) from public, anon;
grant execute on function public.reset_demo_sample_data(uuid, text[]) to authenticated, service_role;
