-- Signing the agreement is how a group accepts the quote.
--
-- There were two acts of agreement and one of them was worth nothing. The agreement carries a
-- real signature -- an emailed code, the signer's IP, their user agent, a hash of the file --
-- while accepting a proposal was typing your name into a box. A group did both, days apart, and
-- the camp had to check two places to know whether it had a booking.
--
-- Now the signature does both. Implemented as a trigger on retreat_documents rather than inside
-- portal_sign_document: that function is the e-signature audit path, it is long, and it is not
-- somewhere to be retyping by hand.

create or replace function public.agreement_signature_accepts_proposal()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_p retreat_proposals;
begin
  if new.doc_type not in ('agreement', 'contract') then return new; end if;
  if new.signed_at is null or old.signed_at is not null then return new; end if;

  -- The quote they were looking at when they signed: newest that is out and unanswered.
  select * into v_p from retreat_proposals p
   where p.retreat_id = new.retreat_id and p.status in ('sent', 'viewed')
   order by p.version desc limit 1;
  if v_p.id is null then return new; end if;

  update retreat_proposals set
    status = 'accepted',
    accepted_at = now(),
    accepted_by_name = coalesce(new.signed_by, accepted_by_name),
    updated_at = now()
  where id = v_p.id;

  -- Same carry-over the portal's own accept does: an accepted quote sets the booking's price.
  update retreats set
    pricing_model = coalesce(v_p.pricing_model, pricing_model),
    rate_per_person_night = coalesce(v_p.rate_per_person_night, rate_per_person_night),
    flat_rate = coalesce(v_p.flat_rate, flat_rate),
    deposit_required = coalesce(v_p.deposit_amount, deposit_required),
    updated_at = now()
  where id = new.retreat_id;

  return new;
end;
$fn$;

drop trigger if exists agreement_accepts_proposal_trg on retreat_documents;
create trigger agreement_accepts_proposal_trg after update of signed_at on retreat_documents
  for each row execute function public.agreement_signature_accepts_proposal();
