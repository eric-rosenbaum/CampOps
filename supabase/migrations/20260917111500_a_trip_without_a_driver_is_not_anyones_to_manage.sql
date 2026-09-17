-- A trip with no driver let any staff member release anybody's seat.
--
-- trips_can_manage_internal() was `admin OR creator OR driver`. With no driver on the trip the
-- last term is `NULL = uid`, which is NULL, so for a non-admin non-creator the whole expression
-- was NULL rather than false. Callers wrote `if ... and not can_manage(t) then raise`, and
-- `not NULL` is NULL, which an IF treats as "don't raise": the refusal silently never fired.
-- Caught by trips_test.sql T6 before any screen used it.
--
-- set_errand_status had the same shape on its cancel path (`requested_by = auth.uid()` with a
-- NULL requester). Both now fold NULL to false.

create or replace function public.trips_can_manage_internal(p_trip public.trips)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(public.get_camp_role(p_trip.camp_id) = 'admin', false)
      or coalesce(p_trip.created_by = auth.uid(), false)
      or coalesce(p_trip.driver_user_id = auth.uid(), false);
$fn$;

create or replace function public.set_errand_status(p_errand_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare e trip_errands; t trips; v_role text; v_allowed boolean; v_camp text; v_head text;
begin
  select * into e from trip_errands where id = p_errand_id for update;
  if not found then raise exception 'errand_not_found'; end if;
  v_role := public.trips_require_writer_internal(e.camp_id);
  if p_status not in ('open','bought','unavailable','cancelled') then raise exception 'bad_status'; end if;
  if e.trip_id is not null then select * into t from trips where id = e.trip_id; end if;

  if p_status = 'cancelled' then
    v_allowed := v_role = 'admin' or e.requested_by is not distinct from auth.uid();
  else
    -- Ticking an errand off is the driver's call, made in the store.
    v_allowed := v_role = 'admin' or (e.trip_id is not null and public.trips_can_manage_internal(t));
  end if;
  if not coalesce(v_allowed, false) then raise exception 'not_allowed' using errcode = '42501'; end if;

  update trip_errands set
    status = p_status,
    driver_note = case when p_note is not null then nullif(left(btrim(p_note), 300), '') else driver_note end,
    done_by = case when p_status in ('bought','unavailable') then auth.uid() end,
    done_at = case when p_status in ('bought','unavailable') then now() end
  where id = e.id;

  if p_status in ('bought','unavailable') and e.requested_by is distinct from auth.uid() then
    select name into v_camp from camps where id = e.camp_id;
    v_head := case p_status when 'bought' then 'Picked up: ' else 'Couldn''t get: ' end;
    perform public.queue_message(e.camp_id, 'trip_errand', e.id, 'errand_done:' || p_status, 'requester',
      public.user_email(e.requested_by), e.requester_name, null, now(),
      v_head || e.item,
      public.msg_wrap(case p_status when 'bought' then 'Your errand is done' else 'Your errand couldn''t be done' end,
        '<strong>' || public.trips_esc_internal(e.item) || '</strong>'
        || coalesce(' (' || public.trips_esc_internal(e.quantity) || ')', '')
        || case p_status when 'bought' then ' was picked up' else ' was not available' end
        || coalesce(' on ' || public.trips_esc_internal(t.title), '') || '.'
        || coalesce('<br>Note from the driver: ' || public.trips_esc_internal(nullif(btrim(p_note), '')), ''),
        public.trips_esc_internal(v_camp)),
      v_head || e.item || coalesce(' (' || e.quantity || ')', '')
        || coalesce('. ' || nullif(btrim(p_note), ''), '') || '.');
  elsif p_status in ('open','cancelled') then
    update scheduled_messages set state = 'cancelled', suppressed_reason = 'errand_reopened', updated_at = now()
     where subject_type = 'trip_errand' and subject_id = e.id and rule_key like 'errand_done:%' and state = 'scheduled';
  end if;
end;
$fn$;

revoke execute on function public.trips_can_manage_internal(public.trips) from public, anon, authenticated;
grant execute on function public.trips_can_manage_internal(public.trips) to service_role;
revoke execute on function public.set_errand_status(uuid,text,text) from public, anon, authenticated;
grant execute on function public.set_errand_status(uuid,text,text) to authenticated, service_role;
