-- Commissary allergy program: replacement meals.
--
-- The module could flag "this meal conflicts with 3 dairy-allergic campers" but never
-- recorded WHAT they eat instead. A substitution attaches an alternative main (+ side)
-- to a specific meal on the calendar, targeted at a restriction. It turns an open
-- warning ("3 affected") into a resolved plan ("3 affected — GF chicken + rice plated").
--
-- Each of main/side may point at a recipe, an inventory item, or be free text; a label
-- is always stored so the plate instruction reads even if a link is later deleted.
-- Access mirrors the rest of the menu (camp members read; staff manage) — a
-- substitution names a dish, not a camper, so it is not health-gated PII.

CREATE TABLE IF NOT EXISTS menu_substitutions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES commissary_sessions(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number >= 1),
  day_index   int NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  meal_period text NOT NULL CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  -- Restriction this alternative covers (allergen/dietary slug), or NULL = general.
  for_restriction text,
  main_recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  main_item_id   uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  main_label     text NOT NULL,
  side_recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  side_item_id   uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  side_label     text,
  notes      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE menu_substitutions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_menu_substitutions_updated_at BEFORE UPDATE ON menu_substitutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS menu_substitutions_session_week_idx ON menu_substitutions(session_id, week_number);
CREATE POLICY "members_select_menu_substitutions" ON menu_substitutions FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_menu_substitutions" ON menu_substitutions FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE menu_substitutions;
ALTER TABLE public.menu_substitutions REPLICA IDENTITY FULL;
