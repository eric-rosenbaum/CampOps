-- {{rate}} rendered as "120.00 per person per night" while {{total}} and {{deposit}} rendered as
-- "$18,000.00". In a contract that is not a formatting nit: the one figure the whole price is
-- derived from was the one without a currency on it. Caught by reading a rendered agreement rather
-- than by reading the function.
create or replace function public.agreement_tokens(p_retreat_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_r retreats; v_c camps; v_p retreat_proposals;
  v_nights int; v_people int; v_total numeric; v_deposit numeric; v_rate text;
begin
  select * into v_r from retreats where id = p_retreat_id;
  if v_r.id is null then raise exception 'No such retreat.'; end if;
  if not is_camp_member(v_r.camp_id) then raise exception 'Forbidden'; end if;
  select * into v_c from camps where id = v_r.camp_id;

  select * into v_p from retreat_proposals
   where retreat_id = p_retreat_id and status = 'accepted'
   order by accepted_at desc nulls last limit 1;

  v_nights := case when v_r.arrival_date is not null and v_r.departure_date is not null
                   then greatest(v_r.departure_date - v_r.arrival_date, 0) end;
  v_people := coalesce(v_r.final_headcount, v_r.headcount);

  if v_r.pricing_model = 'per_person_night' and v_r.rate_per_person_night is not null then
    v_total := v_r.rate_per_person_night * coalesce(v_people, 0) * coalesce(v_nights, 0);
    v_rate  := '$' || to_char(v_r.rate_per_person_night, 'FM999G999D00') || ' per person per night';
  elsif v_r.flat_rate is not null then
    v_total := v_r.flat_rate;
    v_rate  := '$' || to_char(v_r.flat_rate, 'FM999G999D00') || ' for the stay';
  end if;
  v_total   := coalesce(v_p.total, v_total);
  v_deposit := coalesce(v_p.deposit_amount, v_r.deposit_required);

  return jsonb_build_object(
    'camp_name',          v_c.name,
    'camp_address',       nullif(btrim(concat_ws(', ', v_c.address_line1, v_c.city, v_c.state)), ''),
    'group_name',         v_r.group_name,
    'coordinator_name',   v_r.coordinator_name,
    'coordinator_email',  v_r.coordinator_email,
    'coordinator_phone',  v_r.coordinator_phone,
    'arrival_date',       to_char(v_r.arrival_date,   'FMDay, FMDD FMMonth YYYY'),
    'departure_date',     to_char(v_r.departure_date, 'FMDay, FMDD FMMonth YYYY'),
    'arrival_time',       to_char(v_r.arrival_time,   'FMHH12:MIam'),
    'departure_time',     to_char(v_r.departure_time, 'FMHH12:MIam'),
    'nights',             v_nights::text,
    'headcount',          v_people::text,
    'rate',               v_rate,
    'total',              case when v_total is null then null else '$' || to_char(v_total, 'FM999G999G999D00') end,
    'deposit',            case when v_deposit is null then null else '$' || to_char(v_deposit, 'FM999G999G999D00') end,
    'deposit_due',        to_char(v_r.deposit_due, 'FMDD FMMonth YYYY'),
    'balance_due',        to_char(v_r.arrival_date - 14, 'FMDD FMMonth YYYY'),
    'cancellation_date',  to_char(v_r.arrival_date - 30, 'FMDD FMMonth YYYY'),
    'headcount_due',      to_char(coalesce(v_r.headcount_cutoff, v_r.arrival_date - 14), 'FMDD FMMonth YYYY'),
    'coi_due',            to_char(v_r.arrival_date - 21, 'FMDD FMMonth YYYY'),
    'today',              to_char(current_date, 'FMDD FMMonth YYYY')
  );
end;
$fn$;

grant execute on function public.agreement_tokens(uuid) to authenticated;
