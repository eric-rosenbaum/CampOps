-- A front door for a group that wants to enquire.
--
-- `retreat-intake` already turns a forwarded email or a page of phone notes into a structured
-- draft -- but it is staff-facing. Somebody at the camp still has to receive the enquiry, paste it
-- in, and review it. The group filling the thing in themselves was never possible: the portal is
-- token-based and a token only exists once a retreat record does, so there was no way in before
-- you were already a booking.
--
-- So a camp gets a public enquiry link. Anyone with it can submit, and what arrives is an
-- `inquiry` with its fields already populated -- the same row the pipeline already understands,
-- reachable by the same screens.

-- The link. A slug rather than the camp id, so it can be printed on a website without exposing
-- anything, and revocable by clearing it.
alter table public.camps
  add column if not exists enquiry_token text unique;

comment on column public.camps.enquiry_token is
  'Public enquiry link slug. Null means the camp is not taking enquiries through the platform; clearing it revokes every link already handed out.';

create or replace function public.camp_enquiry_page(p_token text)
returns jsonb language sql stable security definer set search_path = public as $fn$
  -- Only what a public page needs to render itself. Deliberately not the camp row: an enquiry
  -- form has no business knowing a camp's plan, status or Stripe state.
  select jsonb_build_object('camp_name', c.name, 'camp_slug', c.slug)
    from camps c
   where c.enquiry_token = p_token
     and c.status = 'active'
     and c.deleted_at is null;
$fn$;

grant execute on function public.camp_enquiry_page(text) to anon, authenticated;

-- submit_camp_enquiry() is created here and then corrected twice in the two migrations that
-- follow: once because gen_random_bytes lives outside the `public` search_path this function is
-- pinned to, and once because the touchpoint insert used column and enum values that do not
-- exist. The final version is in 20260911160344.
