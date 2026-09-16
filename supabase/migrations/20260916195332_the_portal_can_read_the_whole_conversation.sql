-- The thread, inside the payload the portal reads.
--
-- Only the `change_requests` key changed: each request now carries its `messages`, plus who
-- spoke last and whether the camp has closed the thread. The key goes INSIDE the request object
-- the client already maps -- a field added at the payload root is invisible to the portal, and
-- that mistake has shipped here before.
--
-- The rest of this body is `pg_get_functiondef` of the live function, edited in place. Retyping
-- it from memory is how clauses go missing in a way that deploys fine.
CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text, p_session text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r retreats; v_charges numeric; v_paid numeric; v_deposit numeric; v_camp text;
        v_nights int; v_expected numeric; v_inv_gross numeric; v_agreed numeric;
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

  SELECT total INTO v_agreed FROM retreat_proposals
   WHERE retreat_id = r.id AND status = 'accepted' AND COALESCE(total,0) > 0
   ORDER BY version DESC LIMIT 1;

  IF v_inv_gross IS NOT NULL THEN v_expected := v_inv_gross;
  ELSIF v_charges > 0 THEN v_expected := v_charges;
  ELSIF v_agreed IS NOT NULL THEN v_expected := v_agreed;
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
    'change_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'submitted_at',submitted_at,'response_message',response_message,'responded_at',responded_at,'origin',origin,'submitted_by',submitted_by,'responded_by',responded_by,
      'last_message_at', last_message_at, 'last_message_from', last_message_from, 'closed_at', closed_at,
      -- Everything said after the opening ask, oldest first, from both sides. The opening ask
      -- itself is `body` above; the portal draws it as the first bubble.
      'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', m.id, 'author', m.author, 'author_name', m.author_name,
            'body', m.body, 'created_at', m.created_at) ORDER BY m.created_at)
          FROM retreat_request_messages m WHERE m.request_id = cr.id), '[]'::jsonb)
      ) ORDER BY submitted_at DESC) FROM retreat_change_requests cr WHERE retreat_id=r.id), '[]'::jsonb),
    'feedback_submitted', EXISTS(SELECT 1 FROM retreat_feedback WHERE retreat_id=r.id),
    'unlocked', v_unlocked,
    'verify_email_hint', CASE WHEN r.coordinator_email IS NULL THEN NULL
      ELSE regexp_replace(r.coordinator_email, '^(.).*(.)@', '\1***\2@') END);
END $function$;
