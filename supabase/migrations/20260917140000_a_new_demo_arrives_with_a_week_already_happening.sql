-- A demo of food requests, town trips and receipts that opens empty demonstrates nothing.
--
-- A prospect needs to land on a kitchen inbox with a late request in it, a week board where
-- someone is about to be stranded in town, and last month's card statement with one receipt
-- missing and one snapped twice. These functions write exactly that into a DEMO camp:
--
--   * dates are relative to the camp's own today, so a demo opened ten days after it was seeded
--     still shows this week, not a week that has passed;
--   * every row has a deterministic id (md5 of camp + key), so "Reset sample data" deletes the
--     sample rows and writes them again, while anything a visitor created is left alone;
--   * every person is fictional and every address is @example.com, which the outbox cancels at
--     send time -- sample people never receive mail;
--   * no real business names: vendors, stores and statement descriptors are invented.
--
-- seed_demo_data() refuses any camp that is not a demo. Demo data written into the wrong camp has
-- destroyed real rows in this project before.

create or replace function public.demo_seed_uuid(p_camp uuid, p_key text)
returns uuid language sql immutable set search_path to 'public'
as $$ select md5(p_camp::text || ':demo:' || p_key)::uuid $$;

create or replace function public.demo_camp_today(p_camp uuid)
returns date language sql stable set search_path to 'public'
as $$ select (now() at time zone coalesce((select timezone from camps where id = p_camp), 'America/New_York'))::date $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Food requests
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.seed_demo_food_requests_internal(p_camp uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tz      text := coalesce((select timezone from camps where id = p_camp), 'America/New_York');
  v_today   date := demo_camp_today(p_camp);
  v_vendor  uuid;
  v_n       integer := 0;
  r         record;
  l         record;
  v_req     uuid;
  v_created timestamptz;
  v_pickup  timestamptz;
  v_item    record;
begin
  -- The pantry the requests draw on. Existing items (a curated seed camp's own) are left exactly
  -- as they are; only missing ones are added, with stock chosen so an approval visibly changes
  -- what the kitchen needs to order.
  select id into v_vendor from commissary_vendors where camp_id = p_camp and name = 'Northern Foodservice';
  if v_vendor is null then
    insert into commissary_vendors (id, camp_id, name, specialty, rep_email, delivery_day, delivery_fee, sort_order)
    values (demo_seed_uuid(p_camp, 'vendor:northern'), p_camp, 'Northern Foodservice', 'Broadline', 'orders@example.com', 'monday', 0, 0)
    on conflict (id) do nothing;
    v_vendor := demo_seed_uuid(p_camp, 'vendor:northern');
  end if;

  for r in select * from (values
    ('All-purpose flour',          'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '50 lb bag',  22679.6, 38.00, 12, 10),
    ('Large eggs',                 'dairy',     'walk_in_refrigerator', 'count',  'each', 'dozen', 12,      'case',       180,     54.00, 10, 4),
    ('Mini marshmallows',          'snacks',    'dry_storage',          'weight', 'g',    'bag',   283.495, 'case of 12', 3401.94, 26.50, 8,  2),
    ('Semi-sweet chocolate chips', 'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '10 lb case', 4535.92, 61.00, 6,  2),
    ('Unsalted butter',            'dairy',     'walk_in_refrigerator', 'weight', 'g',    'lb',    453.592, '36 lb case', 16329.3, 142.00, 14, 8),
    ('Granulated sugar',           'dry_goods', 'dry_storage',          'weight', 'g',    'lb',    453.592, '50 lb bag',  22679.6, 31.00, 30, 10),
    ('Whole milk',                 'dairy',     'walk_in_refrigerator', 'volume', 'ml',   'gal',   3785.41, 'case of 4',  15141.6, 19.00, 6,  3),
    ('Graham crackers',            'snacks',    'dry_storage',          'weight', 'g',    'box',   408.233, 'case of 12', 4898.8,  33.00, 10, 3),
    ('Shredded mozzarella',        'dairy',     'walk_in_refrigerator', 'weight', 'g',    'lb',    453.592, '20 lb case', 9071.84, 88.00, 9,  6),
    ('Pizza sauce',                'pantry',    'dry_storage',          'volume', 'ml',   'can',   3000,    'case of 6',  18000,   36.00, 5,  2),
    ('Granola bars',               'snacks',    'dry_storage',          'count',  'each', 'box',   24,      'case of 12', 288,     48.00, 6,  2),
    ('Apples',                     'produce',   'walk_in_refrigerator', 'count',  'each', 'each',  1,       'case of 100', 100,    42.00, 60, 40)
  ) as t(name, category, storage, dimension, base_unit, stock_unit, stock_in_base, purchase_unit, purchase_in_base, price, on_hand, par)
  loop
    if not exists (select 1 from inventory_items where camp_id = p_camp and lower(name) = lower(r.name)) then
      insert into inventory_items (id, camp_id, name, category, storage_location, dimension, base_unit, stock_unit, stock_unit_in_base,
        purchase_unit, purchase_unit_in_base, unit_price, vendor_id, on_hand_base, par_level_base, last_counted_at)
      values (demo_seed_uuid(p_camp, 'item:' || r.name), p_camp, r.name, r.category, r.storage, r.dimension, r.base_unit, r.stock_unit,
        r.stock_in_base, r.purchase_unit, r.purchase_in_base, r.price, v_vendor, r.on_hand * r.stock_in_base, r.par * r.stock_in_base,
        now() - interval '2 days')
      on conflict (id) do nothing;
    end if;
  end loop;

  insert into food_request_settings (camp_id, cutoff_hours, kitchen_emails, pickup_location)
  values (p_camp, 72, array['kitchen@example.com'], 'the kitchen back door')
  on conflict (camp_id) do nothing;

  -- Programs keep their public link across re-seeds: a prospect who already scanned the QR code
  -- must not find it dead after the founder resets the sample data.
  for r in select * from (values
    ('cooking',  'Cooking Club',          'Robin Chen',   'robin.chen@example.com',   '#B4552F', 0),
    ('campfire', 'Outdoor Ed · Campfire', 'Sam Okafor',   'sam.okafor@example.com',   '#D08C1B', 1),
    ('baking',   'Baking Club',           'Priya Shah',   'priya.shah@example.com',   '#6b3fa0', 2),
    ('canoe',    'Canoe Trips',           'Jordan Lee',   'jordan.lee@example.com',   '#185fa5', 3)
  ) as t(key, name, lead, email, color, sort)
  loop
    insert into food_programs (id, camp_id, name, lead_name, lead_email, color, request_token, active, sort_order)
    values (demo_seed_uuid(p_camp, 'program:' || r.key), p_camp, r.name, r.lead, r.email, r.color, gen_qr_token(), true, r.sort)
    on conflict (id) do update set name = excluded.name, lead_name = excluded.lead_name, lead_email = excluded.lead_email,
      color = excluded.color, active = true, sort_order = excluded.sort_order;
  end loop;

  -- Sample requests: delete the previous sample rows (and their queued mail), keep the visitor's.
  delete from scheduled_messages where camp_id = p_camp and subject_type = 'food_request'
    and subject_id in (select demo_seed_uuid(p_camp, 'request:' || k) from generate_series(1, 12) k);
  delete from food_request_lines where camp_id = p_camp
    and request_id in (select demo_seed_uuid(p_camp, 'request:' || k) from generate_series(1, 12) k);
  delete from food_requests where camp_id = p_camp
    and id in (select demo_seed_uuid(p_camp, 'request:' || k) from generate_series(1, 12) k);

  --  k  program   pickup  time   status      created(h ago) source  purpose                          people  kitchen note
  for r in select * from (values
    (1,  'campfire', 1,  '19:00', 'submitted', 5,   'link', 'S''mores for tomorrow night''s campfire',       60, null),
    (2,  'baking',   6,  '14:00', 'submitted', 3,   'link', 'Cookie baking for the bake sale',       16, null),
    (3,  'cooking',  3,  '15:30', 'approved',  30,  'link', 'Pancake breakfast practice',            14, 'We can spare 3 lb of flour this week, not 5 — the rest is for Saturday brunch.'),
    (4,  'canoe',    2,  '07:30', 'approved',  100, 'app',  'Two-day canoe trip, lunches and snacks', 9,  null),
    (5,  'cooking',  0,  '16:00', 'ready',     120, 'link', 'Pizza night',                            18, 'Everything is on the second shelf, labelled.'),
    (6,  'campfire', 0,  '19:30', 'approved',  96,  'link', 'Campfire snack for Cabin 4',             12, null),
    (7,  'baking',   -1, '14:00', 'picked_up', 110, 'link', 'Banana bread',                            10, null),
    (8,  'cooking',  -3, '15:00', 'picked_up', 150, 'app',  'Omelette station',                       12, null),
    (9,  'baking',   -2, '10:00', 'missed',    130, 'link', 'Muffins for the parents'' visit',        20, 'Nobody came by. The butter went back in the walk-in.'),
    (10, 'campfire', -4, '19:00', 'declined',  80,  'link', 'Hot chocolate night',                    40, 'We need that milk for breakfast tomorrow — can do 1 gal next week.'),
    (11, 'canoe',    -5, '08:00', 'cancelled', 150, 'link', 'Day paddle lunch',                       8,  null),
    (12, 'canoe',    9,  '07:00', 'approved',  20,  'app',  'Overnight trip to the island',           10, null)
  ) as t(k, program, day_offset, pickup_time, status, hours_ago, source, purpose, headcount, note)
  loop
    v_req := demo_seed_uuid(p_camp, 'request:' || r.k);
    v_created := now() - make_interval(hours => r.hours_ago);
    v_pickup := ((v_today + r.day_offset) + r.pickup_time::time) at time zone v_tz;
    -- A request can't have been made after its own pickup, whatever "now" is when the demo is seeded.
    if v_created > v_pickup then v_created := v_pickup - interval '4 days'; end if;

    insert into food_requests (id, camp_id, program_id, requester_name, requester_email, notify_by, source,
      pickup_date, pickup_time, purpose, headcount, status, notice_hours, cutoff_hours, is_late,
      kitchen_note, changed_by_kitchen, decided_by_name, decided_at, ready_at, picked_up_at, picked_up_by_name,
      missed_at, cancelled_at, cancelled_by, status_token, created_at, updated_at)
    select v_req, p_camp, demo_seed_uuid(p_camp, 'program:' || r.program),
      p.lead_name, p.lead_email, 'email', r.source,
      v_today + r.day_offset, r.pickup_time::time, r.purpose, r.headcount, r.status,
      round(extract(epoch from (v_pickup - v_created)) / 3600.0, 1), 72,
      extract(epoch from (v_pickup - v_created)) / 3600.0 < 72,
      r.note, r.k = 3,
      case when r.status in ('approved','ready','picked_up','missed','declined') then 'Kitchen' end,
      case when r.status in ('approved','ready','picked_up','missed','declined') then v_created + interval '3 hours' end,
      case when r.status in ('ready','picked_up') then v_pickup - interval '2 hours' end,
      case when r.status = 'picked_up' then v_pickup + interval '5 minutes' end,
      case when r.status = 'picked_up' then p.lead_name end,
      case when r.status = 'missed' then v_pickup + interval '2 hours' end,
      case when r.status = 'cancelled' then v_created + interval '20 hours' end,
      case when r.status = 'cancelled' then 'requester' end,
      gen_qr_token(), v_created, now()
    from food_programs p where p.id = demo_seed_uuid(p_camp, 'program:' || r.program);

    for l in select * from (values
      (1, 1, 'Graham crackers', 4, null::numeric), (1, 2, 'Mini marshmallows', 5, null), (1, 3, 'Semi-sweet chocolate chips', 3, null),
      (2, 1, 'All-purpose flour', 6, null), (2, 2, 'Unsalted butter', 4, null), (2, 3, 'Granulated sugar', 3, null), (2, 4, 'Large eggs', 2, null),
      (3, 1, 'All-purpose flour', 5, 3), (3, 2, 'Large eggs', 2, null), (3, 3, 'Whole milk', 1, null),
      (4, 1, 'Granola bars', 2, null), (4, 2, 'Apples', 20, null), (4, 3, '*Trail mix (bags)', 6, null),
      (5, 1, 'Shredded mozzarella', 4, null), (5, 2, 'Pizza sauce', 2, null), (5, 3, 'All-purpose flour', 4, null),
      (6, 1, 'Graham crackers', 2, null), (6, 2, 'Mini marshmallows', 2, null),
      (7, 1, 'All-purpose flour', 3, null), (7, 2, 'Unsalted butter', 1, null), (7, 3, '*Ripe bananas', 8, null),
      (8, 1, 'Large eggs', 4, null), (8, 2, 'Shredded mozzarella', 2, null),
      (9, 1, 'All-purpose flour', 4, null), (9, 2, 'Unsalted butter', 3, null), (9, 3, 'Granulated sugar', 2, null),
      (10, 1, 'Whole milk', 3, null), (10, 2, '*Cocoa powder (tins)', 2, null),
      (11, 1, 'Granola bars', 1, null), (11, 2, 'Apples', 10, null),
      (12, 1, 'Granola bars', 2, null), (12, 2, 'Apples', 20, null), (12, 3, 'Large eggs', 3, null)
    ) as t(k, pos, label, qty, approved) where t.k = r.k
    loop
      if left(l.label, 1) = '*' then
        insert into food_request_lines (id, request_id, camp_id, item_id, label, qty_requested, unit_label, unit_in_base,
          qty_requested_base, qty_approved, approved_unit_label, qty_approved_base, line_state, sort_order, created_at)
        values (demo_seed_uuid(p_camp, 'line:' || r.k || ':' || l.pos), v_req, p_camp, null, substr(l.label, 2), l.qty,
          substring(l.label from '\((.*)\)'), null, null, null, null, null, 'ok', l.pos, v_created);
      else
        select id, name, stock_unit, stock_unit_in_base into v_item
          from inventory_items where camp_id = p_camp and lower(name) = lower(l.label) limit 1;
        insert into food_request_lines (id, request_id, camp_id, item_id, label, qty_requested, unit_label, unit_in_base,
          qty_requested_base, qty_approved, approved_unit_label, qty_approved_base, line_state, sort_order, created_at)
        values (demo_seed_uuid(p_camp, 'line:' || r.k || ':' || l.pos), v_req, p_camp, v_item.id, coalesce(v_item.name, l.label), l.qty,
          v_item.stock_unit, v_item.stock_unit_in_base, l.qty * v_item.stock_unit_in_base,
          l.approved, case when l.approved is not null then v_item.stock_unit end,
          case when l.approved is not null then l.approved * v_item.stock_unit_in_base end,
          case when l.approved is not null then 'changed' else 'ok' end, l.pos, v_created);
      end if;
    end loop;
    v_n := v_n + 1;
  end loop;

  perform plan_food_request_messages_internal();
  return v_n;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Town trips
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.seed_demo_trips_internal(p_camp uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_today date := demo_camp_today(p_camp);
  v_n integer := 0;
  r record;
  s record;
  v_trip uuid;
begin
  delete from scheduled_messages where camp_id = p_camp and subject_type in ('trip', 'trip_seat', 'trip_errand')
    and subject_id in (select demo_seed_uuid(p_camp, x) from unnest(array(
      select 'trip:' || k from generate_series(1, 8) k
      union all select 'seat:' || k from generate_series(1, 40) k
      union all select 'errand:' || k from generate_series(1, 12) k)) x);
  delete from ride_requests where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'ride:' || k) from generate_series(1, 5) k);
  delete from trip_errands where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'errand:' || k) from generate_series(1, 12) k);
  delete from trip_seats where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'seat:' || k) from generate_series(1, 40) k);
  delete from trips where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'trip:' || k) from generate_series(1, 8) k);

  --  k kind          title                        destination                 day  depart   back day  return  seats driver                vehicle            closes
  for r in select * from (values
    (1, 'town_run',   'Town run',                  'Main Street',               0,  '14:00', 0,  '16:00', 3, 'Maya Torres',         'Camp van #2',     '13:30'),
    (2, 'day_off',    'Day-off shuttle into town', 'Town centre',               1,  '09:30', 1,  '17:30', 6, 'Devon Park',          'Camp van #1',     null),
    (3, 'supply_run', 'Supply run',                'Hardware & building supply', 2, '10:00', 2,  '12:30', 2, 'Luis Ortega',         'Maintenance truck', '09:30'),
    (4, 'day_off',    'Evening ride into town',    'Town centre',               3,  '17:00', null, null,  4, 'Aisha Rahman',        null,              null),
    (5, 'other',      'Late pickup from town',     'Town centre',               3,  '21:30', 3,  '22:15', 4, 'Aisha Rahman',        null,              null),
    (6, 'town_run',   'Town run',                  'Main Street',               5,  '13:00', 5,  '15:00', 4, 'Maya Torres',         'Camp van #2',     '12:30'),
    (7, 'day_off',    'Day-off shuttle into town', 'Town centre',               8,  '09:30', 8,  '17:30', 6, 'Devon Park',          'Camp van #1',     null)
  ) as t(k, kind, title, destination, depart_offset, depart_time, back_offset, return_time, seats, driver, vehicle, closes)
  loop
    v_trip := demo_seed_uuid(p_camp, 'trip:' || r.k);
    insert into trips (id, camp_id, kind, title, destination, depart_date, depart_time, return_date, return_time,
      driver_name, vehicle_label, passenger_seats, errands_close_time, notes, status, created_at)
    values (v_trip, p_camp, r.kind, r.title, r.destination, v_today + r.depart_offset, r.depart_time::time,
      case when r.back_offset is null then null else v_today + r.back_offset end, r.return_time::time,
      r.driver, r.vehicle, r.seats, r.closes::time,
      case r.k when 4 then 'One way — the late pickup brings people back.' when 3 then 'Picking up lumber for the dock; two seats only.' end,
      'planned', now() - interval '2 days');
    v_n := v_n + 1;
  end loop;

  -- Riders. Trip 4 carries three people into town; the late pickup (5) has room for only two of
  -- them to come back -- the third is who the board's "no ride back" warning is about.
  --  k  trip  rider              leg      status
  for s in select * from (values
    (1,  1, 'Noor Haddad',     'both',  'confirmed'),
    (2,  1, 'Ben Kowalski',    'both',  'confirmed'),
    (3,  1, 'Chloé Martin',    'both',  'confirmed'),
    (4,  1, 'Owen Brooks',     'both',  'waitlist'),
    (5,  2, 'Tess Nguyen',     'both',  'confirmed'),
    (6,  2, 'Kai Robinson',    'both',  'confirmed'),
    (7,  2, 'Hannah Frey',     'both',  'confirmed'),
    (8,  2, 'Marcus Webb',     'there', 'confirmed'),
    (9,  3, 'Grace Liu',       'both',  'confirmed'),
    (10, 3, 'Theo Adams',      'both',  'confirmed'),
    (11, 4, 'Ines Moreau',     'there', 'confirmed'),
    (12, 4, 'Jamal Carter',    'there', 'confirmed'),
    (13, 4, 'Ruby Walsh',      'there', 'confirmed'),
    (14, 5, 'Ines Moreau',     'back',  'confirmed'),
    (15, 5, 'Jamal Carter',    'back',  'confirmed'),
    (16, 6, 'Leo Fischer',     'both',  'confirmed'),
    (17, 7, 'Tess Nguyen',     'both',  'confirmed'),
    (18, 7, 'Sofia Rossi',     'both',  'confirmed')
  ) as t(k, trip, rider, leg, status)
  loop
    insert into trip_seats (id, camp_id, trip_id, rider_name, rider_email, leg, status, queued_at, confirmed_at, created_at)
    values (demo_seed_uuid(p_camp, 'seat:' || s.k), p_camp, demo_seed_uuid(p_camp, 'trip:' || s.trip), s.rider,
      lower(split_part(s.rider, ' ', 1)) || '.' || lower(split_part(s.rider, ' ', 2)) || '@example.com',
      s.leg, s.status, now() - interval '1 day' + make_interval(mins => s.k),
      case when s.status = 'confirmed' then now() - interval '1 day' + make_interval(mins => s.k) end,
      now() - interval '1 day' + make_interval(mins => s.k));
  end loop;

  --  k  trip  item                                   qty          store              activity      requester        status
  for s in select * from (values
    (1,  1,    'AA batteries',                         '24',        'Hardware store',  'Waterfront',  'Noor Haddad',   'open'),
    (2,  1,    'Poster board',                         '10 sheets', 'Dollar store',    'Arts & crafts', 'Chloé Martin', 'open'),
    (3,  1,    'Birthday candles',                     '2 packs',   'Grocery',         'Cabin 6',     'Ben Kowalski',  'bought'),
    (4,  3,    'Deck screws, 3 inch',                  '2 boxes',   'Hardware store',  'Dock repair', 'Luis Ortega',   'open'),
    (5,  null, 'Propane cylinder refill',              '2',         'Hardware store',  'Outdoor Ed',  'Sam Okafor',    'open'),
    (6,  null, 'Sunscreen SPF 50',                     '6 bottles', 'Pharmacy',        'Health centre', 'Hannah Frey', 'open'),
    (7,  null, 'Zip ties',                             '1 bag',     'Hardware store',  'Tripping',    'Jordan Lee',    'open'),
    (8,  null, 'Glow sticks',                          '100',       'Dollar store',    'Evening program', 'Kai Robinson', 'open'),
    (9,  6,    'Printer ink (black)',                  '2',         'Office supply',   'Office',      'Tess Nguyen',   'open')
  ) as t(k, trip, item, qty, store, activity, requester, status)
  loop
    insert into trip_errands (id, camp_id, trip_id, requester_name, item, quantity, store, for_activity, needed_by, status, done_at, created_at)
    values (demo_seed_uuid(p_camp, 'errand:' || s.k), p_camp,
      case when s.trip is null then null else demo_seed_uuid(p_camp, 'trip:' || s.trip) end,
      s.requester, s.item, s.qty, s.store, s.activity,
      case when s.trip is null then v_today + 4 end, s.status,
      case when s.status = 'bought' then now() - interval '1 hour' end,
      now() - make_interval(hours => 20 + s.k));
  end loop;

  --  k  requester        day  from     to       destination      leg     note
  for s in select * from (values
    (1, 'Priya Shah',     2,  '13:00', '16:00', 'Town centre',   'both',  'Day off — anything after lunch works'),
    (2, 'Owen Brooks',    3,  '09:00', '12:00', 'Pharmacy',      'both',  'Need to pick up a prescription'),
    (3, 'Ruby Walsh',     3,  '20:00', '23:00', 'Back to camp',  'back',  'Going in on the evening ride — need a way back')
  ) as t(k, requester, day, from_t, to_t, destination, leg, note)
  loop
    insert into ride_requests (id, camp_id, requester_name, wanted_date, earliest_time, latest_time, destination, leg, note, status, created_at)
    values (demo_seed_uuid(p_camp, 'ride:' || s.k), p_camp, s.requester, v_today + s.day, s.from_t::time, s.to_t::time,
      s.destination, s.leg, s.note, 'open', now() - make_interval(hours => 6 * s.k));
  end loop;

  perform plan_trip_messages_internal();
  return v_n;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Receipts
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Returns the receipts that should carry a photo, so the admin client can upload the matching
-- sample image (storage objects cannot be written from SQL).
create or replace function public.seed_demo_receipts_internal(p_camp uuid)
returns table(receipt_id uuid, file_path text, sample_file text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_today date := demo_camp_today(p_camp);
  v_last  date := date_trunc('month', v_today - interval '1 month')::date;
  r record;
  v_rid uuid;
  v_stmt uuid;
  v_taxes jsonb;
  v_sub numeric; v_tax numeric; v_total numeric;
begin
  -- Sample rows only: statements (their lines cascade), receipts, cards, codes, settings.
  delete from card_statements where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'statement:' || k) from unnest(array['A','B']) k);
  delete from receipts where camp_id = p_camp and id in (select demo_seed_uuid(p_camp, 'receipt:' || k) from generate_series(1, 40) k);

  for r in select * from (values
    ('PRG',    'Programs',            'Program Supplies',        10),
    ('ARTS',   'Arts & crafts',       'Program Supplies:Arts',   20),
    ('WATER',  'Waterfront',          'Waterfront Equipment',    30),
    ('MAINT',  'Maintenance',         'Repairs & Maintenance',   40),
    ('KIT',    'Kitchen',             'Kitchen Supplies',        50),
    ('HEALTH', 'Health centre',       'Medical Supplies',        60),
    ('TRIP',   'Trips & travel',      'Travel',                  70),
    ('OFFICE', 'Office',              'Office Expenses',         80)
  ) as t(code, name, qb, sort)
  loop
    insert into expense_budget_codes (id, camp_id, code, name, qb_account, sort_order)
    values (demo_seed_uuid(p_camp, 'code:' || r.code), p_camp, r.code, r.name, r.qb, r.sort)
    on conflict do nothing;
  end loop;

  for r in select * from (values
    ('A', 'Visa ··4821', 'Maya Torres (Waterfront)',   '4821', 'WATER'),
    ('B', 'Visa ··7390', 'Luis Ortega (Maintenance)',  '7390', 'MAINT'),
    ('C', 'Visa ··1156', 'Priya Shah (Programs)',      '1156', 'PRG')
  ) as t(k, label, holder, last4, code)
  loop
    insert into expense_cards (id, camp_id, label, holder_name, holder_email, last4, default_budget_code_id)
    values (demo_seed_uuid(p_camp, 'card:' || r.k), p_camp, r.label, r.holder,
      lower(split_part(r.holder, ' ', 1)) || '.' || lower(split_part(r.holder, ' ', 2)) || '@example.com', r.last4,
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code))
    on conflict (id) do update set label = excluded.label, holder_name = excluded.holder_name, last4 = excluded.last4;
  end loop;

  insert into expense_tax_settings (camp_id, currency, province, tax_rules)
  values (p_camp, 'CAD', 'ON', '[{"type":"HST","recoverable_pct":50},{"type":"GST","recoverable_pct":50},{"type":"PST","recoverable_pct":0}]')
  on conflict (camp_id) do nothing;

  -- Last month, three cards. HST 13% unless noted. Day = day of last month.
  --  k  card  day  vendor                          subtotal  tax    code     purpose
  for r in select * from (values
    (1,  'A', 2,  'Blue Heron Marine',               188.04, 'HST', 'WATER',  'Paddle repair kit'),
    (2,  'A', 5,  'Northwind Hardware',               75.00, 'HST', 'WATER',  'Dock cleats'),
    (3,  'A', 9,  'Pinegrove General Store',          30.47, 'HST', 'KIT',    'Ice for the waterfront coolers'),
    (4,  'A', 12, 'Lakeview Pharmacy',                42.65, 'HST', 'HEALTH', 'Sunscreen for swim staff'),
    (5,  'A', 15, 'Blue Heron Marine',               312.39, 'HST', 'WATER',  'Two throw bags and a whistle kit'),
    (6,  'A', 15, 'Blue Heron Marine',               312.39, 'HST', 'WATER',  'Two throw bags and a whistle kit'),
    (7,  'A', 19, 'Trillium Craft Supply',            77.46, 'HST', 'ARTS',   'Tie-dye kits'),
    (8,  'A', 23, 'Northwind Hardware',               18.99, 'HST', 'WATER',  'Rope'),
    (9,  'A', 27, 'The Loon''s Nest Grill',          142.00, 'HST', 'TRIP',   'Staff dinner on the canoe trip'),
    (10, 'B', 3,  'Northwind Hardware',              264.18, 'HST', 'MAINT',  'Hinges and door closers'),
    (11, 'B', 7,  'Foothills Lumber Yard',           612.40, 'HST', 'MAINT',  'Dock decking'),
    (12, 'B', 11, 'Northwind Hardware',               58.20, 'HST', 'MAINT',  'Paint rollers'),
    (13, 'B', 16, 'Cedar Valley Electric Supply',    129.75, 'HST', 'MAINT',  'Breaker for the dining hall'),
    (14, 'B', 21, 'Pinegrove General Store',          22.10, 'HST', 'KIT',    'Emergency milk run'),
    (15, 'B', 26, 'Northwind Hardware',               96.33, 'HST', 'MAINT',  'Plumbing fittings'),
    (16, 'C', 4,  'Trillium Craft Supply',           146.80, 'HST', 'ARTS',   'Beads and string'),
    (17, 'C', 8,  'Paper Moon Stationers',            64.12, 'HST', 'OFFICE', 'Name tags'),
    (18, 'C', 13, 'Trillium Craft Supply',            88.45, 'HST', 'ARTS',   'Watercolour paper'),
    (19, 'C', 18, 'Maple Leaf Games & Toys',         119.99, 'HST', 'PRG',    'Evening program prizes'),
    (20, 'C', 25, 'Pinegrove General Store',          35.60, 'HST', 'PRG',    'Candy for the carnival')
  ) as t(k, card, day, vendor, subtotal, tax, code, purpose)
  loop
    v_rid := demo_seed_uuid(p_camp, 'receipt:' || r.k);
    v_tax := round(r.subtotal * 0.13, 2);
    v_total := r.subtotal + v_tax;
    insert into receipts (id, camp_id, card_id, submitter_name, vendor, purchase_date, subtotal, taxes, total, currency,
      budget_code_id, purpose, status, reviewed_at, possible_duplicate_of, created_at)
    values (v_rid, p_camp, demo_seed_uuid(p_camp, 'card:' || r.card),
      (select holder_name from expense_cards where id = demo_seed_uuid(p_camp, 'card:' || r.card)),
      r.vendor, v_last + (r.day - 1), r.subtotal,
      jsonb_build_array(jsonb_build_object('type', r.tax, 'rate_pct', 13, 'amount', v_tax)), v_total, 'CAD',
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code), r.purpose, 'ready',
      (v_last + (r.day - 1) + 1)::timestamptz,
      case when r.k = 6 then demo_seed_uuid(p_camp, 'receipt:5') end,
      (v_last + (r.day - 1))::timestamptz + interval '15 hours');
  end loop;

  -- Card A's statement: every receipt matched except the one snapped twice, plus one fuel charge
  -- nobody handed in a receipt for. Card B's statement agrees to the cent. Card C has no statement
  -- yet -- the visitor imports it from the guide's sample CSV.
  v_stmt := demo_seed_uuid(p_camp, 'statement:A');
  insert into card_statements (id, camp_id, card_id, period_month, statement_total, file_name, created_at)
  values (v_stmt, p_camp, demo_seed_uuid(p_camp, 'card:A'), v_last, 0, 'visa-4821-statement.csv', now() - interval '3 days');
  insert into statement_lines (id, statement_id, camp_id, posted_date, description, amount, match_state, receipt_id, resolved_at)
  select demo_seed_uuid(p_camp, 'line:A:' || k), v_stmt, p_camp, r2.purchase_date + 1, upper(r2.vendor), r2.total, 'matched', r2.id, now() - interval '2 days'
    from generate_series(1, 9) k join receipts r2 on r2.id = demo_seed_uuid(p_camp, 'receipt:' || k)
   where k <> 6;
  insert into statement_lines (id, statement_id, camp_id, posted_date, description, amount, match_state)
  values (demo_seed_uuid(p_camp, 'line:A:fuel'), v_stmt, p_camp, v_last + 21, 'MAPLE RIDGE GAS BAR', 64.37, 'unmatched');
  update card_statements set statement_total = (select sum(amount) from statement_lines where statement_id = v_stmt) where id = v_stmt;

  v_stmt := demo_seed_uuid(p_camp, 'statement:B');
  insert into card_statements (id, camp_id, card_id, period_month, statement_total, file_name, created_at)
  values (v_stmt, p_camp, demo_seed_uuid(p_camp, 'card:B'), v_last, 0, 'visa-7390-statement.csv', now() - interval '3 days');
  insert into statement_lines (id, statement_id, camp_id, posted_date, description, amount, match_state, receipt_id, resolved_at)
  select demo_seed_uuid(p_camp, 'line:B:' || k), v_stmt, p_camp, r2.purchase_date + 1, upper(r2.vendor), r2.total, 'matched', r2.id, now() - interval '2 days'
    from generate_series(10, 15) k join receipts r2 on r2.id = demo_seed_uuid(p_camp, 'receipt:' || k);
  update card_statements set statement_total = (select sum(amount) from statement_lines where statement_id = v_stmt) where id = v_stmt;

  -- Photos waiting for their holder to confirm what was read. These use the sample receipt images,
  -- so their dates are the dates printed on those images. They all sit on the third card, the one
  -- with no statement yet: on a card whose statement is already reconciled they would show up as
  -- "receipts with no charge" beside the one duplicate that list is meant to demonstrate.
  for r in select * from (values
    (31, 'C', '02-on-hst.jpg',          'Northwind Hardware',         '2026-08-03', 75.00,  '[{"type":"HST","rate_pct":13,"amount":9.75}]',  null::numeric, 84.75,  0.94, 'WATER'),
    (32, 'C', '12-stained-date.jpg',    'Trillium Craft Supply',      null,         77.46,  '[{"type":"HST","rate_pct":13,"amount":10.07}]', null, 87.53,  0.00, 'ARTS'),
    (33, 'C', '06-restaurant-tip.jpg',  'The Loon''s Nest Grill',     '2026-08-08', 142.00, '[{"type":"HST","rate_pct":13,"amount":18.46}]', 25,   185.46, 0.58, 'TRIP'),
    (34, 'C', '01-thermal-faded.jpg',   'Pinegrove General Store',    '2026-08-14', 30.47,  '[{"type":"HST","rate_pct":13,"amount":3.96}]',  null, 34.43,  0.61, 'KIT'),
    (35, 'C', '09-crumpled.jpg',        'Harbourview Books & Gifts',  '2026-09-02', 76.47,  '[{"type":"GST","rate_pct":5,"amount":3.82},{"type":"PST","rate_pct":7,"amount":5.35}]', null, 85.64, 0.71, 'PRG'),
    (36, 'C', '05-ab-gst.jpg',          'Foothills Farm & Feed',      '2026-08-19', 50.50,  '[{"type":"GST","rate_pct":5,"amount":2.53}]',   null, 53.03,  0.88, 'MAINT')
  ) as t(k, card, sample, vendor, day, subtotal, taxes, tip, total, conf, code)
  loop
    v_rid := demo_seed_uuid(p_camp, 'receipt:' || r.k);
    insert into receipts (id, camp_id, card_id, submitter_name, file_path, file_name, file_type, vendor, purchase_date,
      subtotal, taxes, tip, total, currency, budget_code_id, status, ai_result, ai_min_confidence, created_at)
    values (v_rid, p_camp, demo_seed_uuid(p_camp, 'card:' || r.card),
      (select holder_name from expense_cards where id = demo_seed_uuid(p_camp, 'card:' || r.card)),
      p_camp || '/' || v_rid || '.jpg', r.sample, 'image/jpeg', r.vendor, r.day::date,
      r.subtotal, r.taxes::jsonb, r.tip, r.total, 'CAD',
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code), 'needs_review',
      jsonb_build_object(
        'readable', true, 'vendor', r.vendor, 'purchaseDate', r.day, 'subtotal', r.subtotal,
        'taxes', (select coalesce(jsonb_agg(jsonb_build_object('type', e->>'type', 'ratePct', (e->>'rate_pct')::numeric, 'amount', (e->>'amount')::numeric)), '[]'::jsonb)
                    from jsonb_array_elements(r.taxes::jsonb) e),
        'tip', r.tip, 'total', r.total, 'currency', 'CAD',
        'cardLast4', (select last4 from expense_cards where id = demo_seed_uuid(p_camp, 'card:' || r.card)),
        'confidence', jsonb_build_object('vendor', greatest(r.conf, 0.9), 'date', case when r.day is null then 0 else greatest(r.conf, 0.7) end,
                                         'subtotal', r.conf, 'taxes', r.conf, 'tip', case when r.tip is null then 1 else r.conf end,
                                         'total', greatest(r.conf, 0.8), 'currency', 0.95),
        'minConfidence', r.conf,
        'flags', jsonb_build_object('mathMismatch', false, 'dateOutOfRange', false, 'currencyUnsupported', false),
        'model', 'sample'),
      r.conf, now() - make_interval(hours => 3 * (r.k - 30)));
    receipt_id := v_rid; file_path := p_camp || '/' || v_rid || '.jpg'; sample_file := r.sample;
    return next;
  end loop;

  perform plan_receipt_messages_internal();
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The one entry point the admin console calls.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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
    v_out := v_out || jsonb_build_object('food_requests', seed_demo_food_requests_internal(p_camp_id));
  end if;
  if 'town_trips' = any (p_keys) then
    v_out := v_out || jsonb_build_object('town_trips', seed_demo_trips_internal(p_camp_id));
  end if;
  if 'receipts' = any (p_keys) then
    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'file_path', file_path, 'sample_file', sample_file)), '[]'::jsonb)
      into v_files from seed_demo_receipts_internal(p_camp_id);
    v_out := v_out || jsonb_build_object('receipt_files', v_files);
  end if;
  return v_out;
end;
$fn$;

do $$
declare f text;
begin
  foreach f in array array['demo_seed_uuid(uuid,text)', 'demo_camp_today(uuid)',
    'seed_demo_food_requests_internal(uuid)', 'seed_demo_trips_internal(uuid)', 'seed_demo_receipts_internal(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke execute on function public.seed_demo_data(uuid, text[]) from public, anon;
grant execute on function public.seed_demo_data(uuid, text[]) to authenticated, service_role;
