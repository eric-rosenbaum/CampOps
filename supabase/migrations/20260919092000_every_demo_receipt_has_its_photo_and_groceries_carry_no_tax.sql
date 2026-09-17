-- The demo's sample receipts, after a charity finance director read them against their photos.
--
--   * Milk, bread, butter and bananas are basic groceries and zero-rated: those receipts carry no
--     HST. They were charged 13% like everything else.
--   * Budget codes a person would choose: batteries, duct tape and dock hinges are Maintenance, not
--     Kitchen or Waterfront; a riding program's hay is Programs.
--   * Every receipt has a photo, drawn to match its row (vendor, items, taxes, total, and the card
--     number printed on the slip), from scripts/demo-receipts.mjs, the one list both this seed and
--     scripts/render-receipt-fixtures.mjs --demo are made from. Only the review receipts had photos,
--     so a finance reviewer opened "ready" receipts and found no paper behind them.
--   * The review receipts are dated in the seed's month (last month) like everything else, instead
--     of fixed August 2026 dates that fell out of "last month" as soon as the calendar moved.
--   * Card ··4821's month keeps its story exactly: one charge with no receipt, one receipt snapped
--     twice. Its receipts no longer share an amount with card ··1156's, which made the two cards'
--     Trillium receipts look like copies of each other.
--
-- Returns (receipt_id, file_path, sample_file) for every receipt with a photo; sample_file is a file
-- under public/demo/receipts/. The photos print dates in August 2026; for any other month the
-- uploader redraws the date (src/lib/demoReceiptPhotos.ts), since a static file cannot know it.

