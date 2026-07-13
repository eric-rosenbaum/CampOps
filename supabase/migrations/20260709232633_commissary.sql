-- Commissary — phase 1: inventory, vendors, recipes, menu.
-- (Production guide, allergy program and purchase ordering land in later phases.)
--
-- THE UNIT MODEL, because it drives every table here:
--
-- Each inventory item declares a canonical `base_unit` (each / oz / fl oz) and two
-- pack factors that convert its human-facing units into that base:
--   stock_unit_in_base    -- 1 case of eggs = 360 each
--   purchase_unit_in_base -- 1 case of eggs = 360 each
-- Those factors are facts about the ITEM, not about units in general — no lookup
-- table can know that a case holds 30 dozen. So every quantity that participates in
-- arithmetic (on_hand, par_level, recipe ingredient qty, adjustments) is stored in
-- BASE UNITS, and display converts at the edges.
--
-- Separately, the client has a small static table of same-dimension conversions
-- (quart -> fl oz, lb -> oz, dozen -> each) used only to let a cook type "5.5 qt"
-- into a form. Those never touch stored values. See src/lib/commissaryUnits.ts.
--
-- Ordering math, once phase 2 lands, is then honest:
--   need_base  = SUM(recipe ingredient qty_in_base * (target_portions / base_yield))
--   order_qty  = ceil(max(need_base - on_hand_base, 0) / purchase_unit_in_base)
-- You cannot buy 1.82 cases of eggs, hence the ceil.

-- ─── Sessions ─────────────────────────────────────────────────────────────────
-- Distinct from `seasons` (which anchors the pre/post checklist to opening day).
-- A camp runs several sessions per season, each with its own head count, and the
-- head count is what every recipe yield and production quantity scales from.
CREATE TABLE commissary_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id      uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name         text NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  -- target_portions = camper_count + staff_count. Staff are counted separately
  -- because seasonal counselors eat but do not have app accounts.
  camper_count int NOT NULL DEFAULT 0 CHECK (camper_count >= 0),
  staff_count  int NOT NULL DEFAULT 0 CHECK (staff_count  >= 0),
  is_active    boolean NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CHECK (end_date >= start_date)
);
ALTER TABLE commissary_sessions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_sessions_updated_at BEFORE UPDATE ON commissary_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_commissary_sessions" ON commissary_sessions FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_commissary_sessions"   ON commissary_sessions FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Vendors ──────────────────────────────────────────────────────────────────
CREATE TABLE commissary_vendors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id        uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name           text NOT NULL,
  specialty      text,
  account_number text,
  rep_name       text,
  rep_email      text,
  rep_phone      text,
  order_cutoff   text,
  delivery_day   text,
  min_order      numeric(10,2),
  delivery_fee   numeric(10,2),
  notes          text,
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE commissary_vendors ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_commissary_vendors_updated_at BEFORE UPDATE ON commissary_vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE POLICY "members_select_commissary_vendors" ON commissary_vendors FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_commissary_vendors"   ON commissary_vendors FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Inventory items ──────────────────────────────────────────────────────────
CREATE TABLE inventory_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id   uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name      text NOT NULL,
  category  text NOT NULL DEFAULT 'other'
    CHECK (category IN ('protein','dairy','produce','dry_goods','pantry',
                        'frozen','snacks','beverage','other')),
  -- Soft link to the physical box. `safety_items` already logs walk-in fridge and
  -- freezer temperatures twice a day — same box, different module.
  storage_location text DEFAULT 'other'
    CHECK (storage_location IN ('walk_in_refrigerator','walk_in_freezer',
                                'dry_storage','reach_in_refrigerator','other')),

  -- Unit model. `dimension` constrains which same-dimension conversions the client
  -- may offer when someone types a recipe quantity.
  dimension text NOT NULL DEFAULT 'count'
    CHECK (dimension IN ('count','weight','volume')),
  base_unit text NOT NULL DEFAULT 'each',

  stock_unit          text NOT NULL DEFAULT 'each',
  stock_unit_in_base  numeric(14,6) NOT NULL DEFAULT 1 CHECK (stock_unit_in_base > 0),
  purchase_unit       text NOT NULL DEFAULT 'each',
  purchase_unit_in_base numeric(14,6) NOT NULL DEFAULT 1 CHECK (purchase_unit_in_base > 0),
  -- Price per ONE purchase unit (per case, per gallon, …).
  unit_price          numeric(10,2),

  -- Canonical quantities. Never write a display unit into these columns.
  on_hand_base   numeric(14,4) NOT NULL DEFAULT 0,
  par_level_base numeric(14,4) NOT NULL DEFAULT 0 CHECK (par_level_base >= 0),

  vendor_id uuid REFERENCES commissary_vendors(id) ON DELETE SET NULL,
  -- Canonical allergen slugs; see ALLERGENS in src/lib/commissaryUnits.ts.
  -- Allergens live on the ITEM. Recipes derive theirs by union, so re-tagging an
  -- ingredient once fixes every recipe that uses it.
  allergens text[] NOT NULL DEFAULT '{}',
  notes      text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX inventory_items_camp_id_idx ON inventory_items(camp_id);
