-- Commissary menu builder: single-ingredient menu items + camp-customizable courses.
--
-- Two additive changes to the menu model:
--
-- 1. A menu chip may now link directly to an INVENTORY ITEM, not only a recipe. A raw
--    item ("Whole milk", "Bananas") needs no recipe, but as a free-text chip it used
--    to contribute nothing to ordering demand or allergen totals. item_id + a
--    per-portion quantity make it a one-ingredient recipe for demand/allergen math.
--    A chip is now: a recipe, an item, or free text. label is always set (it is what
--    keeps the chip readable if a recipe/item is later deleted).
--
-- 2. Each chip may carry a COURSE ("Protein", "Side", "Dessert"), from a per-camp
--    customizable list (commissary_menu_courses). Optional — an unbucketed chip still
--    works, consistent with the module's "free text is allowed" philosophy.

ALTER TABLE menu_entries
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  -- Base-unit quantity of the item consumed PER PORTION (an item chip's "recipe").
  ADD COLUMN IF NOT EXISTS item_qty_base numeric,
  ADD COLUMN IF NOT EXISTS course text;

ALTER TABLE menu_template_entries
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_qty_base numeric,
  ADD COLUMN IF NOT EXISTS course text;

-- Per-camp course list. Ordered; edited from the menu builder settings.
CREATE TABLE IF NOT EXISTS commissary_menu_courses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id    uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (camp_id, name)
);
ALTER TABLE commissary_menu_courses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_menu_courses_updated_at BEFORE UPDATE ON commissary_menu_courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS commissary_menu_courses_camp_id_idx ON commissary_menu_courses(camp_id);
CREATE POLICY "members_select_commissary_menu_courses" ON commissary_menu_courses FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_commissary_menu_courses" ON commissary_menu_courses FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE commissary_menu_courses;
ALTER TABLE public.commissary_menu_courses REPLICA IDENTITY FULL;
