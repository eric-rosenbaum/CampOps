-- Kitchen fixture for the food-request journeys (J1-J2), in the staging "Prospect QA" camp ONLY.
-- Idempotent: items and the vendor are upserted by name, stock and reorder levels are reset to
-- known values, and earlier journey requests are removed so the inbox starts clean.
--
-- The stock numbers are chosen so the journey can see the kitchen react: 12 lb of flour against a
-- 10 lb minimum needs no order, until the cooking club is approved for 3 lb.
do $$
declare
  v_camp uuid;
  v_vendor uuid;
  r record;
begin
  select id into v_camp from camps where slug = 'prospect-qa' and deleted_at is null;
  if v_camp is null then raise exception 'Prospect QA camp missing: run e2e/setup-qa-camp.sh'; end if;

  -- Previous runs' requests (and their queued mail, all to example.com) go.
  delete from scheduled_messages where camp_id = v_camp and subject_type = 'food_request';
  delete from food_request_lines where camp_id = v_camp;
  delete from food_requests where camp_id = v_camp;
  -- Items the journey adds to the kitchen list from a typed-in line.
  delete from inventory_items where camp_id = v_camp and name like 'Rainbow sprinkles %';
  -- The public link allows 10 requests an hour per address, and a day of journey runs from one
  -- laptop exceeds that. Only this camp's buckets are cleared.
  delete from food_request_throttle where bucket like v_camp::text || ':%';

  select id into v_vendor from commissary_vendors where camp_id = v_camp and name = 'Northern Foodservice';
  if v_vendor is null then
    insert into commissary_vendors (camp_id, name, specialty, rep_email, delivery_day, delivery_fee, sort_order)
    values (v_camp, 'Northern Foodservice', 'Broadline', 'orders@example.com', 'monday', 0, 0)
    returning id into v_vendor;
  end if;

  for r in select * from (values
    -- name, category, storage, dimension, base, stock unit, stock in base, purchase unit, purchase in base, price, on hand (stock units), min (stock units)
    ('All-purpose flour',          'dry_goods', 'dry_storage',           'weight', 'g',    'lb',    453.592, '50 lb bag',  22679.6,  38.00, 12,  10),
    ('Large eggs',                 'dairy',     'walk_in_refrigerator',  'count',  'each', 'dozen', 12,      'case',       180,      54.00, 10,  4),
    ('Mini marshmallows',          'snacks',    'dry_storage',           'weight', 'g',    'bag',   283.495, 'case of 12', 3401.94,  26.50, 8,   2),
    ('Semi-sweet chocolate chips', 'dry_goods', 'dry_storage',           'weight', 'g',    'lb',    453.592, '10 lb case', 4535.92,  61.00, 6,   2),
    ('Unsalted butter',            'dairy',     'walk_in_refrigerator',  'weight', 'g',    'lb',    453.592, '36 lb case', 16329.3,  142.00, 20, 8),
    ('Granulated sugar',           'dry_goods', 'dry_storage',           'weight', 'g',    'lb',    453.592, '50 lb bag',  22679.6,  31.00, 30,  10),
    ('Whole milk',                 'dairy',     'walk_in_refrigerator',  'volume', 'ml',   'gal',   3785.41, 'case of 4',  15141.6,  19.00, 6,   3),
    ('Graham crackers',            'snacks',    'dry_storage',           'weight', 'g',    'box',   408.233, 'case of 12', 4898.8,   33.00, 10,  3)
  ) as t(name, category, storage, dimension, base_unit, stock_unit, stock_in_base, purchase_unit, purchase_in_base, price, on_hand, par)
  loop
    if exists (select 1 from inventory_items where camp_id = v_camp and name = r.name) then
      update inventory_items
         set category = r.category, storage_location = r.storage, dimension = r.dimension, base_unit = r.base_unit,
             stock_unit = r.stock_unit, stock_unit_in_base = r.stock_in_base, purchase_unit = r.purchase_unit,
             purchase_unit_in_base = r.purchase_in_base, unit_price = r.price, vendor_id = v_vendor,
             on_hand_base = r.on_hand * r.stock_in_base, par_level_base = r.par * r.stock_in_base,
             last_counted_at = now(), shelf_life_days = null
       where camp_id = v_camp and name = r.name;
    else
      insert into inventory_items (camp_id, name, category, storage_location, dimension, base_unit, stock_unit, stock_unit_in_base,
        purchase_unit, purchase_unit_in_base, unit_price, vendor_id, on_hand_base, par_level_base, last_counted_at)
      values (v_camp, r.name, r.category, r.storage, r.dimension, r.base_unit, r.stock_unit, r.stock_in_base,
        r.purchase_unit, r.purchase_in_base, r.price, v_vendor, r.on_hand * r.stock_in_base, r.par * r.stock_in_base, now());
    end if;
  end loop;

  -- Menu consumption is never written to stock, so nothing else to reset: the QA camp has no menu.
  delete from inventory_adjustments where camp_id = v_camp and item_id in (select id from inventory_items where camp_id = v_camp);

  if exists (select 1 from food_programs where camp_id = v_camp and name = 'Cooking Club') then
    update food_programs set request_token = 'qa-cooking-club', active = true, color = '#B4552F',
           lead_name = 'Robin Chen', lead_email = 'robin.lead@example.com'
     where camp_id = v_camp and name = 'Cooking Club';
  else
    insert into food_programs (camp_id, name, lead_name, lead_email, color, request_token, sort_order)
    values (v_camp, 'Cooking Club', 'Robin Chen', 'robin.lead@example.com', '#B4552F', 'qa-cooking-club', 0);
  end if;
  if not exists (select 1 from food_programs where camp_id = v_camp and name = 'Canoe trips') then
    insert into food_programs (camp_id, name, lead_name, lead_email, color, sort_order)
    values (v_camp, 'Canoe trips', 'Sam Okafor', 'sam.lead@example.com', '#185fa5', 1);
  end if;

  insert into food_request_settings (camp_id, cutoff_hours, kitchen_emails, pickup_location)
  values (v_camp, 72, array['kitchen@example.com'], 'the kitchen back door')
  on conflict (camp_id) do update
    set cutoff_hours = 72, kitchen_emails = array['kitchen@example.com'], pickup_location = 'the kitchen back door';
end $$;

select 'food request fixture ready' as result;
