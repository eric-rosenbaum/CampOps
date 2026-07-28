-- Structured, recipe-based retreat menus (commissary retreats mode). Mirrors menu_entries
-- but keyed by retreat + absolute date. Drives combined ordering + the guest portal menu.
CREATE TABLE IF NOT EXISTS retreat_menu_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  meal_period text NOT NULL,
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_qty_base numeric,
  label text,
  allergens text[],
  alternatives text,
  portions_override integer,   -- null = use the retreat's headcount
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE retreat_menu_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retreat_menu_entries_retreat_id_idx ON retreat_menu_entries(retreat_id);
CREATE INDEX IF NOT EXISTS retreat_menu_entries_camp_id_idx ON retreat_menu_entries(camp_id);
CREATE POLICY "members_select_retreat_menu_entries" ON retreat_menu_entries FOR SELECT USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_retreat_menu_entries" ON retreat_menu_entries FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));
ALTER PUBLICATION supabase_realtime ADD TABLE retreat_menu_entries;
ALTER TABLE public.retreat_menu_entries REPLICA IDENTITY FULL;
CREATE TRIGGER trg_retreat_menu_entries_updated_at BEFORE UPDATE ON retreat_menu_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
