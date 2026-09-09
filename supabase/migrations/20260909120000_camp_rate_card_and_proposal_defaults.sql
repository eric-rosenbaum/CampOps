-- The camp's rate card.
--
-- There wasn't one. Every retreat carried its own rate_per_person_night and started null, so a
-- proposal built for a new booking produced a line reading "50 people × 3 nights @ $.00/person/
-- night" worth $0 — arithmetic that is correct and useless. The camp charges the same rate to
-- most groups; it should say so once.
--
-- Same for the two other things retyped on every proposal: the terms, and how long a quote
-- stands. Both live on the camp now and seed each new proposal.

alter table camps
  add column if not exists default_pricing_model text,
  add column if not exists default_rate_per_person_night numeric,
  add column if not exists default_flat_rate numeric,
  add column if not exists proposal_terms text,
  add column if not exists proposal_valid_days integer;

alter table camps drop constraint if exists camps_default_pricing_model_check;
alter table camps add constraint camps_default_pricing_model_check
  check (default_pricing_model is null
         or default_pricing_model in ('per_person_night','per_cabin_night','flat'));

comment on column camps.default_rate_per_person_night is
  'Seeds a new retreat and backs build_proposal_lines when the booking has no rate of its own.';
comment on column camps.proposal_valid_days is
  'How long a quote stands. Null means 30.';

-- Fall back to the camp's rate ------------------------------------------------
-- A booking that has been priced individually still wins; the camp rate only fills the gap.
create or replace function public.build_proposal_lines(p_retreat_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  r retreats; c camps;
  v_nights int; v_people int; v_lines jsonb := '[]'::jsonb;
  v_rate numeric; v_flat numeric; v_model text; v_base numeric;
begin
  select * into r from retreats where id = p_retreat_id;
  if r.id is null or not is_camp_member(r.camp_id) then raise exception 'Forbidden'; end if;
  select * into c from camps where id = r.camp_id;

  v_people := coalesce(r.final_headcount, r.headcount, 0);
  v_nights := greatest(coalesce(r.departure_date - r.arrival_date, 1), 1);
  v_model  := coalesce(r.pricing_model, c.default_pricing_model, 'per_person_night');
  v_rate   := coalesce(r.rate_per_person_night, c.default_rate_per_person_night, 0);
  v_flat   := coalesce(r.flat_rate, c.default_flat_rate, 0);

  if v_model = 'per_person_night' then
    v_base := v_rate * v_people * v_nights;
    v_lines := v_lines || jsonb_build_object(
      'description', v_people || ' people × ' || v_nights || ' night' || case when v_nights = 1 then '' else 's' end
                     || ' @ $' || to_char(v_rate, 'FM999990.00') || '/person/night',
      'amount', v_base);
  elsif v_model = 'per_cabin_night' then
    v_base := v_flat * v_nights;
    v_lines := v_lines || jsonb_build_object(
      'description', 'Cabin rate × ' || v_nights || ' night' || case when v_nights = 1 then '' else 's' end,
      'amount', v_base);
  else
    v_base := v_flat;
    v_lines := v_lines || jsonb_build_object('description', 'Facility fee', 'amount', v_base);
  end if;

  return v_lines || coalesce((
    select jsonb_agg(jsonb_build_object('description', ch.description, 'amount', ch.amount))
    from retreat_charges ch where ch.retreat_id = p_retreat_id
  ), '[]'::jsonb);
end;
$fn$;

grant execute on function public.build_proposal_lines(uuid) to authenticated;

-- Give the demo camp a rate so the seeded bookings stop quoting zero.
update camps
   set default_pricing_model = coalesce(default_pricing_model, 'per_person_night'),
       default_rate_per_person_night = coalesce(default_rate_per_person_night, 92),
       proposal_valid_days = coalesce(proposal_valid_days, 30)
 where id = '33333333-3333-4333-8333-333333333333';
