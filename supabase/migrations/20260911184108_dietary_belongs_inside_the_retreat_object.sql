-- The two dietary keys were added to the ROOT of the portal payload; every consumer reads them off
-- `data.retreat`, and the TypeScript interface declares them there too. The client cast hides the
-- mismatch, so it typechecked and was undefined at runtime -- the step could never be satisfied
-- because the value it tested never arrived where it looked.
--
-- Merged into the retreat object instead, which is where the shape already said they lived.
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
      -- An object of counts, e.g. {"vegetarian": 4, "gluten_free": 2}. Null when nobody has been
      -- asked, which the camp must be able to tell from "none" -- a kitchen that reads an unasked
      -- blank as "no needs" cooks one lasagne for a group with four vegetarians in it.
      'dietary_flags', v_retreat.dietary_flags,
      -- The group actively saying there is nothing to work around. That is an answer, and without
      -- it the to-do step could never be completed by a group with no needs.
      'dietary_none_confirmed', v_retreat.dietary_none_confirmed
    ));
end;
$fn$;

revoke execute on function public.get_portal_data_v2(text, text) from public;
grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;
