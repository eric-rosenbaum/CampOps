-- A group that has not been invoiced yet saw no money at all.
--
-- The portal's account card renders only when total_charges or balance_due exists, and both come
-- from invoices. So a booking with an agreed rate but no invoice raised -- which is every booking
-- between "confirmed" and "the camp gets round to billing" -- showed the guest an agreement, a
-- to-do list, and nothing about what any of it costs. Attaching agreements made that state
-- common, and it reads as the portal having lost the money.
--
-- Computed here rather than in the client so every pricing model is handled in one place: the
-- accepted proposal wins if there is one (it is what the group said yes to), otherwise the
-- booking's own rate.
create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_out jsonb; v_retreat retreats;
  v_nights int; v_people int; v_est numeric; v_src text;
begin
  -- Everything the v2 wrapper already assembles, untouched.
  v_out := public.get_portal_data_v2_inner(p_token, p_session);
  if v_out is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_out; end if;

  v_nights := case when v_retreat.arrival_date is not null and v_retreat.departure_date is not null
                   then greatest(v_retreat.departure_date - v_retreat.arrival_date, 0) end;
  v_people := coalesce(v_retreat.final_headcount, v_retreat.headcount);

  -- What the group agreed to, if they have agreed to anything.
  select p.total into v_est
    from retreat_proposals p
   where p.retreat_id = v_retreat.id and p.status = 'accepted'
   order by p.accepted_at desc nulls last limit 1;
  if v_est is not null then
    v_src := 'accepted quote';
  elsif v_retreat.pricing_model = 'per_person_night'
        and v_retreat.rate_per_person_night is not null
        and v_people is not null and v_nights is not null then
    v_est := v_retreat.rate_per_person_night * v_people * v_nights;
    v_src := 'estimate';
  elsif v_retreat.pricing_model = 'flat' and v_retreat.flat_rate is not null then
    v_est := v_retreat.flat_rate;
    v_src := 'estimate';
  end if;

  return jsonb_set(v_out, '{retreat}',
    coalesce(v_out -> 'retreat', '{}'::jsonb) || jsonb_build_object(
      'dietary_flags', v_retreat.dietary_flags,
      'dietary_notes', v_retreat.dietary_notes,
      'dietary_none_confirmed', v_retreat.dietary_none_confirmed,
      -- What the stay comes to before anything is invoiced. Null when the camp has not set a rate,
      -- because a made-up number is worse than an honest blank.
      'estimated_total', v_est,
      -- Whether that figure is something they agreed to or something we worked out. The portal
      -- must not present an estimate as a bill.
      'estimated_basis', v_src,
      'flat_rate', v_retreat.flat_rate
    ));
end;
$fn$;

revoke execute on function public.get_portal_data_v2(text, text) from public;
grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;
