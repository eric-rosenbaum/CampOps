-- Propose the terms for a retreat's agreement schedule.
--
-- Returns a PROPOSAL, never a document: nothing stored, nothing sent. Every line carries where its
-- value came from, so the review screen shows "from the accepted proposal: 24 people x 2 nights
-- @ $320" rather than a bare number a director has no reason to check.
--
-- A value the platform does not know comes back null with missing = true. It is NOT guessed and
-- NOT blank -- the caller blocks confirmation until a human fills it. A blank line in a contract
-- is the failure this feature exists to prevent.
create or replace function public.propose_retreat_terms(p_retreat_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_r retreats; v_c camps; v_p retreat_proposals;
  v_nights int; v_people int; v_total numeric; v_total_src text;
  v_deposit numeric; v_deposit_src text; v_cancel date;
begin
  select * into v_r from retreats where id = p_retreat_id;
  if v_r.id is null then raise exception 'No such retreat.'; end if;
  if not is_camp_member(v_r.camp_id) then raise exception 'Forbidden'; end if;
  select * into v_c from camps where id = v_r.camp_id;

  -- The accepted proposal is the authority on money. A retreat's own rate can be edited after a
  -- group has said yes; what they agreed to is what the agreement must say.
  select * into v_p from retreat_proposals
   where retreat_id = p_retreat_id and status = 'accepted'
   order by accepted_at desc nulls last limit 1;

  v_nights := case when v_r.arrival_date is not null and v_r.departure_date is not null
                   then greatest((v_r.departure_date - v_r.arrival_date), 0) end;
  v_people := coalesce(v_r.final_headcount, v_r.headcount);

  if v_p.id is not null then
    v_total := v_p.total;
    v_total_src := 'the accepted proposal';
  elsif v_r.pricing_model = 'per_person_night'
        and v_r.rate_per_person_night is not null and v_people is not null and v_nights is not null then
    v_total := v_r.rate_per_person_night * v_people * v_nights;
    -- Spelled out, because this one the platform worked out rather than read. A director who
    -- disagrees with the arithmetic can see the arithmetic.
    v_total_src := format('calculated: %s people x %s night%s @ %s per person per night — no accepted proposal on file',
                          v_people, v_nights, case when v_nights = 1 then '' else 's' end,
                          to_char(v_r.rate_per_person_night, 'FM999G999D00'));
  elsif v_r.pricing_model = 'flat' and v_r.flat_rate is not null then
    v_total := v_r.flat_rate;
    v_total_src := 'the flat rate on the booking — no accepted proposal on file';
  end if;

  v_deposit := coalesce(v_p.deposit_amount, v_r.deposit_required);
  v_deposit_src := case
    when v_p.deposit_amount is not null then 'the accepted proposal'
    when v_r.deposit_required is not null then 'the booking'
    else null end;

  v_cancel := case when v_r.arrival_date is not null then v_r.arrival_date - 30 end;

  return jsonb_build_object(
    'retreat_id', p_retreat_id,
    'camp_name',  v_c.name,
    'from_proposal', v_p.id is not null,
    'terms', jsonb_build_array(
      jsonb_build_object('key','group_name','label','Group',
        'value', v_r.group_name, 'source','the booking', 'missing', v_r.group_name is null),

      jsonb_build_object('key','dates','label','Dates',
        'value', case when v_r.arrival_date is null or v_r.departure_date is null then null
                      else to_char(v_r.arrival_date,'FMDD FMMon YYYY') || ' to ' ||
                           to_char(v_r.departure_date,'FMDD FMMon YYYY') end,
        'source','the booking', 'missing', v_r.arrival_date is null or v_r.departure_date is null),

      jsonb_build_object('key','nights','label','Nights',
        'value', v_nights::text, 'source','counted from the dates', 'missing', v_nights is null),

      jsonb_build_object('key','headcount','label','Expected headcount',
        'value', v_people::text,
        'source', case when v_r.final_headcount is not null then 'the group''s confirmed headcount'
                       else 'the headcount on the booking' end,
        'missing', v_people is null),

      jsonb_build_object('key','total','label','Total',
        'value', case when v_total is null then null else to_char(v_total,'FM999G999G999D00') end,
        'source', coalesce(v_total_src, 'not set anywhere'), 'missing', v_total is null),

      jsonb_build_object('key','deposit','label','Deposit',
        'value', case when v_deposit is null then null else to_char(v_deposit,'FM999G999G999D00') end,
        'source', coalesce(v_deposit_src, 'not set anywhere'), 'missing', v_deposit is null),

      jsonb_build_object('key','deposit_due','label','Deposit due',
        'value', case when v_r.deposit_due is null then null
                      else to_char(v_r.deposit_due,'FMDD FMMon YYYY') end,
        'source','the booking', 'missing', v_r.deposit_due is null),

      jsonb_build_object('key','cancel_by','label','Cancel without charge until',
        'value', case when v_cancel is null then null else to_char(v_cancel,'FMDD FMMon YYYY') end,
        -- Named as a suggestion, not a fact. 30 days is a common camp term, not necessarily THIS
        -- camp's term, and the director must see that this line is the platform's guess.
        'source','suggested: 30 days before arrival — check this is your policy',
        'missing', v_cancel is null)
    )
  );
end;
$fn$;

grant execute on function public.propose_retreat_terms(uuid) to authenticated;
