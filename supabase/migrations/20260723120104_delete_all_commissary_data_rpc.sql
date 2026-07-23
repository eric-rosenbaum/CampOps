-- Wipe ALL commissary data for one camp (testing / clearing sample data / fresh start).
-- Camp-scoped: never touches the global product_catalog or any other camp. SECURITY
-- INVOKER so per-table RLS applies; the explicit role check gives a clean error to
-- anyone who isn't an admin/staff of the camp. FK-safe deletion order.
CREATE OR REPLACE FUNCTION delete_all_commissary_data(p_camp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NOT (is_camp_member(p_camp_id) AND get_camp_role(p_camp_id) IN ('admin','staff')) THEN
    RAISE EXCEPTION 'Not authorized to wipe commissary data for this camp';
  END IF;

  DELETE FROM production_prep_tasks     WHERE camp_id = p_camp_id;
  DELETE FROM production_tasks          WHERE camp_id = p_camp_id;
  DELETE FROM production_plans          WHERE camp_id = p_camp_id;
  DELETE FROM purchase_order_lines      WHERE camp_id = p_camp_id;
  DELETE FROM purchase_orders           WHERE camp_id = p_camp_id;
  DELETE FROM commissary_expenses       WHERE camp_id = p_camp_id;
  DELETE FROM menu_entries              WHERE camp_id = p_camp_id;
  DELETE FROM menu_substitutions        WHERE camp_id = p_camp_id;
  DELETE FROM menu_template_entries     WHERE camp_id = p_camp_id;
  DELETE FROM menu_templates            WHERE camp_id = p_camp_id;
  DELETE FROM commissary_diet_counts    WHERE camp_id = p_camp_id;
  DELETE FROM commissary_meal_events    WHERE camp_id = p_camp_id;
  DELETE FROM commissary_menu_courses   WHERE camp_id = p_camp_id;
  DELETE FROM recipe_ingredients        WHERE camp_id = p_camp_id;
  DELETE FROM recipe_steps              WHERE camp_id = p_camp_id;
  DELETE FROM recipes                   WHERE camp_id = p_camp_id;
  DELETE FROM commissary_item_vendors   WHERE camp_id = p_camp_id;
  DELETE FROM inventory_adjustments     WHERE camp_id = p_camp_id;
  DELETE FROM commissary_count_sessions WHERE camp_id = p_camp_id;
  DELETE FROM commissary_storage_map    WHERE camp_id = p_camp_id;
  DELETE FROM camper_restrictions       WHERE camp_id = p_camp_id;
  DELETE FROM campers                   WHERE camp_id = p_camp_id;
  DELETE FROM commissary_files          WHERE camp_id = p_camp_id;
  DELETE FROM inventory_items           WHERE camp_id = p_camp_id;
  DELETE FROM commissary_vendors        WHERE camp_id = p_camp_id;
  DELETE FROM commissary_sessions       WHERE camp_id = p_camp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_all_commissary_data(uuid) TO authenticated;
