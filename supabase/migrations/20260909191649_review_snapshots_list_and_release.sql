-- Taking a snapshot at a chosen instant, reading the saved ones back, and releasing one.

create or replace function public.snapshot_review(
  p_camp_id uuid, p_kind text, p_from date, p_to date, p_as_of timestamptz
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_payload jsonb; v_id uuid; v_who text; v_as_of timestamptz := coalesce(p_as_of, now());
begin
  if not is_camp_admin(p_camp_id) then raise exception 'Forbidden'; end if;
  if v_as_of > now() then raise exception 'A review cannot be taken as of a future date.'; end if;

  v_payload := case p_kind
    -- Rentals has no as-of reconstruction: retreat status carries no history, so a snapshot
    -- there records the numbers as they stand when it is taken.
    when 'season'  then public.season_review(p_camp_id, p_from, p_to, v_as_of)
    when 'rentals' then public.rentals_review(p_camp_id, p_from, p_to)
    else null end;
  if v_payload is null then raise exception 'Unknown review kind: %', p_kind; end if;

  select full_name into v_who from profiles where id = auth.uid();

  insert into review_snapshots (camp_id, kind, period_from, period_to, payload, taken_by, as_of)
  values (p_camp_id, p_kind, p_from, p_to, v_payload, v_who, v_as_of)
  on conflict (camp_id, kind, period_from, period_to, as_of)
    do update set payload = excluded.payload, taken_at = now(), taken_by = excluded.taken_by
  returning id into v_id;
  return v_id;
end;
$fn$;

-- Kept so a client on the old bundle still works; it means "as of now".
create or replace function public.snapshot_review(
  p_camp_id uuid, p_kind text, p_from date, p_to date
) returns uuid language sql security definer set search_path = public as $fn$
  select public.snapshot_review(p_camp_id, p_kind, p_from, p_to, now());
$fn$;

-- The saved snapshots for one period, newest cut-off first. Payload excluded -- it is large.
create or replace function public.list_review_snapshots(
  p_camp_id uuid, p_kind text, p_from date, p_to date
) returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'as_of', as_of, 'taken_at', taken_at, 'taken_by', taken_by)
         order by as_of desc), '[]'::jsonb)
  from review_snapshots
  where camp_id = p_camp_id and kind = p_kind
    and period_from = p_from and period_to = p_to
    and is_camp_member(p_camp_id);
$fn$;

-- One saved snapshot in full.
create or replace function public.get_review_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select payload from review_snapshots
  where id = p_id and is_camp_member(camp_id);
$fn$;

-- Unfreeze: drop a saved snapshot. The live review is unaffected -- it is recomputed anyway.
create or replace function public.release_review_snapshot(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_camp uuid;
begin
  select camp_id into v_camp from review_snapshots where id = p_id;
  if v_camp is null then return false; end if;
  if not is_camp_admin(v_camp) then raise exception 'Forbidden'; end if;
  delete from review_snapshots where id = p_id;
  return true;
end $fn$;

grant execute on function public.snapshot_review(uuid, text, date, date, timestamptz) to authenticated;
grant execute on function public.list_review_snapshots(uuid, text, date, date) to authenticated;
grant execute on function public.get_review_snapshot(uuid) to authenticated;
grant execute on function public.release_review_snapshot(uuid) to authenticated;
