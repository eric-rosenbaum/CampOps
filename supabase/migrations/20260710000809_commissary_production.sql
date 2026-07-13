-- Commissary phase 2b: production guide.
--
-- Production tasks derive from menu x recipes, but they hold `is_complete` state, so
-- they must be real rows rather than a computed view. That creates the classic
-- conflict: the kitchen has ticked off half of Tuesday's prep and someone edits
-- Tuesday's menu. Auto-regeneration destroys work; never regenerating leaves a stale
-- plan silently wrong.
--
-- The answer is an explicit "generate plan for this day" action plus a stored
-- `menu_signature` (the day's menu entry ids + their latest updated_at). The UI
-- recomputes the signature on render and warns when it no longer matches. Nothing
-- regenerates on its own.

CREATE TABLE production_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES commissary_sessions(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number >= 1),
  day_index   int NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  -- Head count frozen at generation, so quantities stay reproducible even if the
  -- session roster changes afterwards.
  portions       int NOT NULL DEFAULT 0,
  menu_signature text NOT NULL DEFAULT '',
  generated_by   text,
  generated_at   timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (session_id, week_number, day_index)
);
ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_production_plans_updated_at BEFORE UPDATE ON production_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_production_plans" ON production_plans FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_production_plans"   ON production_plans FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- Scaled ingredient quantities are SNAPSHOT into `ingredients` jsonb rather than
-- recomputed on read: a cook working from a printed-out plan and a cook looking at the
-- screen must see the same numbers even if the recipe was edited mid-morning.
CREATE TABLE production_tasks (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  meal_period text NOT NULL
    CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  title       text NOT NULL,
  portions    int NOT NULL DEFAULT 0,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  allergens   text[] NOT NULL DEFAULT '{}',
  prep_time   text,
  cook_time   text,
  notes       text,
  is_complete  boolean NOT NULL DEFAULT false,
  completed_by text,
  completed_at timestamptz,
  sort_order   int DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE production_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_production_tasks_updated_at BEFORE UPDATE ON production_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX production_tasks_plan_id_idx ON production_tasks(plan_id);
CREATE POLICY "members_select_production_tasks" ON production_tasks FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_production_tasks"   ON production_tasks FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE production_plans, production_tasks;
ALTER TABLE public.production_plans REPLICA IDENTITY FULL;
ALTER TABLE public.production_tasks REPLICA IDENTITY FULL;