CREATE INDEX inventory_items_vendor_id_idx ON inventory_items(vendor_id);
CREATE POLICY "members_select_inventory_items" ON inventory_items FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_inventory_items"   ON inventory_items FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Inventory adjustments ────────────────────────────────────────────────────
-- Append-only audit trail behind the "Adjust" action. `delta_base` is signed:
-- a delivery is positive, waste and production use are negative.
-- `resulting_on_hand_base` snapshots the running total so history stays readable
-- even after the item's pack factors are later edited.
CREATE TABLE inventory_adjustments (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  delta_base numeric(14,4) NOT NULL,
  resulting_on_hand_base numeric(14,4) NOT NULL,
  reason text NOT NULL DEFAULT 'other'
    CHECK (reason IN ('received','used','waste','count_correction','other')),
  notes       text,
  adjusted_by text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE INDEX inventory_adjustments_item_id_idx ON inventory_adjustments(item_id, created_at DESC);
CREATE POLICY "members_select_inventory_adjustments" ON inventory_adjustments FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_inventory_adjustments"   ON inventory_adjustments FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Recipes ──────────────────────────────────────────────────────────────────
CREATE TABLE recipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  name        text NOT NULL,
  meal_period text NOT NULL DEFAULT 'dinner'
    CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  -- Ingredient quantities are expressed per THIS many portions. Scaling to a
  -- session is qty_in_base * (target_portions / base_yield).
  base_yield int NOT NULL DEFAULT 50 CHECK (base_yield > 0),
  prep_time  text,
  cook_time  text,
  method     text,
  notes      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_recipes_updated_at BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX recipes_camp_id_idx ON recipes(camp_id);
CREATE POLICY "members_select_recipes" ON recipes FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_recipes"   ON recipes FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Recipe ingredients ───────────────────────────────────────────────────────
-- item_id NULL = an unlinked ingredient (salt, pepper, "1 bunch chives"). It shows
-- on the recipe card via free_text_qty but contributes nothing to demand or to the
-- allergen union — the same bargain the menu strikes with free-text chips.
--
-- allergen_override NULL = inherit the item's allergens. A non-null value (including
-- an empty array) replaces them, which is how "GF buns, separate prep" is expressed
-- on a recipe that otherwise contains gluten.
CREATE TABLE recipe_ingredients (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id   uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id   uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  -- Kept even when item_id is set, so a deleted item leaves a readable recipe.
  label     text NOT NULL,
  qty_in_base   numeric(14,4),
  free_text_qty text,
  allergen_override text[],
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- A linked ingredient must carry a real quantity; an unlinked one must not.
  CHECK ((item_id IS NOT NULL AND qty_in_base IS NOT NULL) OR item_id IS NULL)
);
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_recipe_ingredients_updated_at BEFORE UPDATE ON recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX recipe_ingredients_recipe_id_idx ON recipe_ingredients(recipe_id);
CREATE INDEX recipe_ingredients_item_id_idx   ON recipe_ingredients(item_id);
CREATE POLICY "members_select_recipe_ingredients" ON recipe_ingredients FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_recipe_ingredients"   ON recipe_ingredients FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Recipe steps ─────────────────────────────────────────────────────────────
CREATE TABLE recipe_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  recipe_id   uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number int NOT NULL,
  instruction text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_recipe_steps_updated_at BEFORE UPDATE ON recipe_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX recipe_steps_recipe_id_idx ON recipe_steps(recipe_id, step_number);
