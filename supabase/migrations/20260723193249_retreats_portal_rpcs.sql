-- Guest portal backend. Anon guests reach /portal/:token; every read/write goes through
-- these token-validated SECURITY DEFINER RPCs, so no table is exposed to anon directly.

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
      'total_charges', v_charges, 'total_paid', v_paid, 'balance_due', v_charges - v_paid),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'doc_type',doc_type,'name',name,'status',status,'due_date',due_date,'signed_at',signed_at,'signed_by',signed_by,'meta',meta) ORDER BY sort_order) FROM retreat_documents WHERE retreat_id=r.id), '[]'::jsonb),
    'spaces', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'bed_capacity',bed_capacity,'accessible',accessible) ORDER BY sort_order) FROM retreat_spaces WHERE camp_id=r.camp_id), '[]'::jsonb),
    'housing', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',space_id,'space_name',space_name,'subgroup_name',subgroup_name,'people_count',people_count,'notes',notes,'locked',locked) ORDER BY sort_order) FROM retreat_housing WHERE retreat_id=r.id), '[]'::jsonb),
    'meals', CASE WHEN r.menu_published THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('day_date',day_date,'meal_period',meal_period,'name',name,'items',items,'allergens',allergens,'alternatives',alternatives) ORDER BY day_date, sort_order) FROM retreat_meals WHERE retreat_id=r.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'change_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'submitted_at',submitted_at,'response_message',response_message,'responded_at',responded_at) ORDER BY submitted_at DESC) FROM retreat_change_requests WHERE retreat_id=r.id), '[]'::jsonb),
    'feedback_submitted', EXISTS(SELECT 1 FROM retreat_feedback WHERE retreat_id=r.id));
END $$;
GRANT EXECUTE ON FUNCTION get_portal_data(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION portal_submit_change_request(p_token text, p_kind text, p_body text, p_submitted_by text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats; new_id uuid;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal token'; END IF;
  IF NOT r.change_requests_enabled THEN RAISE EXCEPTION 'Change requests are not enabled for this retreat'; END IF;
  INSERT INTO retreat_change_requests (camp_id, retreat_id, kind, body, submitted_by, status)
  VALUES (r.camp_id, r.id, COALESCE(NULLIF(p_kind,''),'other'), p_body, p_submitted_by, 'pending') RETURNING id INTO new_id;
  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION portal_submit_change_request(text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION portal_sign_document(p_token text, p_doc_id uuid, p_signed_by text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal token'; END IF;
  UPDATE retreat_documents SET status='signed', signed_by=p_signed_by, signed_at=now(), updated_at=now()
  WHERE id = p_doc_id AND retreat_id = r.id;
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION portal_sign_document(text,uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION portal_submit_housing(p_token text, p_assignments jsonb, p_submitted_by text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats; a jsonb;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal token'; END IF;
  IF EXISTS(SELECT 1 FROM retreat_housing WHERE retreat_id = r.id AND locked) THEN
    RAISE EXCEPTION 'Housing is locked for this retreat'; END IF;
  DELETE FROM retreat_housing WHERE retreat_id = r.id AND NOT locked;
  FOR a IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    INSERT INTO retreat_housing (camp_id, retreat_id, space_id, space_name, subgroup_name, people_count, notes)
    VALUES (r.camp_id, r.id, NULLIF(a->>'space_id','')::uuid,
      (SELECT name FROM retreat_spaces WHERE id = NULLIF(a->>'space_id','')::uuid),
      a->>'subgroup_name', COALESCE((a->>'people_count')::int,0), a->>'notes');
  END LOOP;
  INSERT INTO retreat_housing_versions (camp_id, retreat_id, version, label, summary, created_by)
  VALUES (r.camp_id, r.id, COALESCE((SELECT max(version) FROM retreat_housing_versions WHERE retreat_id=r.id),0)+1,
    'Group submission', 'Housing preferences submitted via guest portal', p_submitted_by);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION portal_submit_housing(text,jsonb,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION portal_submit_feedback(p_token text, p_overall numeric, p_accommodations numeric, p_food numeric, p_communication numeric, p_comment text, p_returning text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats; new_id uuid;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid portal token'; END IF;
  INSERT INTO retreat_feedback (camp_id, retreat_id, overall, accommodations, food, communication, comment, returning_status)
  VALUES (r.camp_id, r.id, p_overall, p_accommodations, p_food, p_communication, p_comment, p_returning) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION portal_submit_feedback(text,numeric,numeric,numeric,numeric,text,text) TO anon, authenticated;
