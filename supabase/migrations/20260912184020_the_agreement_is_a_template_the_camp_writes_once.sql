-- The retreat agreement IS the proposal.
--
-- They were two objects: a "proposal" carrying the price, and an "agreement" carrying a PDF. But a
-- camp does not quote and then separately contract -- it sends one document that says what the
-- stay costs and what the terms are, and the group signing it is how they commit. Two objects
-- meant the camp assembled the same booking twice and the group got two things to act on.
--
-- So there is one: the camp writes its agreement ONCE, marking the parts that vary by group, and
-- each retreat gets that text with its own details filled in. retreat_proposals already carries
-- the whole lifecycle -- version, sent_at, viewed_at, accepted_at, accepted_by_name -- so it stays
-- as the record and gains the rendered text. The word "proposal" disappears from the product; the
-- table keeps its name, because renaming it would be a migration with no product benefit.

alter table public.camps
  add column if not exists agreement_template_body text;

comment on column public.camps.agreement_template_body is
  'The camp''s standing retreat agreement, written once with {{tokens}} for the parts that vary by group. Rendered per retreat by render_agreement().';

alter table public.retreat_proposals
  add column if not exists agreement_body text;

comment on column public.retreat_proposals.agreement_body is
  'The agreement as it was sent to THIS group, tokens already filled and reviewed. Frozen: never re-rendered, so a rate edited later cannot change what somebody signed.';

/**
 * Every token a camp can put in their agreement, with what it resolves to for one retreat.
 *
 * Returned as data rather than substituted blindly so the review screen can show each value, say
 * where it came from, and flag the ones nothing fills -- a contract with "{{deposit}}" still in it
 * is worse than one with a blank, and both are worse than being told before it goes.
 */
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
    v_rate  := to_char(v_r.rate_per_person_night, 'FM999G999D00') || ' per person per night';
  elsif v_r.flat_rate is not null then
    v_total := v_r.flat_rate;
    v_rate  := to_char(v_r.flat_rate, 'FM999G999D00') || ' for the stay';
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

/** Substitute {{token}} throughout a template. Unknown tokens are left alone, visibly. */
create or replace function public.render_agreement(p_body text, p_values jsonb)
returns text language plpgsql immutable as $fn$
declare v_out text := coalesce(p_body, ''); k text; v text;
begin
  for k, v in select key, value #>> '{}' from jsonb_each(p_values)
  loop
    -- A null value leaves the token in place rather than silently emptying the sentence around
    -- it. The reviewer must SEE that nothing filled it.
    if v is not null and btrim(v) <> '' then
      v_out := replace(v_out, '{{' || k || '}}', v);
    end if;
  end loop;
  return v_out;
end;
$fn$;

grant execute on function public.render_agreement(text, jsonb) to authenticated;
