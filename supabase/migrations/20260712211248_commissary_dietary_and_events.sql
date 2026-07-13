-- Commissary phase 3c: camp-level dietary defaults, population diet counts,
-- meal-level head-count events.

-- A kosher/halal camp is a camp-level fact, not 220 per-camper flags.
ALTER TABLE camps
  ADD COLUMN IF NOT EXISTS dietary_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Replace update_camp with a version that can also set dietary_defaults. The old
-- 6-arg signature is dropped; existing 6-named-arg callers resolve to this one (the
-- new param defaults to null = leave unchanged).
DROP FUNCTION IF EXISTS public.update_camp(uuid, text, text, text, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.update_camp(
  p_camp_id uuid,
  p_name text DEFAULT NULL,
  p_camp_type text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_modules jsonb DEFAULT NULL,
  p_locations jsonb DEFAULT NULL,
  p_dietary_defaults jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NOT is_camp_admin(p_camp_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE camps SET
    name             = COALESCE(p_name, name),
    camp_type        = COALESCE(p_camp_type, camp_type),
    state            = COALESCE(p_state, state),
    modules          = COALESCE(p_modules, modules),
    locations        = COALESCE(p_locations, locations),
    dietary_defaults = COALESCE(p_dietary_defaults, dietary_defaults)
  WHERE id = p_camp_id;
END;
$function$;

-- Standing dietary counts for camps that know the number but not the names
-- ("42 vegetarian this session"). Complements per-camper camper_restrictions.
CREATE TABLE commissary_diet_counts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES commissary_sessions(id) ON DELETE CASCADE,
  restriction text NOT NULL,
  count       int NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (session_id, restriction)
);
ALTER TABLE commissary_diet_counts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_diet_counts_updated_at BEFORE UPDATE ON commissary_diet_counts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX commissary_diet_counts_session_idx ON commissary_diet_counts(session_id);
CREATE POLICY "members_select_diet_counts" ON commissary_diet_counts FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_diet_counts" ON commissary_diet_counts FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- Meal-level head-count overrides + bag lunches + special events.
-- meal_period NULL = whole day. absolute = "300 at visiting-day lunch";
-- delta = "-40 dinner (off-site)".
CREATE TABLE commissary_meal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES commissary_sessions(id) ON DELETE CASCADE,
  date        date NOT NULL,
  meal_period text CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  kind        text NOT NULL DEFAULT 'override' CHECK (kind IN ('override','bag_lunch','event')),
  count_mode  text NOT NULL DEFAULT 'absolute' CHECK (count_mode IN ('absolute','delta')),
  count       int NOT NULL DEFAULT 0,
  label       text NOT NULL,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE commissary_meal_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_meal_events_updated_at BEFORE UPDATE ON commissary_meal_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX commissary_meal_events_session_idx ON commissary_meal_events(session_id, date);
CREATE POLICY "members_select_meal_events" ON commissary_meal_events FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_meal_events" ON commissary_meal_events FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'))
  WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

ALTER PUBLICATION supabase_realtime ADD TABLE commissary_diet_counts, commissary_meal_events;
ALTER TABLE public.commissary_diet_counts REPLICA IDENTITY FULL;
ALTER TABLE public.commissary_meal_events REPLICA IDENTITY FULL;