CREATE OR REPLACE FUNCTION public.seed_demo_receipts_internal(p_camp uuid)
 RETURNS TABLE(receipt_id uuid, file_path text, sample_file text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_today date := demo_camp_today(p_camp);
  v_last  date := date_trunc('month', v_today - interval '1 month')::date;
  r record;
  v_rid uuid;
  v_stmt uuid;
  v_date date;
  v_card uuid;
begin
  -- The sample rows may have been exported by a visitor: replacing them is the seed's to do.
  perform set_config('campcommand.receipts_books', 'on', true);
  -- A visitor's own statement may be matched to sample receipts; deleting those broke "matched has a
  -- receipt". The reset wrappers already do this first; doing it here too keeps the seed safe alone.
  perform demo_unmatch_sample_receipts_internal(p_camp);

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

  -- A camp is a charity or qualifying non-profit far more often than it is a GST/HST registrant
  -- claiming full input tax credits, so the sample is the public service bodies' rebate for an
  -- Ontario charity: 50% of GST and the federal part of HST, 82% of the provincial part (CRA
  -- RC4034). It was a flat "HST 50%", which understated an Ontario camp's rebate by a third.
  insert into expense_tax_settings (camp_id, currency, province, claim_basis, tax_rules)
  values (p_camp, 'CAD', 'ON', 'psb', '[{"type":"HST","recoverable_pct":69.69,"federal_pct":50,"provincial_pct":82},{"type":"GST","recoverable_pct":50}]')
  on conflict (camp_id) do nothing;

  -- Generated by scripts/demo-receipts-sql.mjs from scripts/demo-receipts.mjs. Do not edit by hand.
  --  k  card  month  day  vendor  subtotal  taxes  tip  total  code  purpose  status  confidence  photo
  for r in select * from (values
    (1, 'A', 'last', 2, 'Blue Heron Marine', 188.04, '[{"type":"HST","rate_pct":13,"amount":24.45}]', null::numeric, 212.49, 'WATER', 'Paddle repair kit', 'ready', null, 'demo-01.jpg'),
    (2, 'A', 'last', 5, 'Northwind Hardware', 68.40, '[{"type":"HST","rate_pct":13,"amount":8.89}]', null::numeric, 77.29, 'MAINT', 'Dock cleats and deck screws', 'ready', null, 'demo-02.jpg'),
    (3, 'A', 'last', 9, 'Pinegrove General Store', 27.44, '[]', null::numeric, 27.44, 'KIT', 'Milk, bread and bananas for the swim-test snack', 'ready', null, 'demo-03.jpg'),
    (4, 'A', 'last', 12, 'Lakeview Pharmacy', 42.65, '[{"type":"HST","rate_pct":13,"amount":5.54}]', null::numeric, 48.19, 'HEALTH', 'Sunscreen for swim staff', 'ready', null, 'demo-04.jpg'),
    (5, 'A', 'last', 15, 'Blue Heron Marine', 312.39, '[{"type":"HST","rate_pct":13,"amount":40.61}]', null::numeric, 353.00, 'WATER', 'Two throw bags and a whistle kit', 'ready', null, 'demo-05.jpg'),
    (6, 'A', 'last', 15, 'Blue Heron Marine', 312.39, '[{"type":"HST","rate_pct":13,"amount":40.61}]', null::numeric, 353.00, 'WATER', 'Two throw bags and a whistle kit', 'ready', null, 'demo-05.jpg'),
    (7, 'A', 'last', 19, 'Trillium Craft Supply', 63.72, '[{"type":"HST","rate_pct":13,"amount":8.28}]', null::numeric, 72.00, 'ARTS', 'Tie-dye kits for the waterfront banner', 'ready', null, 'demo-07.jpg'),
    (8, 'A', 'last', 23, 'Northwind Hardware', 18.99, '[{"type":"HST","rate_pct":13,"amount":2.47}]', null::numeric, 21.46, 'WATER', 'Rope for the swim lines', 'ready', null, 'demo-08.jpg'),
    (9, 'A', 'last', 27, 'The Loon''s Nest Grill', 142.00, '[{"type":"HST","rate_pct":13,"amount":18.46}]', null::numeric, 160.46, 'TRIP', 'Staff dinner on the canoe trip', 'ready', null, 'demo-09.jpg'),
    (10, 'B', 'last', 3, 'Northwind Hardware', 264.18, '[{"type":"HST","rate_pct":13,"amount":34.34}]', null::numeric, 298.52, 'MAINT', 'Hinges and door closers', 'ready', null, 'demo-10.jpg'),
    (11, 'B', 'last', 7, 'Foothills Lumber Yard', 612.40, '[{"type":"HST","rate_pct":13,"amount":79.61}]', null::numeric, 692.01, 'MAINT', 'Dock decking', 'ready', null, 'demo-11.jpg'),
    (12, 'B', 'last', 11, 'Northwind Hardware', 58.20, '[{"type":"HST","rate_pct":13,"amount":7.57}]', null::numeric, 65.77, 'MAINT', 'Paint rollers', 'ready', null, 'demo-12.jpg'),
    (13, 'B', 'last', 16, 'Cedar Valley Electric Supply', 129.75, '[{"type":"HST","rate_pct":13,"amount":16.87}]', null::numeric, 146.62, 'MAINT', 'Breaker for the dining hall', 'ready', null, 'demo-13.jpg'),
    (14, 'B', 'last', 21, 'Pinegrove General Store', 22.10, '[]', null::numeric, 22.10, 'KIT', 'Emergency milk run', 'ready', null, 'demo-14.jpg'),
    (15, 'B', 'last', 26, 'Northwind Hardware', 96.33, '[{"type":"HST","rate_pct":13,"amount":12.52}]', null::numeric, 108.85, 'MAINT', 'Plumbing fittings', 'ready', null, 'demo-15.jpg'),
    (16, 'C', 'last', 4, 'Trillium Craft Supply', 146.80, '[{"type":"HST","rate_pct":13,"amount":19.08}]', null::numeric, 165.88, 'ARTS', 'Beads and string', 'ready', null, 'demo-16.jpg'),
    (17, 'C', 'last', 8, 'Paper Moon Stationers', 64.12, '[{"type":"HST","rate_pct":13,"amount":8.34}]', null::numeric, 72.46, 'OFFICE', 'Name tags', 'ready', null, 'demo-17.jpg'),
    (18, 'C', 'last', 13, 'Trillium Craft Supply', 88.45, '[{"type":"HST","rate_pct":13,"amount":11.5}]', null::numeric, 99.95, 'ARTS', 'Watercolour paper', 'ready', null, 'demo-18.jpg'),
    (19, 'C', 'last', 18, 'Maple Leaf Games & Toys', 119.99, '[{"type":"HST","rate_pct":13,"amount":15.6}]', null::numeric, 135.59, 'PRG', 'Evening program prizes', 'ready', null, 'demo-19.jpg'),
    (20, 'C', 'last', 25, 'Pinegrove General Store', 35.60, '[{"type":"HST","rate_pct":13,"amount":4.63}]', null::numeric, 40.23, 'PRG', 'Candy for the carnival', 'ready', null, 'demo-20.jpg'),
    (31, 'C', 'last', 3, 'Northwind Hardware', 75.00, '[{"type":"HST","rate_pct":13,"amount":9.75}]', null::numeric, 84.75, 'MAINT', null, 'needs_review', 0.94, 'demo-31.jpg'),
    (32, 'C', null, null, 'Trillium Craft Supply', 77.46, '[{"type":"HST","rate_pct":13,"amount":10.07}]', null::numeric, 87.53, 'ARTS', null, 'needs_review', 0.00, 'demo-32.jpg'),
    (33, 'C', 'last', 8, 'The Loon''s Nest Grill', 142.00, '[{"type":"HST","rate_pct":13,"amount":18.46}]', 25.00, 185.46, 'TRIP', null, 'needs_review', 0.58, 'demo-33.jpg'),
    (34, 'C', 'last', 14, 'Pinegrove General Store', 30.47, '[{"type":"HST","rate_pct":13,"amount":3.96}]', null::numeric, 34.43, 'MAINT', null, 'needs_review', 0.61, 'demo-34.jpg'),
    (35, 'C', 'this', 2, 'Harbourview Books & Gifts', 76.47, '[{"type":"GST","rate_pct":5,"amount":3.82},{"type":"PST","rate_pct":7,"amount":5.35}]', null::numeric, 85.64, 'PRG', null, 'needs_review', 0.71, 'demo-35.jpg'),
    (36, 'C', 'last', 19, 'Foothills Farm & Feed', 50.50, '[{"type":"GST","rate_pct":5,"amount":2.53}]', null::numeric, 53.03, 'PRG', null, 'needs_review', 0.88, 'demo-36.jpg')
  ) as t(k, card, month, day, vendor, subtotal, taxes, tip, total, code, purpose, status, conf, sample)
  loop
    v_rid := demo_seed_uuid(p_camp, 'receipt:' || r.k);
    v_card := demo_seed_uuid(p_camp, 'card:' || r.card);
    v_date := case r.month when 'last' then v_last + (r.day - 1)
                           when 'this' then (v_last + interval '1 month')::date + (r.day - 1) end;
    insert into receipts (id, camp_id, card_id, submitter_name, file_path, file_name, file_type, vendor, purchase_date,
      subtotal, taxes, tip, total, currency, budget_code_id, purpose, status, reviewed_at, possible_duplicate_of,
      ai_result, ai_min_confidence, created_at)
    values (v_rid, p_camp, v_card, (select holder_name from expense_cards where id = v_card),
      p_camp || '/' || v_rid || '.jpg', r.sample, 'image/jpeg', r.vendor, v_date,
      r.subtotal, r.taxes::jsonb, r.tip, r.total, 'CAD',
      (select id from expense_budget_codes where camp_id = p_camp and code = r.code), r.purpose, r.status,
      case when r.status = 'ready' then (v_date + 1)::timestamptz end,
      case when r.k = 6 then demo_seed_uuid(p_camp, 'receipt:5') end,
      case when r.status = 'needs_review' then jsonb_build_object(
        'readable', true, 'vendor', r.vendor, 'purchaseDate', v_date, 'subtotal', r.subtotal,
        'taxes', (select coalesce(jsonb_agg(jsonb_build_object('type', e->>'type', 'ratePct', (e->>'rate_pct')::numeric, 'amount', (e->>'amount')::numeric)), '[]'::jsonb)
                    from jsonb_array_elements(r.taxes::jsonb) e),
        'tip', r.tip, 'total', r.total, 'currency', 'CAD',
        'cardLast4', (select last4 from expense_cards where id = v_card),
        'confidence', jsonb_build_object('vendor', greatest(r.conf, 0.9), 'date', case when v_date is null then 0 else greatest(r.conf, 0.7) end,
                                         'subtotal', r.conf, 'taxes', r.conf, 'tip', case when r.tip is null then 1 else r.conf end,
                                         'total', greatest(r.conf, 0.8), 'currency', 0.95),
        'minConfidence', r.conf,
        'flags', jsonb_build_object('mathMismatch', false, 'dateOutOfRange', false, 'currencyUnsupported', false),
        'model', 'sample') end,
      r.conf,
      case when r.status = 'ready' then v_date::timestamptz + interval '15 hours'
           else now() - make_interval(hours => 3 * (r.k - 30)) end);
    receipt_id := v_rid; file_path := p_camp || '/' || v_rid || '.jpg'; sample_file := r.sample;
    return next;
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

  perform set_config('campcommand.receipts_books', '', true);
  perform plan_receipt_messages_internal();
end;
$fn$;

revoke execute on function public.seed_demo_receipts_internal(uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_receipts_internal(uuid) to service_role;
