-- The quote is the agreement, so make it carry the numbers.
--
-- Accepting a proposal flipped the lead stage and nothing else. The rate and the deposit stayed
-- wherever they had been typed — usually nowhere — so a booking that had just been won showed
-- "Expected $0", "Rate charged —", and an invoice line reading "$0/person/night × 30 × 4 nights".
-- The camp had agreed a price with the group and the software did not know it.
--
-- A proposal now records the price it quoted, and accepting writes that onto the booking. After
-- that every downstream number — the expected total, the invoice, the portal's balance — reads
-- from something a human actually agreed to rather than from an empty column.

alter table camps
  add column if not exists default_deposit_amount numeric;
comment on column camps.default_deposit_amount is 'Seeds the deposit on a new quote.';

alter table retreat_proposals
  add column if not exists deposit_amount numeric,
  add column if not exists pricing_model text,
  add column if not exists rate_per_person_night numeric,
  add column if not exists flat_rate numeric;

comment on column retreat_proposals.deposit_amount is
  'What this quote asks for up front. Copied to retreats.deposit_required on acceptance.';
comment on column retreat_proposals.rate_per_person_night is
  'The rate this quote was built on. Copied to the booking on acceptance so later invoices agree.';

-- Accepting writes the agreed price onto the booking --------------------------
create or replace function public.portal_accept_proposal(p_token text, p_proposal_id uuid, p_name text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_retreat retreats; v_p retreat_proposals;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then raise exception 'This link is not recognised.' using errcode='22023'; end if;

  select * into v_p from retreat_proposals where id = p_proposal_id and retreat_id = v_retreat.id;
  if v_p.id is null then raise exception 'That proposal is not on this booking.' using errcode='22023'; end if;
  if v_p.status = 'accepted' then return; end if;
  if v_p.valid_until is not null and v_p.valid_until < current_date then
    raise exception 'This proposal has expired. Ask the camp for a new one.' using errcode='22023';
  end if;
  if coalesce(btrim(p_name),'') = '' then
    raise exception 'Please type your name to accept.' using errcode='22023';
  end if;

  update retreat_proposals
     set status = 'accepted', accepted_at = now(), accepted_by_name = left(btrim(p_name), 120)
   where id = p_proposal_id;

  -- Accepting closes the funnel on itself: the inquiry becomes a booking, and it carries the
  -- price that was agreed. coalesce keeps whatever the quote did not specify.
  update retreats
     set lead_stage = 'won',
         status = case when status = 'inquiry' then 'confirmed' else status end,
         pricing_model = coalesce(v_p.pricing_model, pricing_model),
         rate_per_person_night = coalesce(v_p.rate_per_person_night, rate_per_person_night),
         flat_rate = coalesce(v_p.flat_rate, flat_rate),
         deposit_required = coalesce(v_p.deposit_amount, deposit_required),
         updated_at = now()
   where id = v_retreat.id;
end;
$function$;

grant execute on function public.portal_accept_proposal(text, uuid, text) to anon, authenticated;

-- The camp's rate is the floor everywhere, not just on proposals ---------------
-- get_portal_data computed the expected total straight from the booking's own rate, so a group
-- whose booking had never been priced saw a zero balance in their portal.
create or replace function public.retreat_effective_rate(p_retreat_id uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(r.rate_per_person_night, c.default_rate_per_person_night, 0)
  from retreats r join camps c on c.id = r.camp_id
  where r.id = p_retreat_id;
$fn$;
grant execute on function public.retreat_effective_rate(uuid) to anon, authenticated;

update camps set default_deposit_amount = coalesce(default_deposit_amount, 500)
 where id = '33333333-3333-4333-8333-333333333333';
