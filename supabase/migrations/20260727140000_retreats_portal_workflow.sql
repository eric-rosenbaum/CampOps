-- Guest-portal workflow redesign: deposit due date + guest-confirmed final headcount.
-- Deadlines the portal shows: agreement (document.due_date), deposit (deposit_due),
-- housing (housing_deadline, default arrival-7d in UI), final headcount (headcount_cutoff,
-- default arrival-14d in UI), COI (coi document.due_date, default before arrival).

ALTER TABLE retreats
  ADD COLUMN IF NOT EXISTS deposit_due            date,
  ADD COLUMN IF NOT EXISTS final_headcount        integer,
  ADD COLUMN IF NOT EXISTS final_headcount_at     timestamptz,
  ADD COLUMN IF NOT EXISTS final_headcount_by     text;

-- Extend the portal read with deposit + deadline + final-headcount fields.
CREATE OR REPLACE FUNCTION get_portal_data(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats; v_charges numeric; v_paid numeric;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount),0) INTO v_charges FROM retreat_charges WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_paid FROM retreat_payments WHERE retreat_id = r.id;
  RETURN jsonb_build_object(
    'retreat', jsonb_build_object(
      'id', r.id, 'group_name', r.group_name, 'group_type', r.group_type,
      'arrival_date', r.arrival_date, 'departure_date', r.departure_date,
      'headcount', r.headcount, 'coordinator_name', r.coordinator_name,
      'status', r.status, 'dietary_flags', r.dietary_flags,
      'menu_published', r.menu_published, 'change_requests_enabled', r.change_requests_enabled,
      'feedback_opens', r.feedback_opens, 'housing_deadline', r.housing_deadline,
      'headcount_cutoff', r.headcount_cutoff,
      'deposit_required', r.deposit_required, 'deposit_received', r.deposit_received,
      'deposit_due', r.deposit_due,
      'final_headcount', r.final_headcount, 'final_headcount_at', r.final_headcount_at,
      'final_headcount_by', r.final_headcount_by,
      'total_charges', v_charges, 'total_paid', v_paid, 'balance_due', v_charges - v_paid),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'doc_type',doc_type,'name',name,'status',status,'due_date',due_date,'signed_at',signed_at,'signed_by',signed_by,'meta',meta,'has_file',(file_path IS NOT NULL)) ORDER BY sort_order) FROM retreat_documents WHERE retreat_id=r.id), '[]'::jsonb),
    'spaces', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'bed_capacity',bed_capacity,'accessible',accessible) ORDER BY sort_order, name) FROM locations WHERE camp_id=r.camp_id AND is_dorm AND retreat_available AND is_active), '[]'::jsonb),
    'housing', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',location_id,'space_name',space_name,'subgroup_name',subgroup_name,'people_count',people_count,'notes',notes,'locked',locked) ORDER BY sort_order) FROM retreat_housing WHERE retreat_id=r.id), '[]'::jsonb),
    'meals', CASE WHEN r.menu_published THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('day_date',day_date,'meal_period',meal_period,'name',name,'items',items,'allergens',allergens,'alternatives',alternatives) ORDER BY day_date, sort_order) FROM retreat_meals WHERE retreat_id=r.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'change_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'submitted_at',submitted_at,'response_message',response_message,'responded_at',responded_at) ORDER BY submitted_at DESC) FROM retreat_change_requests WHERE retreat_id=r.id), '[]'::jsonb),
    'feedback_submitted', EXISTS(SELECT 1 FROM retreat_feedback WHERE retreat_id=r.id));
END $$;
GRANT EXECUTE ON FUNCTION get_portal_data(text) TO anon, authenticated;

-- Guest confirms their final headcount from the portal.
CREATE OR REPLACE FUNCTION portal_confirm_headcount(p_token text, p_headcount integer, p_submitted_by text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal token'; END IF;
  IF p_headcount IS NULL OR p_headcount < 0 THEN RAISE EXCEPTION 'Invalid headcount'; END IF;
  UPDATE retreats
    SET final_headcount = p_headcount,
        final_headcount_at = now(),
        final_headcount_by = NULLIF(p_submitted_by,''),
        updated_at = now()
    WHERE id = r.id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION portal_confirm_headcount(text,integer,text) TO anon, authenticated;
