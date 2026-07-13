-- Recovered from the live migration ledger (applied out-of-band, no repo file).
-- Recreate the pool manage policies with an explicit WITH CHECK so INSERT is not
-- silently blocked (FOR ALL without WITH CHECK defaults to the USING expression only
-- for existing rows).
DROP POLICY IF EXISTS "staff_manage_equipment" ON pool_equipment;
CREATE POLICY "staff_manage_equipment" ON pool_equipment
  FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']));

DROP POLICY IF EXISTS "staff_manage_pool_inspections" ON pool_inspections;
CREATE POLICY "staff_manage_pool_inspections" ON pool_inspections
  FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']));

DROP POLICY IF EXISTS "staff_manage_pool_insp_log" ON pool_inspection_log;
CREATE POLICY "staff_manage_pool_insp_log" ON pool_inspection_log
  FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']));

DROP POLICY IF EXISTS "staff_manage_svc_log" ON pool_service_log;
CREATE POLICY "staff_manage_svc_log" ON pool_service_log
  FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) = ANY (ARRAY['admin', 'staff']));
