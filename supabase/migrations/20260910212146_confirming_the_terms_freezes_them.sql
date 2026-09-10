-- Confirm the terms schedule.
--
-- Takes the terms AS THE CAMP REVIEWED THEM, not as the platform proposed them: the caller sends
-- back the array including any hand-edits, and that is what is stored. From here the schedule is
-- evidence, not a view -- never recomputed, so a rate edited in November cannot rewrite an
-- agreement signed in June.
--
-- Refuses to confirm a schedule with a missing value. That refusal is the feature: a contract with
-- a blank where the deposit should be is worse than no contract.
create or replace function public.confirm_retreat_terms(
  p_retreat_id uuid,
  p_terms      jsonb,
  p_overridden text[] default '{}',
  p_name       text   default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_r retreats; v_id uuid; v_missing text;
begin
  select * into v_r from retreats where id = p_retreat_id;
  if v_r.id is null then raise exception 'No such retreat.'; end if;
  if not is_camp_member(v_r.camp_id) then raise exception 'Forbidden'; end if;

  if jsonb_typeof(p_terms) is distinct from 'array' or jsonb_array_length(p_terms) = 0 then
    raise exception 'There are no terms to confirm.';
  end if;

  -- Name the first blank rather than saying "something is missing". A director who has to hunt
  -- for it will confirm past it.
  select t->>'label' into v_missing
    from jsonb_array_elements(p_terms) t
   where coalesce(btrim(t->>'value'), '') = ''
   limit 1;
  if v_missing is not null then
    raise exception 'Fill in "%" before confirming. An agreement cannot go out with a blank in it.', v_missing
      using errcode = '22023';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Type your name to confirm these terms.' using errcode = '22023';
  end if;

  -- A previously confirmed schedule is voided rather than overwritten. If terms were re-agreed,
  -- what the group signed before is still what they signed before.
  update retreat_terms_schedules
     set status = 'void'
   where retreat_id = p_retreat_id and status in ('draft', 'confirmed');

  insert into retreat_terms_schedules (
    camp_id, retreat_id, terms, overridden, status, confirmed_at, confirmed_by, confirmed_name
  ) values (
    v_r.camp_id, p_retreat_id, p_terms, coalesce(p_overridden, '{}'), 'confirmed',
    now(), auth.uid(), btrim(p_name)
  ) returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.confirm_retreat_terms(uuid, jsonb, text[], text) to authenticated;

-- What the portal and the proposal email may show: only a CONFIRMED schedule, never a draft and
-- never a live recomputation.
create or replace function public.confirmed_retreat_terms(p_retreat_id uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
           'id', s.id, 'terms', s.terms, 'overridden', s.overridden,
           'confirmed_at', s.confirmed_at, 'confirmed_name', s.confirmed_name)
    from retreat_terms_schedules s
   where s.retreat_id = p_retreat_id and s.status = 'confirmed'
     and is_camp_member(s.camp_id)
   order by s.confirmed_at desc limit 1;
$fn$;

grant execute on function public.confirmed_retreat_terms(uuid) to authenticated;
