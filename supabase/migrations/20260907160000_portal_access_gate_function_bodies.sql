-- The bodies the portal access gate was missing.
--
-- 20260825130000_portal_access_gate.sql created the two tables the gate needs and then said, of
-- the six functions that actually USE them, "See the applied migrations for the bodies of". Those
-- bodies were applied to production by hand and never written down. So production has the gated
-- portal and every environment rebuilt from this directory has the ungated one — which is how
-- staging ended up with `get_portal_data(text)` where the client calls `get_portal_data(text,text)`.
--
-- Two separate failures came out of that one gap, and both were live on staging:
--
--   1. A WHITE SCREEN on every guest portal. The ungated payload has no `guests` key at all
--      (the gated one always returns the key and empties it to `[]` when locked), and the portal
--      reads `data.guests.length` while building its checklist. `get_portal_data_v2`'s
--      tolerate-both-arities shim kept the RPC from erroring, so this surfaced as a blank page
--      with no server-side trace.
--
--   2. NO GATE. The named roster, the room assignments and `portal_document_path` were readable
--      by anyone holding the link, which is exactly what the August work set out to stop. The
--      ungated overloads are dropped below rather than left beside the gated ones: leaving them
--      is a bypass, since a caller can always choose the older signature.
--
-- The bodies below are transcribed from production, which is the only place they existed.
-- Create first, drop the ungated overloads after, so no window has neither.

