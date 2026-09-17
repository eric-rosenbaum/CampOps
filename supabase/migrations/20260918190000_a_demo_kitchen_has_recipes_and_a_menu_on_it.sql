-- A demo's Kitchen Manager had a pantry and food requests but no recipes and an empty menu
-- builder, so the two tabs a kitchen manager opens first said "nothing here yet".
--
-- seed_demo_kitchen_internal writes a working kitchen into a DEMO camp:
--   * a current session (this week's Monday, four weeks, 120 campers + 40 staff);
--   * the pantry the recipes draw on, stocked for about a week and a half of this menu, with a
--     few items deliberately short so the inventory and the next order have something to say (existing items of the same name are not touched,
--     except the sample pantry this seed family owns, whose stock is set to kitchen scale);
--   * fifteen recipes with ingredients linked to those items, allergens that roll up, and prep
--     steps -- some timed the day before (thaw the chicken, chill the cookie dough);
--   * a four-week rotation on the menu builder: breakfast, lunch, dinner and snacks, by course;
--   * a few campers with allergies and dietary needs, so the allergy flags have something to show.
--     Meat and dairy meals are kept apart, so the menu reads correctly at a kosher camp and
--     unremarkably everywhere else.
--
-- Deterministic ids (demo_seed_uuid) make it re-runnable: reseeding rewrites the sample recipes
-- and menu and leaves anything a visitor added. It runs with the food-requests sample data, so
-- "Reset sample data" and "Spin up demo" both include it.

-- One menu cell. The menu builder shows an entry's label, which the app fills with the recipe's
-- name when a cook adds a dish; a seeded entry without it rendered as a row of dashes.
create or replace function public.demo_menu_recipe_internal(
  p_camp uuid, p_session uuid, p_key text, p_week integer, p_day integer, p_meal text,
  p_recipe integer, p_course text, p_sort integer)
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  insert into menu_entries (id, camp_id, session_id, week_number, day_index, meal_period, recipe_id, label, course, sort_order)
  select demo_seed_uuid(p_camp, p_key), p_camp, p_session, p_week, p_day, p_meal, r.id, r.name, p_course, p_sort
    from recipes r where r.id = demo_seed_uuid(p_camp, 'recipe:' || p_recipe);
$fn$;

revoke execute on function public.demo_menu_recipe_internal(uuid, uuid, text, integer, integer, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.demo_menu_recipe_internal(uuid, uuid, text, integer, integer, text, integer, text, integer) to service_role;

create or replace function public.seed_demo_kitchen_internal(p_camp uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_today   date := demo_camp_today(p_camp);
  v_monday  date := v_today - ((extract(isodow from v_today)::int) - 1);
  v_session uuid := demo_seed_uuid(p_camp, 'session:summer');
  v_vendor  uuid;
  v_rid     uuid;
  r record;
  v_n integer := 0;
  v_w integer; v_d integer;
begin
  select id into v_vendor from commissary_vendors where camp_id = p_camp and name = 'Northern Foodservice';
  if v_vendor is null then
    v_vendor := demo_seed_uuid(p_camp, 'vendor:northern');
    insert into commissary_vendors (id, camp_id, name, specialty, rep_email, delivery_day, delivery_fee, sort_order)
    values (v_vendor, p_camp, 'Northern Foodservice', 'Broadline', 'orders@example.com', 'monday', 0, 0)
    on conflict (id) do nothing;
  end if;

  -- ── Pantry ───────────────────────────────────────────────────────────────────────────────
  --  name                     category    storage                 dim      base   stock      in_base   purchase      purch_base  price   on_hand  min   allergens
  for r in select * from (values
    ('All-purpose flour',          'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '50 lb bag',   22679.6, 38.00, 150, 50, '{gluten}'),
    ('Large eggs',                 'dairy',     'walk_in_refrigerator', 'count',  'each', 'dozen', 12,      'case',        180,     54.00, 90, 30, '{egg}'),
    ('Whole milk',                 'dairy',     'walk_in_refrigerator', 'volume', 'ml',   'gal',   3785.41, 'case of 4',   15141.6, 19.00, 28, 10, '{dairy}'),
    ('Unsalted butter',            'dairy',     'walk_in_refrigerator', 'weight', 'g',    'lb',    453.592, '36 lb case',  16329.3, 142.00, 30, 10, '{dairy}'),
    ('Granulated sugar',           'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '50 lb bag',   22679.6, 31.00, 20, 6, '{}'),
    ('Semi-sweet chocolate chips', 'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '10 lb case',  4535.92, 61.00, 10, 6,  '{dairy,soy}'),
    ('Mini marshmallows',          'snacks',    'dry_storage',          'weight', 'g',    'bag',   283.495, 'case of 12',  3401.94, 26.50, 24, 8,  '{}'),
    ('Graham crackers',            'snacks',    'dry_storage',          'weight', 'g',    'box',   408.233, 'case of 12',  4898.8,  33.00, 24, 8,  '{gluten}'),
    ('Shredded mozzarella',        'dairy',     'walk_in_refrigerator', 'weight', 'g',    'lb',    453.592, '20 lb case',  9071.84, 88.00, 35, 25, '{dairy}'),
    ('Pizza sauce',                'pantry',    'dry_storage',          'volume', 'ml',   'can',   3000,    'case of 6',   18000,   36.00, 28, 10,  '{}'),
    ('Apples',                     'produce',   'walk_in_refrigerator', 'count',  'each', 'each',  1,       'case of 100', 100,     42.00, 320, 100, '{}'),
    ('Sandwich bread',             'dry_goods', 'dry_storage',          'count',  'each', 'loaf',  1,       'case of 12',  12,      38.00, 100, 35, '{gluten}'),
    ('Cheddar cheese',             'dairy',     'walk_in_refrigerator', 'weight', 'g',    'lb',    453.592, '20 lb case',  9071.84, 96.00, 90, 30, '{dairy}'),
    ('Rolled oats',                'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '25 lb bag',   11339.8, 29.00, 45, 15, '{}'),
    ('Crushed tomatoes',           'pantry',    'dry_storage',          'volume', 'ml',   'can',   3000,    'case of 6',   18000,   34.00, 54, 18, '{}'),
    ('Dry pasta',                  'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '20 lb case',  9071.84, 32.00, 72, 25, '{gluten}'),
    ('Ground beef',                'protein',   'walk_in_freezer',      'weight', 'g',    'lb',    453.592, '40 lb case',  18143.7, 198.00, 160, 55, '{}'),
    ('Chicken thighs',             'protein',   'walk_in_freezer',      'weight', 'g',    'lb',    453.592, '40 lb case',  18143.7, 164.00, 220, 80, '{}'),
    ('Long-grain rice',            'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '50 lb bag',   22679.6, 41.00, 55, 20, '{}'),
    ('Carrots',                    'produce',   'walk_in_refrigerator', 'weight', 'g',    'lb',    453.592, '25 lb bag',   11339.8, 22.00, 85, 30, '{}'),
    ('Romaine lettuce',            'produce',   'walk_in_refrigerator', 'count',  'each', 'head',  1,       'case of 24',  24,      36.00, 60, 35, '{}'),
    ('Cucumbers',                  'produce',   'walk_in_refrigerator', 'count',  'each', 'each',  1,       'case of 24',  24,      28.00, 140, 50, '{}'),
    ('Flour tortillas',            'dry_goods', 'dry_storage',          'count',  'each', 'pack',  12,      'case of 12',  144,     44.00, 150, 50, '{gluten}'),
    ('Black beans',                'pantry',    'dry_storage',          'volume', 'ml',   'can',   3000,    'case of 6',   18000,   30.00, 18, 6,  '{}'),
    ('Dairy-free chocolate chips', 'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '10 lb case',  4535.92, 68.00, 20, 6,  '{soy}'),
    ('Vegetable oil',              'pantry',    'dry_storage',          'volume', 'ml',   'gal',   3785.41, 'case of 3',   11356.2, 41.00, 9,  3,  '{}')
  ) as t(name, category, storage, dimension, base_unit, stock_unit, stock_in_base, purchase_unit, purchase_in_base, price, on_hand, par, allergens)
  loop
    if not exists (select 1 from inventory_items where camp_id = p_camp and lower(name) = lower(r.name)) then
      insert into inventory_items (id, camp_id, name, category, storage_location, dimension, base_unit, stock_unit, stock_unit_in_base,
        purchase_unit, purchase_unit_in_base, unit_price, vendor_id, on_hand_base, par_level_base, allergens, last_counted_at)
      values (demo_seed_uuid(p_camp, 'item:' || r.name), p_camp, r.name, r.category, r.storage, r.dimension, r.base_unit, r.stock_unit,
        r.stock_in_base, r.purchase_unit, r.purchase_in_base, r.price, v_vendor, r.on_hand * r.stock_in_base, r.par * r.stock_in_base,
        r.allergens::text[], now());
    else
      -- The sample pantry this seed family created is re-stocked to kitchen scale; a camp's own
      -- item that happens to share a name is left exactly as it is.
      update inventory_items
         set on_hand_base = r.on_hand * r.stock_in_base, par_level_base = r.par * r.stock_in_base,
             allergens = r.allergens::text[], last_counted_at = now()
       where id = demo_seed_uuid(p_camp, 'item:' || r.name);
    end if;
  end loop;

  -- ── Courses and the session ──────────────────────────────────────────────────────────────
  for r in select * from (values ('Main', 1), ('Side', 2), ('Fruit', 3), ('Dessert', 4)) as t(name, sort) loop
    if not exists (select 1 from commissary_menu_courses where camp_id = p_camp and lower(name) = lower(r.name)) then
      insert into commissary_menu_courses (id, camp_id, name, sort_order)
      values (demo_seed_uuid(p_camp, 'course:' || r.name), p_camp, r.name, r.sort);
    end if;
  end loop;

  delete from menu_entries where camp_id = p_camp and session_id = v_session;
  update commissary_sessions set is_active = false where camp_id = p_camp and id <> v_session;
  insert into commissary_sessions (id, camp_id, name, start_date, end_date, camper_count, staff_count, is_active,
    budget_per_person_per_day, meals_per_day)
  values (v_session, p_camp, 'Summer session', v_monday, v_monday + 27, 120, 40, true, 14, 3)
  on conflict (id) do update set start_date = excluded.start_date, end_date = excluded.end_date,
    camper_count = excluded.camper_count, staff_count = excluded.staff_count, is_active = true;

  -- ── Recipes ──────────────────────────────────────────────────────────────────────────────
  delete from recipe_steps where camp_id = p_camp and recipe_id in (select demo_seed_uuid(p_camp, 'recipe:' || k) from generate_series(1, 15) k);
  delete from recipe_ingredients where camp_id = p_camp and recipe_id in (select demo_seed_uuid(p_camp, 'recipe:' || k) from generate_series(1, 15) k);

  for r in select * from (values
    (1,  'Buttermilk pancakes',          'breakfast', 50, '15 min', '30 min', 'Serve with maple syrup and fruit.'),
    (2,  'Scrambled eggs & toast',       'breakfast', 50, '10 min', '20 min', null),
    (3,  'Oatmeal bar',                  'breakfast', 50, '5 min',  '25 min', 'Set out brown sugar, raisins and sliced apples.'),
    (4,  'Grilled cheese & tomato soup', 'lunch',     50, '20 min', '30 min', 'Dairy meal.'),
    (5,  'Homemade pizza',               'lunch',     50, '30 min', '20 min', 'Dairy meal. Dough can be made the day before.'),
    (6,  'Bean & cheese quesadillas',    'lunch',     50, '20 min', '20 min', 'Dairy meal. Vegetarian.'),
    (7,  'Pasta with meat sauce',        'dinner',    50, '20 min', '45 min', 'Meat meal — no cheese on the line.'),
    (8,  'Chicken & rice',               'dinner',    50, '20 min', '60 min', 'Meat meal.'),
    (9,  'Beef tacos',                   'dinner',    50, '25 min', '30 min', 'Meat meal. Serve with salsa and lettuce.'),
    (10, 'Roast chicken & carrots',      'dinner',    50, '20 min', '75 min', 'Friday dinner. Meat meal.'),
    (11, 'Garden salad',                 'dinner',    50, '25 min', null,     'Dressing on the side.'),
    (12, 'Chocolate chip cookies',       'snack',     50, '20 min', '12 min', 'Pareve — oil and dairy-free chips, so they can follow a meat dinner.'),
    (13, 'Campfire s''mores',            'snack',     50, '10 min', null,     'Pareve, with dairy-free chocolate. For the evening program.'),
    (14, 'Challah',                      'dinner',    50, '30 min', '35 min', 'Friday dinner. Dough rises in the afternoon.'),
    (15, 'Fresh fruit',                  'breakfast', 50, '10 min', null,     'Sliced and set out on the line.')
  ) as t(k, name, meal, yield, prep, cook, notes)
  loop
    v_rid := demo_seed_uuid(p_camp, 'recipe:' || r.k);
    insert into recipes (id, camp_id, name, meal_period, base_yield, prep_time, cook_time, notes)
    values (v_rid, p_camp, r.name, r.meal, r.yield, r.prep, r.cook, r.notes)
    on conflict (id) do update set name = excluded.name, meal_period = excluded.meal_period, base_yield = excluded.base_yield,
      prep_time = excluded.prep_time, cook_time = excluded.cook_time, notes = excluded.notes;
    v_n := v_n + 1;
  end loop;

  --  recipe  item                         qty (base units per 50 portions)
  for r in select * from (values
    (1, 'All-purpose flour', 1814), (1, 'Large eggs', 12), (1, 'Whole milk', 3785), (1, 'Unsalted butter', 227), (1, 'Granulated sugar', 113),
    (2, 'Large eggs', 100), (2, 'Unsalted butter', 227), (2, 'Sandwich bread', 5),
    (3, 'Rolled oats', 2268), (3, 'Whole milk', 3785), (3, 'Granulated sugar', 227), (3, 'Apples', 10),
    (4, 'Sandwich bread', 6), (4, 'Cheddar cheese', 2268), (4, 'Unsalted butter', 454), (4, 'Crushed tomatoes', 9000), (4, 'Whole milk', 1893),
    (5, 'All-purpose flour', 2722), (5, 'Shredded mozzarella', 2722), (5, 'Pizza sauce', 6000),
    (6, 'Flour tortillas', 100), (6, 'Cheddar cheese', 2268), (6, 'Black beans', 6000),
    (7, 'Dry pasta', 3629), (7, 'Ground beef', 3629), (7, 'Crushed tomatoes', 9000),
    (8, 'Chicken thighs', 6804), (8, 'Long-grain rice', 2722), (8, 'Carrots', 1361),
    (9, 'Ground beef', 4536), (9, 'Flour tortillas', 100), (9, 'Romaine lettuce', 4),
    (10, 'Chicken thighs', 9072), (10, 'Carrots', 2268),
    (11, 'Romaine lettuce', 6), (11, 'Cucumbers', 8), (11, 'Carrots', 907),
    (12, 'All-purpose flour', 1361), (12, 'Vegetable oil', 710), (12, 'Granulated sugar', 907), (12, 'Large eggs', 6), (12, 'Dairy-free chocolate chips', 1361),
    (13, 'Graham crackers', 2041), (13, 'Mini marshmallows', 1417), (13, 'Dairy-free chocolate chips', 907),
    (14, 'All-purpose flour', 2268), (14, 'Large eggs', 6), (14, 'Granulated sugar', 227),
    (15, 'Apples', 25)
  ) as t(k, item, qty)
  loop
    insert into recipe_ingredients (id, camp_id, recipe_id, item_id, label, qty_in_base, sort_order)
    select demo_seed_uuid(p_camp, 'ingredient:' || r.k || ':' || r.item), p_camp, demo_seed_uuid(p_camp, 'recipe:' || r.k),
           i.id, i.name, r.qty,
           (select count(*) from recipe_ingredients x where x.recipe_id = demo_seed_uuid(p_camp, 'recipe:' || r.k))
      from inventory_items i
     where i.camp_id = p_camp and lower(i.name) = lower(r.item)
     limit 1;
  end loop;

  --  recipe  step  instruction                                                     lead  slot
  for r in select * from (values
    (1, 1, 'Whisk the dry ingredients; whisk eggs, milk and melted butter separately.', 0, null),
    (1, 2, 'Fold together until just combined — lumps are fine.', 0, null),
    (1, 3, 'Cook on a 375°F griddle, flip when bubbles form. Hold warm.', 0, null),
    (2, 1, 'Crack and whisk eggs; season lightly.', 0, null),
    (2, 2, 'Scramble in batches over medium-low heat with butter.', 0, null),
    (2, 3, 'Toast bread in the conveyor toaster and serve alongside.', 0, null),
    (3, 1, 'Simmer oats in milk and water, stirring, about 20 minutes.', 0, null),
    (3, 2, 'Slice apples and set out toppings.', 0, 'morning'),
    (4, 1, 'Simmer crushed tomatoes with milk and seasoning for the soup.', 0, 'morning'),
    (4, 2, 'Butter bread, fill with cheddar, grill until golden.', 0, null),
    (5, 1, 'Make the dough and let it rise in the walk-in overnight.', 1, 'afternoon'),
    (5, 2, 'Stretch, sauce, top with mozzarella; bake at 475°F about 12 minutes.', 0, null),
    (6, 1, 'Rinse beans; mash half.', 0, 'morning'),
    (6, 2, 'Fill tortillas with beans and cheddar; griddle until melted.', 0, null),
    (7, 1, 'Move ground beef to the walk-in to thaw.', 1, 'evening'),
    (7, 2, 'Brown beef, add crushed tomatoes, simmer 30 minutes.', 0, 'afternoon'),
    (7, 3, 'Boil pasta just before service.', 0, null),
    (8, 1, 'Move chicken thighs to the walk-in to thaw.', 1, 'evening'),
    (8, 2, 'Roast chicken; cook rice with diced carrots.', 0, 'afternoon'),
    (9, 1, 'Move ground beef to the walk-in to thaw.', 1, 'evening'),
    (9, 2, 'Brown and season beef; shred lettuce; warm tortillas.', 0, null),
    (10, 1, 'Move chicken thighs to the walk-in to thaw.', 1, 'evening'),
    (10, 2, 'Roast chicken and carrots at 400°F about an hour.', 0, 'afternoon'),
    (11, 1, 'Wash and chop romaine; slice cucumbers and carrots.', 0, 'afternoon'),
    (12, 1, 'Make the dough and chill it overnight.', 1, 'afternoon'),
    (12, 2, 'Scoop and bake at 350°F for 10–12 minutes.', 0, 'morning'),
    (13, 1, 'Count out kits per cabin: crackers, marshmallows, chocolate.', 0, 'afternoon'),
    (14, 1, 'Mix and knead the dough; let it rise.', 0, 'morning'),
    (14, 2, 'Braid, egg-wash and bake at 350°F about 35 minutes.', 0, 'afternoon'),
    (15, 1, 'Wash and slice apples; set out with the breakfast line.', 0, 'morning')
  ) as t(k, step, instruction, lead, slot)
  loop
    insert into recipe_steps (id, camp_id, recipe_id, step_number, instruction, lead_days, time_slot)
    values (demo_seed_uuid(p_camp, 'step:' || r.k || ':' || r.step), p_camp, demo_seed_uuid(p_camp, 'recipe:' || r.k),
            r.step, r.instruction, r.lead, r.slot);
  end loop;

  -- ── The menu: the same week four times ──────────────────────────────────────────────────
  for v_w in 1..4 loop
    for v_d in 0..6 loop
      for r in select * from (values
        ('breakfast', (array[1,3,2,1,3,2,1])[v_d + 1], null::text, 'Main', 0),
        ('lunch',     (array[4,5,6,4,5,6,5])[v_d + 1], null,       'Main', 0),
        ('dinner',    (array[7,8,9,7,10,8,9])[v_d + 1], null,      'Main', 0)
      ) as t(meal, recipe, label, course, sort)
      loop
        perform demo_menu_recipe_internal(p_camp, v_session, 'menu:' || v_w || ':' || v_d || ':' || r.meal || ':main',
                                          v_w, v_d, r.meal, r.recipe, r.course, r.sort);
      end loop;

      -- Salad beside dinner four nights a week; fresh fruit at breakfast twice; challah on Friday.
      if v_d in (0, 2, 4, 6) then
        perform demo_menu_recipe_internal(p_camp, v_session, 'menu:' || v_w || ':' || v_d || ':dinner:salad',
                                          v_w, v_d, 'dinner', 11, 'Side', 1);
      end if;
      if v_d in (1, 4) then
        perform demo_menu_recipe_internal(p_camp, v_session, 'menu:' || v_w || ':' || v_d || ':breakfast:fruit',
                                          v_w, v_d, 'breakfast', 15, 'Fruit', 1);
      end if;
      if v_d = 4 then
        perform demo_menu_recipe_internal(p_camp, v_session, 'menu:' || v_w || ':' || v_d || ':dinner:challah',
                                          v_w, v_d, 'dinner', 14, 'Side', 2);
      end if;
      if v_d = 2 then
        perform demo_menu_recipe_internal(p_camp, v_session, 'menu:' || v_w || ':' || v_d || ':snack:cookies',
                                          v_w, v_d, 'snack', 12, 'Dessert', 0);
      end if;
      if v_d = 5 then
        perform demo_menu_recipe_internal(p_camp, v_session, 'menu:' || v_w || ':' || v_d || ':snack:smores',
                                          v_w, v_d, 'snack', 13, 'Dessert', 0);
      end if;
    end loop;
  end loop;

  -- ── The allergy program ──────────────────────────────────────────────────────────────────
  -- A handful of campers with real restrictions, so the menu builder's allergy flags and the
  -- allergy program have something to show. Fictional names; health-gated tables as always.
  delete from camper_restrictions where camp_id = p_camp and camper_id in (select demo_seed_uuid(p_camp, 'camper:' || k) from generate_series(1, 20) k);
  delete from camper_sessions where camp_id = p_camp and camper_id in (select demo_seed_uuid(p_camp, 'camper:' || k) from generate_series(1, 20) k);
  delete from campers where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'camper:' || k) from generate_series(1, 20) k);

  --  k   name               cabin          restriction  kind        severity        notes
  for r in select * from (values
    (1,  'Noa Friedman',     'Cabin 3',     'peanut',    'allergen', 'anaphylactic', 'EpiPen in the health centre and on trips.'),
    (2,  'Eli Kaplan',       'Cabin 7',     'peanut',    'allergen', 'anaphylactic', null),
    (3,  'Maya Levin',       'Cabin 2',     'tree_nut',  'allergen', 'confirmed',    null),
    (4,  'Ari Goldberg',     'Cabin 5',     'tree_nut',  'allergen', 'confirmed',    null),
    (5,  'Talia Stern',      'Cabin 1',     'gluten',    'allergen', 'confirmed',    'Celiac — separate prep and toaster.'),
    (6,  'Jonah Weiss',      'Cabin 6',     'gluten',    'allergen', 'confirmed',    'Celiac.'),
    (7,  'Leah Cohen',       'Cabin 4',     'dairy',     'allergen', 'intolerance',  null),
    (8,  'Sam Rosen',        'Cabin 8',     'dairy',     'allergen', 'intolerance',  null),
    (9,  'Dana Shapiro',     'Cabin 2',     'egg',       'allergen', 'confirmed',    null),
    (10, 'Ben Adler',        'Cabin 7',     'sesame',    'allergen', 'anaphylactic', null),
    (11, 'Rina Katz',        'Cabin 3',     'vegetarian','dietary',  null,           null),
    (12, 'Micah Bloom',      'Cabin 5',     'vegetarian','dietary',  null,           null),
    (13, 'Shira Hoffman',    'Cabin 1',     'vegan',     'dietary',  null,           null),
    (14, 'Gabe Lerner',      'Staff',       'dairy',     'allergen', 'intolerance',  'Kitchen staff.')
  ) as t(k, name, cabin, restriction, kind, severity, notes)
  loop
    insert into campers (id, camp_id, session_id, name, cabin)
    values (demo_seed_uuid(p_camp, 'camper:' || r.k), p_camp, v_session, r.name, r.cabin);
    insert into camper_sessions (id, camp_id, camper_id, session_id)
    values (demo_seed_uuid(p_camp, 'camper_session:' || r.k), p_camp, demo_seed_uuid(p_camp, 'camper:' || r.k), v_session);
    insert into camper_restrictions (id, camp_id, camper_id, restriction, kind, severity, notes)
    values (demo_seed_uuid(p_camp, 'restriction:' || r.k), p_camp, demo_seed_uuid(p_camp, 'camper:' || r.k), r.restriction, r.kind, r.severity, r.notes);
  end loop;

  insert into commissary_diet_counts (id, camp_id, session_id, restriction, count)
  values (demo_seed_uuid(p_camp, 'diet:vegetarian'), p_camp, v_session, 'vegetarian', 18),
         (demo_seed_uuid(p_camp, 'diet:vegan'), p_camp, v_session, 'vegan', 4)
  on conflict (session_id, restriction) do update set count = excluded.count;

  return v_n;
end;
$fn$;

revoke execute on function public.seed_demo_kitchen_internal(uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_kitchen_internal(uuid) to service_role;

-- Both entry points run the kitchen with the food requests: the pantry the requests draw on and
-- the menu the ordering engine plans from are the same kitchen.
create or replace function public.seed_demo_data(p_camp_id uuid, p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_type text;
  v_out jsonb := '{}'::jsonb;
  v_files jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  select account_type into v_type from camps where id = p_camp_id and deleted_at is null;
  if v_type is null then raise exception 'Camp not found'; end if;
  if v_type not in ('trial', 'demo') then
    raise exception 'Sample data can only be written into a demo camp';
  end if;

  if 'food_requests' = any (p_keys) then
    v_out := v_out || jsonb_build_object('food_requests', seed_demo_food_requests_internal(p_camp_id),
                                         'kitchen', seed_demo_kitchen_internal(p_camp_id));
  end if;
  if 'town_trips' = any (p_keys) then
    v_out := v_out || jsonb_build_object('town_trips', seed_demo_trips_internal(p_camp_id));
  end if;
  if 'receipts' = any (p_keys) then
    perform demo_unmatch_sample_receipts_internal(p_camp_id);
    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'file_path', file_path, 'sample_file', sample_file)), '[]'::jsonb)
      into v_files from seed_demo_receipts_internal(p_camp_id);
    v_out := v_out || jsonb_build_object('receipt_files', v_files);
  end if;
  return v_out;
end;
$fn$;

create or replace function public.reset_demo_sample_data(p_camp_id uuid, p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_type text;
  v_out jsonb := '{}'::jsonb;
  v_files jsonb;
begin
  if not (is_camp_admin(p_camp_id) or is_platform_admin()) then
    raise exception 'Not authorized';
  end if;
  select account_type into v_type from camps where id = p_camp_id and deleted_at is null;
  if v_type is null or v_type not in ('trial', 'demo') then
    raise exception 'Sample data can only be reset in a demo camp';
  end if;

  if 'food_requests' = any (p_keys) then
    v_out := v_out || jsonb_build_object('food_requests', seed_demo_food_requests_internal(p_camp_id),
                                         'kitchen', seed_demo_kitchen_internal(p_camp_id));
  end if;
  if 'town_trips' = any (p_keys) then
    v_out := v_out || jsonb_build_object('town_trips', seed_demo_trips_internal(p_camp_id));
  end if;
  if 'receipts' = any (p_keys) then
    perform demo_unmatch_sample_receipts_internal(p_camp_id);
    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'file_path', file_path, 'sample_file', sample_file)), '[]'::jsonb)
      into v_files from seed_demo_receipts_internal(p_camp_id);
    v_out := v_out || jsonb_build_object('receipt_files', v_files);
  end if;
  return v_out;
end;
$fn$;

revoke execute on function public.seed_demo_data(uuid, text[]) from public, anon;
grant execute on function public.seed_demo_data(uuid, text[]) to authenticated, service_role;
revoke execute on function public.reset_demo_sample_data(uuid, text[]) from public, anon;
grant execute on function public.reset_demo_sample_data(uuid, text[]) to authenticated, service_role;
