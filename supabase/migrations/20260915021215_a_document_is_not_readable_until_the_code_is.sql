-- Only `guests` was withheld from a portal with no session. Documents came through in full:
-- the filename, who had signed it, and the meta blob -- which for a certificate of insurance is
-- a policy number and a named insured. A portal link forwarded to a mailing list carried all of
-- that, even though the FILE itself has always needed a code to open.
--
-- The list is not removed, because the portal still has to be able to say a document arrived and
-- offer the code -- a group that is told nothing never unlocks. What survives is the shape: how
-- many, of what kind, due when. The name becomes the kind ("Waiver"), and signer and meta go.
--
-- Rewritten in the v2 wrapper rather than in get_portal_data, which is a 200-line function this
-- has no other business inside.
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

  -- No session: redact the document list down to its shape.
  if coalesce((v_out ->> 'unlocked')::boolean, true) = false then
    v_out := jsonb_set(v_out, '{documents}', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        e -> 'id',
               'doc_type',  e -> 'doc_type',
               'name',      initcap(replace(coalesce(e ->> 'doc_type', 'document'), '_', ' ')),
               'status',    e -> 'status',
               'due_date',  e -> 'due_date',
               'signed_at', null,
               'signed_by', null,
               'meta',      null,
               'has_file',  e -> 'has_file'))
      from jsonb_array_elements(coalesce(v_out -> 'documents', '[]'::jsonb)) e), '[]'::jsonb));
  end if;

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
