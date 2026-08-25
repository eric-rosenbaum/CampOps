-- Commissary production: step-level prep tasks (the "Prep due today" board).
--
-- Dish tasks (production_tasks) are day-of and dish-level. But prep is time-phased -
-- a recipe step tagged "night before" must be done, and checked off, on a DIFFERENT day
-- than the meal is served. These rows are that: one per timed recipe step (and one per
-- auto freezer-pull) generated with a plan, scheduled to prep_date = serviceDate −
-- leadDays, and independently completable. This is what lets the Day plan show
-- everything due today, today's ahead-prep for upcoming meals plus today's cooking -
-- from a single, checkable board, and retires the old service-day "thaw list".

CREATE TABLE IF NOT EXISTS production_prep_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  plan_id      uuid NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  recipe_id    uuid REFERENCES recipes(id) ON DELETE SET NULL,
  -- The day this prep must be done (serviceDate − leadDays), and where in the day.
  prep_date    date NOT NULL,
  time_slot    text CHECK (time_slot IN ('morning','afternoon','evening')),
  meal_period  text NOT NULL CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  -- The day the resulting food is served, for the "serves Wed" hint.
  service_date date NOT NULL,
  title        text NOT NULL,
  instruction  text NOT NULL,
  portions     int NOT NULL DEFAULT 0,
  is_complete  boolean NOT NULL DEFAULT false,
  completed_by text,
  completed_at timestamptz,
  sort_order   int DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE production_prep_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_production_prep_tasks_updated_at BEFORE UPDATE ON production_prep_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS production_prep_tasks_plan_idx ON production_prep_tasks(plan_id);
CREATE INDEX IF NOT EXISTS production_prep_tasks_prep_date_idx ON production_prep_tasks(camp_id, prep_date);
CREATE POLICY "members_select_production_prep_tasks" ON production_prep_tasks FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_production_prep_tasks" ON production_prep_tasks FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE production_prep_tasks;
ALTER TABLE public.production_prep_tasks REPLICA IDENTITY FULL;
