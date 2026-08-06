-- Guest portal: report per-room availability so a coordinator picking cabins can see what
-- is actually free for THEIR dates instead of choosing blind and being told later.
--
-- A room is unavailable when another non-cancelled retreat whose stay overlaps these dates
-- already has it assigned. Deliberately a boolean only: the portal is an unauthenticated
-- surface, so it must not leak which group holds the room.
CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r retreats; v_charges numeric; v_paid numeric; v_deposit numeric; v_camp text;
        v_nights int; v_expected numeric; v_inv_gross numeric;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT name INTO v_camp FROM camps WHERE id = r.camp_id;
  SELECT COALESCE(sum(amount),0) INTO v_charges FROM retreat_charges WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_paid FROM retreat_payments WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_deposit FROM retreat_payments WHERE retreat_id = r.id AND kind = 'deposit';
  v_nights := GREATEST(0, (r.departure_date - r.arrival_date));

  SELECT sum((li->>'amount')::numeric) INTO v_inv_gross
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
      ELSE COALESCE(r.rate_per_person_night,0) * r.headcount * v_nights
    END;
  END IF;

  RETURN jsonb_build_object(
    'retreat', jsonb_build_object(
      'id', r.id, 'group_name', r.group_name, 'group_type', r.group_type,
      'camp_name', v_camp,
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
      'total_charges', v_expected, 'total_paid', v_paid, 'balance_due', v_expected - v_paid),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'doc_type',doc_type,'name',name,'status',status,'due_date',due_date,'signed_at',signed_at,'signed_by',signed_by,'meta',meta,'has_file',(file_path IS NOT NULL)) ORDER BY sort_order) FROM retreat_documents WHERE retreat_id=r.id), '[]'::jsonb),
    'invoices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'number',number,'amount',amount,'note',note,'due_date',due_date,'status',status,'line_items',line_items,'issued_at',issued_at) ORDER BY issued_at DESC) FROM retreat_invoices WHERE retreat_id=r.id AND status <> 'draft'), '[]'::jsonb),
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
    'housing', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',location_id,'space_name',space_name,'subgroup_name',subgroup_name,'people_count',people_count,'notes',notes,'locked',locked) ORDER BY sort_order) FROM retreat_housing WHERE retreat_id=r.id), '[]'::jsonb),
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
    'change_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'submitted_at',submitted_at,'response_message',response_message,'responded_at',responded_at) ORDER BY submitted_at DESC) FROM retreat_change_requests WHERE retreat_id=r.id), '[]'::jsonb),
    'feedback_submitted', EXISTS(SELECT 1 FROM retreat_feedback WHERE retreat_id=r.id));
END $function$;
