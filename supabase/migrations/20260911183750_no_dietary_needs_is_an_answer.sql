-- Dietary needs became a step on the group's to-do list rather than a card in the booking summary,
-- and a step needs a way to be finished. A group with nothing to declare had no way to say so:
-- leaving it blank is indistinguishable from not having looked, which is the whole distinction
-- this feature exists to preserve. So "nobody has any" is a recorded answer, not an absence.
alter table public.retreats
  add column if not exists dietary_none_confirmed boolean not null default false;

comment on column public.retreats.dietary_none_confirmed is
  'The group has actively said nobody has a dietary need. Distinct from dietary_flags being empty, which means nobody has been asked.';

create or replace function public.portal_save_dietary(p_token text, p_flags jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_r retreats; v_clean jsonb := '{}'::jsonb; k text; v int;
begin
  select * into v_r from retreats where portal_token = p_token;
  if v_r.id is null then raise exception 'This link is not recognised.'; end if;

  -- Counts only, and only positive ones. A zero is the same as not saying it, and storing zeros
  -- would make the camp's "4 vegetarian, 0 vegan" read as a considered answer about vegans.
  if jsonb_typeof(p_flags) = 'object' then
    for k, v in select key, (value #>> '{}')::int from jsonb_each(p_flags)
    loop
      if v is not null and v > 0 then
        v_clean := v_clean || jsonb_build_object(k, v);
      end if;
    end loop;
  end if;

  update retreats
     set dietary_flags = case when v_clean = '{}'::jsonb then null else v_clean end,
         -- Submitting the form IS the answer, whichever way it came out. An empty submission is
         -- the group saying there is nothing to work around.
         dietary_none_confirmed = (v_clean = '{}'::jsonb),
         updated_at = now()
   where id = v_r.id;

  return jsonb_build_object('ok', true, 'flags', v_clean);
end;
$fn$;

grant execute on function public.portal_save_dietary(text, jsonb) to anon, authenticated;

-- NOTE: this migration also added the two dietary keys to the ROOT of the portal payload. Every
-- consumer reads them off `data.retreat`. The next migration moves them there.
