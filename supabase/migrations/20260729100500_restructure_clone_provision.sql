-- Phase 1/2 backend: provisioning, deep-clone (for demos/trials), trial expiry.
-- clone_camp deep-copies a camp in FK-dependency order (no superuser needed): every intra-camp
-- row id + camp_id is remapped via one map; user-ids/external refs stay; the single
-- building_components↔building_circuits cycle is broken by nulling controlling_circuit_id then
-- updating it; retreats.portal_token is regenerated (globally unique).

CREATE OR REPLACE FUNCTION public.clone_camp(p_source uuid, p_new_name text, p_account_type text DEFAULT 'trial', p_trial_days int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new uuid := gen_random_uuid();
  v_tbl text; v_col record; v_cols text; v_sel text; v_expr text;
  v_order text[] := ARRAY[
    'location_categories','locations','buildings','building_rooms','building_components','building_circuits',
    'building_details','building_seasonal_tasks','pools','pool_equipment','pool_inspections','pool_inspection_log',
    'pool_chemical_readings','pool_seasonal_tasks','pool_service_log','commissary_vendors','inventory_items',
    'commissary_item_vendors','inventory_adjustments','commissary_sessions','campers','camper_restrictions',
    'camper_sessions','commissary_diet_counts','commissary_expenses','commissary_files','commissary_meal_events',
    'commissary_menu_courses','commissary_count_sessions','recipes','recipe_ingredients','recipe_steps',
    'menu_templates','menu_template_entries','menu_entries','menu_substitutions','production_plans','production_tasks',
    'production_prep_tasks','purchase_orders','purchase_order_lines','seasons','staff_groups','safety_staff',
    'staff_certifications','safety_items','safety_inspection_log','safety_temp_logs','safety_drills','safety_licenses',
    'commissary_storage_map','camp_assets','asset_maintenance_tasks','asset_service_records','issues','issue_activity',
    'asset_checkouts','checklist_tasks','checklist_activity','retreats','retreat_spaces','retreat_housing',
    'retreat_housing_versions','retreat_change_requests','retreat_charges','retreat_checklist','retreat_costs',
    'retreat_documents','retreat_feedback','retreat_invoices','retreat_issues','retreat_meals','retreat_menu_entries',
    'retreat_payments','retreat_reminders','retreat_schedule_items'];
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can clone camps'; END IF;
  IF p_account_type NOT IN ('customer','trial','demo','internal') THEN RAISE EXCEPTION 'bad account_type'; END IF;

  CREATE TEMP TABLE _clone_map(old uuid PRIMARY KEY, new uuid) ON COMMIT DROP;
  INSERT INTO _clone_map VALUES (p_source, v_new);
  FOREACH v_tbl IN ARRAY v_order LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_tbl AND column_name='id') THEN
      EXECUTE format('INSERT INTO _clone_map(old,new) SELECT id, gen_random_uuid() FROM %I WHERE camp_id=$1 ON CONFLICT DO NOTHING', v_tbl) USING p_source;
    END IF;
  END LOOP;

  INSERT INTO camps (id, name, slug, logo_url, address_line1, city, state, country, camp_type,
    approximate_capacity, modules, created_at, updated_at, locations, dietary_defaults,
    org_id, account_type, status, plan, trial_ends_at, is_seed, provisioned_by, provisioned_at)
  SELECT v_new, p_new_name, left(slug,40) || '-' || substr(v_new::text,1,8), logo_url, address_line1, city, state, country, camp_type,
    approximate_capacity, modules, now(), now(), locations, dietary_defaults,
    org_id, p_account_type, 'active', plan,
    CASE WHEN p_trial_days IS NOT NULL THEN now() + make_interval(days => p_trial_days) ELSE NULL END,
    false, auth.uid(), now()
  FROM camps WHERE id = p_source;

  DELETE FROM location_categories WHERE camp_id = v_new;  -- clear trigger-seeded presets

  FOREACH v_tbl IN ARRAY v_order LOOP
    v_cols := ''; v_sel := '';
    FOR v_col IN SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=v_tbl ORDER BY ordinal_position LOOP
      v_cols := v_cols || format('%I,', v_col.column_name);
      IF v_tbl='building_components' AND v_col.column_name='controlling_circuit_id' THEN
        v_expr := 'NULL::uuid';
      ELSIF v_tbl='retreats' AND v_col.column_name='portal_token' THEN
        v_expr := 'replace(gen_random_uuid()::text,''-'','''')';
      ELSIF v_col.udt_name = 'uuid' THEN
        v_expr := format('COALESCE((SELECT m.new FROM _clone_map m WHERE m.old=t.%I), t.%I)', v_col.column_name, v_col.column_name);
      ELSIF v_col.udt_name = '_uuid' THEN
        v_expr := format('COALESCE((SELECT array_agg(COALESCE((SELECT m.new FROM _clone_map m WHERE m.old=e), e)) FROM unnest(t.%I) e), t.%I)', v_col.column_name, v_col.column_name);
      ELSE
        v_expr := format('t.%I', v_col.column_name);
      END IF;
      v_sel := v_sel || v_expr || ',';
    END LOOP;
    v_cols := rtrim(v_cols, ','); v_sel := rtrim(v_sel, ',');
    EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM %I t WHERE t.camp_id=$1', v_tbl, v_cols, v_sel, v_tbl) USING p_source;
  END LOOP;

  UPDATE building_components dst
    SET controlling_circuit_id = (SELECT m2.new FROM _clone_map m2 WHERE m2.old = src.controlling_circuit_id)
  FROM building_components src JOIN _clone_map m1 ON m1.old = src.id
  WHERE src.camp_id = p_source AND dst.id = m1.new AND src.controlling_circuit_id IS NOT NULL;

  RETURN v_new;
END $$;
REVOKE EXECUTE ON FUNCTION public.clone_camp(uuid,text,text,int) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_camp(uuid,text,text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.clone_camp_coverage_gaps()
RETURNS TABLE(missing_table text) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.table_name
  FROM (SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='camp_id') c
  WHERE c.table_name <> ALL (ARRAY['camp_members','camp_invitations','camp_join_codes','audit_log'])
    AND c.table_name <> ALL (ARRAY[
    'location_categories','locations','buildings','building_rooms','building_components','building_circuits',
    'building_details','building_seasonal_tasks','pools','pool_equipment','pool_inspections','pool_inspection_log',
    'pool_chemical_readings','pool_seasonal_tasks','pool_service_log','commissary_vendors','inventory_items',
    'commissary_item_vendors','inventory_adjustments','commissary_sessions','campers','camper_restrictions',
    'camper_sessions','commissary_diet_counts','commissary_expenses','commissary_files','commissary_meal_events',
    'commissary_menu_courses','commissary_count_sessions','recipes','recipe_ingredients','recipe_steps',
    'menu_templates','menu_template_entries','menu_entries','menu_substitutions','production_plans','production_tasks',
    'production_prep_tasks','purchase_orders','purchase_order_lines','seasons','staff_groups','safety_staff',
    'staff_certifications','safety_items','safety_inspection_log','safety_temp_logs','safety_drills','safety_licenses',
    'commissary_storage_map','camp_assets','asset_maintenance_tasks','asset_service_records','issues','issue_activity',
    'asset_checkouts','checklist_tasks','checklist_activity','retreats','retreat_spaces','retreat_housing',
    'retreat_housing_versions','retreat_change_requests','retreat_charges','retreat_checklist','retreat_costs',
    'retreat_documents','retreat_feedback','retreat_invoices','retreat_issues','retreat_meals','retreat_menu_entries',
    'retreat_payments','retreat_reminders','retreat_schedule_items']);
$$;

CREATE OR REPLACE FUNCTION public.provision_camp(p_name text, p_slug text, p_account_type text DEFAULT 'customer', p_plan text DEFAULT NULL, p_org_id uuid DEFAULT NULL, p_trial_days int DEFAULT NULL, p_camp_type text DEFAULT NULL, p_state text DEFAULT NULL, p_modules jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE v_id uuid; v_modules jsonb;
  BEGIN
    IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Only platform admins can provision camps'; END IF;
    v_modules := COALESCE(p_modules, '{"issues":true,"pool":false,"staff":true,"checklists":true,"safety":true,"kitchen":false,"drills":false,"assets":false}'::jsonb);
    INSERT INTO camps (name, slug, camp_type, state, modules, account_type, status, plan, org_id, trial_ends_at, provisioned_by, provisioned_at)
    VALUES (p_name, p_slug, p_camp_type, p_state, v_modules, p_account_type, 'active', p_plan, p_org_id,
      CASE WHEN p_trial_days IS NOT NULL THEN now() + make_interval(days => p_trial_days) ELSE NULL END, auth.uid(), now())
    RETURNING id INTO v_id;
    RETURN v_id;
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.provision_camp(text,text,text,text,uuid,int,text,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_camp(text,text,text,text,uuid,int,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE camps SET status='trial_expired', updated_at=now()
  WHERE account_type='trial' AND status='active' AND trial_ends_at IS NOT NULL AND trial_ends_at < now();
$$;
REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM anon, authenticated;
