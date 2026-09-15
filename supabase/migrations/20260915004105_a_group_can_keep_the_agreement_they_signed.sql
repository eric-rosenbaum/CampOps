-- A group signed the agreement and it vanished.
--
-- The agreement IS the proposal now, and the portal drops the proposal step the moment it is
-- accepted -- so the one document the group is contractually bound by became the one thing they
-- could not get back. "Keep a copy, your camp can send you one" was the instruction, which means
-- an email to the camp for something the portal is already holding.
--
-- The payload gains what a printable copy needs: the agreement text itself, who typed their name,
-- and the camp and group details that go on the letterhead. Same signature, so no new overload.
--
-- Edited from pg_get_functiondef, not retyped: the viewed_at side effect below is the entire
-- reason this function is a function and not a select.
create or replace function public.portal_proposal(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_retreat retreats; v_p retreat_proposals; v_camp_name text;
begin
  select * into v_retreat from retreats where portal_token = p_token;
  if v_retreat.id is null then return null; end if;

  select * into v_p from retreat_proposals
   where retreat_id = v_retreat.id and status in ('sent','viewed','accepted','declined')
   order by version desc limit 1;
  if v_p.id is null then return null; end if;

  if v_p.status = 'sent' then
    update retreat_proposals set status = 'viewed', viewed_at = coalesce(viewed_at, now())
     where id = v_p.id;
    v_p.status := 'viewed';
  end if;

  select name into v_camp_name from camps where id = v_retreat.camp_id;

  return jsonb_build_object(
    'id', v_p.id, 'version', v_p.version, 'line_items', v_p.line_items, 'total', v_p.total,
    'valid_until', v_p.valid_until, 'terms', v_p.terms, 'intro', v_p.intro, 'status', v_p.status,
    'accepted_at', v_p.accepted_at, 'group_name', v_retreat.group_name,
    'arrival', v_retreat.arrival_date, 'departure', v_retreat.departure_date,
    -- Everything below is for the group's own copy of what they signed.
    'agreement_body', v_p.agreement_body,
    'accepted_by_name', v_p.accepted_by_name,
    'camp_name', v_camp_name,
    'coordinator_name', v_retreat.coordinator_name,
    'headcount', coalesce(v_retreat.final_headcount, v_retreat.headcount));
end;
$fn$;

revoke execute on function public.portal_proposal(text) from public;
grant execute on function public.portal_proposal(text) to anon, authenticated;