-- ─── The payload ────────────────────────────────────────────────────────────
create or replace function public.get_portal_data(p_token text, p_session text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE r retreats; v_charges numeric; v_paid numeric; v_deposit numeric; v_camp text;
        v_nights int; v_expected numeric; v_inv_gross numeric;
        v_gender boolean; v_dietary boolean; v_unlocked boolean;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF portal_link_expired(r.departure_date) THEN RETURN jsonb_build_object('expired', true); END IF;
  v_unlocked := portal_session_valid(p_token, p_session);
  SELECT name, roster_collect_gender, roster_collect_dietary
    INTO v_camp, v_gender, v_dietary FROM camps WHERE id = r.camp_id;
  SELECT COALESCE(sum(amount),0) INTO v_charges FROM retreat_charges WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_paid FROM retreat_payments WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_deposit FROM retreat_payments WHERE retreat_id = r.id AND kind = 'deposit';
  v_nights := GREATEST(0, (r.departure_date - r.arrival_date));

  SELECT sum((li->>'amount')::numeric) - max(ri.discount) INTO v_inv_gross
  FROM retreat_invoices ri, jsonb_array_elements(ri.line_items) li
  WHERE ri.retreat_id = r.id AND ri.kind = 'balance' AND ri.status <> 'void'
    AND ri.created_at = (SELECT max(created_at) FROM retreat_invoices
                         WHERE retreat_id = r.id AND kind = 'balance' AND status <> 'void')
    AND (li->>'amount')::numeric > 0;

  IF v_inv_gross IS NOT NULL THEN v_expected := v_inv_gross;
  ELSIF v_charges > 0 THEN v_expected := v_charges;
  ELSE v_expected := CASE r.pricing_model
      WHEN 'per_cabin_night' THEN COALESCE(r.flat_rate,0) * (SELECT count(*) FROM retreat_housing WHERE retreat_id = r.id) * v_nights
      WHEN 'flat' THEN COALESCE(r.flat_rate,0)
      ELSE COALESCE(r.rate_per_person_night,0) * COALESCE(r.final_headcount, r.headcount) * v_nights
    END;
  END IF;

  RETURN jsonb_build_object(
    'retreat', jsonb_build_object(
      'id', r.id, 'group_name', r.group_name, 'group_type', r.group_type,
      'camp_name', v_camp,
      'collect_gender', COALESCE(v_gender,false), 'collect_dietary', COALESCE(v_dietary,false),
      'arrival_date', r.arrival_date, 'departure_date', r.departure_date,
      'headcount', r.headcount, 'coordinator_name', r.coordinator_name,
      'status', r.status, 'dietary_flags', r.dietary_flags,
      'menu_published', r.menu_published, 'change_requests_enabled', r.change_requests_enabled,
      'feedback_opens', r.feedback_opens, 'housing_deadline', r.housing_deadline,
      'headcount_cutoff', r.headcount_cutoff,
      'pricing_model', r.pricing_model, 'rate_per_person_night', r.rate_per_person_night, 'nights', v_nights,
      'deposit_required', r.deposit_required,
      'deposit_received', GREATEST(COALESCE(r.deposit_received,0), v_deposit),
      'deposit_due', r.deposit_due,
      'final_headcount', r.final_headcount, 'final_headcount_at', r.final_headcount_at,
      'final_headcount_by', r.final_headcount_by,
      'housing_submitted_at', r.housing_submitted_at, 'housing_submitted_by', r.housing_submitted_by,
      'total_charges', v_expected, 'total_paid', v_paid, 'balance_due', v_expected - v_paid),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'doc_type',doc_type,'name',name,'status',status,'due_date',due_date,'signed_at',signed_at,'signed_by',signed_by,'meta',meta,'has_file',(file_path IS NOT NULL)) ORDER BY sort_order) FROM retreat_documents WHERE retreat_id=r.id), '[]'::jsonb),
    'invoices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'number',number,'amount',amount,'note',note,'due_date',due_date,'status',status,'line_items',line_items,'discount',discount,'discount_note',discount_note,'issued_at',issued_at) ORDER BY issued_at DESC) FROM retreat_invoices WHERE retreat_id=r.id AND status <> 'draft'), '[]'::jsonb),
    -- The key is always present and empties to [] when locked. The portal reads its length while
    -- building the checklist, so an ABSENT key is a white screen, not a degraded page.
    'guests', CASE WHEN NOT v_unlocked THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'full_name', full_name, 'subgroup', subgroup, 'gender', gender,
        'dietary', dietary, 'needs_accessible', needs_accessible, 'notes', notes,
        'location_id', location_id) ORDER BY sort_order, full_name)
      FROM retreat_guests WHERE retreat_id = r.id), '[]'::jsonb) END,
    'spaces', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name,
               'building_id', t.building_id, 'building', t.building,
               'bed_capacity', t.bed_capacity, 'accessible', t.accessible,
               -- Held by a different, date-overlapping retreat. No group name: the portal
               -- is public, and who else is on site is not this coordinator's business.
               'taken_by_other', EXISTS (
                 SELECT 1
                 FROM retreat_housing rh
                 JOIN retreats o ON o.id = rh.retreat_id
                 WHERE rh.location_id = t.id
                   AND o.id <> r.id
                   AND o.camp_id = r.camp_id
                   AND o.status <> 'cancelled'
                   AND o.arrival_date < r.departure_date
                   AND o.departure_date > r.arrival_date))
             ORDER BY t.building, t.name)
      FROM (
        SELECT rm.id AS id, rm.name AS name, d.id AS building_id, d.name AS building,
               rm.bed_capacity AS bed_capacity, rm.accessible AS accessible
        FROM locations d
        JOIN locations rm ON rm.parent_id = d.id AND rm.is_active AND rm.retreat_available
        WHERE d.camp_id = r.camp_id AND d.is_dorm AND d.retreat_available AND d.is_active AND d.parent_id IS NULL
        UNION ALL
        SELECT d.id, d.name, d.id, d.name, d.bed_capacity, d.accessible
        FROM locations d
        WHERE d.camp_id = r.camp_id AND d.is_dorm AND d.retreat_available AND d.is_active AND d.parent_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM locations rm WHERE rm.parent_id = d.id)
      ) t), '[]'::jsonb),
    'housing', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',location_id,'space_name',space_name,'subgroup_name',subgroup_name,'people_count',people_count,'unnamed_count',unnamed_count,'notes',notes,'locked',locked) ORDER BY sort_order) FROM retreat_housing WHERE retreat_id=r.id), '[]'::jsonb),
    'meals', CASE WHEN r.menu_published THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day_date', rme.day_date, 'meal_period', rme.meal_period,
        'name', COALESCE(NULLIF(rme.label,''), rec.name, it.name),
        'items', NULL::text, 'allergens', rme.allergens, 'alternatives', rme.alternatives)
        ORDER BY rme.day_date, rme.sort_order)
      FROM retreat_menu_entries rme
      LEFT JOIN recipes rec ON rec.id = rme.recipe_id
      LEFT JOIN inventory_items it ON it.id = rme.item_id
      WHERE rme.retreat_id = r.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'change_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'submitted_at',submitted_at,'response_message',response_message,'responded_at',responded_at,'origin',origin,'submitted_by',submitted_by,'responded_by',responded_by) ORDER BY submitted_at DESC) FROM retreat_change_requests WHERE retreat_id=r.id), '[]'::jsonb),
    'feedback_submitted', EXISTS(SELECT 1 FROM retreat_feedback WHERE retreat_id=r.id),
    'unlocked', v_unlocked,
    'verify_email_hint', CASE WHEN r.coordinator_email IS NULL THEN NULL
      ELSE regexp_replace(r.coordinator_email, '^(.).*(.)@', '\1***\2@') END);