CREATE POLICY "members_select_recipe_steps" ON recipe_steps FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_recipe_steps"   ON recipe_steps FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Menu entries ─────────────────────────────────────────────────────────────
-- One chip on the weekly grid. day_index 0..6 counts from the start of the week;
-- the calendar date is session.start_date + (week_number-1)*7 + day_index.
--
-- recipe_id NULL + label set = a free-text chip ("Salad bar", "OJ / Milk"). Real
-- camp menus are full of them and banning them makes the builder unusable. They
-- are excluded from demand and allergen computation, and the UI marks them so the
-- resulting gap in the order is visible rather than a surprise.
CREATE TABLE menu_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id     uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES commissary_sessions(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number >= 1),
  day_index   int NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  meal_period text NOT NULL
    CHECK (meal_period IN ('breakfast','lunch','dinner','snack')),
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  label     text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- A chip is either a recipe or a free-text label. If a recipe is deleted the FK
  -- nulls out, and `label` is what keeps the chip readable — so it is always set.
  CHECK (recipe_id IS NOT NULL OR label IS NOT NULL)
);
ALTER TABLE menu_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_menu_entries_updated_at BEFORE UPDATE ON menu_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX menu_entries_session_week_idx ON menu_entries(session_id, week_number);
CREATE INDEX menu_entries_recipe_id_idx    ON menu_entries(recipe_id);
CREATE POLICY "members_select_menu_entries" ON menu_entries FOR SELECT
  USING (is_camp_member(camp_id));
CREATE POLICY "staff_manage_menu_entries"   ON menu_entries FOR ALL
  USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN ('admin','staff'));

-- ─── Stock adjustment RPC ─────────────────────────────────────────────────────
-- Moving stock touches two tables and must be atomic: if the item update lands but
-- the audit row does not, the trail silently disagrees with the shelf.
--
-- It also has to be a read-modify-write inside the database. Two people counting
-- the same walk-in on two phones would each compute `on_hand + delta` from a stale
-- snapshot and the second write would erase the first. `SET on_hand_base =
-- on_hand_base + p_delta_base` is evaluated against the current row under lock, so
-- concurrent adjustments compose instead of clobbering.
--
-- SECURITY INVOKER (the default) on purpose — the existing RLS policies on
-- inventory_items and inventory_adjustments already say who may write, so this
-- function needs no authorization logic of its own and cannot be used to bypass it.
CREATE OR REPLACE FUNCTION public.adjust_inventory_item(
  p_item_id     uuid,
  p_delta_base  numeric,
  p_reason      text DEFAULT 'other',
  p_notes       text DEFAULT NULL,
  p_adjusted_by text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql AS $function$
DECLARE
  v_camp_id     uuid;
  v_new_on_hand numeric;
BEGIN
  -- Stock cannot go negative; a "used 20 lb" against 15 lb on hand settles at 0.
  -- The adjustment row still records the full delta that was claimed.
  UPDATE public.inventory_items
  SET on_hand_base = GREATEST(0, on_hand_base + p_delta_base),
      updated_at   = now()
  WHERE id = p_item_id
  RETURNING camp_id, on_hand_base INTO v_camp_id, v_new_on_hand;

  IF v_camp_id IS NULL THEN
    RAISE EXCEPTION 'Inventory item % not found or not permitted', p_item_id;
  END IF;

  INSERT INTO public.inventory_adjustments
    (camp_id, item_id, delta_base, resulting_on_hand_base, reason, notes, adjusted_by)
  VALUES
    (v_camp_id, p_item_id, p_delta_base, v_new_on_hand, p_reason, p_notes, p_adjusted_by);

  RETURN v_new_on_hand;
END;
$function$;

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Deliberately split across three subscription domains in db.ts (inventory /
-- catalog / menu) so that adjusting one item's stock does not force a refetch of
-- every recipe and every menu chip. Commissary is the first module large enough
-- that the app's reload-the-whole-domain-on-any-WAL-event pattern would hurt.
ALTER PUBLICATION supabase_realtime ADD TABLE
  commissary_sessions,
  commissary_vendors,
  inventory_items,
  inventory_adjustments,
  recipes,
  recipe_ingredients,
  recipe_steps,
  menu_entries;

-- Replica identity is set in the migration immediately after this one.
