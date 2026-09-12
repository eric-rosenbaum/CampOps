-- The portal asked a group to "sign and confirm the booking" and never showed them the agreement.
--
-- The payload carried the price, the validity date and a short terms blurb, and the button
-- underneath committed them to a contract whose text was not on the page. Now that the agreement
-- is real text rather than an opaque file, there is no reason for that -- and every reason not to:
-- a signature on an unread document is worth nothing to either side.
create or replace function public.get_portal_data_v2(p_token text, p_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_out jsonb; v_retreat retreats;
  v_nights int; v_people int; v_est numeric; v_src text; v_agreement jsonb;
begin
  -- Everything the v2 wrapper already assembles, untouched.
  v_out := public.get_portal_data_v2_inner(p_token, p_session);
  if v_out is null then return null; end if;

  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return v_out; end if;

  v_nights := case when v_retreat.arrival_date is not null and v_retreat.departure_date is not null
                   then greatest(v_retreat.departure_date - v_retreat.arrival_date, 0) end;
  v_people := coalesce(v_retreat.final_headcount, v_retreat.headcount);

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

  -- The agreement they are being asked to sign, verbatim. The latest one actually sent -- a draft
  -- the camp is still writing is not something the group should be reading.
  select jsonb_build_object('version', p.version, 'body', p.agreement_body, 'status', p.status)
    into v_agreement
    from retreat_proposals p
   where p.retreat_id = v_retreat.id
     and p.status in ('sent','viewed','accepted')
     and coalesce(btrim(p.agreement_body), '') <> ''
   order by p.version desc limit 1;

  return jsonb_set(v_out, '{retreat}',
    coalesce(v_out -> 'retreat', '{}'::jsonb) || jsonb_build_object(
      'dietary_flags', v_retreat.dietary_flags,
      'dietary_notes', v_retreat.dietary_notes,
      'dietary_none_confirmed', v_retreat.dietary_none_confirmed,
      'estimated_total', v_est,
      'estimated_basis', v_src,
      'flat_rate', v_retreat.flat_rate
    )) || jsonb_build_object('agreement', v_agreement);
end;
$fn$;

revoke execute on function public.get_portal_data_v2(text, text) from public;
grant execute on function public.get_portal_data_v2(text, text) to anon, authenticated;

-- attach_agreement_from_template() is left in place but is no longer called by anything. It copied
-- ONE uploaded file onto every booking and filled in nothing -- the same generic document for
-- every group, no name, no dates, no price -- which is the opposite of a template. Uploading a
-- file for ONE group still exists on that retreat's Paperwork tab, which is the right home for a
-- negotiated one-off or a signed copy coming back.
comment on function public.attach_agreement_from_template(uuid) is
  'ORPHANED. The camp-level FILE template is gone: a file cannot have a group''s details filled in, so it produced identical unfilled contracts for every booking. The agreement is text now -- see camps.agreement_template_body and render_agreement().';