END $function$;

-- ─── The gated writes ───────────────────────────────────────────────────────
create or replace function public.portal_save_roster(p_token text, p_guests jsonb, p_submitted_by text default null, p_replace boolean default false, p_access text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats; g jsonb; v_added int := 0; v_next int;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;
  IF NOT portal_session_valid(p_token, p_access) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Verify your email to change the guest list.');
  END IF;

  if jsonb_typeof(p_guests) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Expected a list of guests.');
  end if;
  if jsonb_array_length(p_guests) > 500 then
    return jsonb_build_object('ok', false, 'error', 'That is more than 500 names - please split it up.');
  end if;

  if p_replace then
    delete from retreat_guests where retreat_id = r.id and location_id is null;
  end if;

  select coalesce(max(sort_order), 0) into v_next from retreat_guests where retreat_id = r.id;

  for g in select * from jsonb_array_elements(p_guests) loop
    continue when coalesce(btrim(g->>'full_name'), '') = '';
    v_next := v_next + 1;
    insert into retreat_guests (camp_id, retreat_id, full_name, subgroup, gender, dietary,
                                needs_accessible, notes, sort_order)
    values (r.camp_id, r.id,
            left(btrim(g->>'full_name'), 120),
            nullif(btrim(coalesce(g->>'subgroup', '')), ''),
            nullif(btrim(coalesce(g->>'gender', '')), ''),
            nullif(btrim(coalesce(g->>'dietary', '')), ''),
            coalesce((g->>'needs_accessible')::boolean, false),
            nullif(btrim(coalesce(g->>'notes', '')), ''),
            v_next);
    v_added := v_added + 1;
  end loop;

  perform sync_retreat_housing_from_roster(r.id);
  return jsonb_build_object('ok', true, 'added', v_added,
                            'total', (select count(*) from retreat_guests where retreat_id = r.id));
end $function$;

create or replace function public.portal_update_guest(p_token text, p_guest_id uuid, p_full_name text default null, p_subgroup text default null, p_gender text default null, p_dietary text default null, p_needs_accessible boolean default null, p_notes text default null, p_access text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;
  IF NOT portal_session_valid(p_token, p_access) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Verify your email to change the guest list.');
  END IF;

  update retreat_guests
     set full_name        = coalesce(nullif(btrim(p_full_name), ''), full_name),
         subgroup         = case when p_subgroup is null then subgroup else nullif(btrim(p_subgroup), '') end,
         gender           = case when p_gender   is null then gender   else nullif(btrim(p_gender), '')   end,
         dietary          = case when p_dietary  is null then dietary  else nullif(btrim(p_dietary), '')  end,
         needs_accessible = coalesce(p_needs_accessible, needs_accessible),
         notes            = case when p_notes    is null then notes    else nullif(btrim(p_notes), '')    end
   where id = p_guest_id and retreat_id = r.id;

  if not found then return jsonb_build_object('ok', false, 'error', 'That guest is not on this roster.'); end if;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.portal_assign_guests(p_token text, p_guest_ids uuid[], p_location_id uuid, p_access text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats; v_moved int;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;
  IF NOT portal_session_valid(p_token, p_access) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Verify your email to change the guest list.');
  END IF;

  if exists (select 1 from retreat_housing where retreat_id = r.id and locked) then
    return jsonb_build_object('ok', false, 'error', 'The camp has locked housing for this retreat.');
  end if;

  if p_location_id is not null then
    if not exists (
      select 1 from locations l
      where l.id = p_location_id and l.camp_id = r.camp_id
        and l.is_active and l.retreat_available
    ) then
      return jsonb_build_object('ok', false, 'error', 'That room is not available for retreats.');
    end if;
    if exists (
      select 1 from retreat_housing rh
      join retreats o on o.id = rh.retreat_id
      where rh.location_id = p_location_id
        and o.id <> r.id and o.camp_id = r.camp_id and o.status <> 'cancelled'
        and o.arrival_date < r.departure_date and o.departure_date > r.arrival_date
    ) then
      return jsonb_build_object('ok', false, 'error', 'Another group is already in that room for your dates.');
    end if;
  end if;

  update retreat_guests
     set location_id = p_location_id
   where retreat_id = r.id and id = any(p_guest_ids);
  get diagnostics v_moved = row_count;

  perform sync_retreat_housing_from_roster(r.id);
  return jsonb_build_object('ok', true, 'moved', v_moved);
end $function$;

create or replace function public.portal_delete_guests(p_token text, p_guest_ids uuid[], p_access text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats; v_deleted int;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Invalid portal link.'); end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;
  IF NOT portal_session_valid(p_token, p_access) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Verify your email to change the guest list.');
  END IF;

  delete from retreat_guests where retreat_id = r.id and id = any(p_guest_ids);
  get diagnostics v_deleted = row_count;

  perform sync_retreat_housing_from_roster(r.id);
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end $function$;

-- The document FILE stays gated even though its metadata does not: the metadata is what the
-- checklist is built from, the file is the thing worth forwarding a link to steal.
create or replace function public.portal_document_path(p_token text, p_doc_id uuid, p_access text default null)
returns text language plpgsql security definer set search_path to 'public'
as $function$
declare r retreats; v_path text;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal link.'; end if;
  if portal_link_expired(r.departure_date) then raise exception 'This portal link has expired.'; end if;
  if not portal_session_valid(p_token, p_access) then
    raise exception 'Verify your email to open this document.';
  end if;
  select file_path into v_path from retreat_documents where id = p_doc_id and retreat_id = r.id;
  return v_path;
end $function$;

-- One code, not two: a live portal session satisfies signing verification, because both codes go
-- to the same inbox and the second proves nothing the first has not. signature_method still
-- records which was used, so the audit trail keeps them apart.
create or replace function public.portal_sign_document(p_token text, p_doc_id uuid, p_signed_by text, p_ip text default null, p_user_agent text default null, p_file_hash text default null, p_code text default null, p_access text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  r         retreats;
  v_code    retreat_signing_codes;
  v_method  text;
  v_email   text;
begin
  select * into r from retreats where portal_token = p_token;
  if not found then raise exception 'Invalid portal token'; end if;
  if portal_link_expired(r.departure_date) then
    return jsonb_build_object('ok', false, 'error', 'This portal link has expired.');
  end if;

  if coalesce(btrim(r.coordinator_email), '') = '' then
    -- No address to verify against. The typed name still binds under ESIGN; the weaker
    -- method is recorded honestly.
    v_method := 'typed';
  elsif portal_session_valid(p_token, p_access) then
    select s.verified_email into v_email
    from retreat_portal_sessions s
    join retreats rr on rr.id = s.retreat_id
    where rr.portal_token = p_token
      and s.session_hash = encode(extensions.digest(p_access, 'sha256'), 'hex')
      and s.expires_at > now()
    limit 1;
    v_method := 'session';
  else
    if p_code is null then
      return jsonb_build_object('ok', false, 'error', 'A verification code is required.');
    end if;

    select * into v_code
      from retreat_signing_codes
     where document_id = p_doc_id and retreat_id = r.id and consumed_at is null
     order by created_at desc limit 1;

    if not found or v_code.expires_at < now() then
      return jsonb_build_object('ok', false, 'error', 'That code has expired. Request a new one.');
    end if;
    if v_code.attempts >= 5 then
      return jsonb_build_object('ok', false, 'error', 'Too many attempts. Request a new code.');
    end if;
    if v_code.code_hash <> encode(extensions.digest(p_code, 'sha256'), 'hex') then
      update retreat_signing_codes set attempts = attempts + 1 where id = v_code.id;
      return jsonb_build_object('ok', false, 'error', 'That code is not correct.');
    end if;

    update retreat_signing_codes set consumed_at = now() where id = v_code.id;
    v_method := 'code';
    v_email  := v_code.sent_to;
  end if;

  update retreat_documents
     set status = 'signed', signed_by = p_signed_by, signed_at = now(),
         signed_ip = coalesce(p_ip, signed_ip),
         signed_user_agent = coalesce(p_user_agent, signed_user_agent),
         signed_file_hash = coalesce(p_file_hash, signed_file_hash),
         signed_email = coalesce(v_email, signed_email),
         signature_method = v_method,
         consent_at = coalesce(consent_at, now()),
         updated_at = now()
   where id = p_doc_id and retreat_id = r.id and signed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'This document has already been signed.');
  end if;
  return jsonb_build_object('ok', true, 'method', v_method);
end $function$;

-- ─── Drop the ungated overloads ─────────────────────────────────────────────
-- Last, so there is no moment where neither signature resolves. Keeping these beside the gated
-- ones would defeat the gate: PostgREST picks the overload matching the arguments it is sent, so
-- a caller who simply omits p_access would skip the session check.
drop function if exists public.get_portal_data(text);
drop function if exists public.portal_save_roster(text, jsonb, text, boolean);
drop function if exists public.portal_update_guest(text, uuid, text, text, text, text, boolean, text);
drop function if exists public.portal_assign_guests(text, uuid[], uuid);
drop function if exists public.portal_delete_guests(text, uuid[]);
drop function if exists public.portal_document_path(text, uuid);
drop function if exists public.portal_sign_document(text, uuid, text);
drop function if exists public.portal_sign_document(text, uuid, text, text, text, text);
drop function if exists public.portal_sign_document(text, uuid, text, text, text, text, text);

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function public.get_portal_data(text, text) from public;
revoke execute on function public.portal_save_roster(text, jsonb, text, boolean, text) from public;
revoke execute on function public.portal_update_guest(text, uuid, text, text, text, text, boolean, text, text) from public;
revoke execute on function public.portal_assign_guests(text, uuid[], uuid, text) from public;
revoke execute on function public.portal_delete_guests(text, uuid[], text) from public;
revoke execute on function public.portal_document_path(text, uuid, text) from public;
revoke execute on function public.portal_sign_document(text, uuid, text, text, text, text, text, text) from public;

grant execute on function public.get_portal_data(text, text) to anon, authenticated;
grant execute on function public.portal_save_roster(text, jsonb, text, boolean, text) to anon, authenticated;
grant execute on function public.portal_update_guest(text, uuid, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.portal_assign_guests(text, uuid[], uuid, text) to anon, authenticated;
grant execute on function public.portal_delete_guests(text, uuid[], text) to anon, authenticated;
grant execute on function public.portal_document_path(text, uuid, text) to anon, authenticated;
grant execute on function public.portal_sign_document(text, uuid, text, text, text, text, text, text) to anon, authenticated;
