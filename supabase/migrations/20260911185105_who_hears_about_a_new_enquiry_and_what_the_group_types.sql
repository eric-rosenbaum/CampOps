-- ── 1 · Who hears when an enquiry arrives ───────────────────────────────────
-- An enquiry that lands in the pipeline and notifies nobody is a missed booking. Which person at
-- camp gets told is a real decision -- it is usually one or two people, not everybody -- so it is
-- a per-member setting rather than a guess.
alter table public.camp_members
  add column if not exists notify_retreats boolean not null default false;

comment on column public.camp_members.notify_retreats is
  'This person is emailed when a new enquiry arrives through the public link. Set per member on the Team page; nobody is opted in silently.';

-- Admins start opted in, because a camp that turns the enquiry link on and hears nothing has been
-- given a form that drops leads. Anyone can be switched off.
update public.camp_members
   set notify_retreats = true
 where role = 'admin' and is_active;

-- ── 2 · What the group actually needs to say about food ─────────────────────
-- Counts per diet are the tidy half, and the wrong primary: real answers are "one coeliac, and
-- Ben has a severe tree-nut allergy -- he carries an EpiPen". That does not fit in a number box,
-- and a form that only offers numbers quietly throws it away.
alter table public.retreats
  add column if not exists dietary_notes text;

comment on column public.retreats.dietary_notes is
  'What the group wrote in their own words. The primary answer -- dietary_flags counts are the structured secondary, and a kitchen reads this one.';

create or replace function public.portal_save_dietary(p_token text, p_flags jsonb, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_r retreats; v_clean jsonb := '{}'::jsonb; k text; v int; v_notes text;
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

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  update retreats
     set dietary_flags = case when v_clean = '{}'::jsonb then null else v_clean end,
         dietary_notes = v_notes,
         -- Submitting the form IS the answer, whichever way it came out. An empty submission --
         -- no words and no counts -- is the group saying there is nothing to work around.
         dietary_none_confirmed = (v_clean = '{}'::jsonb and v_notes is null),
         updated_at = now()
   where id = v_r.id;

  return jsonb_build_object('ok', true, 'flags', v_clean, 'notes', v_notes);
end;
$fn$;

grant execute on function public.portal_save_dietary(text, jsonb, text) to anon, authenticated;

-- The portal reads what it wrote.
create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_out jsonb; v_retreat retreats;
begin
  -- Everything the v2 wrapper already assembles, untouched.
  v_out := public.get_portal_data_v2_inner(p_token, p_session);
  if v_out is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_out; end if;

  return jsonb_set(v_out, '{retreat}',
    coalesce(v_out -> 'retreat', '{}'::jsonb) || jsonb_build_object(
      'dietary_flags', v_retreat.dietary_flags,
      'dietary_notes', v_retreat.dietary_notes,
      'dietary_none_confirmed', v_retreat.dietary_none_confirmed
    ));
end;
$fn$;

revoke execute on function public.get_portal_data_v2(text, text) from public;
grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;
