-- Generated invoices (deposit or balance) the camp sends to a group; delivered via the
-- guest portal. line_items is a snapshot at issue time so the invoice is immutable.
CREATE TABLE IF NOT EXISTS retreat_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'balance' CHECK (kind IN ('deposit','balance')),
  number text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  due_date date,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('draft','sent','paid','void')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{description, amount}]
  issued_at timestamptz DEFAULT now(),
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE retreat_invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retreat_invoices_retreat_id_idx ON retreat_invoices(retreat_id);
CREATE INDEX IF NOT EXISTS retreat_invoices_camp_id_idx ON retreat_invoices(camp_id);
CREATE POLICY "members_select_retreat_invoices" ON retreat_invoices FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_retreat_invoices" ON retreat_invoices FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));
ALTER PUBLICATION supabase_realtime ADD TABLE retreat_invoices;
ALTER TABLE public.retreat_invoices REPLICA IDENTITY FULL;
CREATE TRIGGER trg_retreat_invoices_updated_at BEFORE UPDATE ON retreat_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Portal: expose camp name (invoice header) + the sent invoices for this retreat.
CREATE OR REPLACE FUNCTION get_portal_data(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r retreats; v_charges numeric; v_paid numeric; v_deposit numeric; v_camp text;
BEGIN
  SELECT * INTO r FROM retreats WHERE portal_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT name INTO v_camp FROM camps WHERE id = r.camp_id;
  SELECT COALESCE(sum(amount),0) INTO v_charges FROM retreat_charges WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_paid FROM retreat_payments WHERE retreat_id = r.id;
  SELECT COALESCE(sum(amount),0) INTO v_deposit FROM retreat_payments WHERE retreat_id = r.id AND kind = 'deposit';
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
      'deposit_required', r.deposit_required,
      'deposit_received', GREATEST(COALESCE(r.deposit_received,0), v_deposit),
      'deposit_due', r.deposit_due,
      'final_headcount', r.final_headcount, 'final_headcount_at', r.final_headcount_at,
      'final_headcount_by', r.final_headcount_by,
      'total_charges', v_charges, 'total_paid', v_paid, 'balance_due', v_charges - v_paid),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'doc_type',doc_type,'name',name,'status',status,'due_date',due_date,'signed_at',signed_at,'signed_by',signed_by,'meta',meta,'has_file',(file_path IS NOT NULL)) ORDER BY sort_order) FROM retreat_documents WHERE retreat_id=r.id), '[]'::jsonb),
    'invoices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'number',number,'amount',amount,'note',note,'due_date',due_date,'status',status,'line_items',line_items,'issued_at',issued_at) ORDER BY issued_at DESC) FROM retreat_invoices WHERE retreat_id=r.id AND status <> 'draft'), '[]'::jsonb),
    'spaces', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'bed_capacity',bed_capacity,'accessible',accessible) ORDER BY sort_order, name) FROM locations WHERE camp_id=r.camp_id AND is_dorm AND retreat_available AND is_active), '[]'::jsonb),
    'housing', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'space_id',location_id,'space_name',space_name,'subgroup_name',subgroup_name,'people_count',people_count,'notes',notes,'locked',locked) ORDER BY sort_order) FROM retreat_housing WHERE retreat_id=r.id), '[]'::jsonb),
    'meals', CASE WHEN r.menu_published THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('day_date',day_date,'meal_period',meal_period,'name',name,'items',items,'allergens',allergens,'alternatives',alternatives) ORDER BY day_date, sort_order) FROM retreat_meals WHERE retreat_id=r.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'change_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'submitted_at',submitted_at,'response_message',response_message,'responded_at',responded_at) ORDER BY submitted_at DESC) FROM retreat_change_requests WHERE retreat_id=r.id), '[]'::jsonb),
    'feedback_submitted', EXISTS(SELECT 1 FROM retreat_feedback WHERE retreat_id=r.id));
END $$;
GRANT EXECUTE ON FUNCTION get_portal_data(text) TO anon, authenticated;
