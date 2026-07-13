-- Commissary phase 3b: cycle-menu templates.
-- Camps run a repeating rotation built once and applied to each session. A template
-- is a session-free menu; applying it writes concrete menu_entries you then tweak.

CREATE TABLE menu_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name         text NOT NULL,
  length_weeks int NOT NULL DEFAULT 1 CHECK (length_weeks BETWEEN 1 AND 6),
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE menu_templates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_menu_templates_updated_at BEFORE UPDATE ON menu_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX menu_templates_camp_idx ON menu_templates(camp_id);
CREATE POLICY "members_select_menu_templates" ON menu_templates FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_menu_templates" ON menu_templates FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

CREATE TABLE menu_template_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES menu_templates(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number >= 1),
  day_index   int NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  meal_period text NOT NULL CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  recipe_id   uuid REFERENCES recipes(id) ON DELETE SET NULL,
  label       text,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CHECK (recipe_id IS NOT NULL OR label IS NOT NULL)
);
ALTER TABLE menu_template_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_menu_template_entries_updated_at BEFORE UPDATE ON menu_template_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX menu_template_entries_template_idx ON menu_template_entries(template_id, week_number);
CREATE POLICY "members_select_menu_template_entries" ON menu_template_entries FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_menu_template_entries" ON menu_template_entries FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- Provenance only; menu_entries stay independent concrete copies once applied.
ALTER TABLE menu_entries
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES menu_templates(id) ON DELETE SET NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE menu_templates, menu_template_entries;
ALTER TABLE public.menu_templates        REPLICA IDENTITY FULL;
ALTER TABLE public.menu_template_entries REPLICA IDENTITY FULL;
