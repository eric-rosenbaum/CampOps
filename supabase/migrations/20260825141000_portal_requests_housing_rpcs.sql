-- Portal side of the same three changes.
--
-- get_portal_data is patched in place rather than retyped. It has been rewritten by a dozen
-- migrations and is now ~100 lines of jsonb assembly; transcribing it to add three fields is
-- how a subtle regression gets introduced somewhere nobody was looking.
do $do$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_portal_data';

  if src is null then raise exception 'get_portal_data not found'; end if;

  -- The group's own housing sign-off, so the portal can show its button as done.
  src := replace(src,
    $a$'final_headcount_by', r.final_headcount_by,$a$,
    $a$'final_headcount_by', r.final_headcount_by,
      'housing_submitted_at', r.housing_submitted_at, 'housing_submitted_by', r.housing_submitted_by,$a$);

  -- Discounts, so the portal shows the same number the camp billed.
  src := replace(src,
    $a$'line_items',line_items,'issued_at',issued_at)$a$,
    $a$'line_items',line_items,'discount',discount,'discount_note',discount_note,'issued_at',issued_at)$a$);

  -- Direction and attribution, so the portal can tell a request it raised from one the camp
  -- raised and is waiting on an answer to.
  src := replace(src,
    $a$'response_message',response_message,'responded_at',responded_at)$a$,
    $a$'response_message',response_message,'responded_at',responded_at,'origin',origin,'submitted_by',submitted_by,'responded_by',responded_by)$a$);

  execute src;
end $do$;

-- ── The group marks their rooming finished ───────────────────────────────────
-- Deliberately reversible: a coordinator who presses this and then spots a mistake should be
-- able to reopen it themselves rather than emailing the camp to undo a flag. The camp's own
-- approval (retreat_housing.locked) is untouched either way.
create or replace function portal_set_housing_complete(
  p_token text, p_complete boolean, p_submitted_by text default null
) returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;
  if portal_link_expired(r.departure_date) then raise exception 'This portal link has expired.'; end if;

  update retreats
    set housing_submitted_at = case when p_complete then now() else null end,
        housing_submitted_by = case when p_complete then nullif(p_submitted_by, '') else null end,
        updated_at = now()
    where id = r.id;
  return true;
end $function$;

-- ── The group answers something the camp asked ───────────────────────────────
create or replace function portal_respond_to_request(
  p_token text, p_request_id uuid, p_body text, p_submitted_by text default null
) returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats; v_origin text;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;
  if portal_link_expired(r.departure_date) then raise exception 'This portal link has expired.'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'A reply is required.'; end if;

  -- Only requests the camp raised, and only on this booking. Without the origin check a
  -- coordinator could overwrite the camp's response to their own request.
  select origin into v_origin
  from retreat_change_requests where id = p_request_id and retreat_id = r.id;
  if v_origin is null then raise exception 'Request not found'; end if;
  if v_origin <> 'camp' then raise exception 'That request is not awaiting your reply.'; end if;

  update retreat_change_requests
    set response_message = p_body,
        responded_by = nullif(p_submitted_by, ''),
        responded_at = now(),
        status = 'approved',
        updated_at = now()
    where id = p_request_id;
  return true;
end $function$;

grant execute on function portal_set_housing_complete(text, boolean, text) to anon;
grant execute on function portal_respond_to_request(text, uuid, text, text) to anon;

-- The expected-total query sums positive line items only, which correctly skips the
-- "less payments received" line but also skipped a discount, so the group would have been
-- quoted a balance the camp had already reduced. Subtract the invoice's discount explicitly.
do $do$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_portal_data';

  if position($a$SELECT sum((li->>'amount')::numeric) INTO v_inv_gross$a$ in src) = 0 then
    raise exception 'expected invoice-gross query not found in get_portal_data';
  end if;

  src := replace(src,
    $a$SELECT sum((li->>'amount')::numeric) INTO v_inv_gross$a$,
    $a$SELECT sum((li->>'amount')::numeric) - max(ri.discount) INTO v_inv_gross$a$);

  execute src;
end $do$;
