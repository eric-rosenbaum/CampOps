-- The AI capture ("point the camera and say what's wrong") is the first thing in this product
-- that costs real money per press. Every draft is a vision call, and until now the only gate on
-- it was "you are logged in as somebody". Two things follow from putting that button in a phone
-- app that lives in a pocket on a work belt:
--
-- 1. A logged-in user of camp A could draft against camp B's members, locations and assets simply
--    by sending them in the request body. Nothing was written, so nothing leaked into `issues` --
--    but the lists came back matched to ids, which is more than a stranger should ever learn.
--    The edge function now demands a camp id and checks membership; this migration is the other
--    half, the part that cannot be skipped by calling the function differently.
--
-- 2. A stuck retry loop, a held-down shutter, or one curious person with the anon key and a
--    session can spend the Anthropic bill without ever filing a work order. So the draft reader
--    gets a budget: twenty drafts per person per camp per rolling hour, which is more than a
--    maintenance director walking a whole camp has ever used in a morning, and far less than a
--    loop can spend before anybody notices.
--
-- Shaped exactly like `public_report_throttle` from the QR reporting migration: one bucket row, a
-- rolling window, and a security-definer function that is the only thing allowed to touch it.

create table if not exists public.ai_draft_throttle (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

alter table public.ai_draft_throttle enable row level security;

comment on table public.ai_draft_throttle is
  'Rolling-hour AI draft counts, keyed camp:user. Written only by spend_ai_draft_budget(); deliberately has no RLS policies.';

-- Returns how many drafts this person has spent in the current hour, and raises when they are
-- out. Raising rather than returning a flag is the same choice submit_public_report() made: the
-- caller gets one sentence it can show a human, and the increment rolls back with the exception,
-- so a blocked caller cannot push its own counter higher by hammering.
--
-- Membership is re-checked here even though the edge function checks it first. The function is
-- callable by any authenticated session, so "the caller already checked" is not a fact this can
-- rely on -- and without the check, a member of one camp could burn another camp's budget.
create or replace function public.spend_ai_draft_budget(p_camp_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $fn$
declare
  v_user    uuid;
  v_bucket  text;
  v_count   integer;
  v_started timestamptz;
  v_minutes integer;
  -- Twenty an hour, per person, per camp. One number, in one place, so the budget is not
  -- something an app version can disagree about.
  v_limit   constant integer := 20;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  if p_camp_id is null or not public.is_camp_member(p_camp_id) then
    raise exception 'You do not have access to this camp.' using errcode = '42501';
  end if;

  v_bucket := p_camp_id::text || ':' || v_user::text;

  insert into public.ai_draft_throttle as t (bucket, window_start, count)
  values (v_bucket, now(), 1)
  on conflict (bucket) do update
    set count        = case when t.window_start < now() - interval '1 hour' then 1     else t.count + 1 end,
        window_start = case when t.window_start < now() - interval '1 hour' then now() else t.window_start end
  returning t.count, t.window_start into v_count, v_started;

  if v_count > v_limit then
    -- The window is rolling, so "try again later" can be specific about how much later.
    v_minutes := greatest(1, ceil(extract(epoch from (v_started + interval '1 hour' - now())) / 60.0)::int);
    raise exception 'That is % AI drafts this hour, which is the limit. Write this one by hand, or try the camera again in % minute(s).', v_limit, v_minutes
      using errcode = '54000';
  end if;

  -- Occasional cheap sweep so the table stays small without needing a scheduled job.
  if random() < 0.01 then
    delete from public.ai_draft_throttle where window_start < now() - interval '1 day';
  end if;

  return v_count;
end;
$fn$;

-- Supabase grants every new function to PUBLIC as well as to anon and authenticated, so revoking
-- from anon alone would leave the door open. Name all three, then grant back exactly one.
revoke execute on function public.spend_ai_draft_budget(uuid) from public, anon, authenticated;
grant  execute on function public.spend_ai_draft_budget(uuid) to authenticated;

comment on function public.spend_ai_draft_budget(uuid) is
  'Counts one AI draft against this user''s hourly budget for this camp and raises 54000 when it is spent. Checks camp membership itself; called by the draft-work-order edge function with the caller''s own JWT.';
